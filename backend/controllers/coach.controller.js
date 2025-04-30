// backend/controllers/coach.controller.js
const db = require('../database.js');
const {
  addDays,
  addMinutes,
  getDay,
  setHours,
  setMinutes,
  setSeconds,
  setMilliseconds,
  parseISO, // <-- Add parseISO
  isBefore, // <-- Add isBefore
  isAfter,   // <-- Add isAfter
  parse: parseDate,
  isValid: isValidDate,
  startOfDay,
  endOfDay,
  formatISO,
} = require('date-fns');

// Controller function to get coach config
const getCoachConfig = async (req, res) => {
  // TODO: Implement authentication/authorization - Ensure only the coach can access this.

  try {
    const sql = "SELECT coachId, weeklyTemplate, sessionDurationMinutes FROM CoachConfig LIMIT 1";
    db.get(sql, [], (err, row) => {
      if (err) {
        console.error("Database error getting coach config:", err.message);
        return res.status(500).json({ error: 'Database error fetching configuration.' });
      }

      if (!row) {
        return res.status(404).json({ error: 'Coach configuration not found.' });
      }

      let configData = { ...row };
      try {
        if (configData.weeklyTemplate) {
            configData.weeklyTemplate = JSON.parse(configData.weeklyTemplate);
        } else {
            configData.weeklyTemplate = null;
        }
      } catch (parseError) {
        console.error("Error parsing weeklyTemplate JSON:", parseError.message);
        return res.status(500).json({ error: 'Error processing configuration data.' });
      }
      res.status(200).json(configData);
    });
  } catch (error) {
    console.error("Error in getCoachConfig controller:", error.message);
    res.status(500).json({ error: 'Failed to retrieve coach configuration.' });
  }
};

// Controller function to update coach config (CORRECTED VERSION)
const updateCoachConfig = async (req, res) => {
  // TODO: Implement authentication/authorization - Ensure only the coach can access this.

  try {
    const { coachId, weeklyTemplate, sessionDurationMinutes } = req.body;

    // --- Input Validation --- (Keep existing validation)
    if (!coachId || !weeklyTemplate || sessionDurationMinutes === undefined) {
        return res.status(400).json({ error: 'Missing required configuration fields (coachId, weeklyTemplate, sessionDurationMinutes).' });
    }
    if (typeof sessionDurationMinutes !== 'number' || sessionDurationMinutes <= 0) {
        return res.status(400).json({ error: 'sessionDurationMinutes must be a positive number.' });
    }
    if (typeof weeklyTemplate !== 'object' || weeklyTemplate === null) {
        return res.status(400).json({ error: 'weeklyTemplate must be a valid object.' });
    }
    // --- End Validation ---

    let weeklyTemplateString;
    try {
      weeklyTemplateString = JSON.stringify(weeklyTemplate);
    } catch (stringifyError) {
      console.error("Error stringifying weeklyTemplate:", stringifyError.message);
      return res.status(400).json({ error: 'Invalid weeklyTemplate JSON format.' });
    }

    // --- Database Upsert (Insert or Replace) ---
    const sql = `
      INSERT INTO CoachConfig (coachId, weeklyTemplate, sessionDurationMinutes)
      VALUES (?, ?, ?)
      ON CONFLICT(coachId) DO UPDATE SET
        weeklyTemplate=excluded.weeklyTemplate,
        sessionDurationMinutes=excluded.sessionDurationMinutes
    `;

    // Make the callback async to use await inside
    db.run(sql, [coachId, weeklyTemplateString, sessionDurationMinutes], async function(err) { // <-- Added async here
      if (err) {
        console.error("Database error upserting coach config:", err.message);
        return res.status(500).json({ error: 'Database error saving configuration.' });
      }

      console.log(`Coach config saved/updated for coachId: ${coachId}. Rows affected: ${this.changes}`);

      // --- Trigger Slot Regeneration ---
      try { // <-- Added try block
        // Await the completion of the regeneration process
        const regenResult = await regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes); // <-- Added await call
        console.log(`Slot regeneration completed. Slots generated: ${regenResult.slotsGenerated}, Skipped: ${regenResult.slotsSkipped}`); // <-- Added more detailed log

        // Respond with success ONLY after regeneration finishes
        res.status(200).json({ message: 'Configuration saved and slots regenerated successfully.' }); // <-- Updated message

      } catch (regenError) { // <-- Added catch block
        console.error("Error during slot regeneration:", regenError.message);
        // Config was saved, but slot regeneration failed. Send an error.
        res.status(500).json({ error: 'Configuration saved, but failed to regenerate availability slots.' });
      }
      // --- End Slot Regeneration ---

    }); // End db.run callback
    // --- End Database ---

  } catch (error) {
    console.error("Error in updateCoachConfig controller:", error.message);
    res.status(500).json({ error: 'Failed to save coach configuration.' });
  }
};

