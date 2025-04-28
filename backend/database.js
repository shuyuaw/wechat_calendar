// backend/database.js
const sqlite3 = require('sqlite3').verbose(); // Use verbose for more detailed error reporting

// Define the path for the database file
const DB_PATH = './coach_app.db';

// Connect to the SQLite database.
// The file is created if it does not exist.
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("Error opening database:", err.message);
  } else {
    console.log(`Connected to the SQLite database at ${DB_PATH}`);
    // Enable foreign key support
    db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
      if (pragmaErr) {
        console.error("Failed to enable foreign keys:", pragmaErr.message);
      } else {
        console.log("Foreign key support enabled.");
        // Create tables if they don't exist
        initializeDatabase();
      }
    });
  }
});

// Function to initialize database tables
function initializeDatabase() {
  db.serialize(() => {
    console.log("Initializing database tables...");

    // 1. Users Table (Stores basic user info, identified by OpenID)
    // userId is TEXT because it's the OpenID from WeChat
    db.run(`
      CREATE TABLE IF NOT EXISTS Users (
        userId TEXT PRIMARY KEY NOT NULL,
        nickName TEXT
        -- Add other user fields if needed in the future
      )
    `, (err) => {
      if (err) {
        console.error("Error creating Users table:", err.message);
      } else {
        console.log("Users table created or already exists.");
      }
    });

    // 2. CoachConfig Table (Stores coach-specific settings)
    // Assuming only one coach, configId might be fixed or auto-incremented
    // weeklyTemplate stored as TEXT (will hold stringified JSON)
    db.run(`
      CREATE TABLE IF NOT EXISTS CoachConfig (
        configId INTEGER PRIMARY KEY AUTOINCREMENT,
        coachId TEXT UNIQUE NOT NULL, -- Assuming a unique identifier for the coach
        weeklyTemplate TEXT,          -- Store JSON as TEXT
        sessionDurationMinutes INTEGER NOT NULL
      )
    `, (err) => {
      if (err) {
        console.error("Error creating CoachConfig table:", err.message);
      } else {
        console.log("CoachConfig table created or already exists.");
        // Optionally, insert a default config if the table is newly created and empty
        // db.run("INSERT OR IGNORE INTO CoachConfig (coachId, ...) VALUES (...)");
      }
    });

    // 3. Bookings Table (Stores details of each confirmed booking)
    // bookingId is auto-incremented
    // Foreign keys link to Users and AvailabilitySlots
    db.run(`
      CREATE TABLE IF NOT EXISTS Bookings (
        bookingId INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        coachId TEXT NOT NULL, -- Matches the coachId in CoachConfig
        slotId INTEGER NOT NULL, -- Link to the specific slot being booked
        startTime TEXT NOT NULL,        -- ISO 8601 format string
        endTime TEXT NOT NULL,          -- ISO 8601 format string
        status TEXT CHECK(status IN ('confirmed', 'cancelled_by_user', 'cancelled_by_coach', 'completed')) NOT NULL, -- Added 'completed' status
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')), -- Store creation timestamp
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE, -- If user is deleted, remove bookings
        FOREIGN KEY (slotId) REFERENCES AvailabilitySlots(slotId) ON DELETE RESTRICT -- Prevent deleting a slot if it's booked
      )
    `, (err) => {
      if (err) {
        console.error("Error creating Bookings table:", err.message);
      } else {
        console.log("Bookings table created or already exists.");
      }
    });

    // 4. AvailabilitySlots Table (Stores generated available time slots)
    // slotId is auto-incremented
    // status indicates if the slot is free or taken
    // bookingId and userId are nullable and link to Bookings/Users when status='booked'
    db.run(`
      CREATE TABLE IF NOT EXISTS AvailabilitySlots (
        slotId INTEGER PRIMARY KEY AUTOINCREMENT,
        coachId TEXT NOT NULL,
        startTime TEXT NOT NULL, -- ISO 8601 format string
        endTime TEXT NOT NULL,   -- ISO 8601 format string
        status TEXT CHECK(status IN ('available', 'booked')) NOT NULL DEFAULT 'available',
        bookingId INTEGER UNIQUE, -- Link to the booking that occupies this slot (can be NULL)
        userId TEXT,              -- Link to the user who booked this slot (can be NULL)
        FOREIGN KEY (coachId) REFERENCES CoachConfig(coachId) ON DELETE RESTRICT, -- Explicitly set default behavior
        FOREIGN KEY (bookingId) REFERENCES Bookings(bookingId) ON DELETE SET NULL, -- If booking is deleted, make slot available again
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE SET NULL -- If user is deleted, make slot available again
      )
    `, (err) => {
      if (err) {
        console.error("Error creating AvailabilitySlots table:", err.message);
      } else {
        console.log("AvailabilitySlots table created or already exists.");
        // Add index for faster querying by date/time
        db.run("CREATE INDEX IF NOT EXISTS idx_slots_start_time ON AvailabilitySlots (startTime);", (indexErr) => {
           if (indexErr) console.error("Error creating index on AvailabilitySlots:", indexErr.message);
           else console.log("Index on AvailabilitySlots(startTime) created or exists.");
        });
      }
    });

    console.log("Database initialization sequence complete.");
  });
}

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error(err.message);
    }
    console.log('Closed the database connection.');
    process.exit(0);
  });
});

// Export the database connection object
module.exports = db;
