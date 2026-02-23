const { prepare } = require('../database/db');
const { checkProfessorTimeClash, checkClassroomDoubleBook } = require('./clashEngine');
const { notifyEnrolledStudents } = require('./notificationEngine');

/**
 * Schedule a new course session
 */
async function scheduleSession({ professorId, courseId, roomId, slotId, date, notes }) {
    // 1. Validate with proper time-range overlap detection
    const roomClash = await checkClassroomDoubleBook(roomId, slotId, date);
    if (roomClash.hasClash) throw new Error(`Room Conflict: ${roomClash.details}`);

    const profClash = await checkProfessorTimeClash(professorId, slotId, date);
    if (profClash.hasClash) throw new Error(`Professor Conflict: ${profClash.details}`);

    // 2. Insert session
    const result = await prepare(`
        INSERT INTO course_sessions (course_id, room_id, slot_id, date, notes, status)
        VALUES ($1, $2, $3::INTEGER, $4::DATE, $5::TEXT, 'scheduled')
        RETURNING id
    `).run(courseId, roomId, slotId, notes || null);

    const sessionId = result.lastInsertRowid;

    // 3. Notify enrolled students
    const course = await prepare('SELECT name, code FROM courses WHERE id = $1').get(courseId);
    if (course) {
        await notifyEnrolledStudents(
            courseId,
            sessionId,
            'schedule',
            `New Lecture: ${course.name}`,
            `A new session for ${course.code} has been scheduled on ${date} at slot ${slotId} in room ${roomId}.`
        );
    }

    return { sessionId, courseName: course ? course.name : 'Unknown' };
}

/**
 * Cancel an existing course session
 */
async function cancelSession(sessionId, professorId) {
    const session = await prepare(`
        SELECT cs.*, c.professor_id, c.name as course_name, c.code as course_code
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        WHERE cs.id = $1
    `).get(sessionId);

    if (!session) throw new Error('Session not found');
    if (session.professor_id !== professorId) throw new Error('Unauthorized');

    await prepare("UPDATE course_sessions SET status = 'cancelled' WHERE id = $1").run(sessionId);

    await notifyEnrolledStudents(
        session.course_id,
        sessionId,
        'cancel',
        `CANCELLED: ${session.course_name}`,
        `The session for ${session.course_code} on ${session.date} has been cancelled.`
    );

    return true;
}

/**
 * Reschedule a session
 */
async function rescheduleSession(sessionId, { professorId, newRoomId, newSlotId, newDate }) {
    const session = await prepare(`
        SELECT cs.*, c.professor_id, c.name as course_name, c.code as course_code
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        WHERE cs.id = $1
    `).get(sessionId);

    if (!session) throw new Error('Session not found');
    if (session.professor_id !== professorId) throw new Error('Unauthorized');

    // Validate new slot with time-range overlap, excluding current session
    const roomClash = await checkClassroomDoubleBook(newRoomId, newSlotId, newDate, sessionId);
    if (roomClash.hasClash) throw new Error(`Room Conflict: ${roomClash.details}`);

    const profClash = await checkProfessorTimeClash(professorId, newSlotId, newDate, sessionId);
    if (profClash.hasClash) throw new Error(`Professor Conflict: ${profClash.details}`);

    await prepare(`
        UPDATE course_sessions
        SET room_id = $1, slot_id = $2, date = $3::DATE, status = 'rescheduled'
        WHERE id = $4
    `).run(newRoomId, newSlotId, newDate, sessionId);

    await notifyEnrolledStudents(
        session.course_id,
        sessionId,
        'reschedule',
        `RESCHEDULED: ${session.course_name}`,
        `The session for ${session.course_code} has been moved to ${newDate} at slot ${newSlotId} in room ${newRoomId}.`
    );

    return true;
}

async function getProfessorSessions(professorId, filters = {}) {
    let sql = `
        SELECT cs.*, c.name as course_name, c.code as course_code,
               ts.label as slot_label, ts.start_time, ts.end_time
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        JOIN time_slots ts ON cs.slot_id = ts.id
        WHERE c.professor_id = $1
    `;
    const params = [professorId];
    let idx = 2;

    if (filters.date) {
        sql += ` AND cs.date::DATE = $${idx++}::DATE`;
        params.push(filters.date);
    }
    if (filters.status) {
        sql += ` AND cs.status = $${idx++}`;
        params.push(filters.status);
    }

    sql += ' ORDER BY cs.date DESC, ts.start_time ASC';
    return await prepare(sql).all(...params);
}

module.exports = { scheduleSession, cancelSession, rescheduleSession, getProfessorSessions };