// Updated function to handle deleting old slots and generating new ones with conflict check
async function regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes) {
  console.log(`Regenerating slots for coachId: ${coachId} with conflict check.`);
  const WEEKS_TO_GENERATE = 8;
  const today = startOfDay(new Date());
  const todayISO = formatISO(today);

  try {
    // --- Step 1: Fetch future booked slots for conflict checking ---
    const fetchBookedSql = `
      SELECT startTime, endTime
      FROM AvailabilitySlots
      WHERE coachId = ?
        AND status = 'booked'
        AND startTime >= ?
    `;
    console.log(`Fetching future booked slots from ${todayISO} onwards...`);

    // Wrap db.all in a Promise to use await
    const bookedSlotsData = await new Promise((resolve, reject) => {
      db.all(fetchBookedSql, [coachId, todayISO], (err, rows) => {
        if (err) {
          console.error("Error fetching booked slots:", err.message);
          return reject(new Error('Failed to fetch booked slots.'));
        }
        resolve(rows);
      });
    });

    // Parse fetched booked slots into Date objects for easier comparison
    const bookedIntervals = bookedSlotsData.map(slot => ({
      start: parseISO(slot.startTime),
      end: parseISO(slot.endTime)
    }));
    console.log(`Found ${bookedIntervals.length} future booked slots to check against.`);

    // Use db.serialize to ensure delete happens before inserts start in earnest
    // Wrap the whole serialize block in a promise as well
    const generationResult = await new Promise((resolve, reject) => {
        db.serialize(async () => { // Mark callback as async if using await inside (though not strictly needed here)
            // --- Step 2: Delete existing future 'available' slots ---
            const deleteSql = `
                DELETE FROM AvailabilitySlots
                WHERE coachId = ?
                AND status = 'available'
                AND startTime >= ?
            `;
            console.log(`Deleting future available slots from ${todayISO} onwards...`);

            // Wrap db.run in a promise
            const deleteResult = await new Promise((res, rej) => {
                 db.run(deleteSql, [coachId, todayISO], function(deleteErr) {
                    if (deleteErr) {
                        console.error("Error deleting old availability slots:", deleteErr.message);
                        return rej(new Error('Failed to delete old slots.'));
                    }
                    console.log(`Deleted ${this.changes} old available slots.`);
                    res(this.changes);
                 });
            });


            // --- Step 3: Prepare statement for inserting new slots ---
            const insertSql = `
                INSERT INTO AvailabilitySlots
                (coachId, startTime, endTime, status)
                VALUES (?, ?, ?, 'available')
            `;
            // Prepare statement (handle potential errors)
            const stmt = await new Promise((res, rej) => {
                 const prepStmt = db.prepare(insertSql, (prepareErr) => {
                    if (prepareErr) {
                        console.error("Error preparing insert statement:", prepareErr.message);
                        return rej(new Error('Failed to prepare slot insertion statement.'));
                    }
                    res(prepStmt);
                 });
            });


            // --- Step 4: Generate and insert new slots, checking for conflicts ---
            console.log(`Generating new slots for the next ${WEEKS_TO_GENERATE} weeks...`);
            let slotsGenerated = 0;
            let slotsSkipped = 0;
            const daysToGenerate = WEEKS_TO_GENERATE * 7;
            const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

            for (let i = 0; i < daysToGenerate; i++) {
                const currentDate = addDays(today, i);
                const dayOfWeekIndex = getDay(currentDate);
                const dayName = dayMapping[dayOfWeekIndex];
                const timeSlots = weeklyTemplate[dayName];

                if (timeSlots && timeSlots.length > 0) {
                    for (const timeString of timeSlots) { // Use for...of for clarity
                        try {
                            const [hour, minute] = timeString.split(':').map(Number);
                            // Ensure calculation is based on consistent base date + time
                            const slotStartTime = setMilliseconds(setSeconds(setMinutes(setHours(currentDate, hour), minute), 0), 0);
                            const slotEndTime = addMinutes(slotStartTime, sessionDurationMinutes);

                            // Check for conflicts with booked slots
                            let isConflict = false;
                            for (const bookedInterval of bookedIntervals) {
                                // Check overlap: new_start < booked_end AND new_end > booked_start
                                if (isBefore(slotStartTime, bookedInterval.end) && isAfter(slotEndTime, bookedInterval.start)) {
                                    isConflict = true;
                                    slotsSkipped++;
                                    console.log(`Conflict detected: Skipping generation for ${formatISO(slotStartTime)} due to booked slot ${formatISO(bookedInterval.start)} - ${formatISO(bookedInterval.end)}`);
                                    break; // No need to check further booked slots for this potential slot
                                }
                            }

                            // Insert only if no conflict was found
                            if (!isConflict) {
                                let startTimeISO = formatISO(slotStartTime);
                                let endTimeISO = formatISO(slotEndTime);

                                // Wrap stmt.run in a promise (optional if just logging errors)
                                await new Promise((res_run, rej_run) => {
                                    stmt.run(coachId, startTimeISO, endTimeISO, function(insertErr) {
                                        if (insertErr) {
                                            console.error(`Error inserting slot for ${startTimeISO}:`, insertErr.message);
                                            // Log but continue? Or reject? For now, log and continue.
                                            // Consider adding to an error list to return later.
                                        } else {
                                            slotsGenerated++;
                                        }
                                        res_run(); // Resolve even if error occurred, as we decided to continue
                                    });
                                });
                            }
                        } catch (timeErr) {
                            console.error(`Error processing timeString "${timeString}" for ${formatISO(currentDate)}:`, timeErr.message);
                        }
                    } // End loop through timeSlots
                }
            } // End loop through daysToGenerate

            // Finalize the statement
            await new Promise((res_fin, rej_fin) => {
                stmt.finalize((finalizeErr) => {
                    if (finalizeErr) {
                        console.error("Error finalizing statement:", finalizeErr.message);
                        return rej_fin(new Error('Failed to finalize slot insertion.'));
                    }
                    console.log(`Slot generation complete. Generated: ${slotsGenerated}, Skipped due to conflicts: ${slotsSkipped}.`);
                    res_fin();
                });
            });

            resolve({ slotsGenerated, slotsSkipped }); // Resolve outer promise

        }); // End db.serialize
    }); // End generationResult Promise

    return generationResult; // Return the result object

  } catch (error) {
    console.error("Critical error during slot regeneration:", error.message);
    // Re-throw the error to be caught by the calling function (updateCoachConfig)
    throw error;
  }
}

