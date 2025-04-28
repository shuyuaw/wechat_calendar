// backend/routes/booking.routes.js
const express = require('express');
const router = express.Router();
const bookingController = require('../controllers/booking.controller.js');

// Define route for creating a booking
// POST /api/bookings
// (The path is '/' because '/api/bookings' will be the base path defined in server.js)
router.post('/', bookingController.createBooking);
// DELETE /api/bookings/:bookingId
router.delete('/:bookingId', bookingController.cancelBooking);

// --- Add other booking-related routes here later ---
// e.g., router.get('/mine/upcoming', bookingController.getMyUpcomingBookings);

module.exports = router;