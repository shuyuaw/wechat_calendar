// backend/services/scheduler.js
const schedule = require('node-schedule');
const db = require('../database.js'); // Adjust path if needed
const { format, addMinutes, subMinutes } = require('date-fns');
// Assuming your notification sending logic is in a separate util or accessible
// For simplicity, let's assume sendSubscribeMessage and getWeChatAccessToken are accessible here.
// You might need to export them from your booking.controller.js or move them to a shared utils file.
// For now, let's redefine a simplified version here. If you moved them to a util, require it instead.
const axios = require('axios');

// --- Reusable Notification Logic (Move to a utils/notification.js file later if you refactor) ---
let appAccessToken = null;
let tokenExpiryTime = 0;
async function getWeChatAccessToken() {
    // ... (This should be the exact same function as in your booking.controller.js) ...
    const now = Math.floor(Date.now() / 1000);
    if (appAccessToken && now < tokenExpiryTime - 600) { return appAccessToken; }
    const appId = process.env.WECHAT_APP_ID;
    const appSecret = process.env.WECHAT_APP_SECRET;
    if (!appId || !appSecret) { console.error('[AccessToken] WeChat AppID/Secret not configured.'); return null; }
    try {
        const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${appId}&secret=${appSecret}`;
        const response = await axios.get(url);
        if (response.data && response.data.access_token) {
            appAccessToken = response.data.access_token;
            tokenExpiryTime = now + response.data.expires_in;
            console.log('[AccessToken] (From Scheduler) New access token fetched.');
            return appAccessToken;
        } else { console.error('[AccessToken] (From Scheduler) Failed to fetch:', response.data); return null; }
    } catch (error) { console.error('[AccessToken] (From Scheduler) Error:', error.message); return null; }
}

async function sendSubscribeMessage({ recipientOpenId, templateId, dataPayload, pageLink }) {
    const accessToken = await getWeChatAccessToken();
    if (!accessToken) { console.error('[SendNotify] (From Scheduler) Cannot send, access token missing.'); return; }
    const url = `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${accessToken}`;
    const messageBody = {
        touser: recipientOpenId, template_id: templateId, page: pageLink, data: dataPayload, miniprogram_state: 'developer'
    };
    try {
        console.log(`[SendNotify] (From Scheduler) Attempting reminder to ${recipientOpenId}`);
        const response = await axios.post(url, messageBody);
        if (response.data && response.data.errcode === 0) {
            console.log(`[SendNotify] (From Scheduler) Reminder sent successfully to ${recipientOpenId}.`);
            return true;
        } else {
            console.error(`[SendNotify] (From Scheduler) Failed to send reminder to ${recipientOpenId}. Error:`, response.data);
            return false;
        }
    } catch (error) { console.error(`[SendNotify] (From Scheduler) Axios error sending reminder to ${recipientOpenId}:`, error.message); return false; }
}
// --- End Reusable Notification Logic ---


/**
 * The main scheduler job function. Runs every minute.
 */
const sendAppointmentReminders = () => {
    console.log(`[Scheduler] Running job at ${new Date().toISOString()}: Checking for upcoming appointments...`);

    // Define the reminder window, e.g., 15 minutes from now.
    const reminderWindowMinutes = 15;
    const now = new Date();
    // We'll look for appointments starting between now + 14 mins and now + 15 mins.
    // This way, a job running at 10:00 finds appointments starting from 10:14:00 to 10:15:00.
    const windowStart = addMinutes(now, reminderWindowMinutes - 1);
    const windowEnd = addMinutes(now, reminderWindowMinutes);

    const sql = `
        SELECT bookingId, userId, startTime, endTime FROM Bookings
        WHERE status = 'confirmed'
          AND isReminderSent = 0
          AND datetime(startTime) > datetime(?)
          AND datetime(startTime) <= datetime(?)
    `;
    const params = [windowStart.toISOString(), windowEnd.toISOString()];

    db.all(sql, params, (err, bookings) => {
        if (err) {
            console.error('[Scheduler] DB Error fetching bookings for reminders:', err.message);
            return;
        }

        if (bookings.length > 0) {
            console.log(`[Scheduler] Found ${bookings.length} booking(s) to send reminders for.`);
        }

        bookings.forEach(booking => {
            const reminderTemplateId = 'YUu-DQjYHd8zUmQdgR5k98fhV7ojQsDYkX_lL-5pfB0';

            // Prepare data payload based on keywords
            const startTime = new Date(booking.startTime);
            const endTime = new Date(booking.endTime);
            const formattedTimeSlot = `${format(startTime, 'yyyy-MM-dd HH:mm')} - ${format(endTime, 'HH:mm')}`;

            const reminderData = {
                "thing3": { "value": "辅导预约即将开始" }, // 预约项目
                "character_string10": { "value": formattedTimeSlot } // 预约时间段
            };

            // Send the notification
            sendSubscribeMessage({
                recipientOpenId: booking.userId,
                templateId: reminderTemplateId,
                dataPayload: reminderData,
                pageLink: 'pages/myBookings/myBookings'
            }).then(success => {
                // If the message was sent successfully, update the database
                if (success) {
                    const updateSql = "UPDATE Bookings SET isReminderSent = 1 WHERE bookingId = ?";
                    db.run(updateSql, [booking.bookingId], function(updateErr) {
                        if (updateErr) {
                            console.error(`[Scheduler] DB Error updating isReminderSent flag for booking ${booking.bookingId}:`, updateErr.message);
                        } else {
                            console.log(`[Scheduler] Successfully updated isReminderSent flag for booking ${booking.bookingId}.`);
                        }
                    });
                }
            });
        });
    });
};

/**
 * Initializes and starts the scheduler.
 */
const initScheduler = () => {
    // Schedule the job to run every minute ('* * * * *')
    schedule.scheduleJob('* * * * *', sendAppointmentReminders);
    console.log('[Scheduler] Appointment reminder scheduler initialized. Will run every minute.');
};

module.exports = {
    initScheduler
};