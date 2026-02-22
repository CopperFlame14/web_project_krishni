const express = require('express');
const router = express.Router();
const { pool, prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');
const checkFreeze = require('../middleware/checkFreeze');
const { checkStudentTimeClash } = require('../services/clashEngine');
const { getSystemConfig } = require('../services/statusEngine');
const { notifyUser } = require('../services/notificationEngine');

// GET /api/enrollments — my enrollments
router.get('/', requireAuth, async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const enrollments = await prepare(`
            SELECT e.*, c.name as course_name, c.code as course_code,
                   c.max_capacity, c.status as course_status,
                   u.full_name as professor_name, u.email as professor_email,
                   (SELECT COUNT(*) FROM enrollments e2 WHERE e2.course_id = c.id) as enrolled_count
            FROM enrollments e
            JOIN courses c ON e.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE e.student_id = $1 AND c.academic_year = $2
            ORDER BY c.code
        `).all(req.user.id, academicYear);
        res.json(enrollments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/enrollments/requests — my pending/rejected requests
router.get('/requests', requireAuth, requireRole('student'), async (req, res) => {
    try {
        const requests = await prepare(`
            SELECT er.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
            FROM enrollment_requests er
            JOIN courses c ON er.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE er.student_id = $1
            ORDER BY er.requested_at DESC
        `).all(req.user.id);
        res.json(requests);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/enrollments/courses — all enrollable courses with capacity info
router.get('/courses', requireAuth, async (req, res) => {
    try {
        const academicYear = await getSystemConfig('current_academic_year');
        const courses = await prepare(`
            SELECT c.*, u.full_name as professor_name,
                   (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id) as enrolled_count,
                   (c.max_capacity - (SELECT COUNT(*) FROM enrollments e WHERE e.course_id = c.id)) as spots_left,
                   CASE
                     WHEN c.enrollment_open_at IS NOT NULL AND NOW() < c.enrollment_open_at THEN 'not_open'
                     WHEN c.enrollment_close_at IS NOT NULL AND NOW() > c.enrollment_close_at THEN 'closed'
                     ELSE 'open'
                   END as window_status
            FROM courses c
            JOIN users u ON c.professor_id = u.id
            WHERE c.academic_year = $1 AND c.status = 'active'
            ORDER BY c.code
        `).all(academicYear);
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/enrollments — enroll in a course
router.post('/', requireAuth, requireRole('student'), checkFreeze, async (req, res) => {
    const client = await pool.connect();
    try {
        const { courseId } = req.body;
        if (!courseId) return res.status(400).json({ error: 'courseId is required' });

        await client.query('BEGIN');

        // 1. Fetch course with lock to prevent race conditions
        const courseResult = await client.query(
            `SELECT c.*, u.full_name as professor_name
             FROM courses c JOIN users u ON c.professor_id = u.id
             WHERE c.id = $1 FOR UPDATE`,
            [courseId]
        );
        const course = courseResult.rows[0];
        if (!course) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Course not found' }); }
        if (course.status === 'archived') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Course is archived and not accepting enrollments' }); }

        // 2. Check enrollment window
        const now = new Date();
        if (course.enrollment_open_at && now < new Date(course.enrollment_open_at)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Enrollment window not open yet. Opens on ${new Date(course.enrollment_open_at).toDateString()}` });
        }
        if (course.enrollment_close_at && now > new Date(course.enrollment_close_at)) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Enrollment window has closed (closed on ${new Date(course.enrollment_close_at).toDateString()})` });
        }

        // 3. Check if already enrolled or has pending request
        const alreadyEnrolled = await client.query(
            'SELECT id FROM enrollments WHERE student_id = $1 AND course_id = $2',
            [req.user.id, courseId]
        );
        if (alreadyEnrolled.rows.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Already enrolled in this course' }); }

        const alreadyRequested = await client.query(
            "SELECT id FROM enrollment_requests WHERE student_id = $1 AND course_id = $2 AND status = 'pending'",
            [req.user.id, courseId]
        );
        if (alreadyRequested.rows.length > 0) { await client.query('ROLLBACK'); return res.status(409).json({ error: 'Enrollment request already pending for this course' }); }

        // 4. Check capacity (locked row)
        const capacityResult = await client.query(
            'SELECT COUNT(*) as cnt FROM enrollments WHERE course_id = $1',
            [courseId]
        );
        const enrolledCount = parseInt(capacityResult.rows[0].cnt);
        if (course.max_capacity && enrolledCount >= course.max_capacity) {
            await client.query('ROLLBACK');
            return res.status(400).json({ error: `Course is full (${enrolledCount}/${course.max_capacity} enrolled)` });
        }

        // 5. Get course's timetable sessions to check clash
        const academicYear = course.academic_year;
        const timetableEntries = await client.query(
            'SELECT * FROM timetable WHERE course_id = $1 AND academic_year = $2',
            [courseId, academicYear]
        );

        // 6. Clash detection across all course sessions
        for (const entry of timetableEntries.rows) {
            if (!entry.slot_id || !entry.day) continue;
            const clash = await checkStudentTimeClash(req.user.id, entry.slot_id, entry.day, academicYear);
            if (clash.hasClash) {
                await client.query('ROLLBACK');
                return res.status(409).json({ error: `Schedule clash: ${clash.details}` });
            }
        }

        let enrollmentId;
        let responseStatus;

        if (course.auto_approve) {
            // 7a. Auto-approve: insert directly into enrollments
            const enrollResult = await client.query(
                `INSERT INTO enrollments (student_id, course_id, status) VALUES ($1, $2, 'enrolled') RETURNING id`,
                [req.user.id, courseId]
            );
            enrollmentId = enrollResult.rows[0].id;

            // 7b. Auto-create timetable entries for this student
            for (const entry of timetableEntries.rows) {
                await client.query(`
                    INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, subject_name, academic_year)
                    VALUES ($1, $2, $3, $4, $5, $6, $7)
                    ON CONFLICT (student_id, day, slot_id, academic_year) DO NOTHING
                `, [req.user.id, courseId, entry.day, entry.slot_id, entry.room_id, course.code, academicYear]);
            }

            responseStatus = 'enrolled';
        } else {
            // 7c. Manual approval required: create enrollment request
            const reqResult = await client.query(
                `INSERT INTO enrollment_requests (student_id, course_id, status) VALUES ($1, $2, 'pending') RETURNING id`,
                [req.user.id, courseId]
            );
            enrollmentId = reqResult.rows[0].id;

            // Notify professor
            await notifyUser(
                course.professor_id,
                'enrollment_request',
                `New Enrollment Request: ${course.code}`,
                `${req.user.full_name || req.user.username} has requested to enroll in ${course.name}.`,
                null
            );

            responseStatus = 'pending';
        }

        await client.query('COMMIT');

        res.status(201).json({
            success: true,
            status: responseStatus,
            enrollmentId,
            course: { id: course.id, code: course.code, name: course.name },
            message: responseStatus === 'enrolled'
                ? 'Successfully enrolled! Timetable updated.'
                : 'Enrollment request sent. Awaiting professor approval.'
        });

    } catch (err) {
        await client.query('ROLLBACK');
        if (err.message?.toLowerCase().includes('unique')) {
            return res.status(409).json({ error: 'Already enrolled in this course' });
        }
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

// DELETE /api/enrollments/:courseId — unenroll (also removes timetable entries)
router.delete('/:courseId', requireAuth, requireRole('student'), checkFreeze, async (req, res) => {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');

        // Remove enrollment
        const deleted = await client.query(
            'DELETE FROM enrollments WHERE student_id = $1 AND course_id = $2 RETURNING id',
            [req.user.id, req.params.courseId]
        );
        if (deleted.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Enrollment not found' });
        }

        // Remove timetable entries for this course
        await client.query(
            'DELETE FROM student_timetables WHERE student_id = $1 AND course_id = $2',
            [req.user.id, req.params.courseId]
        );

        await client.query('COMMIT');
        res.json({ success: true, message: 'Unenrolled and timetable entries removed.' });
    } catch (err) {
        await client.query('ROLLBACK');
        res.status(500).json({ error: err.message });
    } finally {
        client.release();
    }
});

module.exports = router;
