const { isEnrollmentFrozen } = require('../services/statusEngine');

/**
 * Middleware to block requests if enrollment system is frozen
 */
async function checkFreeze(req, res, next) {
    try {
        const frozen = await isEnrollmentFrozen();
        if (frozen) {
            return res.status(403).json({
                error: 'System Frozen',
                message: 'Enrollment modifications are currently disabled by administration.'
            });
        }
        next();
    } catch (err) {
        res.status(500).json({ error: 'Governance check failed' });
    }
}

module.exports = checkFreeze;
