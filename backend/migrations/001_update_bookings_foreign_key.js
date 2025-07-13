// backend/migrations/001_update_bookings_foreign_key.js

// Using a direct export for the migration logic
module.exports.up = async function(db) {
  return new Promise((resolve, reject) => {
    db.get("PRAGMA foreign_key_list(Bookings)", (err, result) => {
      if (err) {
        // If the table doesn't exist, the migration should proceed
        if (err.message.includes("no such table: Bookings")) {
          return runMigration(db, resolve, reject);
        }
        return reject(err);
      }

      // Check if the migration has already been applied
      const hasSetNull = result && result.on_delete === 'SET NULL';
      if (hasSetNull) {
        console.log("Migration 001_update_bookings_foreign_key already applied.");
        return resolve();
      }

      runMigration(db, resolve, reject);
    });
  });
};

function runMigration(db, resolve, reject) {
  db.serialize(() => {
    // Begin a transaction
    db.run("BEGIN TRANSACTION;", (err) => {
      if (err) return reject(err);
    });

    // Step 1: Rename the existing 'Bookings' table
    db.run("ALTER TABLE Bookings RENAME TO Bookings_old;", (err) => {
      if (err) {
        console.error("Error renaming Bookings table:", err.message);
        return db.run("ROLLBACK;", () => reject(err));
      }
      console.log("Renamed Bookings to Bookings_old.");
    });

    // Step 2: Create the new 'Bookings' table with the updated foreign key
    db.run(`
      CREATE TABLE Bookings (
        bookingId INTEGER PRIMARY KEY AUTOINCREMENT,
        userId TEXT NOT NULL,
        coachId TEXT NOT NULL,
        slotId INTEGER, -- Made nullable
        startTime TEXT NOT NULL,
        endTime TEXT NOT NULL,
        status TEXT CHECK(status IN ('confirmed', 'cancelled_by_user', 'cancelled_by_coach', 'completed')) NOT NULL,
        createdAt TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        isReminderSent INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES Users(userId) ON DELETE CASCADE,
        FOREIGN KEY (slotId) REFERENCES AvailabilitySlots(slotId) ON DELETE SET NULL -- Updated rule
      );
    `, (err) => {
      if (err) {
        console.error("Error creating new Bookings table:", err.message);
        return db.run("ROLLBACK;", () => reject(err));
      }
      console.log("Created new Bookings table with ON DELETE SET NULL.");
    });

    // Step 3: Copy data from the old table to the new one
    // Note: Ensure all columns are listed here
    const columns = "bookingId, userId, coachId, slotId, startTime, endTime, status, createdAt, isReminderSent";
    db.run(`INSERT INTO Bookings (${columns}) SELECT ${columns} FROM Bookings_old;`, (err) => {
      if (err) {
        console.error("Error copying data to new Bookings table:", err.message);
        return db.run("ROLLBACK;", () => reject(err));
      }
      console.log("Copied data from Bookings_old to new Bookings table.");
    });

    // Step 4: Remove the old table
    db.run("DROP TABLE Bookings_old;", (err) => {
      if (err) {
        console.error("Error dropping Bookings_old table:", err.message);
        return db.run("ROLLBACK;", () => reject(err));
      }
      console.log("Dropped Bookings_old table.");
    });

    // Commit the transaction
    db.run("COMMIT;", (err) => {
      if (err) {
        console.error("Error committing transaction:", err.message);
        return reject(err);
      }
      console.log("Transaction committed successfully.");
      resolve();
    });
  });
}
