/**
 * Middleware factory: require a specific role (or array of roles)
 * Must be used AFTER requireAuth
 * Usage: router.post('/classes', requireAuth, requireRole('professor'), handler)
 */
function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'Authentication required' });
        }
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: `Access denied. Required role: ${roles.join(' or ')}` });
        }
        next();
    };
}

module.exports = requireRole;
