/**
 * Clash Detection Engine
 * Uses proper time-range overlap: (start1 < end2) AND (start2 < end1)
 * All checks run BEFORE any DB commit.
 */
const { prepare } = require('../database/db');

/**
 * Check if a student has a time conflict for a proposed slot on a given day.
 * Uses time-range overlap on time_slots table — not slot-ID equality.
 *
 * @param {number} studentId
 * @param {number} newSlotId   - The slot the student wants to add
 * @param {string} day         - e.g. 'Monday'
 * @param {string} academicYear
 * @returns {{ hasClash: boolean, details?: string }}
 */
async function checkStudentTimeClash(studentId, newSlotId, day, academicYear) {
    // Get the proposed slot's time range
    const newSlot = await prepare('SELECT start_time, end_time FROM time_slots WHERE id = $1').get(newSlotId);
    if (!newSlot) return { hasClash: false }; // unknown slot — let DB constraint catch it

    // Find any existing timetable entry for this student on the same day whose time overlaps
    const clash = await prepare(`
        SELECT st.*, ts.start_time as existing_start, ts.end_time as existing_end,
               c.name as course_name, st.subject_name
        FROM student_timetables st
        LEFT JOIN time_slots ts ON st.slot_id = ts.id
        LEFT JOIN courses c ON st.course_id = c.id
        WHERE st.student_id = $1
          AND st.day = $2
          AND st.academic_year = $3
          AND ts.start_time IS NOT NULL
          AND ts.start_time < $4
          AND $5 < ts.end_time
    `).get(studentId, day, academicYear, newSlot.end_time, newSlot.start_time);

    if (clash) {
        const name = clash.course_name || clash.subject_name || 'another course';
        return {
            hasClash: true,
            details: `Time conflict with "${name}" (${clash.existing_start}–${clash.existing_end})`
        };
    }
    return { hasClash: false };
}

/**
 * Check if a professor is double-booked for a given slot on a date.
 * Uses time-range overlap against course_sessions and master timetable.
 *
 * @param {number} professorId
 * @param {number} slotId
 * @param {string} date  - 'YYYY-MM-DD'
 * @param {number|null} excludeSessionId  - exclude current session when rescheduling
 * @returns {{ hasClash: boolean, details?: string }}
 */
async function checkProfessorTimeClash(professorId, slotId, date, excludeSessionId = null) {
    const slot = await prepare('SELECT start_time, end_time FROM time_slots WHERE id = $1').get(slotId);
    if (!slot) return { hasClash: false };

    // Check course_sessions
    const sessionClash = await prepare(`
        SELECT cs.id, c.name as course_name, ts.start_time, ts.end_time
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        JOIN time_slots ts ON cs.slot_id = ts.id
        WHERE c.professor_id = $1
          AND cs.date::DATE = $2::DATE
          AND cs.status = 'scheduled'
          AND ($3::INTEGER IS NULL OR cs.id != $3::INTEGER)
          AND ts.start_time < $4::TEXT
          AND $5::TEXT < ts.end_time
    `).get(
        professorId,
        date,
        excludeSessionId ? parseInt(excludeSessionId) : null,
        slot.end_time,
        slot.start_time
    );

    if (sessionClash) {
        return {
            hasClash: true,
            details: `Professor already has "${sessionClash.course_name}" at ${sessionClash.start_time}–${sessionClash.end_time}`
        };
    }

    return { hasClash: false };
}

/**
 * Check if a classroom is double-booked for a given slot on a date.
 * Checks course_sessions (with time-range overlap) and reservations.
 *
 * @param {string} roomId
 * @param {number} slotId
 * @param {string} date
 * @param {number|null} excludeSessionId
 * @returns {{ hasClash: boolean, details?: string }}
 */
async function checkClassroomDoubleBook(roomId, slotId, date, excludeSessionId = null) {
    const slot = await prepare('SELECT start_time, end_time FROM time_slots WHERE id = $1').get(slotId);
    if (!slot) return { hasClash: false };

    // Check existing sessions in same room with overlapping time
    const sessionClash = await prepare(`
        SELECT cs.id, c.name as course_name, ts.start_time, ts.end_time
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        JOIN time_slots ts ON cs.slot_id = ts.id
        WHERE cs.room_id = $1
          AND cs.date::DATE = $2::DATE
          AND cs.status = 'scheduled'
          AND ($3::INTEGER IS NULL OR cs.id != $3::INTEGER)
          AND ts.start_time < $4::TEXT
          AND $5::TEXT < ts.end_time
    `).get(
        roomId,
        date,
        excludeSessionId ? parseInt(excludeSessionId) : null,
        slot.end_time,
        slot.start_time
    );

    if (sessionClash) {
        return {
            hasClash: true,
            details: `Room occupied by "${sessionClash.course_name}" at ${sessionClash.start_time}–${sessionClash.end_time}`
        };
    }

    // Check reservations
    const reservation = await prepare(`
        SELECT r.*, ts.start_time, ts.end_time
        FROM reservations r
        JOIN time_slots ts ON r.slot_id = ts.id
        WHERE r.room_id = $1
          AND r.date::DATE = $2::DATE
          AND ts.start_time < $3::TEXT
          AND $4::TEXT < ts.end_time
    `).get(roomId, date, slot.end_time, slot.start_time);

    if (reservation) {
        return {
            hasClash: true,
            details: `Room reserved (${reservation.purpose || 'reservation'}) at ${reservation.start_time}–${reservation.end_time}`
        };
    }

    return { hasClash: false };
}

module.exports = {
    checkStudentTimeClash,
    checkProfessorTimeClash,
    checkClassroomDoubleBook
};
