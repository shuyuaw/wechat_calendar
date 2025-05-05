// backend/middleware/auth.middleware.js

const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // Make sure JWT_SECRET is loaded via dotenv in server.js

/**
 * Express middleware to verify JWT token from Authorization header.
 * If valid, attaches decoded payload to req.user.
 * If invalid or missing, sends 401 or 403 response.
 */
const verifyToken = (req, res, next) => {
    // 1. Get the token from the Authorization header
    const authHeader = req.headers['authorization'];
    // The header should look like "Bearer YOUR_TOKEN"
    const token = authHeader && authHeader.split(' ')[1]; // Extract token part

    // 2. Check if token exists
    if (!token) {
        console.log('[Auth Middleware] No token provided.');
        // 401 Unauthorized is often used when credentials are required but missing
        // 403 Forbidden can be used if you consider access without a token as forbidden
        return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // 3. Verify the token
    jwt.verify(token, JWT_SECRET, (err, decodedPayload) => {
        if (err) {
            console.error('[Auth Middleware] Token verification failed:', err.message);
            // Common errors: TokenExpiredError, JsonWebTokenError (malformed/invalid signature)
            if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired. Please log in again.' });
            }
            // For other verification errors, 403 might be suitable as the token is invalid/forbidden
            return res.status(403).json({ error: 'Invalid token.' });
        }

        // 4. Token is valid, attach payload to request object
        // The decodedPayload contains whatever you put in it during generation (e.g., { openid: '...' })
        console.log('[Auth Middleware] Token verified successfully. Payload:', decodedPayload);
        req.user = decodedPayload; // Attach the decoded payload (contains openid)

        // 5. Call next() to pass control to the next middleware or route handler
        next();
    });
};

// Export the middleware function
module.exports = {
    verifyToken
};