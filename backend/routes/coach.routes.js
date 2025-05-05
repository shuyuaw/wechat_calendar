// backend/routes/coach.routes.js
const express = require('express');
const router = express.Router();
const coachController = require('../controllers/coach.controller.js');
const { verifyToken } = require('../middleware/auth.middleware.js'); // <--- Import the middleware

// --- Protected Coach Routes ---
// The verifyToken middleware will run FIRST for all these routes.
// It ensures a valid token exists and populates req.user.
// Additional authorization (checking if req.user IS the coach) must happen inside the controller.

// GET /api/coach/config (Get coach configuration - requires coach permission)
router.get('/config', verifyToken, coachController.getCoachConfig);

// PUT /api/coach/config
router.put('/config', verifyToken, coachController.updateCoachConfig);

// GET /api/coach/bookings?date=YYYY-MM-DD
router.get('/bookings', verifyToken, coachController.getCoachBookingsForDate); // <-- ADD THIS LINE

module.exports = router;