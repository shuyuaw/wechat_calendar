const {
    // ... other functions like parseISO, isBefore, isAfter ...
    formatISO, // <-- Make sure this is included
    startOfDay, // <-- ADDED: For getting the start of today
    format,      // <-- ADDED: For formatting dates for notifications
  } = require('date-fns');
const db = require('../database.js');
const { sendSubscribeMessage } = require('../utils/wechat.js'); // <-- ADDED: For sending WeChat notifications

// Controller function to create a new booking
const createBooking = async (req, res) => {
  // TODO: Implement authentication - Get userId from a verified session/token instead of req.body
  // For now, we'll temporarily expect userId in the request body for testing.
  const { slotId, userId } = req.body;

  // --- Input Validation ---
  if (slotId === undefined || !userId) {
    return res.status(400).json({ error: 'Missing required fields: slotId and userId.' });
  }
  // Ensure slotId is a number if your PK is INTEGER
  const slotIdNum = parseInt(slotId, 10);
   if (isNaN(slotIdNum)) {
     return res.status(400).json({ error: 'Invalid slotId format.' });
   }
  // --- End Validation ---


  // --- Database Transaction ---
  db.serialize(() => { // Use serialize to ensure sequential execution within this connection
    db.run('BEGIN TRANSACTION;');

    // Step 1: Attempt to atomically update the slot status from 'available' to 'booked'
    const updateSlotSql = `
      UPDATE AvailabilitySlots
      SET status = 'booked', userId = ?
      WHERE slotId = ? AND status = 'available'
    `;

    db.run(updateSlotSql, [userId, slotIdNum], function(updateErr) {
      if (updateErr) {
        console.error("Error updating slot status:", updateErr.message);
        db.run('ROLLBACK;');
        return res.status(500).json({ error: 'Database error trying to book slot.' });
      }

      // Check if the update actually changed a row
      if (this.changes === 0) {
        // No rows affected = slot was not found OR was not 'available'
        console.log(`Booking failed: Slot ${slotIdNum} not found or not available.`);
        db.run('ROLLBACK;');
        return res.status(409).json({ error: 'Slot not available or already booked.' });
      }

      // If update succeeded (this.changes === 1), proceed to create Booking record
      console.log(`Slot ${slotIdNum} successfully marked as booked for user ${userId}.`);

      // Step 2: Get the details from the updated slot for the Bookings table
      const getSlotDetailsSql = "SELECT startTime, endTime, coachId FROM AvailabilitySlots WHERE slotId = ?";
      db.get(getSlotDetailsSql, [slotIdNum], (getErr, slotDetails) => {
        if (getErr || !slotDetails) {
          console.error("Error fetching details for booked slot:", getErr ? getErr.message : 'Slot details not found after update');
          db.run('ROLLBACK;');
          return res.status(500).json({ error: 'Database error fetching slot details after booking.' });
        }

        // Step 3: Insert the record into the Bookings table
        const insertBookingSql = `
          INSERT INTO Bookings (userId, coachId, slotId, startTime, endTime, status)
          VALUES (?, ?, ?, ?, ?, 'confirmed')
        `;
        db.run(insertBookingSql, [userId, slotDetails.coachId, slotIdNum, slotDetails.startTime, slotDetails.endTime], function(insertErr) {
          if (insertErr) {
            console.error("Error inserting booking record:", insertErr.message);
            db.run('ROLLBACK;');
            return res.status(500).json({ error: 'Database error creating booking record.' });
          }

          const newBookingId = this.lastID; // Get the ID of the newly inserted booking
          console.log(`Booking record ${newBookingId} created successfully.`);

          // Step 4: Update AvailabilitySlots again to link to the new bookingId
          const linkBookingSql = "UPDATE AvailabilitySlots SET bookingId = ? WHERE slotId = ?";
          db.run(linkBookingSql, [newBookingId, slotIdNum], function(linkErr) {
             if (linkErr) {
                console.error(`Error linking bookingId ${newBookingId} to slotId ${slotIdNum}:`, linkErr.message);
                db.run('ROLLBACK;');
                return res.status(500).json({ error: 'Database error linking booking to slot.' });
             }

             console.log(`Slot ${slotIdNum} successfully linked to booking ${newBookingId}.`);

             // If all steps succeeded:
             db.run('COMMIT;', (commitErr) => { // Commit the transaction
                if (commitErr) {
                    console.error("Error committing transaction:", commitErr.message);
                    // ROLLBACK might not be possible or effective if COMMIT failed.
                    // Critical error, requires manual check or advanced handling.
                    return res.status(500).json({ error: 'Database error committing booking.' });
                }

                // --- START: WeChat Notification Logic ---
                // Note: Using slotDetails for startTime and endTime as newBooking object is not defined here.
                // Assuming slotDetails contains the correct startTime and endTime for the newly created booking.
                const studentOpenId = userId; // userId from req.body is the student's OpenID
                const coachOpenId = slotDetails.coachId || process.env.COACH_OPENID; // Coach for the booking

                const bookingStartTime = new Date(slotDetails.startTime); // Using slotDetails.startTime
                const bookingEndTime = new Date(slotDetails.endTime); // Using slotDetails.endTime

                // === MODIFICATION START ===
                // Old longer format:
                // const formattedTimeSlot = `${format(bookingStartTime, 'yyyy年MM月dd日 HH:mm')} - ${format(bookingEndTime, 'HH:mm')}`;
                // New shorter format:
                const formattedTimeSlot = `${format(bookingStartTime, 'MM月dd日 HH:mm')}-${format(bookingEndTime, 'HH:mm')}`;
                // Example: "06月03日 11:00-12:00"
                // === MODIFICATION END ===

                const bookingConfirmationTemplateId = process.env.WECHAT_BOOKING_CONFIRM_TEMPLATE_ID || 'Bai8NNhUQlXdOJaMrMIUv5bblC_W7wb9w3G9c-Ylip0'; // Example: Use env var for template ID

                // Data for the student notification
                const studentMessageData = {
                    "thing1": { "value": "职业发展辅导预约" }, // Ensure "职业发展辅导预约" is <= 20 chars if thing1 is 'thing'
                    "thing13": { "value": formattedTimeSlot }   // Booking Time Slot
                };

                // Data for the coach notification
                const coachMessageData = {
                    "thing1": { "value": "新的辅导预约" }, // Ensure "新的辅导预约" is <= 20 chars if thing1 is 'thing'
                    "thing13": { "value": formattedTimeSlot }
                };

                // Send to student
                sendSubscribeMessage({
                    recipientOpenId: studentOpenId,
                    templateId: bookingConfirmationTemplateId,
                    dataPayload: studentMessageData,
                    pageLink: 'pages/myBookings/myBookings' // Page student lands on
                }).then(success => {
                    if (success) console.log(`[Notification] Student (${studentOpenId}) notification initiated for booking ${newBookingId}.`);
                    else console.error(`[Notification] Student (${studentOpenId}) notification failed to initiate for booking ${newBookingId}.`);
                });

                // Send to coach
                if (coachOpenId) {
                     sendSubscribeMessage({
                        recipientOpenId: coachOpenId,
                        templateId: bookingConfirmationTemplateId,
                        dataPayload: coachMessageData,
                        pageLink: 'pages/coachBookings/coachBookings' // Page coach lands on
                    }).then(success => {
                        if (success) console.log(`[Notification] Coach (${coachOpenId}) notification initiated for booking ${newBookingId}.`);
                        else console.error(`[Notification] Coach (${coachOpenId}) notification failed to initiate for booking ${newBookingId}.`);
                    });
                } else {
                    console.log(`[Notification] No coachId found for slot ${slotIdNum}, or no default coach OpenID configured. Coach notification skipped for booking ${newBookingId}.`);
                }
                // --- END: WeChat Notification Logic ---

             // Send success response
             res.status(201).json({
                  message: 'Booking created successfully. Notifications initiated.',
               bookingId: newBookingId,
               slotId: slotIdNum,
               userId: userId,
                  coachId: slotDetails.coachId, // Added coachId to response
               startTime: slotDetails.startTime,
               endTime: slotDetails.endTime,
               status: 'confirmed'
             });
             }); // End COMMIT db.run

          }); // End link booking db.run
        }); // End insert booking db.run
      }); // End get slot details db.get
    }); // End update slot db.run
  }); // End db.serialize
};

