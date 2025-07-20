// backend/controllers/auth.controller.js 
const axios = require('axios');
const pool = require('../database.js'); // Use the new MySQL pool
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET;

// --- Common function to handle DB interaction and JWT generation (now async) ---
const processLoginAndGenerateToken = async (openid, nickName, res) => {
  if (!openid) {
    console.error("ProcessLogin: OpenID is missing.");
    return res.status(500).json({ error: 'Internal error: OpenID not determined.' });
  }

  try {
    const findUserSql = "SELECT userId, nickName FROM Users WHERE userId = ?";
    const [userRows] = await pool.query(findUserSql, [openid]);
    const userRow = userRows[0];

    const generateAndSendToken = () => {
      const payload = { openid: openid };
      const expiresIn = (openid.startsWith('test-student-') || openid === process.env.COACH_OPENID) ? '1h' : '1d';
      const options = { expiresIn: expiresIn };
      const token = jwt.sign(payload, JWT_SECRET, options);

      console.log(`Generated JWT for OpenID: ${openid} (Expires in: ${expiresIn})`);
      res.status(200).json({ token: token, openid: openid });
    };

    if (!userRow) {
      // User not found, insert new user
      const finalNickName = nickName || '空用户名';
      console.log(`User ${openid} not found. Inserting new user with nickname: ${finalNickName}`);
      const insertUserSql = "INSERT INTO Users (userId, nickName) VALUES (?, ?)";
      await pool.query(insertUserSql, [openid, finalNickName]);
      console.log(`User ${openid} inserted successfully.`);
    } else if (nickName && userRow.nickName !== nickName) {
      // User found, update nickname if provided and different
      console.log(`[BE] Updating nickname for user ${openid} from "${userRow.nickName}" to "${nickName}".`);
      const updateUserSql = "UPDATE Users SET nickName = ? WHERE userId = ?";
      await pool.query(updateUserSql, [nickName, openid]);
      console.log(`User ${openid} nickname updated successfully.`);
    } else {
      console.log(`User ${openid} found. Nickname not provided or already up-to-date.`);
    }

    // After all DB operations are complete, generate and send the token
    generateAndSendToken();

  } catch (err) {
    console.error("Database error during user processing:", err.message);
    return res.status(500).json({ error: 'Database error processing user.' });
  }
};


// --- Main Login Handler (now calls the async version of processLogin) ---
const loginUser = async (req, res) => {
  try {
    const { code, openid, userInfo } = req.body;
    const nickName = userInfo ? userInfo.nickName : null;

    if (openid && userInfo && !code) {
      console.log(`Updating user info for existing OpenID: ${openid}`);
      await processLoginAndGenerateToken(openid, nickName, res); // Use await
      return;
    }

    let targetOpenid = null;
    let isMock = false;
    const studentMockCode = 'mockCodeStudent123';
    const coachMockCode = 'mockCodeCoach456';

    if (code === studentMockCode) {
      targetOpenid = 'test-student-openid-123';
      isMock = true;
      console.log(`MOCK LOGIN: Handling mock student code. Generated OpenID: ${targetOpenid}`);
    } else if (code === coachMockCode) {
      targetOpenid = process.env.COACH_OPENID;
      if (!targetOpenid) {
        console.error("MOCK LOGIN ERROR: mockCodeCoach used, but COACH_OPENID is not set in .env!");
        return res.status(500).json({ error: 'Server configuration error: COACH_OPENID missing.' });
      }
      isMock = true;
      console.log(`MOCK LOGIN: Handling mock coach code. Using configured COACH_OPENID: ${targetOpenid}`);
    }

    if (isMock) {
      await processLoginAndGenerateToken(targetOpenid, nickName, res); // Use await
      return;
    }

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

    const { openid: wechatOpenid } = wechatData;
    console.log(`REAL LOGIN: Successfully retrieved OpenID: ${wechatOpenid}`);

    await processLoginAndGenerateToken(wechatOpenid, nickName, res); // Use await

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
