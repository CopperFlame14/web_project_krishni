const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const { pool, prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const checkFreeze = require('../middleware/checkFreeze');
const { getAllRoomsWithStatus, getSystemConfig } = require('../services/statusEngine');
const { checkStudentTimeClash } = require('../services/clashEngine');

// Multer for CSV uploads (2 MB limit)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        if (!file.originalname.endsWith('.csv')) return cb(new Error('Only CSV files allowed'));
        cb(null, true);
    }
});

// All student routes require JWT + student role
router.use(requireAuth, requireRole('student'));

// GET /api/student/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const today = new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' });
        const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        const todayDay = days[new Date(today).getDay()];

        const [enrollments, todayTimetable, unreadCount, pendingRequests] = await Promise.all([
            prepare(`
                SELECT e.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
                FROM enrollments e
                JOIN courses c ON e.course_id = c.id
                JOIN users u ON c.professor_id = u.id
                WHERE e.student_id = $1 AND c.academic_year = $2
            `).all(req.user.id, academicYear),

            prepare(`
                SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label,
                       c.name as course_name, c.code as course_code
                FROM student_timetables st
                LEFT JOIN time_slots ts ON st.slot_id = ts.id
                LEFT JOIN courses c ON st.course_id = c.id
                WHERE st.student_id = $1 AND st.day = $2 AND st.academic_year = $3
                ORDER BY ts.start_time
            `).all(req.user.id, todayDay, academicYear),

            prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = $1 AND is_read = FALSE').get(req.user.id),

            prepare("SELECT COUNT(*) as c FROM enrollment_requests WHERE student_id = $1 AND status = 'pending'").get(req.user.id)
        ]);

        res.json({
            student: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: {
                enrollments: enrollments.length,
                unreadNotifications: parseInt(unreadCount.c),
                pendingRequests: parseInt(pendingRequests.c),
                classesToday: todayTimetable.length
            },
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
            SELECT st.*, ts.start_time, ts.end_time, ts.label as slot_label,
                   c.name as course_name, c.code as course_code, u.full_name as professor_name
            FROM student_timetables st
            LEFT JOIN time_slots ts ON st.slot_id = ts.id
            LEFT JOIN courses c ON st.course_id = c.id
            LEFT JOIN users u ON c.professor_id = u.id
            WHERE st.student_id = $1 AND st.academic_year = $2
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

// POST /api/student/timetable/upload — CSV upload with transactional clash detection + auto-enrollment
router.post('/timetable/upload', checkFreeze, upload.single('timetable'), async (req, res) => {
    const client = await pool.connect();
    try {
        if (!req.file) return res.status(400).json({ error: 'CSV file is required' });
        const academicYear = await getSystemConfig('current_academic_year');

        const csvText = req.file.buffer.toString('utf-8');
        let records;
        try {
            records = parse(csvText, { columns: true, skip_empty_lines: true, trim: true });
        } catch (parseErr) {
            return res.status(400).json({ error: `CSV parse error: ${parseErr.message}` });
        }

        await client.query('BEGIN');

        // Clear this student's existing timetable for the academic year
        await client.query(
            'DELETE FROM student_timetables WHERE student_id = $1 AND academic_year = $2',
            [req.user.id, academicYear]
        );
        // Clear existing enrollments for re-evaluation (upload replaces everything)
        await client.query(
            `DELETE FROM enrollments WHERE student_id = $1
             AND course_id IN (SELECT id FROM courses WHERE academic_year = $2)`,
            [req.user.id, academicYear]
        );

        const results = [];

        for (const row of records) {
            const subjectName = (row.subject_name || row.course_code || row.code || '').trim();
            if (!subjectName) { results.push({ row: subjectName, status: 'skipped', reason: 'Empty row' }); continue; }

            // Try to match CSV row to a course in DB (by code or name)
            const course = await client.query(
                `SELECT c.*, t.day, t.slot_id, t.room_id
                 FROM courses c
                 LEFT JOIN timetable t ON t.course_id = c.id AND t.academic_year = c.academic_year
                 WHERE c.academic_year = $1
                   AND (LOWER(c.code) = LOWER($2) OR LOWER(c.name) ILIKE LOWER($3))
                 LIMIT 1`,
                [academicYear, subjectName, subjectName]
            );

            if (course.rows.length === 0) {
                results.push({ row: subjectName, status: 'not_found', reason: `No matching course found for "${subjectName}"` });
                continue;
            }

            const c = course.rows[0];
            const slotId = c.slot_id || null;
            const day = c.day || row.day || null;

            // Resolve slot from CSV start_time if course has no timetable entry
            let resolvedSlotId = slotId;
            if (!resolvedSlotId && row.start_time) {
                const slot = await client.query(
                    'SELECT id FROM time_slots WHERE start_time = $1',
                    [row.start_time]
                );
                resolvedSlotId = slot.rows[0]?.id || null;
            }

            // Clash detection
            if (resolvedSlotId && day) {
                const clash = await checkStudentTimeClash(req.user.id, resolvedSlotId, day, academicYear);
                if (clash.hasClash) {
                    results.push({ row: subjectName, status: 'clash', reason: clash.details });
                    continue;
                }
            }

            // Check capacity
            const capacityResult = await client.query(
                'SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = $1',
                [c.id]
            );
            if (c.max_capacity && parseInt(capacityResult.rows[0].cnt) >= c.max_capacity) {
                results.push({ row: subjectName, status: 'full', reason: `Course is at capacity (${c.max_capacity})` });
                continue;
            }

            // Insert timetable entry
            await client.query(`
                INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, subject_name, academic_year)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (student_id, day, slot_id, academic_year) DO NOTHING
            `, [req.user.id, c.id, day, resolvedSlotId, c.room_id || row.room_id || null, c.code || subjectName, academicYear]);

            // Auto-enroll
            await client.query(
                `INSERT INTO enrollments (student_id, course_id, status) VALUES ($1, $2, 'enrolled')
                 ON CONFLICT (student_id, course_id) DO NOTHING`,
                [req.user.id, c.id]
            );

            results.push({ row: subjectName, status: 'enrolled', courseId: c.id, courseName: c.name });
        }

        await client.query('COMMIT');
        res.json({
            success: true,
            results,
            summary: {
                total: records.length,
                enrolled: results.filter(r => r.status === 'enrolled').length,
                clashes: results.filter(r => r.status === 'clash').length,
                notFound: results.filter(r => r.status === 'not_found').length,
                full: results.filter(r => r.status === 'full').length
            }
        });

    } catch (err) {
        await client.query('ROLLBACK');
        res.status(400).json({ error: err.message });
    } finally {
        client.release();
    }
});

// GET /api/student/notifications
router.get('/notifications', async (req, res) => {
    try {
        const notifications = await prepare(
            'SELECT * FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50'
        ).all(req.user.id);
        const unreadCount = await prepare(
            'SELECT COUNT(*) as c FROM notifications WHERE user_id = $1 AND is_read = FALSE'
        ).get(req.user.id);
        res.json({ notifications, unreadCount: parseInt(unreadCount.c) });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/student/notifications/:id/read
router.put('/notifications/:id/read', async (req, res) => {
    try {
        await prepare(
            'UPDATE notifications SET is_read = TRUE WHERE id = $1 AND user_id = $2'
        ).run(parseInt(req.params.id), req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/student/notifications/read-all
router.put('/notifications/read-all', async (req, res) => {
    try {
        await prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = $1').run(req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/student/rescheduled — session updates for enrolled courses
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
            WHERE e.student_id = $1 AND c.academic_year = $2
              AND cs.status IN ('rescheduled', 'cancelled')
            ORDER BY cs.date DESC
        `).all(req.user.id, academicYear);
        res.json(sessionUpdates);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
