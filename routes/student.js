const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const checkFreeze = require('../middleware/checkFreeze');
const { getAllRoomsWithStatus, getSystemConfig } = require('../services/statusEngine');

// Multer for CSV uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }
});

router.use(requireAuth, requireRole('student'));

// GET /api/student/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDay = days[new Date(today).getDay()];

        const enrollments = await prepare(`
            SELECT e.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE e.student_id = ? AND c.academic_year = ?
        `).all(req.user.id, academicYear);

        const todayTimetable = await prepare(`
            SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM student_timetables st
            LEFT JOIN time_slots ts ON st.slot_id = ts.id
            WHERE st.student_id = ? AND st.day = ? AND st.academic_year = ?
            ORDER BY ts.start_time
        `).all(req.user.id, todayDay, academicYear);

        const unreadCount = await prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = FALSE').get(req.user.id);

        res.json({
            student: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: { enrollments: enrollments.length, unreadNotifications: parseInt(unreadCount.c) },
            todayTimetable,
            enrollments,
            academicYear
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/student/timetable
router.get('/timetable', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const timetable = await prepare(`
            SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM student_timetables st
            LEFT JOIN time_slots ts ON st.slot_id = ts.id
            WHERE st.student_id = ? AND st.academic_year = ?
            ORDER BY CASE st.day
                WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,
            ts.start_time
        `).all(req.user.id, academicYear);
        res.json(timetable);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/student/timetable/upload (Student only + Check Freeze)
router.post('/timetable/upload', checkFreeze, upload.single('timetable'), async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
        const academicYear = await getSystemConfig('current_academic_year');

        const csvText = req.file.buffer.toString('utf-8');
        const records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });

        // Clear existing for THIS YEAR
        await prepare('DELETE FROM student_timetables WHERE student_id = ? AND academic_year = ?').run(req.user.id, academicYear);

        let inserted = 0;
        for (const row of records) {
            // Match CSV headers: day, start_time, subject_name, faculty_name, room_id
            let slotId = null;
            if (row.start_time) {
                const s = await prepare('SELECT id FROM time_slots WHERE start_time = ?').get(row.start_time);
                slotId = s?.id || null;
            }

            await prepare(`
                INSERT INTO student_timetables (student_id, day, slot_id, room_id, subject_name, academic_year)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(req.user.id, row.day, slotId, row.room_id || null, row.subject_name, academicYear);
            inserted++;
        }

        res.json({ success: true, inserted });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/student/notifications
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
        const unreadCount = await prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = FALSE').get(req.user.id);
        res.json({ notifications, unreadCount: parseInt(unreadCount.c) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// MARK READ
router.put('/notifications/:id/read', async (req, res) => {
    await prepare('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user.id);
    res.json({ success: true });
});

// GET /api/student/rescheduled — view session updates for enrolled courses
router.get('/rescheduled', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const sessionUpdates = await prepare(`
            SELECT cs.*, c.name as course_name, c.code as course_code, u.full_name as professor_name,
                   ts.start_time, ts.end_time, ts.label as slot_label
            FROM course_sessions cs
            JOIN courses c ON cs.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            JOIN time_slots ts ON cs.slot_id = ts.id
            JOIN enrollments e ON e.course_id = c.id
            WHERE e.student_id = ? AND c.academic_year = ? AND cs.status IN ('rescheduled', 'cancelled')
            ORDER BY cs.date DESC
        `).all(req.user.id, academicYear);
        res.json(sessionUpdates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;