// Controller function to cancel a booking
const cancelBooking = async (req, res) => {
    const { bookingId } = req.params;
    const bookingIdNum = parseInt(bookingId, 10);

    // --- Get authenticated user's OpenID from the token (populated by verifyToken middleware) ---
    if (!req.user || !req.user.openid) {
        // This should ideally not happen if verifyToken middleware is applied to the route
        console.error('[CancelBooking] Auth error: req.user or req.user.openid is missing.');
        return res.status(401).json({ error: 'Authentication failed. User not identified.' });
    }
    const authenticatedUserId = req.user.openid;
    // --- End User Authentication ---

    // --- Validate Input ---
    if (isNaN(bookingIdNum)) {
        return res.status(400).json({ error: 'Invalid bookingId format.' });
    }
    // --- End Validation ---

    try {
        db.serialize(() => {
            // Find the booking details first
            const findBookingSql = "SELECT userId, slotId, status, coachId, startTime, endTime FROM Bookings WHERE bookingId = ?";

            db.get(findBookingSql, [bookingIdNum], (findErr, booking) => {
                if (findErr) {
                    console.error(`[CancelBooking] Error finding booking ${bookingIdNum}:`, findErr.message);
                    return res.status(500).json({ error: 'Database error finding booking.' });
                }
                if (!booking) {
                    return res.status(404).json({ error: `Booking with ID ${bookingIdNum} not found.` });
                }

                // Store details for notification before status changes
                const originalBookingDetailsForNotification = { ...booking };

                if (booking.status.startsWith('cancelled_')) {
                    return res.status(200).json({ message: 'Booking already cancelled.' });
                }

                // --- Permission Check ---
                const systemCoachOpenId = process.env.COACH_OPENID;
                const isOwner = (authenticatedUserId === booking.userId);
                const isCoach = (authenticatedUserId === systemCoachOpenId || authenticatedUserId === booking.coachId);

                if (!isOwner && !isCoach) {
                    console.log(`[CancelBooking] Forbidden: User ${authenticatedUserId} attempted to cancel booking ${bookingIdNum} owned by ${booking.userId}. Not assigned or system coach.`);
                    return res.status(403).json({ error: 'Forbidden - You do not have permission to cancel this booking.' });
                }
                // --- End Permission Check ---

                // --- MODIFICATION START ---
                // --- Corrected Logic for Determining Cancellation Status ---
                let newStatus;
                if (isOwner) {
                    // If the person cancelling is the owner of the booking, it's always by the user.
                    // This correctly handles the case where the coach cancels their own booking.
                    newStatus = 'cancelled_by_user';
                } else if (isCoach && !isOwner) {
                    // This case applies only when the coach cancels a booking that is NOT their own.
                    newStatus = 'cancelled_by_coach';
                } else {
                    // This case shouldn't be reached if the main permission check is correct,
                    // but as a fallback, we treat it as a user cancellation.
                    newStatus = 'cancelled_by_user';
                }
                // --- End of Corrected Logic ---
                // --- MODIFICATION END ---


                db.run('BEGIN TRANSACTION;');

                const updateBookingSql = "UPDATE Bookings SET status = ? WHERE bookingId = ?";
                db.run(updateBookingSql, [newStatus, bookingIdNum], function(updateBookingErr) {
                    if (updateBookingErr) {
                        console.error(`[CancelBooking] Error updating booking status for ${bookingIdNum}:`, updateBookingErr.message);
                        db.run('ROLLBACK;');
                        return res.status(500).json({ error: 'Database error cancelling booking.' });
                    }
                    if (this.changes === 0) {
                        console.error(`[CancelBooking] Failed to update booking status for ${bookingIdNum} (no rows affected).`);
                        db.run('ROLLBACK;');
                        return res.status(500).json({ error: 'Failed to update booking status (no change applied).' });
                    }
                    console.log(`[CancelBooking] Booking ${bookingIdNum} status updated to ${newStatus}.`);

                    const updateSlotSql = `
                        UPDATE AvailabilitySlots
                        SET status = 'available', userId = NULL, bookingId = NULL
                        WHERE slotId = ?
                    `;
                    db.run(updateSlotSql, [booking.slotId], function(updateSlotErr) {
                        if (updateSlotErr) {
                            console.error(`[CancelBooking] Error updating slot status for slot ${booking.slotId}:`, updateSlotErr.message);
                            db.run('ROLLBACK;');
                            return res.status(500).json({ error: 'Database error updating slot status.' });
                        }
                        console.log(`[CancelBooking] Slot ${booking.slotId} status updated to available.`);

                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) {
                                console.error("[CancelBooking] Error committing transaction:", commitErr.message);
                                return res.status(500).json({ error: 'Database error committing cancellation.' });
                            }

                            // Send response to the client first to not delay the UI
                            res.status(200).json({ message: 'Booking cancelled successfully.' });

                            // --- SEND CANCELLATION NOTIFICATIONS ---
                            // This part happens after the response has been sent.
                            console.log('[Notification] Preparing cancellation notifications...');
                            const cancellationTemplateId = 'azP4v48iJE9jwlqYZuXJ7nHgXUSxUdd8ulUvzK19-sM';

                            // Format the data for the template keywords
                            const bookingStartTime = new Date(originalBookingDetailsForNotification.startTime);
                            const formattedTimeSlot = `${format(bookingStartTime, 'MM月dd日 HH:mm')}`; // Shorter format

                            // --- MODIFICATION START ---
                            let cancellationReason = '';
                            if (newStatus === 'cancelled_by_user') {
                                cancellationReason = '用户主动取消'; // "Cancelled by user"
                            } else if (newStatus === 'cancelled_by_coach') {
                                cancellationReason = '教练取消了此预约'; // "The coach has cancelled this appointment"
                            }
                            // --- MODIFICATION END ---

                            const studentMessageData = {
                                "thing1": { "value": "辅导预约已取消" },       // 预约主题
                                "thing4": { "value": cancellationReason },  // 取消原因
                                "thing8": { "value": formattedTimeSlot }    // 预约时段
                            };

                            const coachMessageData = {
                                "thing1": { "value": `预约已被取消` },       // 预约主题
                                "thing4": { "value": cancellationReason },  // 取消原因
                                "thing8": { "value": formattedTimeSlot }    // 预约时段
                            };

                            // Send to student
                            sendSubscribeMessage({
                                recipientOpenId: originalBookingDetailsForNotification.userId,
                                templateId: cancellationTemplateId,
                                dataPayload: studentMessageData,
                                pageLink: 'pages/myBookings/myBookings'
                            }).then(success => {
                                if (success) console.log(`[Notification] Cancellation Student (${originalBookingDetailsForNotification.userId}) notification initiated for booking ${bookingIdNum}.`);
                                else console.error(`[Notification] Cancellation Student (${originalBookingDetailsForNotification.userId}) notification failed for booking ${bookingIdNum}.`);
                            });


                            // Send to coach
                            if (originalBookingDetailsForNotification.coachId) {
                                 sendSubscribeMessage({
                                    recipientOpenId: originalBookingDetailsForNotification.coachId,
                                    templateId: cancellationTemplateId,
                                    dataPayload: coachMessageData,
                                    pageLink: 'pages/coachBookings/coachBookings'
                                }).then(success => {
                                    if (success) console.log(`[Notification] Cancellation Coach (${originalBookingDetailsForNotification.coachId}) notification initiated for booking ${bookingIdNum}.`);
                                    else console.error(`[Notification] Cancellation Coach (${originalBookingDetailsForNotification.coachId}) notification failed for booking ${bookingIdNum}.`);
                                });
                            }
                            // --- END NOTIFICATION LOGIC ---
                        }); // End COMMIT
                    }); // End updateSlotSql
                }); // End updateBookingSql
            }); // End findBookingSql
        }); // End db.serialize
    } catch (error) {
        console.error(`[CancelBooking] Outer catch error for booking ${bookingIdNum}:`, error.message);
        res.status(500).json({ error: 'Failed to cancel booking due to an unexpected error.' });
    }
};


