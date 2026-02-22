const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { scheduleClass, cancelClass, rescheduleClass, getProfessorClasses } = require('../services/schedulingService');

// All professor routes require JWT + professor role
router.use(requireAuth, requireRole('professor'));

// GET /api/professor/classes — my scheduled classes
router.get('/classes', (req, res) => {
    try {
        const { date, status } = req.query;
        const classes = getProfessorClasses(req.user.id, { date, status });
        res.json(classes);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/classes — schedule a class
router.post('/classes', (req, res) => {
    try {
        const { subjectId, roomId, slotId, date, notes } = req.body;
        if (!roomId || !slotId || !date) {
            return res.status(400).json({ error: 'roomId, slotId, and date are required' });
        }

        const newClass = scheduleClass({
            professorId: req.user.id,
            subjectId: subjectId || null,
            roomId, slotId, date, notes
        });

        res.status(201).json({ success: true, class: newClass });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// DELETE /api/professor/classes/:id — cancel a class
router.delete('/classes/:id', (req, res) => {
    try {
        const result = cancelClass(parseInt(req.params.id), req.user.id);
        res.json(result);
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// PUT /api/professor/classes/:id — reschedule a class
router.put('/classes/:id', (req, res) => {
    try {
        const { newRoomId, newSlotId, newDate, notes } = req.body;
        const newClass = rescheduleClass(parseInt(req.params.id), req.user.id, { newRoomId, newSlotId, newDate, notes });
        res.json({ success: true, class: newClass });
    } catch (err) {
        res.status(err.statusCode || 500).json({ error: err.message });
    }
});

// GET /api/professor/subjects — my subjects
router.get('/subjects', (req, res) => {
    try {
        const subjects = prepare('SELECT * FROM subjects WHERE professor_id = ? ORDER BY code').all(req.user.id);
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/subjects — create a subject
router.post('/subjects', (req, res) => {
    try {
        const { code, name } = req.body;
        if (!code || !name) return res.status(400).json({ error: 'code and name are required' });
        try {
            const result = prepare('INSERT INTO subjects (code, name, professor_id) VALUES (?, ?, ?)').run(code, name, req.user.id);
            res.status(201).json({ success: true, subject: { id: result.lastInsertRowid, code, name, professor_id: req.user.id } });
        } catch (e) {
            if (e.message?.includes('UNIQUE')) return res.status(409).json({ error: 'Subject code already exists' });
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/dashboard — summary stats
router.get('/dashboard', (req, res) => {
    try {
        const today = new Date().toISOString().split('T')[0];
        const todayClasses = prepare("SELECT COUNT(*) as c FROM professor_classes WHERE professor_id = ? AND date = ? AND status = 'scheduled'").get(req.user.id, today);
        const totalClasses = prepare("SELECT COUNT(*) as c FROM professor_classes WHERE professor_id = ? AND status = 'scheduled'").get(req.user.id);
        const subjects = prepare('SELECT COUNT(*) as c FROM subjects WHERE professor_id = ?').get(req.user.id);
        const enrolledStudents = prepare(`
            SELECT COUNT(DISTINCT e.student_id) as c FROM enrollments e
            JOIN subjects s ON e.subject_id = s.id WHERE s.professor_id = ?
        `).get(req.user.id);

        res.json({
            professor: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: {
                todayClasses: todayClasses.c,
                totalScheduled: totalClasses.c,
                subjects: subjects.c,
                enrolledStudents: enrolledStudents.c
            }
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
