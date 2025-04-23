// backend/server.js

// 1. Require Modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./database.js'); // Import the database (ensures connection + init)

// --- Require Route Modules ---
const authRoutes = require('./routes/auth.routes');
const coachRoutes = require('./routes/coach.routes');
// Add other route requires here later (e.g., bookingRoutes)

// 2. Configure Environment Variables
dotenv.config();

// 3. Initialize Express App
const app = express();

// 4. Apply Global Middleware
app.use(cors());
app.use(express.json());

// Basic Logging Middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- Mount API Routers ---
// Any routes defined in auth.routes.js will be prefixed with /api
app.use('/api', authRoutes);
// Any routes defined in coach.routes.js will be prefixed with /api/coach
app.use('/api/coach', coachRoutes);
// Add other app.use() for other route modules here

// --- Basic Test Route (Optional - can be removed later) ---
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello from the Coach Appointment Backend!' });
});

// --- Global Error Handling Middleware (Basic Example) ---
// This should come after all app.use() and routes
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err.message || err);
  // Avoid sending stack trace in production
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong!' });
});

// --- Not Found Handler (If no routes matched) ---
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

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    // Relying on db.close() in database.js for now
});