const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const { getAllRoomsWithStatus } = require('../services/statusEngine');

// Multer: memory storage for CSV uploads (max 2MB)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) cb(null, true);
        else cb(new Error('Only CSV files are allowed'));
    }
});

// All student routes require JWT + student role
router.use(requireAuth, requireRole('student'));

// GET /api/student/dashboard
router.get('/dashboard', (req, res) => {
    try {
        const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const todayDate = new Date(today).toISOString().split('T')[0];
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDay = days[new Date(today).getDay()];

        const enrollments = prepare(`
            SELECT e.*, s.name as subject_name, s.code as subject_code, u.full_name as professor_name
            FROM enrollments e
            JOIN subjects s ON e.subject_id = s.id
            JOIN users u ON s.professor_id = u.id
            WHERE e.student_id = ?
        `).all(req.user.id);

        const todayTimetable = prepare(`
            SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM student_timetables st
            LEFT JOIN time_slots ts ON st.slot_id = ts.id
            WHERE st.student_id = ? AND st.day = ?
            ORDER BY ts.start_time
        `).all(req.user.id, todayDay);

        const unreadCount = prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);

        res.json({
            student: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: { enrollments: enrollments.length, unreadNotifications: unreadCount.c },
            todayTimetable,
            enrollments
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/student/timetable
router.get('/timetable', (req, res) => {
    try {
        const timetable = prepare(`
            SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM student_timetables st
            LEFT JOIN time_slots ts ON st.slot_id = ts.id
            WHERE st.student_id = ?
            ORDER BY CASE st.day
                WHEN 'Monday' THEN 1 WHEN 'Tuesday' THEN 2 WHEN 'Wednesday' THEN 3
                WHEN 'Thursday' THEN 4 WHEN 'Friday' THEN 5 WHEN 'Saturday' THEN 6 ELSE 7 END,
            ts.start_time
        `).all(req.user.id);
        res.json(timetable);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/student/timetable/upload — upload CSV timetable
// Expected CSV columns: day, start_time, end_time, subject_name, faculty_name, room_id
router.post('/timetable/upload', upload.single('timetable'), (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: 'CSV file is required' });

        const csvText = req.file.buffer.toString('utf-8');
        const records = parse(csvText, {
            columns: true,
            skip_empty_lines: true,
            trim: true
        });

        const validDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        let inserted = 0;
        let errors = [];

        // Clear existing timetable for this student
        prepare('DELETE FROM student_timetables WHERE student_id = ?').run(req.user.id);

        for (const [i, row] of records.entries()) {
            const { day, subject_name, faculty_name, room_id, slot_id } = row;
            if (!day || !subject_name) {
                errors.push(`Row ${i + 2}: day and subject_name are required`);
                continue;
            }
            if (!validDays.includes(day)) {
                errors.push(`Row ${i + 2}: invalid day "${day}"`);
                continue;
            }

            // Try to find matching slot_id from start_time if provided
            let resolvedSlotId = slot_id ? parseInt(slot_id) : null;
            if (!resolvedSlotId && row.start_time) {
                const slot = prepare('SELECT id FROM time_slots WHERE start_time = ?').get(row.start_time);
                resolvedSlotId = slot?.id || null;
            }

            prepare(`
                INSERT INTO student_timetables (student_id, day, slot_id, room_id, subject_name, faculty_name)
                VALUES (?, ?, ?, ?, ?, ?)
            `).run(req.user.id, day, resolvedSlotId, room_id || null, subject_name, faculty_name || null);
            inserted++;
        }

        res.json({ success: true, inserted, errors: errors.length > 0 ? errors : undefined });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/student/notifications
router.get('/notifications', (req, res) => {
    try {
        const { unread } = req.query;
        let sql = 'SELECT * FROM notifications WHERE user_id = ?';
        if (unread === 'true') sql += ' AND is_read = 0';
        sql += ' ORDER BY created_at DESC LIMIT 50';
        const notifications = prepare(sql).all(req.user.id);
        const unreadCount = prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0').get(req.user.id);
        res.json({ notifications, unreadCount: unreadCount.c });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/student/notifications/:id/read
router.put('/notifications/:id/read', (req, res) => {
    try {
        prepare('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?').run(parseInt(req.params.id), req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/student/notifications/read-all
router.put('/notifications/read-all', (req, res) => {
    try {
        prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/student/availability — live room availability
router.get('/availability', (req, res) => {
    try {
        const { slot_id, date, block } = req.query;
        let rooms = getAllRoomsWithStatus(slot_id, date);
        if (block) rooms = rooms.filter(r => r.block === block);
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/student/rescheduled — view rescheduled classes for enrolled subjects
router.get('/rescheduled', (req, res) => {
    try {
        const rescheduled = prepare(`
            SELECT pc.*, ts.start_time, ts.end_time, ts.label as slot_label,
                   u.full_name as professor_name, s.name as subject_name, s.code as subject_code
            FROM professor_classes pc
            JOIN time_slots ts ON pc.slot_id = ts.id
            JOIN users u ON pc.professor_id = u.id
            LEFT JOIN subjects s ON pc.subject_id = s.id
            JOIN enrollments e ON e.subject_id = pc.subject_id
            WHERE e.student_id = ? AND pc.status IN ('scheduled','cancelled')
            ORDER BY pc.date DESC
        `).all(req.user.id);
        res.json(rescheduled);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
