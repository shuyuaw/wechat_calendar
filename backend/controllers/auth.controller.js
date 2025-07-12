// backend/controllers/auth.controller.js
const axios = require('axios');
const db = require('../database.js'); // Adjust path as needed
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// --- Common function to handle DB interaction and JWT generation ---
const processLoginAndGenerateToken = (openid, nickName, res) => { // Added nickName parameter
  if (!openid) {
     console.error("ProcessLogin: OpenID is missing.");
     return res.status(500).json({ error: 'Internal error: OpenID not determined.' });
  }

  const findUserSql = "SELECT userId FROM Users WHERE userId = ?";
  db.get(findUserSql, [openid], (err, userRow) => {
    if (err) {
      console.error("Database error checking user:", err.message);
      return res.status(500).json({ error: 'Database error checking user.' });
    }

    const generateAndSendToken = () => {
      const payload = { openid: openid }; // Include openid in the token payload
      // Use shorter expiry for mocks, default for real logins
      const expiresIn = (openid.startsWith('test-student-') || openid === process.env.COACH_OPENID) ? '1h' : '1d';
      const options = { expiresIn: expiresIn };
      console.log(`DEBUG: Attempting jwt.sign. JWT_SECRET value is: "${JWT_SECRET}"`);
      const token = jwt.sign(payload, JWT_SECRET, options);

      console.log(`Generated JWT for OpenID: ${openid} (Expires in: ${expiresIn})`);
      res.status(200).json({ token: token, openid: openid }); // Return token and openid
    };

    if (!userRow) {
      // User not found, insert new user
      console.log(`User ${openid} not found. Inserting new user with nickname: ${nickName}`);
      const insertUserSql = "INSERT INTO Users (userId, nickName) VALUES (?, ?)";
      db.run(insertUserSql, [openid, nickName], (insertErr) => { // Use nickName here
        if (insertErr) {
          console.error("Database error inserting user:", insertErr.message);
          return res.status(500).json({ error: 'Database error inserting user.' });
        }
        console.log(`User ${openid} inserted successfully.`);
        generateAndSendToken(); // Send response after insert
      });
    } else {
      // User found, update nickname if provided and different
      if (nickName && userRow.nickName !== nickName) {
        console.log(`User ${openid} found. Updating nickname to: ${nickName}`);
        const updateUserSql = "UPDATE Users SET nickName = ? WHERE userId = ?";
        db.run(updateUserSql, [nickName, openid], (updateErr) => {
          if (updateErr) {
            console.error("Database error updating user nickname:", updateErr.message);
            // Do not block login for this error, but log it
          } else {
            console.log(`User ${openid} nickname updated successfully.`);
          }
          generateAndSendToken(); // Send response after update (or if no update needed)
        });
      } else {
        console.log(`User ${openid} found. Nickname not provided or already up-to-date.`);
        generateAndSendToken(); // Send response immediately
      }
    }
  });
};


// --- Main Login Handler ---
const loginUser = async (req, res) => {
  try {
    const { code, openid, userInfo } = req.body; // Destructure code, openid, and userInfo
    const nickName = userInfo ? userInfo.nickName : null; // Extract nickName

    // Scenario 1: Frontend is sending existing openid and new userInfo (e.g., after getUserProfile)
    if (openid && userInfo && !code) {
      console.log(`Updating user info for existing OpenID: ${openid}`);
      return processLoginAndGenerateToken(openid, nickName, res);
    }

    // --- START TEMPORARY MOCK LOGIC ---
    let targetOpenid = null;
    let isMock = false;
    const studentMockCode = 'mockCodeStudent123'; // Define student mock code
    const coachMockCode = 'mockCodeCoach456';   // Define coach mock code

    if (code === studentMockCode) {
      targetOpenid = 'test-student-openid-123'; // Generate fake student ID
      isMock = true;
      console.log(`MOCK LOGIN: Handling mock student code. Generated OpenID: ${targetOpenid}`);
    } else if (code === coachMockCode) {
      targetOpenid = process.env.COACH_OPENID; // Use REAL coach OpenID from .env
      if (!targetOpenid) {
         console.error("MOCK LOGIN ERROR: mockCodeCoach used, but COACH_OPENID is not set in .env!");
         return res.status(500).json({ error: 'Server configuration error: COACH_OPENID missing.' });
      }
      isMock = true;
      console.log(`MOCK LOGIN: Handling mock coach code. Using configured COACH_OPENID: ${targetOpenid}`);
    }

    if (isMock) {
       // Use the common function for DB ops and token generation for mock users
       return processLoginAndGenerateToken(targetOpenid, nickName, res); // Pass nickName
    }
    // --- END TEMPORARY MOCK LOGIC ---


    // Scenario 2: Standard WeChat login with code
    console.log('REAL LOGIN: Processing code via WeChat API...');
    if (!code) {
      return res.status(400).json({ error: 'Login code is required for initial login.' });
    }

    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
      console.error('REAL LOGIN ERROR: WeChat AppID or AppSecret not configured.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    console.log(`REAL LOGIN: Requesting session from WeChat API for code: ${code}`);
    const wechatResponse = await axios.get(url);
    const wechatData = wechatResponse.data;

    if (wechatData.errcode) {
      console.error('REAL LOGIN - WeChat API Error:', wechatData);
      return res.status(400).json({ error: `WeChat API Error: ${wechatData.errmsg}` });
    }

    const { openid: wechatOpenid } = wechatData; // Rename to avoid conflict with req.body.openid
    console.log(`REAL LOGIN: Successfully retrieved OpenID: ${wechatOpenid}`);

    // Use the common function for DB ops and token generation for real users
    processLoginAndGenerateToken(wechatOpenid, nickName, res); // Pass nickName

  } catch (error) {
    // Catch errors from axios or other synchronous issues
    console.error("Error in loginUser controller:", error.message);
    if (error.response) { // Axios error with response
      console.error("Error data:", error.response.data);
      console.error("Error status:", error.response.status);
    } else if (error.request) { // Axios error without response
      console.error("Error request:", error.request);
    } else { // Other errors
      console.error('Error message:', error.message);
    }
    res.status(500).json({ error: 'Failed to process login.' });
  }
};

module.exports = {
  loginUser,
};