// Controller function for the coach to get confirmed bookings for a specific date
const getCoachBookingsForDate = async (req, res) => {
  // TODO: Implement authentication - Verify requester is the coach
  // For now, assume the coach making the request corresponds to COACH_001
  const coachId = 'COACH_001';

  const requestedDate = req.query.date; // Get date from query param

  // --- Validate Input Date ---
  if (!requestedDate) {
      return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD).' });
  }
  const parsedDate = parseDate(requestedDate, 'yyyy-MM-dd', new Date());
  if (!isValidDate(parsedDate)) {
      return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
  }
  // --- End Validation ---

  // --- Calculate Date Range for Query ---
  const dayStart = startOfDay(parsedDate);
  const dayEnd = endOfDay(parsedDate);
  const startTimeQuery = formatISO(dayStart);
  const endTimeQuery = formatISO(dayEnd);
  // --- End Date Range Calculation ---

  try {
      // --- Database Query ---
      // Select booking details and join with Users table to get student nickname
      const sql = `
          SELECT
              b.bookingId,
              b.slotId,
              b.startTime,
              b.endTime,
              b.status,
              b.userId,
              u.nickName AS userNickName
          FROM Bookings b
          LEFT JOIN Users u ON b.userId = u.userId
          WHERE b.coachId = ?
            AND b.startTime >= ?
            AND b.startTime <= ?
            AND b.status = 'confirmed' -- Only show confirmed bookings
          ORDER BY b.startTime ASC
      `;

      console.log(`Querying confirmed bookings for coach ${coachId} on ${requestedDate}`);

      db.all(sql, [coachId, startTimeQuery, endTimeQuery], (err, rows) => {
          if (err) {
              console.error(`Database error fetching coach bookings for date ${requestedDate}:`, err.message);
              return res.status(500).json({ error: 'Database error fetching bookings.' });
          }
          res.status(200).json(rows || []); // Return found bookings or empty array
      });
      // --- End Database Query ---

  } catch (error) {
      console.error(`Error in getCoachBookingsForDate controller for date ${requestedDate}:`, error.message);
      res.status(500).json({ error: 'Failed to retrieve coach bookings.' });
  }
};

module.exports = {
  getCoachConfig,
  updateCoachConfig,
  getCoachBookingsForDate, // <-- Add this line
  // Make sure regenerateAvailabilitySlots is NOT exported unless needed externally
};