const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'campus_jwt_secret_change_in_production_32chars';
const JWT_EXPIRES = '8h';

function hashPassword(password) {
    return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
    return bcrypt.compareSync(password, hash);
}

function signToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES });
}

function verifyToken(token) {
    return jwt.verify(token, JWT_SECRET);
}

module.exports = { hashPassword, comparePassword, signToken, verifyToken, JWT_SECRET };
