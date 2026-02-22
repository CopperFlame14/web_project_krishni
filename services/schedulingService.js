const { prepare } = require('../database/db');
const { checkConflict } = require('./statusEngine');
const { notifyEnrolledStudents } = require('./notificationEngine');

/**
 * Schedule a class for a professor
 */
async function scheduleClass({ professorId, subjectId, roomId, slotId, date, notes }) {
    // Validate inputs
    if (!professorId || !roomId || !slotId || !date) {
        throw new Error('professorId, roomId, slotId, and date are required');
    }

    // Check for conflicts
    const conflict = await checkConflict(roomId, slotId, date);
    if (conflict.hasConflict) {
        const err = new Error(conflict.details);
        err.statusCode = 409;
        throw err;
    }

    // Insert — UNIQUE constraint on (room_id, slot_id, date) is the final safety net
    let result;
    try {
        result = await prepare(`
            INSERT INTO professor_classes (professor_id, subject_id, room_id, slot_id, date, notes, status)
            VALUES (?, ?, ?, ?, ?, ?, 'scheduled')
            RETURNING id
        `).run(professorId, subjectId || null, roomId, slotId, date, notes || null);
    } catch (err) {
        if (err.message && err.message.includes('unique')) {
            const e = new Error('Room is already booked for this slot');
            e.statusCode = 409;
            throw e;
        }
        throw err;
    }

    const classId = result.lastInsertRowid;

    // Get full class info for notification
    const classInfo = await prepare(`
        SELECT pc.*, u.full_name as professor_name, s.name as subject_name, s.code as subject_code
        FROM professor_classes pc
        JOIN users u ON pc.professor_id = u.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.id = ?
    `).get(classId);

    // Notify enrolled students asynchronously
    if (subjectId && classInfo) {
        const title = `Class Scheduled: ${classInfo.subject_name || 'Class'}`;
        const message = `${classInfo.professor_name} has scheduled ${classInfo.subject_name || 'a class'} in Room ${roomId} on ${date}.`;
        notifyEnrolledStudents(subjectId, classId, 'class_scheduled', title, message).catch(console.error);
    }

    return classInfo;
}

/**
 * Cancel a professor's class
 */
async function cancelClass(classId, professorId) {
    const existing = await prepare('SELECT * FROM professor_classes WHERE id = ?').get(classId);
    if (!existing) {
        const err = new Error('Class not found');
        err.statusCode = 404;
        throw err;
    }
    if (existing.professor_id !== professorId) {
        const err = new Error('You can only cancel your own classes');
        err.statusCode = 403;
        throw err;
    }
    if (existing.status === 'cancelled') {
        const err = new Error('Class is already cancelled');
        err.statusCode = 400;
        throw err;
    }

    await prepare("UPDATE professor_classes SET status = 'cancelled' WHERE id = ?").run(classId);

    // Notify enrolled students
    if (existing.subject_id) {
        const prof = await prepare('SELECT full_name FROM users WHERE id = ?').get(professorId);
        const subj = await prepare('SELECT name FROM subjects WHERE id = ?').get(existing.subject_id);
        const title = `Class Cancelled`;
        const message = `${prof?.full_name || 'Professor'} has cancelled ${subj?.name || 'the class'} scheduled in Room ${existing.room_id} on ${existing.date}.`;
        notifyEnrolledStudents(existing.subject_id, classId, 'class_cancelled', title, message).catch(console.error);
    }

    return { success: true, classId };
}

/**
 * Reschedule a class (cancel old + create new)
 */
async function rescheduleClass(classId, professorId, { newRoomId, newSlotId, newDate, notes }) {
    const existing = await prepare('SELECT * FROM professor_classes WHERE id = ?').get(classId);
    if (!existing) {
        const err = new Error('Class not found');
        err.statusCode = 404;
        throw err;
    }
    if (existing.professor_id !== professorId) {
        const err = new Error('You can only reschedule your own classes');
        err.statusCode = 403;
        throw err;
    }

    // Cancel old
    await prepare("UPDATE professor_classes SET status = 'cancelled' WHERE id = ?").run(classId);

    // Schedule new
    const newClass = await scheduleClass({
        professorId,
        subjectId: existing.subject_id,
        roomId: newRoomId || existing.room_id,
        slotId: newSlotId || existing.slot_id,
        date: newDate || existing.date,
        notes: notes || existing.notes
    });

    // Notify enrolled students about reschedule
    if (existing.subject_id) {
        const prof = await prepare('SELECT full_name FROM users WHERE id = ?').get(professorId);
        const subj = await prepare('SELECT name FROM subjects WHERE id = ?').get(existing.subject_id);
        const title = `Class Rescheduled`;
        const message = `${prof?.full_name || 'Professor'} has rescheduled ${subj?.name || 'the class'} to Room ${newClass.room_id} on ${newClass.date}.`;
        notifyEnrolledStudents(existing.subject_id, newClass.id, 'class_rescheduled', title, message).catch(console.error);
    }

    return newClass;
}

/**
 * Get professor's classes
 */
async function getProfessorClasses(professorId, { date, status } = {}) {
    let sql = `
        SELECT pc.*, ts.start_time, ts.end_time, ts.label as slot_label,
               s.name as subject_name, s.code as subject_code
        FROM professor_classes pc
        JOIN time_slots ts ON pc.slot_id = ts.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.professor_id = ?
    `;
    const params = [professorId];
    if (date) { sql += ' AND pc.date = ?::DATE'; params.push(date); }
    if (status) { sql += ' AND pc.status = ?'; params.push(status); }
    sql += ' ORDER BY pc.date DESC, ts.start_time';
    return await prepare(sql).all(...params);
}

module.exports = { scheduleClass, cancelClass, rescheduleClass, getProfessorClasses };
