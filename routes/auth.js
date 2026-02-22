const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { prepare } = require('../database/db');
const { hashPassword, comparePassword, signToken } = require('../services/authService');
const requireAuth = require('../middleware/requireAuth');

// Rate limit: 10 attempts per 15 minutes per IP
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    message: { error: 'Too many login attempts. Try again in 15 minutes.' }
});

// POST /api/auth/register
router.post('/register', (req, res) => {
    try {
        const { username, email, password, role, full_name } = req.body;
        if (!username || !email || !password || !role) {
            return res.status(400).json({ error: 'username, email, password, and role are required' });
        }
        if (!['student', 'professor'].includes(role)) {
            return res.status(400).json({ error: 'Role must be student or professor' });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: 'Password must be at least 6 characters' });
        }

        const existing = prepare('SELECT id FROM users WHERE username = ? OR email = ?').get(username, email);
        if (existing) {
            return res.status(409).json({ error: 'Username or email already exists' });
        }

        const hash = hashPassword(password);
        const result = prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?)').run(username, email, hash, role, full_name || username);
        const userId = result.lastInsertRowid;

        const token = signToken({ id: userId, username, email, role, full_name: full_name || username });
        console.log(`✅ New ${role} registered: ${username}`);
        res.status(201).json({ success: true, token, user: { id: userId, username, email, role, full_name: full_name || username } });
    } catch (err) {
        console.error('Register error:', err);
        res.status(500).json({ error: err.message });
    }
});

// POST /api/auth/login
router.post('/login', loginLimiter, (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ error: 'Username and password are required' });
        }

        const user = prepare('SELECT * FROM users WHERE username = ? OR email = ?').get(username, username);
        if (!user || !comparePassword(password, user.password)) {
            console.log(`❌ Failed login: ${username}`);
            return res.status(401).json({ error: 'Invalid username or password' });
        }

        const token = signToken({ id: user.id, username: user.username, email: user.email, role: user.role, full_name: user.full_name });
        console.log(`✅ Login: ${user.username} (${user.role})`);
        res.json({ success: true, token, user: { id: user.id, username: user.username, email: user.email, role: user.role, full_name: user.full_name } });
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ error: err.message });
    }
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
    const user = prepare('SELECT id, username, email, role, full_name, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// POST /api/auth/logout (client-side token discard; endpoint for completeness)
router.post('/logout', (req, res) => {
    res.json({ success: true, message: 'Logged out successfully' });
});

module.exports = router;
