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
    parseISO,
    isBefore,
    isAfter,
    parse: parseDate,
    isValid: isValidDate,
    startOfDay,
    endOfDay,
    formatISO,
} = require('date-fns');

// --- Authorization Helper Function (Optional but Recommended) ---
// You can keep the checks inline, or use a helper for cleaner code
const checkCoachAuthorization = (req, res) => {
    const loggedInUserId = req.user?.openid; // Get OpenID from verified token (added by verifyToken middleware)
    const designatedCoachId = process.env.COACH_OPENID; // Get Coach ID from config

    if (!loggedInUserId) {
        // This case should technically be caught by verifyToken middleware, but good to double-check
        console.error("[AuthZ] No user OpenID found in request after verifyToken.");
        res.status(401).json({ error: "Unauthorized: Missing user identification." });
        return false; // Indicate authorization failed
    }

    if (!designatedCoachId) {
        console.error("[AuthZ] COACH_OPENID is not configured in .env");
        res.status(500).json({ error: "Server configuration error." });
        return false; // Indicate authorization failed
    }

    if (loggedInUserId !== designatedCoachId) {
        console.warn(`[AuthZ] Forbidden attempt. User: ${loggedInUserId} is not the designated coach (${designatedCoachId}).`);
        res.status(403).json({ error: "Forbidden: You do not have permission to perform this action." });
        return false; // Indicate authorization failed
    }

    // If all checks pass
    console.log(`[AuthZ] Access granted for coach: ${loggedInUserId}`);
    return true; // Indicate authorization succeeded
};
// --- End Authorization Helper ---


