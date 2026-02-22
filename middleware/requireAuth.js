const { verifyToken } = require('../services/authService');

/**
 * Middleware: require a valid JWT in Authorization header
 * Attaches req.user = { id, username, email, role, full_name }
 */
function requireAuth(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Authentication required' });
    }
    const token = authHeader.substring(7);
    try {
        const payload = verifyToken(token);
        req.user = payload;
        next();
    } catch (err) {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}

module.exports = requireAuth;
