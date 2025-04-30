// backend/database.js
const sqlite3 = require('sqlite3').verbose(); // Use verbose for more detailed error reporting

// Define the path for the database file
const DB_PATH = './coach_app.db';

// Connect to the SQLite database.
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error("FATAL: Error opening database:", err.message);
    process.exit(1); // Exit if cannot open DB
  } else {
    console.log(`Connected to the SQLite database at ${DB_PATH}`);
    // Enable foreign key support
    db.run("PRAGMA foreign_keys = ON;", (pragmaErr) => {
      if (pragmaErr) {
        console.error("FATAL: Failed to enable foreign keys:", pragmaErr.message);
        process.exit(1); // Exit if FKs cannot be enabled
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
    let criticalError = false; // Flag to track critical errors
    const criticalTables = ['Users', 'CoachConfig', 'Bookings', 'AvailabilitySlots'];

    // Helper callback for table creation
    const createTableCallback = (tableName, err) => {
      if (err) {
        console.error(`FATAL: Error creating ${tableName} table:`, err.message);
        if (criticalTables.includes(tableName)) {
          criticalError = true;
        }
      } else {
        console.log(`${tableName} table created or already exists.`);
      }
    };

    // 1. Users Table
    db.run(`
      CREATE TABLE IF NOT EXISTS Users (
        userId TEXT PRIMARY KEY NOT NULL,
        nickName TEXT
      )
    `, (err) => createTableCallback('Users', err));

    // 2. CoachConfig Table
    db.run(`
      CREATE TABLE IF NOT EXISTS CoachConfig (
        configId INTEGER PRIMARY KEY AUTOINCREMENT,
        coachId TEXT UNIQUE NOT NULL,
        weeklyTemplate TEXT,
        sessionDurationMinutes INTEGER NOT NULL
      )
    `, (err) => createTableCallback('CoachConfig', err));

    // 3. Bookings Table
    db.run(`
      CREATE TABLE IF NOT EXISTS Bookings (
        bookingId INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        coachId TEXT NOT NULL,
        slotId INTEGER NOT NULL, -- Removed UNIQUE constraint here
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        status TEXT CHECK(status IN ('confirmed', 'cancelled_by_user', 'cancelled_by_coach', 'completed')) NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE,
        FOREIGN KEY (slotId) REFERENCES AvailabilitySlots(slotId) ON DELETE RESTRICT
      )
    `, (err) => createTableCallback('Bookings', err));

    // 4. AvailabilitySlots Table
    db.run(`
      CREATE TABLE IF NOT EXISTS AvailabilitySlots (
        slotId INTEGER PRIMARY KEY AUTOINCREMENT,
        coachId TEXT NOT NULL,
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        status TEXT CHECK(status IN ('available', 'booked')) NOT NULL DEFAULT 'available',
        bookingId INTEGER UNIQUE,
        userId TEXT,
        FOREIGN KEY (coachId) REFERENCES CoachConfig(coachId) ON DELETE RESTRICT,
        FOREIGN KEY (bookingId) REFERENCES Bookings(bookingId) ON DELETE SET NULL,
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE SET NULL
      )
    `, (err) => {
      createTableCallback('AvailabilitySlots', err);
      // Check for critical error after attempting to create the last critical table
      if (criticalError) {
        console.error("FATAL: Exiting due to critical error during table creation.");
        process.exit(1);
      }

      // Add index (non-critical, just log error if fails)
      db.run("CREATE INDEX IF NOT EXISTS idx_slots_start_time ON AvailabilitySlots (startTime);", (indexErr) => {
        if (indexErr) console.error("Error creating index on AvailabilitySlots:", indexErr.message);
        else console.log("Index on AvailabilitySlots(startTime) created or exists.");

        // Only log completion if no critical error occurred before this point
        if (!criticalError) {
          console.log("Database initialization sequence complete.");
        }
      });
    }); // End AvailabilitySlots db.run
  }); // End db.serialize
} // End initializeDatabase

// Graceful shutdown
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error("Error closing database:", err.message);
    } else {
      console.log('Closed the database connection.');
    }
    process.exit(err ? 1 : 0); // Exit with error code if closing failed
  });
});

// Export the database connection object
module.exports = db;