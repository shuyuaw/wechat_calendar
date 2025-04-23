// backend/routes/coach.routes.js
const express = require('express');
const router = express.Router();
const coachController = require('../controllers/coach.controller.js');

// Define coach config routes
// GET /api/coach/config
router.get('/config', coachController.getCoachConfig);

// PUT /api/coach/config
router.put('/config', coachController.updateCoachConfig);

module.exports = router;