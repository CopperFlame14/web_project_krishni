const { prepare } = require('../database/db');
const { checkProfessorClash, checkRoomClash } = require('./statusEngine');
const { notifyEnrolledStudents } = require('./notificationEngine');

/**
 * Schedule a new course session
 */
async function scheduleSession({ professorId, courseId, roomId, slotId, date, notes }) {
    // 1. Validate constraints
    const roomClash = await checkRoomClash(roomId, slotId, date);
    if (roomClash.hasClash) throw new Error(`Room Conflict: ${roomClash.details}`);

    const profClash = await checkProfessorClash(professorId, slotId, date);
    if (profClash.hasClash) throw new Error(`Professor Conflict: ${profClash.details}`);

    // 2. Insert session (using PostgreSQL UUID support)
    const result = await prepare(`
        INSERT INTO course_sessions (course_id, room_id, slot_id, date, notes, status)
        VALUES (?, ?, ?, ?::DATE, ?, 'scheduled')
        RETURNING id
    `).run(courseId, roomId, slotId, date, notes || null);

    const sessionId = result.lastInsertRowid;

    // 3. Notify enrolled students
    const course = await prepare('SELECT name, code FROM courses WHERE id = ?').get(courseId);
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
    // Verify ownership
    const session = await prepare(`
        SELECT cs.*, c.professor_id, c.name as course_name, c.code as course_code
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        WHERE cs.id = ?
    `).get(sessionId);

    if (!session) throw new Error('Session not found');
    if (session.professor_id !== professorId) throw new Error('Unauthorized');

    await prepare("UPDATE course_sessions SET status = 'cancelled' WHERE id = ?").run(sessionId);

    // Notify students
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
        WHERE cs.id = ?
    `).get(sessionId);

    if (!session) throw new Error('Session not found');
    if (session.professor_id !== professorId) throw new Error('Unauthorized');

    // Validate new slot
    const roomClash = await checkRoomClash(newRoomId, newSlotId, newDate);
    if (roomClash.hasClash) throw new Error(`Room Conflict: ${roomClash.details}`);

    const profClash = await checkProfessorClash(professorId, newSlotId, newDate);
    if (profClash.hasClash) throw new Error(`Professor Conflict: ${profClash.details}`);

    await prepare(`
        UPDATE course_sessions 
        SET room_id = ?, slot_id = ?, date = ?::DATE, status = 'rescheduled'
        WHERE id = ?
    `).run(newRoomId, newSlotId, newDate, sessionId);

    // Notify students
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
        SELECT cs.*, c.name as course_name, c.code as course_code, ts.label as slot_label
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        JOIN time_slots ts ON cs.slot_id = ts.id
        WHERE c.professor_id = ?
    `;
    const params = [professorId];

    if (filters.date) {
        sql += " AND cs.date = ?::DATE";
        params.push(filters.date);
    }
    if (filters.status) {
        sql += " AND cs.status = ?";
        params.push(filters.status);
    }

    sql += " ORDER BY cs.date DESC, cs.slot_id ASC";
    return await prepare(sql).all(...params);
}

module.exports = {
    scheduleSession,
    cancelSession,
    rescheduleSession,
    getProfessorSessions
};
