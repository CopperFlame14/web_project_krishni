const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// GET /api/enrollments — my enrollments
router.get('/', requireAuth, (req, res) => {
    try {
        const enrollments = prepare(`
            SELECT e.*, s.name as subject_name, s.code as subject_code,
                   u.full_name as professor_name, u.email as professor_email
            FROM enrollments e
            JOIN subjects s ON e.subject_id = s.id
            JOIN users u ON s.professor_id = u.id
            WHERE e.student_id = ?
            ORDER BY s.code
        `).all(req.user.id);
        res.json(enrollments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/enrollments — enroll in a subject (student only)
router.post('/', requireAuth, requireRole('student'), (req, res) => {
    try {
        const { subjectId } = req.body;
        if (!subjectId) return res.status(400).json({ error: 'subjectId is required' });

        const subject = prepare('SELECT * FROM subjects WHERE id = ?').get(subjectId);
        if (!subject) return res.status(404).json({ error: 'Subject not found' });

        try {
            const result = prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(req.user.id, subjectId);
            res.status(201).json({ success: true, enrollmentId: result.lastInsertRowid, subject });
        } catch (e) {
            if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Already enrolled in this subject' });
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/enrollments/:subjectId — unenroll
router.delete('/:subjectId', requireAuth, requireRole('student'), (req, res) => {
    try {
        prepare('DELETE FROM enrollments WHERE student_id = ? AND subject_id = ?').run(req.user.id, parseInt(req.params.subjectId));
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/enrollments/subjects — list all available subjects (for enrollment)
router.get('/subjects', requireAuth, (req, res) => {
    try {
        const subjects = prepare(`
            SELECT s.*, u.full_name as professor_name,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.subject_id = s.id) as enrolled_count
            FROM subjects s
            JOIN users u ON s.professor_id = u.id
            ORDER BY s.code
        `).all();
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
