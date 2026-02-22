const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const checkFreeze = require('../middleware/checkFreeze');
const { getSystemConfig } = require('../services/statusEngine');

// GET /api/enrollments — my enrollments
router.get('/', requireAuth, async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const enrollments = await prepare(`
            SELECT e.*, c.name as course_name, c.code as course_code,
                   u.full_name as professor_name, u.email as professor_email
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE e.student_id = ? AND c.academic_year = ?
            ORDER BY c.code
        `).all(req.user.id, academicYear);
        res.json(enrollments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/enrollments — enroll in a course (student only + check freeze)
router.post('/', requireAuth, requireRole('student'), checkFreeze, async (req, res) => {
    try {
        const { courseId } = req.body;
        if (!courseId) return res.status(400).json({ error: 'courseId is required' });

        const course = await prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
        if (!course) return res.status(404).json({ error: 'Course not found' });

        try {
            const result = await prepare('INSERT INTO enrollments (student_id, course_id) VALUES (?, ?) RETURNING id').run(req.user.id, courseId);
            res.status(201).json({ success: true, enrollmentId: result.lastInsertRowid, course });
        } catch (e) {
            if (e.message?.toLowerCase().includes('unique')) return res.status(409).json({ error: 'Already enrolled in this course' });
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/enrollments/:courseId — unenroll (student only + check freeze)
router.delete('/:courseId', requireAuth, requireRole('student'), checkFreeze, async (req, res) => {
    try {
        await prepare('DELETE FROM enrollments WHERE student_id = ? AND course_id = ?').run(req.user.id, req.params.courseId);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/enrollments/courses — list all available courses (for enrollment)
router.get('/courses', requireAuth, async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const courses = await prepare(`
            SELECT c.*, u.full_name as professor_name,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrolled_count
            FROM courses c
            JOIN users u ON c.professor_id = u.id
            WHERE c.academic_year = ?
            ORDER BY c.code
        `).all(academicYear);
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
