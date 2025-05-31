// backend/controllers/slot.controller.js
const db = require('../database.js');
const {
  parse: parseDate,
  isValid: isValidDate,
  startOfDay,
  endOfDay,
  formatISO,
  startOfWeek, // <-- Add startOfWeek
  endOfWeek,   // <-- Add endOfWeek
  addDays,
} = require('date-fns');

// Controller function to get slots for a specific date
const getSlotsForDate = async (req, res) => {
  const requestedDate = req.query.date; // Get date from query param, e.g., ?date=2025-05-10

  // --- Validate Input Date ---
  if (!requestedDate) {
    return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD).' });
  }

  // Try parsing the date string using date-fns
  // parseDate expects 'yyyy-MM-dd' format directly
  const parsedDate = parseDate(requestedDate, 'yyyy-MM-dd', new Date());

  if (!isValidDate(parsedDate)) {
    return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
  }
  // --- End Validation ---

  // --- Calculate Date Range for Query ---
  // Use date-fns to get the very start and very end of the requested day
  const dayStart = startOfDay(parsedDate);
  const dayEnd = endOfDay(parsedDate);

  // Format for SQLite comparison (ISO 8601 format works well)
  const startTimeQuery = formatISO(dayStart);
  const endTimeQuery = formatISO(dayEnd);
  // --- End Date Range Calculation ---

  // TODO: Determine coachId dynamically later, perhaps from route or authentication
  const coachId = 'COACH_001'; // Hardcoding for now

  try {
    // --- Database Query ---
    const sql = `
      SELECT slotId, startTime, endTime, status
      FROM AvailabilitySlots
      WHERE coachId = ?
        AND startTime >= ?
        AND startTime <= ?
      ORDER BY startTime ASC
    `;

    db.all(sql, [coachId, startTimeQuery, endTimeQuery], (err, rows) => {
      if (err) {
        console.error(`Database error fetching slots for date ${requestedDate}:`, err.message);
        return res.status(500).json({ error: 'Database error fetching slots.' });
      }

      // Return the found slots (or an empty array if none found)
      res.status(200).json(rows || []);
    });
    // --- End Database Query ---

  } catch (error) {
    console.error(`Error in getSlotsForDate controller for date ${requestedDate}:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve slots.' });
  }
};

// Controller function to get AVAILABLE slots for a specific week

const getSlotsForWeek = async (req, res) => {
  const requestedStartDate = req.query.startDate; // This is 'today' from frontend

  if (!requestedStartDate) {
    return res.status(400).json({ error: 'Missing required query parameter: startDate (YYYY-MM-DD).' });
  }
  const parsedStartDate = parseDate(requestedStartDate, 'yyyy-MM-dd', new Date());
  if (!isValidDate(parsedStartDate)) {
    return res.status(400).json({ error: 'Invalid startDate format. Please use yyyy-MM-dd.' });
  }

  // Fetch slots for the next 7 days starting from parsedStartDate (today)
  const queryRangeStart = startOfDay(parsedStartDate);
  const queryRangeEnd = endOfDay(addDays(parsedStartDate, 6)); // Today + 6 more days = 7 day window

  const startTimeQuery = formatISO(queryRangeStart);
  const endTimeQuery = formatISO(queryRangeEnd);

  const designatedCoachId = process.env.COACH_OPENID;
  if (!designatedCoachId) {
      console.error("COACH_OPENID is not set in environment variables. Cannot fetch slots.");
      return res.status(500).json({ error: 'Server configuration error: Coach ID missing.' });
  }

  try {
    const sql = `
      SELECT slotId, startTime, endTime, status
      FROM AvailabilitySlots
      WHERE coachId = ?
        AND status = 'available'
        AND startTime >= ?
        AND startTime <= ?
      ORDER BY startTime ASC
    `;

    console.log(`[SlotController] Querying available slots from ${startTimeQuery} to ${endTimeQuery} for coach ${designatedCoachId}`);

    db.all(sql, [designatedCoachId, startTimeQuery, endTimeQuery], (err, rows) => {
      if (err) {
        console.error(`[SlotController] Database error fetching slots for date range:`, err.message);
        return res.status(500).json({ error: 'Database error fetching slots for date range.' });
      }
      res.status(200).json(rows || []);
    });
  } catch (error) {
    console.error(`[SlotController] Error in getSlotsForWeek controller:`, error.message);
    res.status(500).json({ error: 'Failed to retrieve slots for date range.' });
  }
};

module.exports = {
  getSlotsForDate,
  getSlotsForWeek,
};