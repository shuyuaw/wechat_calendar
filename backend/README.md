# Coach Booking Backend

This is the backend server for the Coach Booking application. It handles API requests for user authentication, managing availability slots, and booking appointments.

## Installation & Setup

1.  **Install Dependencies:**
    Navigate to the `backend` directory and install the required `npm` packages.
    ```bash
    cd backend
    npm install
    ```

2.  **Configure Environment Variables:**
    Create a `.env` file in the `backend` directory by copying the example file.
    ```bash
    cp .env.example .env
    ```
    Then, edit the `.env` file to include your specific credentials for the `JWT_SECRET`, `COACH_OPENID`, `WECHAT_APP_ID`, and `WECHAT_APP_SECRET`.

## Running the Application

### For Development

To run the server in a development environment, use `node`. The server will run, but it will not automatically restart on file changes.

```bash
node server.js
```

### For Production (Recommended)

For production, it is highly recommended to use `pm2` to manage the process. This will handle automatic restarts and provide robust logging.

1.  **Start the application with `pm2`:**
    Use the provided configuration file to start the server.
    ```bash
    pm2 start ecosystem.config.js
    ```

2.  **Manage the application with `pm2`:**
    The following commands are essential for managing the `pm2` process.

| Command                       | Description                                           |
| ----------------------------- | ----------------------------------------------------- |
| `pm2 start ecosystem.config.js` | Starts the application.                               |
| `pm2 stop coach-booking-app`    | Stops the application.                                |
| `pm2 restart coach-booking-app` | Restarts the application.                             |
| `pm2 logs coach-booking-app`    | Displays the logs for the application.                |
| `pm2 monit`                     | Opens a real-time dashboard to monitor the process.   |
| `pm2 delete coach-booking-app`  | Stops and removes the application from `pm2`'s list.  |
