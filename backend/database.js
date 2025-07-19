// backend/database.js
const mysql = require('mysql2/promise');
require('dotenv').config();

console.log('Initializing MySQL connection pool...');

// Create a connection pool using the credentials from your .env file
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT, // Add this line
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// Test the connection
pool.getConnection()
  .then(connection => {
    console.log('Successfully connected to the MySQL database.');
    connection.release(); // Release the connection back to the pool
  })
  .catch(err => {
    console.error('FATAL: Error connecting to MySQL database:', err);
    process.exit(1);
  });

// Export the pool to be used in other parts of the application
module.exports = pool;
