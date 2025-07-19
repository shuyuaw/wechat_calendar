// backend/controllers/coach.controller.js
const pool = require('../database.js'); // Use the new MySQL pool
const {
    addDays,
    addMinutes,
    getDay,
    setHours,
    setMinutes,
    setSeconds,
    setMilliseconds,
    parseISO,
    isBefore,
    isAfter,
    parse: parseDate,
    isValid: isValidDate,
    startOfDay,
    endOfDay,
    format: formatDate, // Use format for consistency
} = require('date-fns');

// Authorization Helper - no changes needed here
const checkCoachAuthorization = (req, res) => {
    const loggedInUserId = req.user?.openid;
    const designatedCoachId = process.env.COACH_OPENID;

    if (!loggedInUserId) {
        res.status(401).json({ error: "Unauthorized: Missing user identification." });
        return false;
    }
    if (!designatedCoachId) {
        console.error("[AuthZ] COACH_OPENID is not configured in .env");
        res.status(500).json({ error: "Server configuration error." });
        return false;
    }
    if (loggedInUserId !== designatedCoachId) {
        res.status(403).json({ error: "Forbidden: You do not have permission to perform this action." });
        return false;
    }
    return true;
};

// Get coach config - Converted to MySQL
const getCoachConfig = async (req, res) => {
    if (!checkCoachAuthorization(req, res)) return;
    const coachOpenId = req.user.openid;

    try {
        const sql = "SELECT coachId, weeklyTemplate, sessionDurationMinutes FROM CoachConfig WHERE coachId = ? LIMIT 1";
        const [rows] = await pool.query(sql, [coachOpenId]);

        if (rows.length === 0) {
            console.log("Coach configuration not found in database. Returning default.");
            return res.status(200).json({ coachId: coachOpenId, weeklyTemplate: null, sessionDurationMinutes: 60 });
        }

        let configData = rows[0];
        if (configData.weeklyTemplate && typeof configData.weeklyTemplate === 'string') {
            configData.weeklyTemplate = JSON.parse(configData.weeklyTemplate);
        }
        res.status(200).json(configData);

    } catch (error) {
        console.error("Error in getCoachConfig:", error.message);
        res.status(500).json({ error: 'Failed to retrieve coach configuration.' });
    }
};

// Update coach config - Converted to MySQL
const updateCoachConfig = async (req, res) => {
    if (!checkCoachAuthorization(req, res)) return;
    const coachOpenId = req.user.openid;

    try {
        const { weeklyTemplate, sessionDurationMinutes } = req.body;

        if (weeklyTemplate === undefined || sessionDurationMinutes === undefined) {
            return res.status(400).json({ error: 'Missing required fields.' });
        }
        if (typeof sessionDurationMinutes !== 'number' || sessionDurationMinutes <= 0) {
            return res.status(400).json({ error: 'sessionDurationMinutes must be a positive number.' });
        }
        if (typeof weeklyTemplate !== 'object' || weeklyTemplate === null || Array.isArray(weeklyTemplate)) {
            return res.status(400).json({ error: 'weeklyTemplate must be a valid object.' });
        }

        const weeklyTemplateString = JSON.stringify(weeklyTemplate);

        // MySQL's "UPSERT" syntax
        const sql = `
            INSERT INTO CoachConfig (coachId, weeklyTemplate, sessionDurationMinutes)
            VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
               weeklyTemplate = VALUES(weeklyTemplate),
               sessionDurationMinutes = VALUES(sessionDurationMinutes)
        `;

        await pool.query(sql, [coachOpenId, weeklyTemplateString, sessionDurationMinutes]);
        console.log(`Coach config saved/updated for coachId: ${coachOpenId}.`);

        const regenResult = await regenerateAvailabilitySlots(coachOpenId, weeklyTemplate, sessionDurationMinutes);
        console.log(`Slot regeneration completed. Generated: ${regenResult.slotsGenerated}, Skipped: ${regenResult.slotsSkipped}`);
        res.status(200).json({ message: 'Configuration saved and slots regenerated successfully.' });

    } catch (error) {
        console.error("Error in updateCoachConfig:", error.message);
        // Check if the error is from regeneration and tailor the message
        if (error.message.includes('regenerate')) {
             res.status(500).json({ error: 'Configuration saved, but failed to regenerate availability slots.' });
        } else {
             res.status(500).json({ error: 'Failed to save coach configuration.' });
        }
    }
};

