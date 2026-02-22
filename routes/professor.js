const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
    scheduleSession,
    cancelSession,
    rescheduleSession,
    getProfessorSessions
} = require('../services/schedulingService');
const { getSystemConfig } = require('../services/statusEngine');

// All professor routes require JWT + professor role
router.use(requireAuth, requireRole('professor'));

// GET /api/professor/sessions — my scheduled sessions
router.get('/sessions', async (req, res) => {
    try {
        const { date, status } = req.query;
        const sessions = await getProfessorSessions(req.user.id, { date, status });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/sessions — schedule a session
router.post('/sessions', async (req, res) => {
    try {
        const { courseId, roomId, slotId, date, notes } = req.body;
        if (!courseId || !roomId || !slotId || !date) {
            return res.status(400).json({ error: 'courseId, roomId, slotId, and date are required' });
        }

        const newSession = await scheduleSession({
            professorId: req.user.id,
            courseId, roomId, slotId, date, notes
        });

        res.status(201).json({ success: true, session: newSession });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE /api/professor/sessions/:id — cancel a session
router.delete('/sessions/:id', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const result = await cancelSession(sessionId, req.user.id);
        res.json({ success: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/professor/sessions/:id — reschedule a session
router.put('/sessions/:id', async (req, res) => {
    try {
        const sessionId = parseInt(req.params.id);
        const { newRoomId, newSlotId, newDate } = req.body;
        const result = await rescheduleSession(sessionId, {
            professorId: req.user.id,
            newRoomId, newSlotId, newDate
        });
        res.json({ success: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/courses — my courses (current academic year)
router.get('/courses', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const courses = await prepare('SELECT * FROM courses WHERE professor_id = ? AND academic_year = ? ORDER BY code').all(req.user.id, academicYear);
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/courses — create a course
router.post('/courses', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const { code, name, semester } = req.body;
        if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

        try {
            const result = await prepare(`
                INSERT INTO courses (code, name, professor_id, academic_year, semester) 
                VALUES (?, ?, ?, ?, ?) 
                RETURNING id
            `).run(code, name, req.user.id, academicYear, semester || 1);

            res.status(201).json({ success: true, course: { id: result.lastInsertRowid, code, name } });
        } catch (e) {
            if (e.message?.toLowerCase().includes('unique')) return res.status(409).json({ error: 'Course code already exists for this year' });
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/dashboard — summary stats
router.get('/dashboard', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const today = new Date().toISOString().split('T')[0];

        const [todaySessions, totalSessions, courses, students] = await Promise.all([
            prepare("SELECT COUNT(*) as c FROM course_sessions cs JOIN courses c ON cs.course_id = c.id WHERE c.professor_id = ? AND cs.date = ?::DATE AND cs.status = 'scheduled'").get(req.user.id, today),
            prepare("SELECT COUNT(*) as c FROM course_sessions cs JOIN courses c ON cs.course_id = c.id WHERE c.professor_id = ? AND cs.status = 'scheduled'").get(req.user.id),
            prepare("SELECT COUNT(*) as c FROM courses WHERE professor_id = ? AND academic_year = ?").get(req.user.id, academicYear),
            prepare("SELECT COUNT(DISTINCT e.student_id) as c FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE c.professor_id = ?").get(req.user.id)
        ]);

        res.json({
            professor: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: {
                todaySessions: parseInt(todaySessions.c),
                totalScheduled: parseInt(totalSessions.c),
                courses: parseInt(courses.c),
                enrolledStudents: parseInt(students.c)
            },
            academicYear
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
