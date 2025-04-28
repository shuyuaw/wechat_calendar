// backend/controllers/slot.controller.js
const db = require('../database.js');
const {
  parse: parseDate, // Rename to avoid conflict with JSON.parse if needed later
  isValid: isValidDate,
  startOfDay,
  endOfDay,
  formatISO,
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

module.exports = {
  getSlotsForDate,
};