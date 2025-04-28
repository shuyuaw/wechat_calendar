const {
    // ... other functions like parseISO, isBefore, isAfter ...
    formatISO, // <-- Make sure this is included
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
const cancelBooking = async (req, res) => {
    const { bookingId } = req.params; // Get bookingId from URL parameter
    const bookingIdNum = parseInt(bookingId, 10);
  
    // TODO: Implement authentication - Get requesterUserId and requesterRole from verified session/token
    // For testing now, let's assume a requester ID and role.
    const requesterUserId = 'test_user_openid_123'; // Example student user
    // const requesterRole = 'student'; // Or 'coach'
    // We'll infer role based on ID match for now for simplicity, assuming only student or coach can cancel.
    // In a real app, the role would come from the authenticated session.
  
  
    // --- Validate Input ---
    if (isNaN(bookingIdNum)) {
      return res.status(400).json({ error: 'Invalid bookingId format.' });
    }
    // --- End Validation ---
  
    try {
      // --- Database Operations ---
      // Use serialize to ensure sequential execution
      db.serialize(() => {
        // Step 1: Find the booking to get its details (owner, slot, status)
        const findBookingSql = "SELECT userId, slotId, status FROM Bookings WHERE bookingId = ?";
        db.get(findBookingSql, [bookingIdNum], (findErr, booking) => {
          if (findErr) {
            console.error(`Error finding booking ${bookingIdNum}:`, findErr.message);
            return res.status(500).json({ error: 'Database error finding booking.' });
          }
          if (!booking) {
            return res.status(404).json({ error: `Booking with ID ${bookingIdNum} not found.` });
          }
  
          // Step 2: Check status and permissions
          if (booking.status.startsWith('cancelled_')) {
            return res.status(200).json({ message: 'Booking already cancelled.' }); // Or 400 Bad Request? Let's use 200 OK.
          }
  
          // Basic Permission Check (replace with real auth later)
          // Assuming only the user who booked or the coach (hardcoded ID for now) can cancel
          const coachId = 'COACH_001'; // Assuming this is the coach's ID used elsewhere
          const isAllowed = (requesterUserId === booking.userId || requesterUserId === coachId);
  
          if (!isAllowed) {
            // In a real app check role: requesterRole === 'coach' || requesterUserId === booking.userId
             console.log(`User ${requesterUserId} attempted to cancel booking ${bookingIdNum} owned by ${booking.userId}`);
             return res.status(403).json({ error: 'Forbidden - You do not have permission to cancel this booking.' });
          }
  
          // Determine new status based on who is cancelling (simplified check)
          const newStatus = (requesterUserId === coachId) ? 'cancelled_by_coach' : 'cancelled_by_user';
  
          // Use a transaction for the two updates
          db.run('BEGIN TRANSACTION;');
  
          // Step 3: Update the booking status
          const updateBookingSql = "UPDATE Bookings SET status = ? WHERE bookingId = ?";
          db.run(updateBookingSql, [newStatus, bookingIdNum], function(updateBookingErr) {
            if (updateBookingErr) {
              console.error(`Error updating booking status for ${bookingIdNum}:`, updateBookingErr.message);
              db.run('ROLLBACK;');
              return res.status(500).json({ error: 'Database error cancelling booking.' });
            }
            if (this.changes === 0) {
               // Should not happen if we found the booking, but good practice
               console.error(`Failed to update booking status for ${bookingIdNum} (no rows affected).`);
               db.run('ROLLBACK;');
               return res.status(500).json({ error: 'Failed to update booking status.' });
            }
  
            console.log(`Booking ${bookingIdNum} status updated to ${newStatus}.`);
  
            // Step 4: Update the corresponding slot status back to 'available'
            const updateSlotSql = `
              UPDATE AvailabilitySlots
              SET status = 'available', userId = NULL, bookingId = NULL
              WHERE slotId = ?
            `;
            db.run(updateSlotSql, [booking.slotId], function(updateSlotErr) {
              if (updateSlotErr) {
                console.error(`Error updating slot status for slot ${booking.slotId}:`, updateSlotErr.message);
                // Critical decision: Booking is cancelled, but slot not freed. Rollback?
                // Design doc says atomicity not critical, let's commit booking cancel but log slot error.
                // For consistency, maybe rollback is better? Let's rollback.
                db.run('ROLLBACK;');
                return res.status(500).json({ error: 'Database error updating slot status.' });
              }
  
              console.log(`Slot ${booking.slotId} status updated to available.`);
  
              // If both updates succeed, commit
              db.run('COMMIT;');
  
              // TODO: Trigger cancellation notification to coach and student
  
              res.status(200).json({ message: 'Booking cancelled successfully.' });
  
            }); // End update slot db.run
          }); // End update booking db.run
        }); // End find booking db.get
      }); // End db.serialize
      // --- End Database Operations ---
  
    } catch (error) {
      // Catch synchronous errors if any occurred before DB operations
      console.error(`Error in cancelBooking controller for booking ${bookingIdNum}:`, error.message);
      // Attempt rollback just in case a transaction started but failed synchronously
      db.run('ROLLBACK;', (rbError) => {
           if (rbError) console.error("Rollback error in catch block:", rbError.message);
      });
      res.status(500).json({ error: 'Failed to cancel booking.' });
    }
  };

// Controller function for a student to get their own upcoming bookings
const getMyUpcomingBookings = async (req, res) => {
    // TODO: Implement authentication - Get requesterUserId from verified session/token
    // For testing now, let's assume the ID of the user we manually added
    const requesterUserId = 'test_user_openid_123';
  
    if (!requesterUserId) {
      // This check will be more robust with real authentication
      return res.status(401).json({ error: 'User identification missing.' });
    }
  
    try {
      const nowISO = formatISO(new Date()); // Get current time in ISO format for comparison
  
      // --- Database Query ---
      const sql = `
        SELECT bookingId, slotId, startTime, endTime, status
        FROM Bookings
        WHERE userId = ?
          AND status = 'confirmed'
          AND startTime >= ?  -- Only bookings starting now or in the future
        ORDER BY startTime ASC
      `;
  
      console.log(`Querying upcoming confirmed bookings for user ${requesterUserId} from ${nowISO}...`);
  
      db.all(sql, [requesterUserId, nowISO], (err, rows) => {
        if (err) {
          console.error(`Database error fetching upcoming bookings for user ${requesterUserId}:`, err.message);
          return res.status(500).json({ error: 'Database error fetching bookings.' });
        }
        res.status(200).json(rows || []); // Return found bookings or empty array
      });
      // --- End Database Query ---
  
    } catch (error) {
      console.error(`Error in getMyUpcomingBookings controller for user ${requesterUserId}:`, error.message);
      res.status(500).json({ error: 'Failed to retrieve upcoming bookings.' });
    }
  };

module.exports = {
  createBooking,
  cancelBooking,
  getMyUpcomingBookings,
};