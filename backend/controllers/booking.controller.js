const {
    // ... other functions like parseISO, isBefore, isAfter ...
    formatISO, // <-- Make sure this is included
    startOfDay, // <-- ADDED: For getting the start of today
  } = require('date-fns');

// backend/controllers/booking.controller.js
const db = require('../database.js');

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

    let bookingSuccessful = false; // Flag to track outcome

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
                // This is problematic: booking exists but slot isn't linked.
                // Should still commit the booking but log the error.
                // Or potentially try to rollback? Rollback is safer data-wise.
                db.run('ROLLBACK;');
                return res.status(500).json({ error: 'Database error linking booking to slot.' });
             }

             console.log(`Slot ${slotIdNum} successfully linked to booking ${newBookingId}.`);

             // If all steps succeeded:
             bookingSuccessful = true;
             db.run('COMMIT;'); // Commit the transaction

             // TODO: Trigger notification to coach and student about the new booking

             // Send success response
             res.status(201).json({
               message: 'Booking created successfully.',
               bookingId: newBookingId,
               slotId: slotIdNum,
               userId: userId,
               startTime: slotDetails.startTime,
               endTime: slotDetails.endTime,
               status: 'confirmed'
             });

          }); // End link booking db.run
        }); // End insert booking db.run
      }); // End get slot details db.get
    }); // End update slot db.run
  }); // End db.serialize
};

// Controller function to cancel a booking
// The following cancelBooking function aligns with the LLM's specified "Modified cancelBooking Controller Function".
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
            const findBookingSql = "SELECT userId, slotId, status, coachId FROM Bookings WHERE bookingId = ?";
            // Also fetching coachId from Booking, assuming it's stored there and reflects the coach for that specific booking.
            // If not, you might need to get the system's designated coach ID differently (e.g., process.env.COACH_OPENID)

            db.get(findBookingSql, [bookingIdNum], (findErr, booking) => {
                if (findErr) {
                    console.error(`[CancelBooking] Error finding booking ${bookingIdNum}:`, findErr.message);
                    return res.status(500).json({ error: 'Database error finding booking.' });
                }
                if (!booking) {
                    return res.status(404).json({ error: `Booking with ID ${bookingIdNum} not found.` });
                }

                if (booking.status.startsWith('cancelled_')) {
                    return res.status(200).json({ message: 'Booking already cancelled.' });
                }

                // --- Permission Check ---
                // The authenticated user must be the one who made the booking (booking.userId)
                // OR the authenticated user must be THE system coach (process.env.COACH_OPENID)
                const systemCoachOpenId = process.env.COACH_OPENID; // Get the system's coach OpenID

                const isOwner = (authenticatedUserId === booking.userId);
                const isCoach = (authenticatedUserId === systemCoachOpenId);

                if (!isOwner && !isCoach) { // Only owner or the system coach can cancel
                    console.log(`[CancelBooking] Forbidden: User ${authenticatedUserId} attempted to cancel booking ${bookingIdNum} owned by ${booking.userId}. Not coach either.`);
                    return res.status(403).json({ error: 'Forbidden - You do not have permission to cancel this booking.' });
                }
                // --- End Permission Check ---

                const newStatus = isCoach ? 'cancelled_by_coach' : 'cancelled_by_user';

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
                        return res.status(500).json({ error: 'Failed to update booking status.' });
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
                        db.run('COMMIT;');
                        // TODO: Trigger notification
                        res.status(200).json({ message: 'Booking cancelled successfully.' });
                    });
                });
            });
        });
    } catch (error) {
        console.error(`[CancelBooking] Error in cancelBooking controller for booking ${bookingIdNum}:`, error.message);
        db.run('ROLLBACK;', (rbError) => {
            if (rbError) console.error("[CancelBooking] Rollback error in catch block:", rbError.message);
        });
        res.status(500).json({ error: 'Failed to cancel booking.' });
    }
};


// START OF MODIFIED SECTION: getMyUpcomingBookings
const getMyUpcomingBookings = (req, res) => { // Changed from async to sync as per example
    const studentUserId = req.user.openid; // Get the authenticated user's OpenID from the token

    if (!studentUserId) {
        // This case should ideally be caught by verifyToken middleware if a token is required
        return res.status(401).json({ error: "User not authenticated." });
    }

    const currentDate = formatISO(startOfDay(new Date())); // Get today's date at start of day

    // --- Database Query ---
    const sql = `
        SELECT * FROM Bookings 
        WHERE userId = ? 
          AND status = 'confirmed' 
          AND startTime >= ? 
        ORDER BY startTime ASC
    `;
    // Parameters for the SQL query
    const params = [studentUserId, currentDate];

    console.log(`Querying upcoming confirmed bookings for user ${studentUserId} from ${currentDate}...`); // Updated log

    db.all(sql, params, (err, rows) => {
        if (err) {
            console.error("Database error fetching user's upcoming bookings:", err.message); // Updated error log
            return res.status(500).json({ error: "Failed to retrieve your bookings." }); // Updated error response
        }
        console.log(`Fetched ${rows.length} upcoming bookings for user ${studentUserId}`); // New log message
        res.json(rows || []); // Return found bookings or empty array, changed from res.status(200) for consistency with example
    });
    // --- End Database Query ---

    // Removed the try-catch block as db.all handles errors with its callback,
    // and the primary source of studentUserId is now req.user.openid which is checked upfront.
    // Synchronous errors before db.all are less likely in this simplified structure.
};
// END OF MODIFIED SECTION: getMyUpcomingBookings

module.exports = {
  createBooking,
  cancelBooking,
  getMyUpcomingBookings,
};