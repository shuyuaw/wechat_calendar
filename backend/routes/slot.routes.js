// backend/routes/slot.routes.js
const express = require('express');
const router = express.Router();
const slotController = require('../controllers/slot.controller.js');

// Define route for getting slots by date
// GET /api/slots?date=YYYY-MM-DD
// (The path is '/' because '/api/slots' will be the base path defined in server.js)
router.get('/', slotController.getSlotsForDate);
// GET /api/slots/week?startDate=YYYY-MM-DD
router.get('/week', slotController.getSlotsForWeek);
module.exports = router;