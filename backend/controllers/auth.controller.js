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
      return res.status(400).json({ error: `WeChat API Error: ${wechatData.errmsg}` });
    }

    const { openid, session_key } = wechatData;
    console.log(`Successfully retrieved OpenID: ${openid}`);

    const findUserSql = "SELECT * FROM Users WHERE userId = ?";
    db.get(findUserSql, [openid], (err, userRow) => {
      if (err) {
        console.error("Database error checking user:", err.message);
        return res.status(500).json({ error: 'Database error checking user.' });
      }

      if (!userRow) {
        console.log(`User ${openid} not found. Inserting new user.`);
        const insertUserSql = "INSERT INTO Users (userId, nickName) VALUES (?, ?)";
        db.run(insertUserSql, [openid, null], (insertErr) => {
          if (insertErr) {
            console.error("Database error inserting user:", insertErr.message);
            return res.status(500).json({ error: 'Database error inserting user.' });
          }
          console.log(`User ${openid} inserted successfully.`);
          res.status(200).json({ openid: openid });
        });
      } else {
        console.log(`User ${openid} found.`);
        res.status(200).json({ openid: openid });
      }
    });

  } catch (error) {
    console.error("Error in loginUser controller:", error.message);
    if (error.response) {
      console.error("Error data:", error.response.data);
      console.error("Error status:", error.response.status);
    } else if (error.request) {
      console.error("Error request:", error.request);
    } else {
      console.error('Error message:', error.message);
    }
    res.status(500).json({ error: 'Failed to process login.' });
  }
};

module.exports = {
  loginUser,
};