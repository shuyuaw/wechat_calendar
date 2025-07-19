// backend/server.js
// backend/server.js
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

console.log('Checking env vars after dotenv config:');
console.log('  JWT_SECRET:', process.env.JWT_SECRET ? 'Loaded' : 'MISSING!');
console.log('  COACH_OPENID:', process.env.COACH_OPENID ? 'Loaded' : 'MISSING!');
console.log('  WECHAT_APP_ID:', process.env.WECHAT_APP_ID ? 'Loaded' : 'MISSING!');
console.log('  WECHAT_APP_SECRET:', process.env.WECHAT_APP_SECRET ? 'Loaded' : 'MISSING!');
console.log('------------------------------------');

const express = require('express');
const cors = require('cors');
const pool = require('./database.js'); // <-- MODIFIED: Import pool directly
const scheduler = require('./services/scheduler');

const authRoutes = require('./routes/auth.routes');
const coachRoutes = require('./routes/coach.routes');
const slotRoutes = require('./routes/slot.routes'); 
const bookingRoutes = require('./routes/booking.routes'); 

const app = express();
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use('/api', authRoutes);
app.use('/api/coach', coachRoutes);
app.use('/api/slots', slotRoutes);
app.use('/api/bookings', bookingRoutes);

app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello from the Coach Appointment Backend!' });
});

app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack || err.message || err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong!' });
});

app.use((req, res, next) => {
    res.status(404).json({ error: `Cannot ${req.method} ${req.path}` });
});

scheduler.initScheduler();

const PORT = process.env.PORT || 3001;

// --- MODIFICATION START ---
// Store the server instance so we can close it gracefully
const server = app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server and database pool...');
    server.close(() => {
        console.log('HTTP server closed.');
        pool.end(err => {
            if (err) {
                console.error('Error closing database pool:', err.message);
                process.exit(1);
            }
            console.log('Database pool closed.');
            process.exit(0);
        });
    });
});
// --- MODIFICATION END ---
