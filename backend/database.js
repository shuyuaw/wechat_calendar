// backend/database.js
const sqlite3 = require('sqlite3').verbose(); // Use verbose for more detailed error reporting
const path = require('path');

// Define the path for the database file
const DB_PATH = path.resolve(__dirname, 'coach_app.db');

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

const fs = require('fs');

// Function to initialize and migrate database
async function initializeDatabase() {
    console.log("Initializing database...");

    // Wrap in a promise to handle asynchronous operations
    return new Promise((resolve, reject) => {
        db.serialize(async () => {
            // 1. Create Migrations Table
            db.run(`
                CREATE TABLE IF NOT EXISTS Migrations (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
                )
            `, (err) => {
                if (err) {
                    console.error("FATAL: Error creating Migrations table:", err.message);
                    return reject(err);
                }
                console.log("Migrations table created or already exists.");
            });

            // 2. Run Initial Schema Setup (as a pseudo-migration)
            await runInitialSchema();

            // 3. Apply pending migrations
            await applyMigrations().catch(reject);

            console.log("Database initialization and migration sequence complete.");
            resolve();
        });
    });
}

// Function to run the initial table creation
async function runInitialSchema() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {
            const tables = {
                Users: `
                    CREATE TABLE IF NOT EXISTS Users (
                        userId TEXT PRIMARY KEY NOT NULL,
                        nickName TEXT
                    )
                `,
                CoachConfig: `
                    CREATE TABLE IF NOT EXISTS CoachConfig (
                        configId INTEGER PRIMARY KEY AUTOINCREMENT,
                        coachId TEXT UNIQUE NOT NULL,
                        weeklyTemplate TEXT,
                        sessionDurationMinutes INTEGER NOT NULL
                    )
                `,
                AvailabilitySlots: `
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
                `,
                Bookings: `
                    CREATE TABLE IF NOT EXISTS Bookings (
                        bookingId INTEGER PRIMARY KEY AUTOINCREMENT,
                        userId TEXT NOT NULL,
                        coachId TEXT NOT NULL,
                        slotId INTEGER NOT NULL,
                        startTime TEXT NOT NULL,
                        endTime TEXT NOT NULL,
                        status TEXT CHECK(status IN ('confirmed', 'cancelled_by_user', 'cancelled_by_coach', 'completed')) NOT NULL,
                        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
                        isReminderSent INTEGER NOT NULL DEFAULT 0,
                        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE,
                        FOREIGN KEY (slotId) REFERENCES AvailabilitySlots(slotId) ON DELETE RESTRICT
                    )
                `
            };

            Object.entries(tables).forEach(([name, sql]) => {
                db.run(sql, (err) => {
                    if (err) {
                        console.error(`FATAL: Error creating ${name} table:`, err.message);
                        reject(err);
                    } else {
                        console.log(`${name} table checked/created successfully.`);
                    }
                });
            });

            // Create index
            db.run("CREATE INDEX IF NOT EXISTS idx_slots_start_time ON AvailabilitySlots (startTime);", (err) => {
                if (err) console.error("Error creating index on AvailabilitySlots:", err.message);
                else console.log("Index on AvailabilitySlots(startTime) created or exists.");
                resolve(); // Resolve after the last operation
            });
        });
    });
}

// Function to apply database migrations
async function applyMigrations() {
    const migrationsDir = path.join(__dirname, 'migrations');
    if (!fs.existsSync(migrationsDir)) {
        fs.mkdirSync(migrationsDir);
        console.log("Created migrations directory.");
    }

    const migrationFiles = fs.readdirSync(migrationsDir)
        .filter(file => file.endsWith('.js'))
        .sort();

    // Using a traditional for loop to ensure sequential execution
    for (const file of migrationFiles) {
        const migrationName = path.basename(file, '.js');
        const isApplied = await new Promise((resolve, reject) => {
            db.get("SELECT name FROM Migrations WHERE name = ?", [migrationName], (err, row) => {
                if (err) reject(err);
                else resolve(!!row);
            });
        });

        if (!isApplied) {
            console.log(`Applying migration: ${migrationName}...`);
            try {
                const migration = require(path.join(migrationsDir, file));
                await migration.up(db); // Pass the db connection to the migration

                // Record migration in the database
                await new Promise((resolve, reject) => {
                    db.run("INSERT INTO Migrations (name) VALUES (?)", [migrationName], function(err) {
                        if (err) reject(err);
                        else resolve();
                    });
                });
                console.log(`Migration ${migrationName} applied successfully.`);
            } catch (err) {
                console.error(`FATAL: Failed to apply migration ${migrationName}:`, err);
                // Depending on the desired behavior, you might want to exit here
                process.exit(1);
            }
        }
    }
}

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
