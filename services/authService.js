const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

// SECURITY: JWT_SECRET must be set in environment — fail loudly at import time
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('FATAL: JWT_SECRET environment variable is missing.');
    console.error('Please set JWT_SECRET in your environment or deployment dashboard (e.g., Render, Vercel).');
    process.exit(1);
}

const JWT_EXPIRES = '8h';

/**
 * Async password hashing — does NOT block the event loop
 */
async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

/**
 * Async password comparison
 */
async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, JWT_SECRET };
