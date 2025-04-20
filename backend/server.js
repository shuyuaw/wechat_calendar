// backend/server.js

// 1. Require Modules
const express = require('express'); // Web framework for Node.js
const cors = require('cors'); // Middleware for enabling Cross-Origin Resource Sharing
const dotenv = require('dotenv'); // Module to load environment variables from a .env file
const db = require('./database.js'); // Import the database connection and initialization logic

// 2. Configure Environment Variables
// Loads variables from .env file into process.env
// Create a .env file in your backend folder for sensitive info like secrets or PORT if needed
dotenv.config();

// 3. Initialize Express App
const app = express();

// 4. Apply Middleware
// Enable CORS for all origins (adjust for production later if needed)
app.use(cors());
// Enable parsing of JSON request bodies
app.use(express.json());

// --- Basic Logging Middleware (Optional but Recommended) ---
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next(); // Pass control to the next middleware/route handler
});

// --- API Routes Will Go Here ---

// 5. Define a Basic Test Route
// A simple GET route to check if the server is alive
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello from the Coach Appointment Backend!' });
});

// --- Error Handling Middleware (Example - Add more specific handlers later) ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});


// 6. Start the Server
// Use the PORT from environment variables or default to 3001
const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
  // The database connection attempt happens when './database.js' is required.
  // Check the console logs from database.js to confirm connection success.
});

// Handle graceful shutdown on SIGINT (Ctrl+C)
// This ensures the database connection is closed cleanly if already open
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    // Close the server (stops accepting new connections)
    // Note: db connection closing is handled in database.js
    // We might need to wrap app.listen in a server variable to explicitly close it
    // For now, rely on the process exit triggered by db.close in database.js
    // or let Node.js handle the exit.
    // A more robust approach might involve explicitly closing the server here too.
});
