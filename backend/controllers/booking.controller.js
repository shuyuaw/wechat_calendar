const {
    // ... other functions like parseISO, isBefore, isAfter ...
    formatISO, // <-- Make sure this is included
    startOfDay, // <-- ADDED: For getting the start of today
    format,      // <-- ADDED: For formatting dates for notifications
  } = require('date-fns');
const db = require('../database.js');
const { sendSubscribeMessage } = require('../utils/wechat.js'); // <-- ADDED: For sending WeChat notifications

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
                db.run('ROLLBACK;');
                return res.status(500).json({ error: 'Database error linking booking to slot.' });
             }

             console.log(`Slot ${slotIdNum} successfully linked to booking ${newBookingId}.`);

             // If all steps succeeded:
             db.run('COMMIT;', (commitErr) => { // Commit the transaction
                if (commitErr) {
                    console.error("Error committing transaction:", commitErr.message);
                    // ROLLBACK might not be possible or effective if COMMIT failed.
                    // Critical error, requires manual check or advanced handling.
                    return res.status(500).json({ error: 'Database error committing booking.' });
                }

                // --- START: WeChat Notification Logic ---
                // Note: Using slotDetails for startTime and endTime as newBooking object is not defined here.
                // Assuming slotDetails contains the correct startTime and endTime for the newly created booking.
                const studentOpenId = userId; // userId from req.body is the student's OpenID
                const coachOpenId = slotDetails.coachId || process.env.COACH_OPENID; // Coach for the booking

                const bookingStartTime = new Date(slotDetails.startTime); // Using slotDetails.startTime
                const bookingEndTime = new Date(slotDetails.endTime); // Using slotDetails.endTime

                // === MODIFICATION START ===
                // Old longer format:
                // const formattedTimeSlot = `${format(bookingStartTime, 'yyyy年MM月dd日 HH:mm')} - ${format(bookingEndTime, 'HH:mm')}`;
                // New shorter format:
                const formattedTimeSlot = `${format(bookingStartTime, 'MM月dd日 HH:mm')}-${format(bookingEndTime, 'HH:mm')}`;
                // Example: "06月03日 11:00-12:00"
                // === MODIFICATION END ===

                const bookingConfirmationTemplateId = process.env.WECHAT_BOOKING_CONFIRM_TEMPLATE_ID || 'Bai8NNhUQlXdOJaMrMIUv5bblC_W7wb9w3G9c-Ylip0'; // Example: Use env var for template ID

                // Data for the student notification
                const studentMessageData = {
                    "thing1": { "value": "职业发展辅导预约" }, // Ensure "职业发展辅导预约" is <= 20 chars if thing1 is 'thing'
                    "thing13": { "value": formattedTimeSlot }   // Booking Time Slot
                };

                // Data for the coach notification
                const coachMessageData = {
                    "thing1": { "value": "新的辅导预约" }, // Ensure "新的辅导预约" is <= 20 chars if thing1 is 'thing'
                    "thing13": { "value": formattedTimeSlot }
                };

                // Send to student
                sendSubscribeMessage({
                    recipientOpenId: studentOpenId,
                    templateId: bookingConfirmationTemplateId,
                    dataPayload: studentMessageData,
                    pageLink: 'pages/myBookings/myBookings' // Page student lands on
                }).then(success => {
                    if (success) console.log(`[Notification] Student (${studentOpenId}) notification initiated for booking ${newBookingId}.`);
                    else console.error(`[Notification] Student (${studentOpenId}) notification failed to initiate for booking ${newBookingId}.`);
                });

                // Send to coach
                if (coachOpenId) {
                     sendSubscribeMessage({
                        recipientOpenId: coachOpenId,
                        templateId: bookingConfirmationTemplateId,
                        dataPayload: coachMessageData,
                        pageLink: 'pages/coachBookings/coachBookings' // Page coach lands on
                    }).then(success => {
                        if (success) console.log(`[Notification] Coach (${coachOpenId}) notification initiated for booking ${newBookingId}.`);
                        else console.error(`[Notification] Coach (${coachOpenId}) notification failed to initiate for booking ${newBookingId}.`);
                    });
                } else {
                    console.log(`[Notification] No coachId found for slot ${slotIdNum}, or no default coach OpenID configured. Coach notification skipped for booking ${newBookingId}.`);
                }
                // --- END: WeChat Notification Logic ---

             // Send success response
             res.status(201).json({
                  message: 'Booking created successfully. Notifications initiated.',
               bookingId: newBookingId,
               slotId: slotIdNum,
               userId: userId,
                  coachId: slotDetails.coachId, // Added coachId to response
               startTime: slotDetails.startTime,
               endTime: slotDetails.endTime,
               status: 'confirmed'
             });
             }); // End COMMIT db.run

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
            const findBookingSql = "SELECT userId, slotId, status, coachId, startTime, endTime FROM Bookings WHERE bookingId = ?"; // Added startTime, endTime for notification
            // Also fetching coachId from Booking, assuming it's stored there and reflects the coach for that specific booking.

            db.get(findBookingSql, [bookingIdNum], (findErr, booking) => {
                if (findErr) {
                    console.error(`[CancelBooking] Error finding booking ${bookingIdNum}:`, findErr.message);
                    return res.status(500).json({ error: 'Database error finding booking.' });
                }
                if (!booking) {
                    return res.status(404).json({ error: `Booking with ID ${bookingIdNum} not found.` });
                }

                // Store details for notification before status changes
                const originalBookingDetailsForNotification = { ...booking };


                if (booking.status.startsWith('cancelled_')) {
                    // If already cancelled, we might still want to ensure notifications were sent or resend if appropriate,
                    // but for now, just return based on existing logic.
                    return res.status(200).json({ message: 'Booking already cancelled.' });
                }

                // --- Permission Check ---
                const systemCoachOpenId = process.env.COACH_OPENID;
                const isOwner = (authenticatedUserId === booking.userId);
                const isCoach = (authenticatedUserId === systemCoachOpenId || authenticatedUserId === booking.coachId); // Allow specific booking coach or system coach

                if (!isOwner && !isCoach) {
                    console.log(`[CancelBooking] Forbidden: User ${authenticatedUserId} attempted to cancel booking ${bookingIdNum} owned by ${booking.userId}. Not assigned or system coach.`);
                    return res.status(403).json({ error: 'Forbidden - You do not have permission to cancel this booking.' });
                }
                // --- End Permission Check ---

                const cancelledByWhom = authenticatedUserId === booking.userId ? "user" : "coach";
                const newStatus = `cancelled_by_${cancelledByWhom}`;


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
                        // This could mean the booking was already in the target state, or another issue.
                        // For now, treating as an error if we expected a change.
                        return res.status(500).json({ error: 'Failed to update booking status (no change applied).' });
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
                        db.run('COMMIT;', (commitErr) => {
                            if (commitErr) {
                                console.error("[CancelBooking] Error committing transaction:", commitErr.message);
                                return res.status(500).json({ error: 'Database error committing cancellation.' });
                            }

                            // --- START: WeChat Notification Logic for Cancellation ---
                            const studentOpenIdForCancel = originalBookingDetailsForNotification.userId;
                            const coachOpenIdForCancel = originalBookingDetailsForNotification.coachId || process.env.COACH_OPENID;

                            const bookingStartTimeForCancel = new Date(originalBookingDetailsForNotification.startTime);
                            const bookingEndTimeForCancel = new Date(originalBookingDetailsForNotification.endTime);
                            const formattedTimeSlotForCancel = `${format(bookingStartTimeForCancel, 'yyyy年MM月dd日 HH:mm')} - ${format(bookingEndTimeForCancel, 'HH:mm')}`;
                            
                            // It's good practice to use different template IDs for different notifications
                            const bookingCancellationTemplateId = process.env.WECHAT_BOOKING_CANCEL_TEMPLATE_ID || 'YOUR_CANCELLATION_TEMPLATE_ID_HERE';

                            const cancelledByText = cancelledByWhom === "user" ? "用户" : "辅导员"; // "User" or "Coach"

                            // Data for the student notification
                            const studentCancellationMessageData = {
                                "thing1": { "value": `您的辅导预约已取消 (by ${cancelledByText})` }, // Subject: "Your coaching appointment has been cancelled (by User/Coach)"
                                "thing2": { "value": formattedTimeSlotForCancel }, // Time Slot
                                // Add other relevant fields your template expects, e.g., reason if available
                            };

                            // Data for the coach notification
                            const coachCancellationMessageData = {
                                "thing1": { "value": `辅导预约已取消 (by ${cancelledByText})` }, // Subject: "Coaching appointment cancelled (by User/Coach)"
                                "thing2": { "value": formattedTimeSlotForCancel }, // Time Slot
                                // Add other relevant fields
                            };

                            // Send to student who owned the booking
                            sendSubscribeMessage({
                                recipientOpenId: studentOpenIdForCancel,
                                templateId: bookingCancellationTemplateId,
                                dataPayload: studentCancellationMessageData,
                                pageLink: 'pages/myBookings/myBookings'
                            }).then(success => {
                                if (success) console.log(`[Notification] Cancellation Student (${studentOpenIdForCancel}) notification initiated for booking ${bookingIdNum}.`);
                                else console.error(`[Notification] Cancellation Student (${studentOpenIdForCancel}) notification failed for booking ${bookingIdNum}.`);
                            });

                            // Send to coach if applicable and not the one who cancelled
                            if (coachOpenIdForCancel) {
                                 sendSubscribeMessage({
                                    recipientOpenId: coachOpenIdForCancel,
                                    templateId: bookingCancellationTemplateId,
                                    dataPayload: coachCancellationMessageData,
                                    pageLink: 'pages/coachBookings/coachBookings'
                                }).then(success => {
                                    if (success) console.log(`[Notification] Cancellation Coach (${coachOpenIdForCancel}) notification initiated for booking ${bookingIdNum}.`);
                                    else console.error(`[Notification] Cancellation Coach (${coachOpenIdForCancel}) notification failed for booking ${bookingIdNum}.`);
                                });
                            }
                            // --- END: WeChat Notification Logic for Cancellation ---

                            res.status(200).json({ message: 'Booking cancelled successfully. Notifications initiated.' });
                        }); // End COMMIT
                    }); // End updateSlotSql
                }); // End updateBookingSql
            }); // End findBookingSql
        }); // End db.serialize
    } catch (error) {
        console.error(`[CancelBooking] Outer catch error for booking ${bookingIdNum}:`, error.message);
        // Attempt rollback if transaction was started and an error occurred outside db callbacks
        // This specific db.serialize structure might make this tricky, ensure db.run('ROLLBACK;') is called in error paths.
        res.status(500).json({ error: 'Failed to cancel booking due to an unexpected error.' });
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
        SELECT b.bookingId, b.coachId, b.slotId, b.startTime, b.endTime, b.status,
               c.name as coachName, c.avatarUrl as coachAvatarUrl 
        FROM Bookings b
        LEFT JOIN Coaches c ON b.coachId = c.coachId 
        WHERE b.userId = ? 
          AND b.status = 'confirmed' 
          AND b.startTime >= ? 
        ORDER BY b.startTime ASC
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
};
// END OF MODIFIED SECTION: getMyUpcomingBookings

module.exports = {
  createBooking,
  cancelBooking,
  getMyUpcomingBookings,
};