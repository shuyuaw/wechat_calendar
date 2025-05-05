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
router.post('/', verifyToken, bookingController.createBooking);

// DELETE /api/bookings/:bookingId (Cancel a booking - requires student or coach permission)
router.delete('/:bookingId', verifyToken, bookingController.cancelBooking);

// GET /api/bookings/mine/upcoming (Get logged-in user's upcoming bookings - requires student permission)
router.get('/mine/upcoming', verifyToken, bookingController.getMyUpcomingBookings);

module.exports = router;