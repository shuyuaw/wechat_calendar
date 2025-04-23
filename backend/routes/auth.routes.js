// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const authController = require('../controllers/auth.controller.js');

// Define the login route
// POST /api/login (Note: '/api' prefix will be added in server.js)
router.post('/login', authController.loginUser);

module.exports = router;