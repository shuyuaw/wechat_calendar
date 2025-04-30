// backend/controllers/auth.controller.js
const axios = require('axios');
const db = require('../database.js'); // Adjust path as needed

const loginUser = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Login code is required.' });
    }

    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;

    if (!appId || !appSecret) {
      console.error('WeChat AppID or AppSecret not configured in .env file.');
      return res.status(500).json({ error: 'Server configuration error.' });
    }

    const url = `https://api.weixin.qq.com/sns/jscode2session?appid=${appId}&secret=${appSecret}&js_code=${code}&grant_type=authorization_code`;

    console.log(`Requesting session from WeChat API for code: ${code}`);
    const wechatResponse = await axios.get(url);
    const wechatData = wechatResponse.data;

    if (wechatData.errcode) {
      console.error('WeChat API Error:', wechatData);
      // Consider more specific status codes based on errcode if needed
      return res.status(400).json({ error: `WeChat API Error: ${wechatData.errmsg}` });
    }

    const { openid, session_key } = wechatData;
    console.log(`Successfully retrieved OpenID: ${openid}`);
    // session_key is sensitive and generally not needed/returned unless decrypting user data

    // Check if user exists or insert them
    const findUserSql = "SELECT userId FROM Users WHERE userId = ?"; // Only need userId
    db.get(findUserSql, [openid], (err, userRow) => {
      if (err) {
        console.error("Database error checking user:", err.message);
        return res.status(500).json({ error: 'Database error checking user.' });
      }

      const handleLoginResponse = () => {
          // TODO: Implement JWT generation using 'openid' and a secret key.
          //       Return the JWT token instead of/in addition to the openid for session management.
          // Example: const token = generateJwtToken(openid); res.status(200).json({ token });
          res.status(200).json({ openid: openid });
      };

      if (!userRow) {
        // User not found, insert new user
        console.log(`User ${openid} not found. Inserting new user.`);
        const insertUserSql = "INSERT INTO Users (userId, nickName) VALUES (?, ?)";
        db.run(insertUserSql, [openid, null], (insertErr) => {
          if (insertErr) {
            // Log specific constraint error if possible
            console.error("Database error inserting user:", insertErr.message);
            return res.status(500).json({ error: 'Database error inserting user.' });
          }
          console.log(`User ${openid} inserted successfully.`);
          handleLoginResponse(); // Send response after insert
        });
      } else {
        // User found
        console.log(`User ${openid} found.`);
        handleLoginResponse(); // Send response immediately
      }
    });

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