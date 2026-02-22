const express = require('express');
const router = express.Router();
const AdminService = require('../services/adminService');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { hashPassword } = require('../services/authService');
const { prepare, pool } = require('../database/db');

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

// POST /api/admin/users — create a professor or student (admin only)
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

// DELETE /api/admin/users/:id — remove a professor or student (admin only)
router.delete('/users/:id', async (req, res) => {
    try {
        const user = await prepare('SELECT id, role FROM users WHERE id = $1').get(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete an admin account' });

        await prepare('DELETE FROM users WHERE id = $1').run(req.params.id);
        res.json({ success: true });
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

// POST /api/admin/courses — admin creates a class and assigns it to a professor
router.post('/courses', async (req, res) => {
    try {
        const { code, name, professor_id, semester, max_capacity, academic_year } = req.body;
        if (!code || !name || !professor_id) {
            return res.status(400).json({ error: 'code, name, and professor_id are required' });
        }

        // Verify professor exists and has correct role
        const prof = await prepare('SELECT id FROM users WHERE id = $1 AND role = $2').get(professor_id, 'professor');
        if (!prof) return res.status(404).json({ error: 'Professor not found' });

        // Resolve academic year
        const yearRow = await prepare("SELECT value FROM system_settings WHERE key = 'current_academic_year'").get();
        const resolvedYear = academic_year || yearRow?.value || '2025-26';

        try {
            const result = await prepare(`
                INSERT INTO courses (code, name, professor_id, academic_year, semester, max_capacity, status, auto_approve)
                VALUES ($1, $2, $3, $4, $5, $6, 'active', true)
                RETURNING id
            `).run(code, name, professor_id, resolvedYear, semester || 1, max_capacity || 60);

            res.status(201).json({
                success: true,
                course: { id: result.lastInsertRowid, code, name, professor_id, academic_year: resolvedYear }
            });
        } catch (e) {
            if (e.message?.toLowerCase().includes('unique')) {
                return res.status(409).json({ error: 'Course code already exists for this academic year' });
            }
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/admin/courses/:id — update course (reassign professor, change status, etc.)
router.patch('/courses/:id', async (req, res) => {
    try {
        const { professor_id, name, status, max_capacity } = req.body;

        const course = await prepare('SELECT * FROM courses WHERE id = $1').get(req.params.id);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        if (professor_id) {
            const prof = await prepare('SELECT id FROM users WHERE id = $1 AND role = $2').get(professor_id, 'professor');
            if (!prof) return res.status(404).json({ error: 'Professor not found' });
        }

        await prepare(`
            UPDATE courses SET
                professor_id = COALESCE($1, professor_id),
                name         = COALESCE($2, name),
                status       = COALESCE($3, status),
                max_capacity = COALESCE($4, max_capacity)
            WHERE id = $5
        `).run(professor_id || null, name || null, status || null, max_capacity || null, req.params.id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/admin/courses/:id
router.delete('/courses/:id', async (req, res) => {
    try {
        const course = await prepare('SELECT id FROM courses WHERE id = $1').get(req.params.id);
        if (!course) return res.status(404).json({ error: 'Course not found' });
        await prepare('DELETE FROM courses WHERE id = $1').run(req.params.id);
        res.json({ success: true });
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