// Regenerate slots - Heavily modified for MySQL transactions and batch inserts
async function regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes) {
    console.log(`Regenerating slots for coachId: ${coachId}.`);
    const WEEKS_TO_GENERATE = 8;
    const today = startOfDay(new Date());
    const currentTime = new Date();
    
    // Use a single connection for the entire transaction
    const connection = await pool.getConnection();
    
    try {
        await connection.beginTransaction();

        const fetchBookedSql = `
            SELECT startTime, endTime FROM AvailabilitySlots
            WHERE coachId = ? AND status = 'booked' AND startTime >= ?
        `;
        const [bookedSlotsData] = await connection.query(fetchBookedSql, [coachId, formatDate(today, 'yyyy-MM-dd HH:mm:ss')]);
        const bookedIntervals = bookedSlotsData.map(slot => ({
            start: slot.startTime,
            end: slot.endTime
        }));
        console.log(`Found ${bookedIntervals.length} future booked slots.`);

        const deleteSql = `DELETE FROM AvailabilitySlots WHERE coachId = ? AND status = 'available'`;
        const [deleteResult] = await connection.query(deleteSql, [coachId]);
        console.log(`Deleted ${deleteResult.affectedRows} old available slots.`);

        let slotsGenerated = 0;
        let slotsSkipped = 0;
        const daysToGenerate = WEEKS_TO_GENERATE * 7;
        const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const insertSlots = [];

        for (let i = 0; i < daysToGenerate; i++) {
            const currentDate = addDays(today, i);
            const dayName = dayMapping[getDay(currentDate)];
            const timeSlots = weeklyTemplate[dayName];

            if (Array.isArray(timeSlots) && timeSlots.length > 0) {
                for (const timeString of timeSlots) {
                    try {
                        const [hour, minute] = timeString.split(':').map(Number);
                        const slotStartTime = setMilliseconds(setSeconds(setMinutes(setHours(currentDate, hour), minute), 0), 0);

                        if (isAfter(slotStartTime, currentTime)) {
                            const slotEndTime = addMinutes(slotStartTime, sessionDurationMinutes);
                            const isConflict = bookedIntervals.some(interval =>
                                isBefore(slotStartTime, interval.end) && isAfter(slotEndTime, interval.start)
                            );

                            if (!isConflict) {
                                // Format for MySQL DATETIME column
                                insertSlots.push([
                                    coachId,
                                    formatDate(slotStartTime, 'yyyy-MM-dd HH:mm:ss'),
                                    formatDate(slotEndTime, 'yyyy-MM-dd HH:mm:ss'),
                                    'available'
                                ]);
                                slotsGenerated++;
                            } else {
                                slotsSkipped++;
                            }
                        } else {
                            slotsSkipped++;
                        }
                    } catch (timeErr) {
                        console.error(`Error processing timeString "${timeString}"`, timeErr);
                        slotsSkipped++;
                    }
                }
            }
        }

        if (insertSlots.length > 0) {
            const insertSql = "INSERT INTO AvailabilitySlots (coachId, startTime, endTime, status) VALUES ?";
            await connection.query(insertSql, [insertSlots]);
        }

        await connection.commit();
        console.log(`Slot generation transaction committed. Generated: ${slotsGenerated}, Skipped: ${slotsSkipped}.`);
        return { slotsGenerated, slotsSkipped };

    } catch (error) {
        await connection.rollback();
        console.error(`Critical error during slot regeneration for coach ${coachId}, transaction rolled back:`, error);
        throw new Error('Failed to regenerate slots.'); // Propagate a clearer error
    } finally {
        connection.release();
    }
}

// Get coach bookings for a date - Converted to MySQL
const getCoachBookingsForDate = async (req, res) => {
    if (!checkCoachAuthorization(req, res)) return;
    const coachOpenId = req.user.openid;
    const { date } = req.query;

    if (!date) {
        return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD).' });
    }
    const parsedDate = parseDate(date, 'yyyy-MM-dd', new Date());
    if (!isValidDate(parsedDate)) {
        return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
    }

    const startTimeQuery = formatDate(startOfDay(parsedDate), 'yyyy-MM-dd HH:mm:ss');
    const endTimeQuery = formatDate(endOfDay(parsedDate), 'yyyy-MM-dd HH:mm:ss');

    try {
        const sql = `
            SELECT b.bookingId, b.slotId, b.startTime, b.endTime, b.status, b.userId, u.nickName AS userNickName
            FROM Bookings b
            LEFT JOIN Users u ON b.userId = u.userId
            WHERE b.coachId = ? AND b.startTime >= ? AND b.startTime <= ? AND b.status = 'confirmed'
            ORDER BY b.startTime ASC
        `;
        const [rows] = await pool.query(sql, [coachOpenId, startTimeQuery, endTimeQuery]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error in getCoachBookingsForDate:`, error.message);
        res.status(500).json({ error: 'Failed to retrieve coach bookings.' });
    }
};

// Get all coach bookings - Converted to MySQL
const getAllCoachBookings = async (req, res) => {
    if (!checkCoachAuthorization(req, res)) return;
    const coachOpenId = req.user.openid;

    try {
        const sql = `
            SELECT b.bookingId, b.slotId, b.startTime, b.endTime, b.status, b.userId, u.nickName AS userNickName
            FROM Bookings b
            LEFT JOIN Users u ON b.userId = u.userId
            WHERE b.coachId = ? AND b.status = 'confirmed'
            ORDER BY b.startTime ASC
        `;
        const [rows] = await pool.query(sql, [coachOpenId]);
        res.status(200).json(rows);
    } catch (error) {
        console.error(`Error in getAllCoachBookings:`, error.message);
        res.status(500).json({ error: 'Failed to retrieve all coach bookings.' });
    }
};

module.exports = {
    getCoachConfig,
    updateCoachConfig,
    getCoachBookingsForDate,
    getAllCoachBookings,
};
