// backend/services/scheduler.js
const schedule = require('node-schedule');
const pool = require('../database.js'); // Use the new MySQL pool
const { format: formatDate, addMinutes } = require('date-fns');
const { sendSubscribeMessage } = require('../utils/wechat.js'); // Assuming you moved the notification logic here

/**
 * The main scheduler job function. Runs every minute.
 * Converted to async and MySQL.
 */
const sendAppointmentReminders = async () => {
    console.log(`[Scheduler] Running job at ${new Date().toISOString()}: Checking for upcoming appointments...`);

    const reminderWindowMinutes = 15;
    const now = new Date();
    const windowStart = addMinutes(now, reminderWindowMinutes - 1);
    const windowEnd = addMinutes(now, reminderWindowMinutes);

    // MySQL uses standard date comparison, no need for datetime() function
    const sql = `
        SELECT bookingId, userId, startTime, endTime FROM Bookings
        WHERE status = 'confirmed'
          AND isReminderSent = 0
          AND startTime > ?
          AND startTime <= ?
    `;
    // Format dates for MySQL DATETIME columns
    const params = [
        formatDate(windowStart, 'yyyy-MM-dd HH:mm:ss'),
        formatDate(windowEnd, 'yyyy-MM-dd HH:mm:ss')
    ];

    try {
        const [bookings] = await pool.query(sql, params);

        if (bookings.length > 0) {
            console.log(`[Scheduler] Found ${bookings.length} booking(s) to send reminders for.`);
        }

        // Use a for...of loop to handle async operations correctly for each booking
        for (const booking of bookings) {
            const reminderTemplateId = process.env.WECHAT_REMINDER_TEMPLATE_ID || 'YOUR_REMINDER_TEMPLATE_ID_HERE';

            const startTime = new Date(booking.startTime);
            const endTime = new Date(booking.endTime);
            const formattedTimeSlot = `${formatDate(startTime, 'yyyy-MM-dd HH:mm')} - ${formatDate(endTime, 'HH:mm')}`;

            const reminderData = {
                "thing3": { "value": "辅导预约即将开始" },
                "character_string10": { "value": formattedTimeSlot }
            };

            const success = await sendSubscribeMessage({
                recipientOpenId: booking.userId,
                templateId: reminderTemplateId,
                dataPayload: reminderData,
                pageLink: 'pages/myBookings/myBookings'
            });

            if (success) {
                const updateSql = "UPDATE Bookings SET isReminderSent = 1 WHERE bookingId = ?";
                await pool.query(updateSql, [booking.bookingId]);
                console.log(`[Scheduler] Successfully updated isReminderSent flag for booking ${booking.bookingId}.`);
            }
        }
    } catch (err) {
        console.error('[Scheduler] DB Error fetching or processing bookings for reminders:', err.message);
    }
};

/**
 * Initializes and starts the scheduler.
 */
const initScheduler = () => {
    // node-schedule handles async functions correctly
    schedule.scheduleJob('* * * * *', sendAppointmentReminders);
    console.log('[Scheduler] Appointment reminder scheduler initialized. Will run every minute.');
};

module.exports = {
    initScheduler
};
