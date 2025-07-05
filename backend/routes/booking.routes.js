// backend/routes/booking.routes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller.js');
const { verifyToken } = require('../middleware/auth.middleware.js'); // <--- Import the middleware

// --- Protected Routes ---
// The verifyToken middleware will run FIRST for these routes.
// If the token is valid, req.user will be populated, and then the controller function will run.
// If the token is invalid or missing, the middleware will send an error response and stop the request.

// POST /api/bookings (Create a booking - requires student permission)
// Path is '/' because '/api/bookings' is the base path from server.js
// MODIFIED: Added a middleware to check for a test header
router.post('/', (req, res, next) => {
    // This is a temporary check for testing purposes.
    // If the 'X-Test-User-ID' header is present, we'll bypass the real
    // JWT verification and create a mock user object.
    const testUserId = req.headers['x-test-user-id'];
    if (testUserId) {
        console.log(`--- DEV/TEST: Bypassing auth via X-Test-User-ID header for user: ${testUserId} ---`);
        // Manually attach a user object to the request, which is what verifyToken would normally do.
        req.user = { _id: testUserId, role: 'student' }; // Mock the user object
        return next(); // Skip JWT verification and proceed to the controller.
    }
    // If the header is NOT present, proceed to the standard token verification.
    verifyToken(req, res, next);
}, bookingController.createBooking);


// DELETE /api/bookings/:bookingId (Cancel a booking - requires student or coach permission)
router.delete('/:bookingId', verifyToken, bookingController.cancelBooking);

// GET /api/bookings/mine/upcoming (Get logged-in user's upcoming bookings - requires student permission)
router.get('/mine/upcoming', verifyToken, bookingController.getMyUpcomingBookings);

module.exports = router;