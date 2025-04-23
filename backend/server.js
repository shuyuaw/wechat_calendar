// backend/server.js

// 1. Require Modules
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const db = require('./database.js'); // Import your database connection
const axios = require('axios'); // <--- ADD THIS LINE

// 2. Configure Environment Variables
dotenv.config();

// 3. Initialize Express App
const app = express();

// 4. Apply Middleware
app.use(cors());
app.use(express.json());

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// --- API Routes Will Go Here ---

// POST /api/login - Handles user login via WeChat code
// Input: { code: "user_login_code_from_wx.login" }
// Output: { openid: "user_openid" } on success
app.post('/api/login', async (req, res) => {
  try {
    const { code } = req.body; // Extract the code from request body

    // Validate input
    if (!code) {
      return res.status(400).json({ error: 'Login code is required.' });
    }

    // Retrieve AppID and AppSecret from environment variables
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
      console.error('WeChat AppID or AppSecret not configured in .env file.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    // Construct the URL for WeChat jscode2session API
    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    // Call the WeChat API using axios
    console.log(`Requesting session from WeChat API for code: ${code}`);
    const wechatResponse = await axios.get(url);
    const wechatData = wechatResponse.data;

    // Check for errors from WeChat API
    if (wechatData.errcode) {
      console.error('WeChat API Error:', wechatData);
      return res.status(400).json({ error: `WeChat API Error: ${wechatData.errmsg}` });
    }

    // Successfully received openid and session_key
    const { openid, session_key } = wechatData;
    console.log(`Successfully retrieved OpenID: ${openid}`);
    // Note: session_key should generally not be sent to the frontend or stored long-term
    // unless needed for decrypting user data, which is not part of current requirements.

    // ---- Database Interaction: Check/Insert User ----
    const findUserSql = "SELECT * FROM Users WHERE userId = ?";
    db.get(findUserSql, [openid], (err, userRow) => {
      if (err) {
        console.error("Database error checking user:", err.message);
        return res.status(500).json({ error: 'Database error checking user.' });
      }

      if (!userRow) {
        // User not found, insert new user
        console.log(`User ${openid} not found. Inserting new user.`);
        const insertUserSql = "INSERT INTO Users (userId, nickName) VALUES (?, ?)";
        // We don't have nickname at this stage, insert with null or placeholder
        db.run(insertUserSql, [openid, null], (insertErr) => {
          if (insertErr) {
            console.error("Database error inserting user:", insertErr.message);
            // Even if DB insert fails, we might still return openid if login was successful
            // Or return an error depending on desired behavior.
            return res.status(500).json({ error: 'Database error inserting user.' });
          }
          console.log(`User ${openid} inserted successfully.`);
          // Return the openid to the frontend after successful insert
          res.status(200).json({ openid: openid });
        });
      } else {
        // User found, just return the openid
        console.log(`User ${openid} found.`);
        res.status(200).json({ openid: openid });
      }
    });
    // ---- End Database Interaction ----

  } catch (error) {
    // Handle errors from axios request or other unexpected issues
    console.error("Error in /api/login:", error.message);
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Error data:", error.response.data);
      console.error("Error status:", error.response.status);
    } else if (error.request) {
      // The request was made but no response was received
      console.error("Error request:", error.request);
    } else {
      // Something happened in setting up the request that triggered an Error
      console.error('Error message:', error.message);
    }
    res.status(500).json({ error: 'Failed to process login.' });
  }
});

// GET /api/coach/config - Retrieves the coach's configuration
app.get('/api/coach/config', async (req, res) => {
    // TODO: Implement authentication/authorization - Ensure only the coach can access this.
  
    try {
      const sql = "SELECT coachId, weeklyTemplate, sessionDurationMinutes FROM CoachConfig LIMIT 1";
      db.get(sql, [], (err, row) => { // Use db.get for single row expected
        if (err) {
          console.error("Database error getting coach config:", err.message);
          return res.status(500).json({ error: 'Database error fetching configuration.' });
        }
  
        if (!row) {
          // No config found yet
          return res.status(404).json({ error: 'Coach configuration not found.' });
          // Alternatively, could return default/empty config: res.status(200).json({});
        }
  
        // Config found, parse the weeklyTemplate JSON string
        let configData = { ...row }; // Copy row data
        try {
          // Only parse if weeklyTemplate is not null/empty
          if (configData.weeklyTemplate) {
              configData.weeklyTemplate = JSON.parse(configData.weeklyTemplate);
          } else {
              configData.weeklyTemplate = null; // Or {} if you prefer an empty object
          }
        } catch (parseError) {
          console.error("Error parsing weeklyTemplate JSON:", parseError.message);
          // Send back the raw data but maybe log the error or return a specific parse error
          // For simplicity here, we might return an error or the unparsed data
          return res.status(500).json({ error: 'Error processing configuration data.' });
          // Or potentially return row data with unparsed template:
          // return res.status(200).json(row);
        }
  
        // Successfully retrieved and parsed config
        res.status(200).json(configData);
      });
    } catch (error) {
      console.error("Error in GET /api/coach/config:", error.message);
      res.status(500).json({ error: 'Failed to retrieve coach configuration.' });
    }
  });

// 5. Define a Basic Test Route
app.get('/', (req, res) => {
  res.status(200).json({ message: 'Hello from the Coach Appointment Backend!' });
});

// --- Error Handling Middleware ---
app.use((err, req, res, next) => {
  console.error("Unhandled Error:", err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});


// 6. Start the Server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
    console.log('SIGINT signal received: closing HTTP server');
    // Relying on db.close() in database.js for now
});