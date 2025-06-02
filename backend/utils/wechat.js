// backend/utils/wechat.js
const axios = require('axios'); // For making HTTP requests

// --- Access Token Management (Simple Cache) ---
// In a real production app, consider a more robust cache like Redis or a dedicated library
let appAccessToken = null;
let tokenExpiryTime = 0;

async function getWeChatAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (appAccessToken && now < tokenExpiryTime - 600) { // Refresh 10 mins before expiry
        console.log('[AccessToken] Using cached access token.');
        return appAccessToken;
    }

    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    if (!appId || !appSecret) {
        console.error('[AccessToken] WeChat AppID or AppSecret not configured.');
        return null;
    }

    try {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
        console.log('[AccessToken] Fetching new access token...');
        const response = await axios.get(url);
        if (response.data && response.data.access_token) {
            appAccessToken = response.data.access_token;
            // expires_in is in seconds, set expiry time
            tokenExpiryTime = now + response.data.expires_in;
            console.log('[AccessToken] New access token fetched and cached.');
            return appAccessToken;
        } else {
            console.error('[AccessToken] Failed to fetch access token:', response.data);
            return null;
        }
    } catch (error) {
        console.error('[AccessToken] Error fetching access token:', error.message);
        return null;
    }
}

async function sendSubscribeMessage({ recipientOpenId, templateId, dataPayload, pageLink }) {
    const accessToken = await getWeChatAccessToken();
    if (!accessToken) {
        console.error('[SendNotify] Cannot send message, access token missing.');
        return false;
    }

    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;
    const messageBody = {
        touser: recipientOpenId,
        template_id: templateId,
        page: pageLink, // e.g., 'pages/myBookings/myBookings'
        data: dataPayload,
        miniprogram_state: 'developer' // Or 'trial', 'formal'
    };

    try {
        console.log(`[SendNotify] Attempting to send message to ${recipientOpenId}, template: ${templateId}, data:`, dataPayload);
        const response = await axios.post(url, messageBody);
        if (response.data && response.data.errcode === 0) {
            console.log(`[SendNotify] Message sent successfully to ${recipientOpenId}. MsgID: ${response.data.msgid}`);
            return true;
        } else {
            console.error(`[SendNotify] Failed to send message to ${recipientOpenId}. Error:`, response.data);
            return false;
        }
    } catch (error) {
        console.error(`[SendNotify] Axios error sending message to ${recipientOpenId}:`, error.message);
        return false;
    }
}

module.exports = {
    getWeChatAccessToken, // Export if needed elsewhere, though sendSubscribeMessage handles it internally
    sendSubscribeMessage
};