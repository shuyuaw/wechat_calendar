// backend/controllers/booking.controller.js
const { format: formatDate, startOfDay } = require('date-fns');
const pool = require('../database.js');
const { sendSubscribeMessage } = require('../utils/wechat.js');

// Create a new booking
const createBooking = async (req, res) => {
    const { slotId, userId } = req.body;
    const slotIdNum = parseInt(slotId, 10);

    if (isNaN(slotIdNum) || !userId) {
        return res.status(400).json({ error: 'Missing or invalid required fields: slotId and userId.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const updateSlotSql = `UPDATE AvailabilitySlots SET status = 'booked', userId = ? WHERE slotId = ? AND status = 'available'`;
        const [updateResult] = await connection.query(updateSlotSql, [userId, slotIdNum]);

        if (updateResult.affectedRows === 0) {
            await connection.rollback();
            return res.status(409).json({ error: 'Slot not available or already booked.' });
        }

        const getSlotDetailsSql = "SELECT startTime, endTime, coachId FROM AvailabilitySlots WHERE slotId = ?";
        const [slotRows] = await connection.query(getSlotDetailsSql, [slotIdNum]);
        const slotDetails = slotRows[0];

        // --- DIAGNOSTIC LOGGING START ---
        console.log('--- DIAGNOSING createBooking ---');
        console.log('Raw slotDetails from DB:', slotDetails);
        if (slotDetails) {
            console.log('Type of slotDetails.startTime:', typeof slotDetails.startTime, '| Is it a Date object?', slotDetails.startTime instanceof Date);
            console.log('Value of slotDetails.startTime:', slotDetails.startTime);
        }
        console.log('--- DIAGNOSING createBooking END ---');
        // --- DIAGNOSTIC LOGGING END ---

        if (!slotDetails) { throw new Error('Could not find slot details after update.'); }

        // The rest of the function has a logic error in the ordering.
        // For now, let's just get the log output. We will fix the order later.
        
        const bookingStartTime = slotDetails.startTime;
        const bookingEndTime = slotDetails.endTime;
        const formattedTimeSlot = `${formatDate(bookingStartTime, 'MM月dd日 HH:mm')}-${formatDate(bookingEndTime, 'HH:mm')}`;

        const insertBookingSql = `INSERT INTO Bookings (userId, coachId, slotId, startTime, endTime, status) VALUES (?, ?, ?, ?, ?, 'confirmed')`;
        const [insertResult] = await connection.query(insertBookingSql, [userId, slotDetails.coachId, slotIdNum, slotDetails.startTime, slotDetails.endTime]);
        const newBookingId = insertResult.insertId;

        const linkBookingSql = "UPDATE AvailabilitySlots SET bookingId = ? WHERE slotId = ?";
        await connection.query(linkBookingSql, [newBookingId, slotIdNum]);

        await connection.commit();

        // Send notifications after commit
        const bookingConfirmationTemplateId = process.env.WECHAT_BOOKING_CONFIRM_TEMPLATE_ID || 'YOUR_TEMPLATE_ID_HERE';
        sendSubscribeMessage({
            recipientOpenId: userId,
            templateId: bookingConfirmationTemplateId,
            dataPayload: { "thing1": { "value": "职业发展辅导预约" }, "thing13": { "value": formattedTimeSlot } },
            pageLink: 'pages/myBookings/myBookings'
        });
        if (slotDetails.coachId) {
            sendSubscribeMessage({
                recipientOpenId: slotDetails.coachId,
                templateId: bookingConfirmationTemplateId,
                dataPayload: { "thing1": { "value": "新的辅导预约" }, "thing13": { "value": formattedTimeSlot } },
                pageLink: 'pages/coachBookings/coachBookings'
            });
        }

        res.status(201).json({
            message: 'Booking created successfully.',
            bookingId: newBookingId,
            ...slotDetails
        });

    } catch (error) {
        await connection.rollback();
        console.error("Error in createBooking, transaction rolled back:", error.message);
        res.status(500).json({ error: 'Failed to create booking.' });
    } finally {
        connection.release();
    }
};

// The other functions remain the same
const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    const bookingIdNum = parseInt(bookingId, 10);
    const authenticatedUserId = req.user?.openid;

    if (isNaN(bookingIdNum)) return res.status(400).json({ error: 'Invalid bookingId format.' });
    if (!authenticatedUserId) return res.status(401).json({ error: 'Authentication failed.' });

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const findBookingSql = "SELECT userId, slotId, status, coachId, startTime FROM Bookings WHERE bookingId = ?";
        const [bookingRows] = await connection.query(findBookingSql, [bookingIdNum]);
        
        if (bookingRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: `Booking not found.` });
        }
        const booking = bookingRows[0];

        if (booking.status.startsWith('cancelled_')) {
            await connection.rollback();
            return res.status(200).json({ message: 'Booking already cancelled.' });
        }

        const systemCoachOpenId = process.env.COACH_OPENID;
        const isOwner = (authenticatedUserId === booking.userId);
        const isCoach = (authenticatedUserId === systemCoachOpenId || authenticatedUserId === booking.coachId);

        if (!isOwner && !isCoach) {
            await connection.rollback();
            return res.status(403).json({ error: 'Forbidden - You cannot cancel this booking.' });
        }

        const newStatus = isOwner ? 'cancelled_by_user' : 'cancelled_by_coach';

        const updateBookingSql = "UPDATE Bookings SET status = ? WHERE bookingId = ?";
        await connection.query(updateBookingSql, [newStatus, bookingIdNum]);

        const updateSlotSql = `UPDATE AvailabilitySlots SET status = 'available', userId = NULL, bookingId = NULL WHERE slotId = ?`;
        await connection.query(updateSlotSql, [booking.slotId]);

        await connection.commit();

        const cancellationTemplateId = 'YOUR_CANCELLATION_TEMPLATE_ID_HERE';
        const formattedTimeSlot = `${formatDate(booking.startTime, 'MM月dd日 HH:mm')}`;
        const cancellationReason = newStatus === 'cancelled_by_user' ? '用户主动取消' : '教练取消了此预约';
        
        const messageData = {
            "thing1": { "value": "辅导预约已取消" },
            "thing4": { "value": cancellationReason },
            "thing8": { "value": formattedTimeSlot }
        };

        sendSubscribeMessage({ recipientOpenId: booking.userId, templateId: cancellationTemplateId, dataPayload: messageData, pageLink: 'pages/myBookings/myBookings' });
        if (booking.coachId) {
            sendSubscribeMessage({ recipientOpenId: booking.coachId, templateId: cancellationTemplateId, dataPayload: messageData, pageLink: 'pages/coachBookings/coachBookings' });
        }

        res.status(200).json({ message: 'Booking cancelled successfully.' });

    } catch (error) {
        await connection.rollback();
        console.error(`Error in cancelBooking for booking ${bookingIdNum}, transaction rolled back:`, error.message);
        res.status(500).json({ error: 'Failed to cancel booking.' });
    } finally {
        connection.release();
    }
};

const getMyUpcomingBookings = async (req, res) => {
    const studentUserId = req.user?.openid;
    if (!studentUserId) {
        return res.status(401).json({ error: "User not authenticated." });
    }

    const currentDate = formatDate(startOfDay(new Date()), 'yyyy-MM-dd HH:mm:ss');

    try {
        const sql = `
            SELECT bookingId, coachId, slotId, startTime, endTime, status
            FROM Bookings
            WHERE userId = ? AND status = 'confirmed' AND startTime >= ?
            ORDER BY startTime ASC
        `;
        const [rows] = await pool.query(sql, [studentUserId, currentDate]);
        res.json(rows);
    } catch (error) {
        console.error("Database error fetching user's upcoming bookings:", error.message);
        res.status(500).json({ error: "Failed to retrieve your bookings." });
    }
};


module.exports = {
  createBooking,
  cancelBooking,
  getMyUpcomingBookings,
};
