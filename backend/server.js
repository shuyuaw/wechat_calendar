// backend/server.js

// 1. Require Modules
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const db = require('./database.js'); // Import the database (ensures connection + init)

// --- Require Middleware ---
const authenticateToken = require('./middleware/auth.middleware.js'); // <-- Import the auth middleware

// --- Require Route Modules ---
const authRoutes = require('./routes/auth.routes');     // Contains /login (Public)
const coachRoutes = require('./routes/coach.routes');   // Protected
const slotRoutes = require('./routes/slot.routes');     // Protected
const bookingRoutes = require('./routes/booking.routes'); // Protected

// 3. Initialize Express App
const app = express();

// 4. Apply Global Middleware (runs for all requests)
app.use(cors());
app.use(express.json()); // Parses incoming JSON requests

// Basic Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Mount API Routers ---

// Mount PUBLIC routes FIRST - NO auth middleware here
app.use('/api', authRoutes); // Handles /api/login

// Apply auth middleware BEFORE mounting protected routes
// Requests to these paths will now require a valid JWT in the Authorization header
app.use('/api/coach', authenticateToken, coachRoutes);
app.use('/api/slots', authenticateToken, slotRoutes);
app.use('/api/bookings', authenticateToken, bookingRoutes);
// If you add more protected routes (e.g., /api/users), apply middleware similarly:
// app.use('/api/users', authenticateToken, userRoutes);

// --- Basic Test Routes ---
// Public root route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello from the Coach Appointment Backend! (Public)' });
});

// Example protected route for testing middleware
app.get('/api/test-protected', authenticateToken, (req, res) => {
    // If authenticateToken calls next(), we reach here.
    // req.user should be attached by the middleware.
    res.status(200).json({
        message: 'Access granted to protected route!',
        user: req.user // Send back the decoded user info from the token
    });
});


// --- Global Error Handling Middleware ---
// This should come AFTER all app.use() for routes
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err.message || err);
  // Avoid sending stack trace in production for security
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong!' });
});

// --- Not Found Handler (If no routes matched above) ---
app.use((req, res, next) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});


// 6. Start the Server
const PORT = process.env.PORT || 3001;

console.log("Attempting to start server listener...");

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  console.log("Listener successfully started!");
});

// Handle graceful shutdown (optional but good practice)
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    // You might add cleanup code here, like closing the DB connection if needed
    // db.close(() => { process.exit(0); }); // Example if db object has a close method
    process.exit(0); // Exit cleanly
});