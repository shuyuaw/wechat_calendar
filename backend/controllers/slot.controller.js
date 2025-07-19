// backend/controllers/slot.controller.js
const pool = require('../database.js'); // Use the new MySQL pool
const {
  parse: parseDate,
  isValid: isValidDate,
  startOfDay,
  endOfDay,
  addDays,
  parseISO, // Import parseISO
} = require('date-fns');
const { formatInTimeZone } = require('date-fns-tz'); // Import formatInTimeZone

// Get slots for a specific date
const getSlotsForDate = async (req, res) => {
  const { date } = req.query;

  if (!date) {
    return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD).' });
  }
  const parsedDate = parseDate(date, 'yyyy-MM-dd', new Date());
  if (!isValidDate(parsedDate)) {
    return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
  }

  const TIMEZONE = process.env.TIMEZONE || 'Asia/Shanghai'; // Use the same timezone as coach.controller
  const startOfDayInTimezone = startOfDay(parsedDate);
  const endOfDayInTimezone = endOfDay(parsedDate);

  // Convert to UTC for database query
  const startTimeQuery = formatInTimeZone(startOfDayInTimezone, 'UTC', 'yyyy-MM-dd HH:mm:ss');
  const endTimeQuery = formatInTimeZone(endOfDayInTimezone, 'UTC', 'yyyy-MM-dd HH:mm:ss');

  const coachId = process.env.COACH_OPENID;
  if (!coachId) {
      return res.status(500).json({ error: 'Server configuration error: Coach ID missing.' });
  }

  try {
    const sql = `
      SELECT slotId, startTime, endTime, status
      FROM AvailabilitySlots
      WHERE coachId = ? AND startTime >= ? AND startTime <= ?
      ORDER BY startTime ASC
    `;
    const [rows] = await pool.query(sql, [coachId, startTimeQuery, endTimeQuery]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(`Error in getSlotsForDate:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve slots.' });
  }
};

// Get available slots for the next 7 days
const getSlotsForWeek = async (req, res) => {
  const { startDate } = req.query;

  if (!startDate) {
    return res.status(400).json({ error: 'Missing required query parameter: startDate (YYYY-MM-DD).' });
  }
  const parsedStartDate = parseDate(startDate, 'yyyy-MM-dd', new Date());
  if (!isValidDate(parsedStartDate)) {
    return res.status(400).json({ error: 'Invalid startDate format. Please use yyyy-MM-dd.' });
  }

  const TIMEZONE = process.env.TIMEZONE || 'Asia/Shanghai'; // Use the same timezone as coach.controller
  const startOfRangeInTimezone = startOfDay(parsedStartDate);
  const endOfRangeInTimezone = endOfDay(addDays(parsedStartDate, 6));

  // Convert to UTC for database query
  const queryRangeStart = formatInTimeZone(startOfRangeInTimezone, 'UTC', 'yyyy-MM-dd HH:mm:ss');
  const queryRangeEnd = formatInTimeZone(endOfRangeInTimezone, 'UTC', 'yyyy-MM-dd HH:mm:ss');

  const coachId = process.env.COACH_OPENID;
  if (!coachId) {
      return res.status(500).json({ error: 'Server configuration error: Coach ID missing.' });
  }

  try {
    const sql = `
      SELECT slotId, startTime, endTime, status
      FROM AvailabilitySlots
      WHERE coachId = ? AND status = 'available' AND startTime >= ? AND startTime <= ?
      ORDER BY startTime ASC
    `;
    const [rows] = await pool.query(sql, [coachId, queryRangeStart, queryRangeEnd]);
    res.status(200).json(rows);
  } catch (error) {
    console.error(`Error in getSlotsForWeek:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve slots for the week.' });
  }
};

// Delete a specific slot (Note: This is likely an admin-only function)
const deleteSlot = async (req, res) => {
  const { slotId } = req.params;

  if (!slotId || isNaN(parseInt(slotId))) {
    return res.status(400).json({ error: 'Invalid or missing slotId.' });
  }

  try {
    const sql = "DELETE FROM AvailabilitySlots WHERE slotId = ?";
    const [result] = await pool.query(sql, [slotId]);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Slot not found.' });
    }

    res.status(200).json({ message: `Slot ${slotId} deleted successfully.` });
  } catch (error) {
    console.error(`Error in deleteSlot for slotId ${slotId}:`, error.message);
    res.status(500).json({ error: 'Failed to delete the slot.' });
  }
};

module.exports = {
  getSlotsForDate,
  getSlotsForWeek,
  deleteSlot,
};
