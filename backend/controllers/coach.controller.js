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
    isBefore,
    isAfter,
    parse: parseDate,
    isValid: isValidDate,
    startOfDay,
    endOfDay,
    format: formatDate, // Use format for consistency
} = require('date-fns');
const { utcToZonedTime, zonedTimeToUtc, formatInTimeZone } = require('date-fns-tz');

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
// MODIFICATION START: Replaced the entire updateCoachConfig function
const updateCoachConfig = async (req, res) => {
    if (!checkCoachAuthorization(req, res)) return;
    const coachOpenId = req.user.openid;
    try {
        const { weeklyTemplate, sessionDurationMinutes } = req.body;
        const weeklyTemplateString = JSON.stringify(weeklyTemplate);
        const sql = `
            INSERT INTO CoachConfig (coachId, weeklyTemplate, sessionDurationMinutes) VALUES (?, ?, ?)
            ON DUPLICATE KEY UPDATE
            weeklyTemplate = VALUES(weeklyTemplate), sessionDurationMinutes = VALUES(sessionDurationMinutes)`;
        await pool.query(sql, [coachOpenId, weeklyTemplateString, sessionDurationMinutes]);

        await regenerateAvailabilitySlots(coachOpenId, weeklyTemplate, sessionDurationMinutes);
        res.status(200).json({ message: 'Configuration saved and slots regenerated successfully.' });
    } catch (error) {
        console.error("Error in updateCoachConfig:", error.message);
             res.status(500).json({ error: 'Failed to save coach configuration.' });
        }
};
// MODIFICATION END

// Regenerate slots - Heavily modified for MySQL transactions and batch inserts
// MODIFICATION START: Replaced the entire regenerateAvailabilitySlots function
async function regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes) {
    const TIMEZONE = process.env.TIMEZONE || 'Asia/Shanghai';
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const fetchBookedSql = `SELECT startTime, endTime FROM AvailabilitySlots WHERE coachId = ? AND status = 'booked' AND startTime >= ?`;
        const [bookedSlotsData] = await connection.query(fetchBookedSql, [coachId, new Date()]);
        
        // FIX 1: Directly use Date objects from the database
        const bookedIntervals = bookedSlotsData.map(slot => ({
            start: slot.startTime,
            end: slot.endTime
        }));

        const deleteSql = `DELETE FROM AvailabilitySlots WHERE coachId = ? AND status = 'available'`;
        await connection.query(deleteSql, [coachId]);

        const insertSlots = [];
        const nowInTimezone = utcToZonedTime(new Date(), TIMEZONE);
        const todayInTimezone = startOfDay(nowInTimezone);
        const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

        for (let i = 0; i < 56; i++) { // 8 weeks
            const currentDateInTimezone = addDays(todayInTimezone, i);
            const dayName = dayMapping[getDay(currentDateInTimezone)];
            const timeSlots = weeklyTemplate[dayName];
            if (Array.isArray(timeSlots)) {
                for (const timeString of timeSlots) {
                        const [hour, minute] = timeString.split(':').map(Number);
                    const slotStartTimeInTimezone = setMilliseconds(setSeconds(setMinutes(setHours(currentDateInTimezone, hour), minute), 0), 0);
                        const slotStartTimeUtc = zonedTimeToUtc(slotStartTimeInTimezone, TIMEZONE);

                    if (isAfter(slotStartTimeUtc, new Date())) {
                            const slotEndTimeUtc = addMinutes(slotStartTimeUtc, sessionDurationMinutes);
                        const isConflict = bookedIntervals.some(interval => isBefore(slotStartTimeUtc, interval.end) && isAfter(slotEndTimeUtc, interval.start));
                            if (!isConflict) {
                            insertSlots.push([coachId, slotStartTimeUtc, slotEndTimeUtc, 'available']);
                        }
                    }
                }
            }
        }

        if (insertSlots.length > 0) {
            const insertSql = "INSERT INTO AvailabilitySlots (coachId, startTime, endTime, status) VALUES ?";
            await connection.query(insertSql, [insertSlots]);
        }
        await connection.commit();
    } catch (error) {
        await connection.rollback();
        console.error(`Critical error during slot regeneration:`, error);
        throw error;
    } finally {
        connection.release();
    }
}
// MODIFICATION END

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