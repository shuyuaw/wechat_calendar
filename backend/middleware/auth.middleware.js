// backend/middleware/auth.middleware.js
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET; // Access the secret

if (!JWT_SECRET) {
  console.error("FATAL ERROR in auth.middleware.js: JWT_SECRET environment variable is not set. Authentication middleware cannot function.");
  // In a real app, you might want to throw an error to prevent server startup
  // throw new Error("JWT_SECRET is not defined.");
}

const authenticateToken = (req, res, next) => {
  // 1. Get the token from the Authorization header
  const authHeader = req.header('Authorization');
  // Header format is typically "Bearer TOKEN_STRING"
  const token = authHeader && authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : null;

  // 2. Check if token exists
  if (!token) {
    console.log('[Auth Middleware] Failed: No token provided.');
    // 401 Unauthorized - Client needs to authenticate
    return res.status(401).json({ message: 'Access denied. No token provided.' });
  }

  // 3. Verify the token
  try {
    // jwt.verify throws an error if token is invalid (e.g., wrong secret, expired)
    const decodedPayload = jwt.verify(token, JWT_SECRET);

    // 4. Attach payload to request object
    // We can now access req.user in subsequent route handlers
    req.user = decodedPayload; // Contains { openid: '...', iat: ..., exp: ... }
    console.log('[Auth Middleware] Success: Token verified for openid:', req.user.openid);

    // 5. Call next() to pass control to the next middleware/route handler
    next();

  } catch (error) {
    console.error('[Auth Middleware] Failed: Token verification error:', error.message);
    // 403 Forbidden - Client authenticated but token is invalid/expired
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token expired. Please log in again.' }); // Use 401 for expired token often
    }
    if (error instanceof jwt.JsonWebTokenError) {
        return res.status(403).json({ message: 'Invalid token.' });
    }
    // Generic server error if it's something else
    return res.status(500).json({ message: 'Could not verify token.' });
  }
};

module.exports = authenticateToken; // Export the middleware function