const getMyUpcomingBookings = (req, res) => {
    // Get the authenticated user's OpenID from the token payload set by verifyToken middleware
    const studentUserId = req.user.openid;

    if (!studentUserId) {
        return res.status(401).json({ error: "User not authenticated." });
    }

    // Get today's date at the start of the day to find all future bookings
    const currentDate = formatISO(startOfDay(new Date()));

    // --- Corrected Database Query ---
    // This query selects all necessary fields ONLY from the Bookings table.
    const sql = `
        SELECT
            bookingId,
            coachId,
            slotId,
            startTime,
            endTime,
            status
        FROM Bookings
        WHERE userId = ?
          AND status = 'confirmed'
          AND startTime >= ?
        ORDER BY startTime ASC
    `;
    // The parameters for the query remain the same.
    const params = [studentUserId, currentDate];

    console.log(`Querying upcoming confirmed bookings for user ${studentUserId} from ${currentDate}...`);

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("Database error fetching user's upcoming bookings:", err.message);
            return res.status(500).json({ error: "Failed to retrieve your bookings." });
        }
        console.log(`Fetched ${rows.length} upcoming bookings for user ${studentUserId}.`);
        res.json(rows || []);
    });
};

module.exports = {
  createBooking,
  cancelBooking,
  getMyUpcomingBookings,
};