const express = require('express');
const router = express.Router();
const AdminService = require('../services/adminService');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { hashPassword } = require('../services/authService');
const { prepare } = require('../database/db');

// All admin routes require JWT + admin role
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/dashboard — global stats
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await AdminService.getGlobalStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/stats — extended statistics
router.get('/stats', async (req, res) => {
    try {
        const stats = await AdminService.getStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/freeze — toggle enrollment freeze
router.post('/freeze', async (req, res) => {
    try {
        const { status } = req.body;
        const newStatus = await AdminService.setFreeze(status === true);
        res.json({ success: true, isFrozen: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/professors
router.get('/professors', async (req, res) => {
    try {
        const professors = await AdminService.getAllProfessors();
        res.json(professors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/students
router.get('/students', async (req, res) => {
    try {
        const students = await AdminService.getAllStudents();
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/users — all users
router.get('/users', async (req, res) => {
    try {
        const users = await AdminService.getAllUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/users — create a professor or student
router.post('/users', async (req, res) => {
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

        const hash = await hashPassword(password);
        try {
            const result = await prepare(
                'INSERT INTO users (username, email, password, role, full_name) VALUES ($1, $2, $3, $4, $5) RETURNING id'
            ).run(username, email, hash, role, full_name || username);
            res.status(201).json({
                success: true,
                user: { id: result.lastInsertRowid, username, email, role, full_name: full_name || username }
            });
        } catch (e) {
            if (e.message?.toLowerCase().includes('unique')) {
                return res.status(409).json({ error: 'Username or email already exists' });
            }
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/courses
router.get('/courses', async (req, res) => {
    try {
        const courses = await AdminService.getAllCourses();
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/courses/:id/students — enrolled students for a course
router.get('/courses/:id/students', async (req, res) => {
    try {
        const students = await AdminService.getCourseStudents(req.params.id);
        res.json(students);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/enrollments — all enrollments
router.get('/enrollments', async (req, res) => {
    try {
        const enrollments = await AdminService.getEnrollmentRequests();
        res.json(enrollments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/enrollment-requests — pending requests
router.get('/enrollment-requests', async (req, res) => {
    try {
        const requests = await prepare(`
            SELECT er.*, u.full_name as student_name, u.email as student_email,
                   c.name as course_name, c.code as course_code,
                   p.full_name as professor_name
            FROM enrollment_requests er
            JOIN users u ON er.student_id = u.id
            JOIN courses c ON er.course_id = c.id
            JOIN users p ON c.professor_id = p.id
            ORDER BY er.requested_at DESC
        `).all();
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
