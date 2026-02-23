const express = require('express');
const router = express.Router();
const { pool, prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const {
    scheduleSession,
    cancelSession,
    rescheduleSession,
    getProfessorSessions
} = require('../services/schedulingService');
const { getSystemConfig } = require('../services/statusEngine');
const { notifyUser } = require('../services/notificationEngine');

// All professor routes require JWT + professor role
router.use(requireAuth, requireRole('professor'));

// GET /api/professor/dashboard
router.get('/dashboard', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const today = new Date().toISOString().split('T')[0];

        const [todaySessions, totalSessions, courses, students, pendingRequests] = await Promise.all([
            prepare(`SELECT COUNT(*) as c FROM course_sessions cs JOIN courses c ON cs.course_id = c.id
                     WHERE c.professor_id = $1 AND cs.date::DATE = $2::DATE AND cs.status = 'scheduled'`).get(req.user.id, today),
            prepare(`SELECT COUNT(*) as c FROM course_sessions cs JOIN courses c ON cs.course_id = c.id
                     WHERE c.professor_id = $1 AND cs.status = 'scheduled'`).get(req.user.id),
            prepare(`SELECT COUNT(*) as c FROM courses WHERE professor_id = $1 AND academic_year = $2`).get(req.user.id, academicYear),
            prepare(`SELECT COUNT(DISTINCT e.student_id) as c FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE c.professor_id = $1`).get(req.user.id),
            prepare(`SELECT COUNT(*) as c FROM enrollment_requests er JOIN courses c ON er.course_id = c.id WHERE c.professor_id = $1 AND er.status = 'pending'`).get(req.user.id)
        ]);

        res.json({
            professor: { id: req.user.id, name: req.user.full_name, email: req.user.email },
            stats: {
                todaySessions: parseInt(todaySessions.c),
                totalScheduled: parseInt(totalSessions.c),
                courses: parseInt(courses.c),
                enrolledStudents: parseInt(students.c),
                pendingApprovals: parseInt(pendingRequests.c)
            },
            academicYear
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/sessions
router.get('/sessions', async (req, res) => {
    try {
        const { date, status } = req.query;
        const sessions = await getProfessorSessions(req.user.id, { date, status });
        res.json(sessions);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/sessions
router.post('/sessions', async (req, res) => {
    try {
        const { courseId, roomId, slotId, date, notes } = req.body;
        if (!courseId || !roomId || !slotId || !date) {
            return res.status(400).json({ error: 'courseId, roomId, slotId, and date are required' });
        }
        const newSession = await scheduleSession({ professorId: req.user.id, courseId, roomId, slotId, date, notes });
        res.status(201).json({ success: true, session: newSession });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// DELETE /api/professor/sessions/:id
router.delete('/sessions/:id', async (req, res) => {
    try {
        const result = await cancelSession(parseInt(req.params.id), req.user.id);
        res.json({ success: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// PUT /api/professor/sessions/:id
router.put('/sessions/:id', async (req, res) => {
    try {
        const { newRoomId, newSlotId, newDate } = req.body;
        const result = await rescheduleSession(parseInt(req.params.id), { professorId: req.user.id, newRoomId, newSlotId, newDate });
        res.json({ success: result });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

// GET /api/professor/courses
router.get('/courses', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const courses = await prepare(`
            SELECT c.*,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrolled_count,
                   (SELECT COUNT(*) FROM enrollment_requests er WHERE er.course_id = c.id AND er.status = 'pending') as pending_count
            FROM courses c
            WHERE c.professor_id = $1 AND c.academic_year = $2
            ORDER BY c.code
        `).all(req.user.id, academicYear);
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/professor/courses — create course with all new fields
router.post('/courses', async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const {
            code, name, semester,
            max_capacity, auto_approve,
            enrollment_open_at, enrollment_close_at,
            status
        } = req.body;
        if (!code || !name) return res.status(400).json({ error: 'code and name are required' });

        try {
            const result = await prepare(`
                INSERT INTO courses (code, name, professor_id, academic_year, semester,
                                     max_capacity, auto_approve, enrollment_open_at, enrollment_close_at, status)
                VALUES ($1, $2, $3::INTEGER, $4, $5::INTEGER, $6::INTEGER, $7::BOOLEAN, $8::TIMESTAMPTZ, $9::TIMESTAMPTZ, $10)
                RETURNING id
            `).run(
                code, name, req.user.id, academicYear, semester || 1,
                max_capacity || 60,
                auto_approve !== false,
                enrollment_open_at || null,
                enrollment_close_at || null,
                status || 'active'
            );

            res.status(201).json({
                success: true,
                course: { id: result.lastInsertRowid, code, name, academic_year: academicYear }
            });
        } catch (e) {
            if (e.message?.toLowerCase().includes('unique')) return res.status(409).json({ error: 'Course code already exists for this year' });
            throw e;
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PATCH /api/professor/courses/:id — update course (archive/reopen)
router.patch('/courses/:id', async (req, res) => {
    try {
        const { status, max_capacity, auto_approve, enrollment_open_at, enrollment_close_at, name } = req.body;

        // Verify ownership
        const course = await prepare('SELECT * FROM courses WHERE id = $1 AND professor_id = $2').get(req.params.id, req.user.id);
        if (!course) return res.status(404).json({ error: 'Course not found or not yours' });

        await prepare(`
            UPDATE courses SET
                status = COALESCE($1, status),
                max_capacity = COALESCE($2::INTEGER, max_capacity),
                auto_approve = COALESCE($3::BOOLEAN, auto_approve),
                enrollment_open_at = COALESCE($4::TIMESTAMPTZ, enrollment_open_at),
                enrollment_close_at = COALESCE($5::TIMESTAMPTZ, enrollment_close_at),
                name = COALESCE($6, name)
            WHERE id = $7
        `).run(status, max_capacity, auto_approve, enrollment_open_at, enrollment_close_at, name, req.params.id);

        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/courses/:id/students — enrolled students for a course
router.get('/courses/:id/students', async (req, res) => {
    try {
        const course = await prepare('SELECT * FROM courses WHERE id = $1 AND professor_id = $2').get(req.params.id, req.user.id);
        if (!course) return res.status(404).json({ error: 'Course not found or not yours' });

        const students = await prepare(`
            SELECT u.id, u.username, u.email, u.full_name, e.enrolled_at, e.status
            FROM enrollments e JOIN users u ON e.student_id = u.id
            WHERE e.course_id = $1
            ORDER BY u.full_name
        `).all(req.params.id);
        res.json({ course: { id: course.id, code: course.code, name: course.name }, students });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/professor/enrollment-requests — pending requests for my courses
router.get('/enrollment-requests', async (req, res) => {
    try {
        const requests = await prepare(`
            SELECT er.*, u.full_name as student_name, u.email as student_email,
                   c.code as course_code, c.name as course_name, c.max_capacity,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrolled_count
            FROM enrollment_requests er
            JOIN users u ON er.student_id = u.id
            JOIN courses c ON er.course_id = c.id
            WHERE c.professor_id = $1 AND er.status = 'pending'
            ORDER BY er.requested_at ASC
        `).all(req.user.id);
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT /api/professor/enrollment-requests/:id/approve
router.put('/enrollment-requests/:id/approve', async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        const reqResult = await client.query(`
            SELECT er.*, c.professor_id, c.name as course_name, c.code as course_code,
                   c.max_capacity, c.academic_year, c.auto_approve
            FROM enrollment_requests er
            JOIN courses c ON er.course_id = c.id
            WHERE er.id = $1 AND er.status = 'pending'
        `, [req.params.id]);

        const enrollReq = reqResult.rows[0];
        if (!enrollReq) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Request not found or already resolved' }); }
        if (enrollReq.professor_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'Unauthorized' }); }

        // Check capacity
        const cap = await client.query('SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = $1', [enrollReq.course_id]);
        if (enrollReq.max_capacity && parseInt(cap.rows[0].cnt) >= enrollReq.max_capacity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: 'Course is at capacity; cannot approve' });
        }

        // Move to enrollments
        await client.query(
            `INSERT INTO enrollments (student_id, course_id, status) VALUES ($1, $2, 'enrolled')
             ON CONFLICT (student_id, course_id) DO UPDATE SET status = 'enrolled'`,
            [enrollReq.student_id, enrollReq.course_id]
        );

        // Mark request approved
        await client.query(
            `UPDATE enrollment_requests SET status = 'approved', resolved_at = NOW() WHERE id = $1`,
            [enrollReq.id]
        );

        // Auto-create timetable entries
        const timetableRows = await client.query(
            'SELECT * FROM timetable WHERE course_id = $1 AND academic_year = $2',
            [enrollReq.course_id, enrollReq.academic_year]
        );
        for (const entry of timetableRows.rows) {
            if (!entry.slot_id || !entry.day) continue;
            await client.query(`
                INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, subject_name, academic_year)
                VALUES ($1, $2, $3, $4, $5, $6, $7)
                ON CONFLICT (student_id, day, slot_id, academic_year) DO NOTHING
            `, [enrollReq.student_id, enrollReq.course_id, entry.day, entry.slot_id, entry.room_id, enrollReq.course_code, enrollReq.academic_year]);
        }

        await client.query('COMMIT');

        // Notify student
        await notifyUser(
            enrollReq.student_id,
            'enrollment_approved',
            `Enrollment Approved: ${enrollReq.course_name}`,
            `Your enrollment in ${enrollReq.course_code} – ${enrollReq.course_name} has been approved. Your timetable has been updated.`
        );

        res.json({ success: true, message: 'Enrollment approved and timetable updated.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// PUT /api/professor/enrollment-requests/:id/reject
router.put('/enrollment-requests/:id/reject', async (req, res) => {
    try {
        const enrollReq = await prepare(`
            SELECT er.*, c.professor_id, c.name as course_name, c.code as course_code
            FROM enrollment_requests er
            JOIN courses c ON er.course_id = c.id
            WHERE er.id = $1 AND er.status = 'pending'
        `).get(req.params.id);

        if (!enrollReq) return res.status(404).json({ error: 'Request not found' });
        if (enrollReq.professor_id !== req.user.id) return res.status(403).json({ error: 'Unauthorized' });

        await prepare(
            `UPDATE enrollment_requests SET status = 'rejected', resolved_at = NOW(), message = $1 WHERE id = $2`
        ).run(req.body.reason || null, enrollReq.id);

        // Notify student
        await notifyUser(
            enrollReq.student_id,
            'enrollment_rejected',
            `Enrollment Rejected: ${enrollReq.course_name}`,
            `Your request for ${enrollReq.course_code} – ${enrollReq.course_name} was not approved.${req.body.reason ? ' Reason: ' + req.body.reason : ''}`
        );

        res.json({ success: true, message: 'Request rejected and student notified.' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
