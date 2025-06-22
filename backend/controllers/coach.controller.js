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


// START: Replaced Function
// backend/controllers/coach.controller.js// (keep your existing getCoachConfig and updateCoachConfig functions, but replace this one)
async function regenerateAvailabilitySlots(coachId, weeklyTemplate, sessionDurationMinutes) {
    console.log(`Regenerating slots for coachId: ${coachId}.`);
    const WEEKS_TO_GENERATE = 8;
    const today = startOfDay(new Date());
    const todayISO = formatISO(today);

    // Promisify db functions to use async/await cleanly
    const dbAll = (sql, params) => new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
    });
    const dbRun = (sql, params) => new Promise((resolve, reject) => {
        db.run(sql, params, function(err) { err ? reject(err) : resolve(this) });
    });

    try {
        // --- Step 1: Fetch all future booked slots to avoid conflicts ---
        console.log(`Fetching future booked slots from ${todayISO} onwards for coach ${coachId}...`);
        const fetchBookedSql = `
            SELECT startTime, endTime FROM AvailabilitySlots
            WHERE coachId = ? AND status = 'booked' AND startTime >= ?
        `;
        const bookedSlotsData = await dbAll(fetchBookedSql, [coachId, todayISO]);
        const bookedIntervals = bookedSlotsData.map(slot => ({
            start: parseISO(slot.startTime),
            end: parseISO(slot.endTime)
        }));
        console.log(`Found ${bookedIntervals.length} future booked slots to check against.`);

        // --- Step 2: Delete existing future 'available' slots THAT ARE NOT BOOKED ---
        console.log(`Deleting future available slots from ${todayISO} onwards for coach ${coachId}...`);
                    const deleteSql = `
                        DELETE FROM AvailabilitySlots
            WHERE
                coachId = ?
                AND status = 'available'
                AND startTime >= ?
                AND slotId NOT IN (SELECT DISTINCT slotId FROM Bookings WHERE slotId IS NOT NULL)
        `;
        const deleteResult = await dbRun(deleteSql, [coachId, todayISO]);
        console.log(`Deleted ${deleteResult.changes} old unreferenced available slots.`);

        // --- Step 3: Generate and insert new slots ---
        console.log(`Generating new slots for the next ${WEEKS_TO_GENERATE} weeks...`);
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
                                    const slotEndTime = addMinutes(slotStartTime, sessionDurationMinutes);

                        // Check for conflicts with already booked slots
                        let isConflict = bookedIntervals.some(interval =>
                            isBefore(slotStartTime, interval.end) && isAfter(slotEndTime, interval.start)
                        );

                                    if (!isConflict) {
                            insertSlots.push({
                                coachId: coachId,
                                startTime: formatISO(slotStartTime),
                                endTime: formatISO(slotEndTime)
                            });
                            slotsGenerated++;
                        } else {
                            slotsSkipped++;
                                    }
                                } catch (timeErr) {
                        console.error(`Error processing timeString "${timeString}"`, timeErr);
                                }
                            }
            }
        }

        // --- Step 4: Batch insert the new slots in a transaction ---
        if (insertSlots.length > 0) {
            await dbRun('BEGIN TRANSACTION;');
            try {
                const stmt = db.prepare("INSERT INTO AvailabilitySlots (coachId, startTime, endTime, status) VALUES (?, ?, ?, 'available')");
                for (const slot of insertSlots) {
                    await new Promise((resolve, reject) => {
                        stmt.run(slot.coachId, slot.startTime, slot.endTime, err => err ? reject(err) : resolve());
                    });
                }
                stmt.finalize();
                await dbRun('COMMIT;');
            } catch(batchInsertError) {
                console.error("Error during batch insert, rolling back.", batchInsertError);
                await dbRun('ROLLBACK;');
                throw batchInsertError; // Propagate error
                              }
        }
        
        console.log(`Slot generation complete. Generated: ${slotsGenerated}, Skipped: ${slotsSkipped}.`);
        return { slotsGenerated, slotsSkipped };

    } catch (error) {
        console.error(`Critical error during slot regeneration for coach ${coachId}:`, error.stack);
        throw error;
    }
}
// END: Replaced Function


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