// Controller function to get coach config
const getCoachConfig = async (req, res) => {
    // --- Authorization Check ---
    if (!checkCoachAuthorization(req, res)) {
        return; // Stop execution if authorization fails
    }
    // If authorization passes, req.user.openid is confirmed to be the coach's openid
    const coachOpenId = req.user.openid; // Use the verified coach's openid
    // --- End Authorization Check ---

    try {
        // Use coachOpenId (which *is* the designated coach's ID) to potentially fetch config if needed,
        // though for a single coach, LIMIT 1 might be sufficient. Let's keep LIMIT 1 for simplicity now.
        const sql = "SELECT coachId, weeklyTemplate, sessionDurationMinutes FROM CoachConfig LIMIT 1";
        db.get(sql, [], (err, row) => {
            if (err) {
                console.error("Database error getting coach config:", err.message);
                return res.status(500).json({ error: 'Database error fetching configuration.' });
            }

            if (!row) {
                // Configuration might not exist yet, which could be okay.
                // Consider returning default/empty state instead of 404 if first-time setup is allowed via PUT.
                 console.log("Coach configuration not found in database.");
                 return res.status(200).json({ coachId: coachOpenId, weeklyTemplate: null, sessionDurationMinutes: 60 }); // Example default
                // return res.status(404).json({ error: 'Coach configuration not found.' });
            }

            let configData = { ...row };
            try {
                if (configData.weeklyTemplate && typeof configData.weeklyTemplate === 'string') { // Add type check
                    configData.weeklyTemplate = JSON.parse(configData.weeklyTemplate);
                } else if (!configData.weeklyTemplate) { // Handle null/empty template explicitly
                    configData.weeklyTemplate = null;
                }
                 // Ensure the returned coachId matches the authenticated coach if the table stores it
                 // configData.coachId = coachOpenId; // Optionally overwrite if needed
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

// Controller function to update coach config
const updateCoachConfig = async (req, res) => {
    // --- Authorization Check ---
    if (!checkCoachAuthorization(req, res)) {
        return; // Stop execution if authorization fails
    }
    // If authorization passes, req.user.openid is confirmed to be the coach's openid
    const coachOpenId = req.user.openid;
    // --- End Authorization Check ---

    try {
        // IMPORTANT: Use the *verified* coachOpenId from the token, ignore any coachId potentially passed in the body for security.
        const { weeklyTemplate, sessionDurationMinutes } = req.body;

        // --- Input Validation ---
        // Note: We no longer need coachId from the body, we use the verified one.
        if (weeklyTemplate === undefined || sessionDurationMinutes === undefined) {
            return res.status(400).json({ error: 'Missing required configuration fields (weeklyTemplate, sessionDurationMinutes).' });
        }
        if (typeof sessionDurationMinutes !== 'number' || sessionDurationMinutes <= 0) {
            return res.status(400).json({ error: 'sessionDurationMinutes must be a positive number.' });
        }
        // Basic validation for weeklyTemplate structure (can be enhanced)
        if (typeof weeklyTemplate !== 'object' || weeklyTemplate === null || Array.isArray(weeklyTemplate)) { // Ensure it's an object, not array
            return res.status(400).json({ error: 'weeklyTemplate must be a valid object mapping day names to time arrays.' });
        }
        // Add validation for days and time formats within weeklyTemplate if needed
        // --- End Validation ---

        let weeklyTemplateString;
        try {
            weeklyTemplateString = JSON.stringify(weeklyTemplate);
        } catch (stringifyError) {
            console.error("Error stringifying weeklyTemplate:", stringifyError.message);
            return res.status(400).json({ error: 'Invalid weeklyTemplate JSON format.' });
        }

        // --- Database Upsert ---
        // Use the verified coachOpenId here
        const sql = `
            INSERT INTO CoachConfig (coachId, weeklyTemplate, sessionDurationMinutes)
            VALUES (?, ?, ?)
            ON CONFLICT(coachId) DO UPDATE SET
               weeklyTemplate=excluded.weeklyTemplate,
               sessionDurationMinutes=excluded.sessionDurationMinutes
        `;

        db.run(sql, [coachOpenId, weeklyTemplateString, sessionDurationMinutes], async function (err) { // Use coachOpenId
            if (err) {
                console.error("Database error upserting coach config:", err.message);
                return res.status(500).json({ error: 'Database error saving configuration.' });
            }

            console.log(`Coach config saved/updated for coachId: ${coachOpenId}. Rows affected: ${this.changes}`);

            // --- Trigger Slot Regeneration ---
            try {
                // Pass the verified coachOpenId
                const regenResult = await regenerateAvailabilitySlots(coachOpenId, weeklyTemplate, sessionDurationMinutes);
                console.log(`Slot regeneration completed. Slots generated: ${regenResult.slotsGenerated}, Skipped: ${regenResult.slotsSkipped}`);
                res.status(200).json({ message: 'Configuration saved and slots regenerated successfully.' });
            } catch (regenError) {
                console.error("Error during slot regeneration:", regenError);
                res.status(500).json({ error: 'Configuration saved, but failed to regenerate availability slots.' });
            }
            // --- End Slot Regeneration ---
        });
        // --- End Database ---

    } catch (error) {
        console.error("Error in updateCoachConfig controller:", error.message);
        res.status(500).json({ error: 'Failed to save coach configuration.' });
    }
};


// Updated function to handle deleting old slots and generating new ones with conflict check
// This function is internal, called by updateCoachConfig, so it receives the verified coachId
async function regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes) {
    // coachId received here is already verified as the designated coach
    console.log(`Regenerating slots for coachId: ${coachId} with conflict check.`);
    const WEEKS_TO_GENERATE = 8;
    const today = startOfDay(new Date());
    const todayISO = formatISO(today);

    try {
        // --- Step 1: Fetch future booked slots ---
        const fetchBookedSql = `
            SELECT startTime, endTime FROM AvailabilitySlots
            WHERE coachId = ? AND status = 'booked' AND startTime >= ?
        `;
        console.log(`Workspaceing future booked slots from ${todayISO} onwards for coach ${coachId}...`);
        const bookedSlotsData = await new Promise((resolve, reject) => {
            db.all(fetchBookedSql, [coachId, todayISO], (err, rows) => {
                if (err) {
                    console.error("Error fetching booked slots:", err.message);
                    return reject(new Error('Failed to fetch booked slots.'));
                }
                resolve(rows);
            });
        });
        const bookedIntervals = bookedSlotsData.map(slot => ({
            start: parseISO(slot.startTime),
            end: parseISO(slot.endTime)
        }));
        console.log(`Found ${bookedIntervals.length} future booked slots to check against for coach ${coachId}.`);

        // --- Steps 2-4: Delete old, Prepare Insert, Generate/Insert New (within serialize) ---
        const generationResult = await new Promise((resolve, reject) => {
            db.serialize(async () => {
                try { // Add try/catch around the whole serialized block
                    // --- Step 2: Delete existing future 'available' slots ---
                    const deleteSql = `
                        DELETE FROM AvailabilitySlots
                        WHERE coachId = ? AND status = 'available' AND startTime >= ?
                    `;
                    console.log(`Deleting future available slots from ${todayISO} onwards for coach ${coachId}...`);
                    const deleteResult = await new Promise((res, rej) => {
                        db.run(deleteSql, [coachId, todayISO], function (deleteErr) {
                            if (deleteErr) {
                                console.error("Error deleting old availability slots:", deleteErr.message);
                                return rej(new Error('Failed to delete old slots.'));
                            }
                            console.log(`Deleted ${this.changes} old available slots for coach ${coachId}.`);
                            res(this.changes);
                        });
                    });

                    // --- Step 3: Prepare statement ---
                    const insertSql = `
                        INSERT INTO AvailabilitySlots (coachId, startTime, endTime, status)
                        VALUES (?, ?, ?, 'available')
                    `;
                    const stmt = await new Promise((res, rej) => {
                        const prepStmt = db.prepare(insertSql, (prepareErr) => {
                             if (prepareErr) {
                                 console.error("Error preparing insert statement:", prepareErr.message);
                                 return rej(new Error('Failed to prepare slot insertion statement.'));
                             }
                             res(prepStmt);
                        });
                    });

                    // --- Step 4: Generate and insert new slots ---
                    console.log(`Generating new slots for the next ${WEEKS_TO_GENERATE} weeks for coach ${coachId}...`);
                    let slotsGenerated = 0;
                    let slotsSkipped = 0;
                    const daysToGenerate = WEEKS_TO_GENERATE * 7;
                    const dayMapping = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

                    for (let i = 0; i < daysToGenerate; i++) {
                        const currentDate = addDays(today, i);
                        const dayOfWeekIndex = getDay(currentDate);
                        const dayName = dayMapping[dayOfWeekIndex];
                        const timeSlots = weeklyTemplate[dayName]; // Use the passed template

                        if (Array.isArray(timeSlots) && timeSlots.length > 0) { // Check if it's an array
                            for (const timeString of timeSlots) {
                                try {
                                    const [hour, minute] = timeString.split(':').map(Number);
                                    if (isNaN(hour) || isNaN(minute)) throw new Error('Invalid time format'); // Basic format check

                                    const slotStartTime = setMilliseconds(setSeconds(setMinutes(setHours(currentDate, hour), minute), 0), 0);
                                    const slotEndTime = addMinutes(slotStartTime, sessionDurationMinutes);

                                    // Check for conflicts
                                    let isConflict = false;
                                    for (const bookedInterval of bookedIntervals) {
                                        if (isBefore(slotStartTime, bookedInterval.end) && isAfter(slotEndTime, bookedInterval.start)) {
                                            isConflict = true;
                                            slotsSkipped++;
                                            // console.log(`Conflict detected: Skipping generation for ${formatISO(slotStartTime)}`); // Less verbose logging
                                            break;
                                        }
                                    }

                                    // Insert if no conflict
                                    if (!isConflict) {
                                        let startTimeISO = formatISO(slotStartTime);
                                        let endTimeISO = formatISO(slotEndTime);
                                        await new Promise((res_run, rej_run) => {
                                            stmt.run(coachId, startTimeISO, endTimeISO, function (insertErr) { // Use verified coachId
                                                if (insertErr) {
                                                    console.error(`Error inserting slot for ${startTimeISO}:`, insertErr.message);
                                                    // Decide if one error should stop all generation (rej_run) or just log (res_run)
                                                } else {
                                                    slotsGenerated++;
                                                }
                                                res_run();
                                            });
                                        });
                                    }
                                } catch (timeErr) {
                                    console.error(`Error processing timeString "${timeString}" for ${formatISO(currentDate)}:`, timeErr.message);
                                }
                            }
                        } else if (timeSlots !== undefined && timeSlots !== null) {
                            // Log if day exists in template but is not an array or empty
                            console.warn(`Template for ${dayName} is not a valid array or is empty.`);
                        }
                    } // End loop days

                    // Finalize statement
                    await new Promise((res_fin, rej_fin) => {
                         stmt.finalize((finalizeErr) => {
                              if (finalizeErr) {
                                  console.error("Error finalizing statement:", finalizeErr.message);
                                  // Don't reject the whole process for finalize error? Or should we?
                              }
                              console.log(`Slot generation complete for coach ${coachId}. Generated: ${slotsGenerated}, Skipped: ${slotsSkipped}.`);
                              res_fin();
                         });
                    });

                    resolve({ slotsGenerated, slotsSkipped }); // Resolve outer promise after serialize finishes

                } catch(serializeError) { // Catch errors within the serialize block
                    console.error("Error during serialized database operations:", serializeError);
                    reject(serializeError); // Reject the outer promise
                }
            }); // End db.serialize
        }); // End generationResult Promise

        return generationResult;

    } catch (error) {
        console.error(`Critical error during slot regeneration for coach ${coachId}:`, error.message, error.stack);
        throw error; // Re-throw to be caught by updateCoachConfig
    }
}


// Controller function for the coach to get confirmed bookings for a specific date
const getCoachBookingsForDate = async (req, res) => {
    // --- Authorization Check ---
    if (!checkCoachAuthorization(req, res)) {
        return; // Stop execution if authorization fails
    }
    // If authorization passes, req.user.openid is confirmed to be the coach's openid
    const coachOpenId = req.user.openid;
    // --- End Authorization Check ---

    const requestedDate = req.query.date;

    // --- Validate Input Date ---
    if (!requestedDate) {
        return res.status(400).json({ error: 'Missing required query parameter: date (YYYY-MM-DD).' });
    }
    const parsedDate = parseDate(requestedDate, 'yyyy-MM-dd', new Date());
    if (!isValidDate(parsedDate)) {
        return res.status(400).json({ error: 'Invalid date format. Please use YYYY-MM-DD.' });
    }
    // --- End Validation ---

    // --- Calculate Date Range ---
    const dayStart = startOfDay(parsedDate);
    const dayEnd = endOfDay(parsedDate);
    const startTimeQuery = formatISO(dayStart);
    const endTimeQuery = formatISO(dayEnd);
    // --- End Date Range ---

    try {
        // --- Database Query ---
        // Use the verified coachOpenId in the WHERE clause
        const sql = `
            SELECT
                b.bookingId, b.slotId, b.startTime, b.endTime,
                b.status, b.userId, u.nickName AS userNickName
            FROM Bookings b
            LEFT JOIN Users u ON b.userId = u.userId
            WHERE b.coachId = ?
              AND b.startTime >= ?
              AND b.startTime <= ?
              AND b.status = 'confirmed'
            ORDER BY b.startTime ASC
        `;

        console.log(`Querying confirmed bookings for coach ${coachOpenId} on ${requestedDate}`);

        // Use verified coachOpenId in the query parameters
        db.all(sql, [coachOpenId, startTimeQuery, endTimeQuery], (err, rows) => {
            if (err) {
                console.error(`Database error fetching coach bookings for date ${requestedDate}:`, err.message);
                return res.status(500).json({ error: 'Database error fetching bookings.' });
            }
            res.status(200).json(rows || []);
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
    getCoachBookingsForDate,
    // Note: regenerateAvailabilitySlots is internal and not exported
};