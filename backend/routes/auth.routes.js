// backend/routes/auth.routes.js
const express = require('express');
const router = express.Router();
const axios = require('axios'); // To make HTTP requests to WeChat API
const jwt = require('jsonwebtoken'); // To create JWT tokens

// --- Access secrets from process.env ---
// These should be available because dotenv was configured in server.js
const JWT_SECRET = process.env.JWT_SECRET;
const WECHAT_APPID = process.env.WECHAT_APPID;
const WECHAT_SECRET = process.env.WECHAT_SECRET;

// --- Optional check (good practice) ---
if (!JWT_SECRET || !WECHAT_APPID || !WECHAT_SECRET) {
  console.error("FATAL ERROR in auth.routes.js: Missing required environment variables (JWT_SECRET, WECHAT_APPID, WECHAT_SECRET). Check .env file and server startup.");
  // Optionally throw an error to prevent the route from being defined incorrectly
  // throw new Error("Missing critical configuration in auth.routes.js");
}

// --- Define the login route ---
// POST /api/login (Note: '/api' prefix is added in server.js where this router is used)
router.post('/login', async (req, res) => {
  const { code } = req.body; // Get the temporary code from the frontend request body

  // --- Validate input ---
  if (!code) {
    console.log('[Backend /api/login] Failed: Login code missing from request body.');
    return res.status(400).json({ message: 'Login code is required' });
  }

  // --- Construct WeChat API URL ---
  const wechatApiUrl = `https://api.weixin.qq.com/sns/jscode2session?appid=${WECHAT_APPID}&secret=${WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`;

  console.log(`[Backend /api/login] Received code: ${code}. Requesting session from WeChat...`);

  try {
    // --- Step 1: Exchange code for openid with WeChat API ---
    const wechatResponse = await axios.get(wechatApiUrl);

    // --- Check for errors returned by WeChat API ---
    if (wechatResponse.data.errcode || !wechatResponse.data.openid) {
      console.error('[Backend /api/login] WeChat API error:', wechatResponse.data);
      return res.status(500).json({ message: 'Failed to authenticate with WeChat', error: wechatResponse.data });
    }

    // --- Successfully retrieved openid ---
    const openid = wechatResponse.data.openid;
    // const session_key = wechatResponse.data.session_key; // You might store/use this later if needed

    console.log('[Backend /api/login] OpenID retrieved:', openid);

    // --- (Optional but Recommended): Database step ---
    // Here you would normally find or create a user in your database based on the openid
    // Example: const user = await findOrCreateUserByOpenId(openid); const userId = user._id;

    // --- Step 2: Generate JWT Token ---
    const payload = {
      openid: openid,
      // Include other useful, non-sensitive info if needed:
      // userId: userId // If you have a database user ID
    };

    console.log('[Backend /api/login] Attempting to sign JWT...');
    const token = jwt.sign(
        payload,          // Data to include
        JWT_SECRET,       // Your secret key
        { expiresIn: '7d' } // Token expiration (e.g., 7 days)
    );
    console.log('[Backend /api/login] JWT signing successful.');

    // --- Step 3: Return the Token to the Frontend ---
    console.log('[Backend /api/login] Sending token response...');
    res.status(200).json({ token: token }); // Send the generated token

  } catch (error) {
    // --- Handle potential errors during the process ---
    console.error('[Backend /api/login] Error during login process:', error.message);
    // Log details if it's an error making the HTTP request to WeChat
    if (error.response) {
        console.error('Axios error details:', error.response.status, error.response.data);
    } else {
        console.error(error.stack); // Log stack trace for other errors
    }
    res.status(500).json({ message: 'Internal server error during login' });
  }
});

// Export the router so it can be used in server.js
module.exports = router;