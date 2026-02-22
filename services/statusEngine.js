const { initDB, prepare } = require('../database/db');

let dbInitialized = false;

async function ensureDB() {
    if (!dbInitialized) {
        await initDB();
        dbInitialized = true;
    }
}

function getSchoolTime() {
    return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function getCurrentTimeSlot() {
    const now = getSchoolTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    const slots = prepare('SELECT * FROM time_slots ORDER BY id').all();
    for (const slot of slots) {
        if (currentTime >= slot.start_time && currentTime < slot.end_time) {
            return slot;
        }
    }
    return null;
}

function getTodayName() {
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    return days[getSchoolTime().getDay()];
}

function getTodayDate() {
    const now = getSchoolTime();
    const year = now.getFullYear();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
}

/**
 * Calculate room status with updated priority hierarchy:
 * 1. Manual Override
 * 2. Professor Scheduled Class (active)
 * 3. Reservation
 * 4. Default Timetable
 * 5. Available
 */
function getRoomStatus(roomId, slotId = null, day = null, date = null) {
    const currentSlot = (slotId !== null && slotId !== undefined) ? parseInt(slotId) : (getCurrentTimeSlot()?.id || null);
    const currentDay = day || getTodayName();
    const currentDate = date || getTodayDate();

    if (!currentSlot) {
        return { status: 'available', reason: 'Outside class hours', priority: 5 };
    }

    // ── PRIORITY 1: Manual Override ──────────────────────────────────────
    const room = prepare('SELECT * FROM classrooms WHERE id = ?').get(roomId);
    if (room && room.status_override) {
        if (room.override_expires) {
            const expiry = new Date(room.override_expires);
            if (expiry > new Date()) {
                return { status: room.status_override, reason: 'Manual override', priority: 1 };
            } else {
                prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(roomId);
            }
        } else {
            return { status: room.status_override, reason: 'Manual override', priority: 1 };
        }
    }

    // ── PRIORITY 2: Professor Scheduled Class (NEW) ──────────────────────
    const profClass = prepare(`
        SELECT pc.*, u.full_name as professor_name, s.name as subject_name, s.code as subject_code
        FROM professor_classes pc
        JOIN users u ON pc.professor_id = u.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.room_id = ? AND CAST(pc.slot_id AS INTEGER) = ? AND pc.date = ?
          AND pc.status = 'scheduled'
    `).get(roomId, currentSlot, currentDate);

    if (profClass) {
        return {
            status: 'occupied',
            reason: profClass.subject_name || 'Professor Class',
            faculty: profClass.professor_name,
            subjectCode: profClass.subject_code,
            classId: profClass.id,
            priority: 2
        };
    }

    // ── PRIORITY 3: Reservation ──────────────────────────────────────────
    const reservation = prepare(`
        SELECT * FROM reservations
        WHERE room_id = ? AND CAST(slot_id AS INTEGER) = ? AND date = ?
    `).get(roomId, currentSlot, currentDate);

    if (reservation) {
        return {
            status: 'reserved',
            reason: reservation.purpose || 'Reserved',
            bookedBy: reservation.booked_by,
            priority: 3
        };
    }

    // ── PRIORITY 4: Default Timetable ────────────────────────────────────
    const timetableEntry = prepare(`
        SELECT * FROM timetable
        WHERE room_id = ? AND CAST(slot_id AS INTEGER) = ? AND day = ?
    `).get(roomId, currentSlot, currentDay);

    if (timetableEntry) {
        return {
            status: 'occupied',
            reason: timetableEntry.subject,
            faculty: timetableEntry.faculty,
            priority: 4
        };
    }

    // ── PRIORITY 5: Available ────────────────────────────────────────────
    return { status: 'available', reason: 'No scheduled classes', priority: 5 };
}

function getAllRoomsWithStatus(slotId = null, date = null) {
    const rooms = prepare('SELECT * FROM classrooms ORDER BY block, floor, id').all();

    let targetSlotId = null;
    let targetDay = null;
    let targetDate = null;

    if (slotId || date) {
        targetDate = date || getTodayDate();
        targetSlotId = slotId ? parseInt(slotId) : null;
        const d = new Date(targetDate);
        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        targetDay = dayNames[d.getDay()];
    } else {
        const currentSlot = getCurrentTimeSlot();
        targetSlotId = currentSlot?.id || null;
        targetDay = getTodayName();
        targetDate = getTodayDate();
    }

    return rooms.map(room => {
        const statusInfo = getRoomStatus(room.id, targetSlotId, targetDay, targetDate);
        return {
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            currentStatus: statusInfo.status,
            statusReason: statusInfo.reason,
            statusDetails: statusInfo
        };
    });
}

function getAvailableSlotsForRoom(roomId, date) {
    const slots = prepare('SELECT * FROM time_slots ORDER BY id').all();
    const d = new Date(date);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[d.getDay()];

    return slots.map(slot => {
        const status = getRoomStatus(roomId, slot.id, day, date);
        return {
            ...slot,
            isAvailable: status.status === 'available',
            statusDetails: status
        };
    });
}

/**
 * Check for booking conflicts (checks all priority layers)
 */
function checkConflict(roomId, slotId, date) {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];

    // Check professor_classes (Priority 2)
    const profConflict = prepare(`
        SELECT pc.*, u.full_name as professor_name, s.name as subject_name
        FROM professor_classes pc
        JOIN users u ON pc.professor_id = u.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.room_id = ? AND pc.slot_id = ? AND pc.date = ? AND pc.status = 'scheduled'
    `).get(roomId, slotId, date);

    if (profConflict) {
        return {
            hasConflict: true,
            type: 'professor_class',
            details: `Professor class: ${profConflict.subject_name || 'Class'} by ${profConflict.professor_name}`
        };
    }

    // Check timetable (Priority 4)
    const timetableConflict = prepare('SELECT * FROM timetable WHERE room_id = ? AND slot_id = ? AND day = ?').get(roomId, slotId, day);
    if (timetableConflict) {
        return {
            hasConflict: true,
            type: 'timetable',
            details: `Regular class: ${timetableConflict.subject} by ${timetableConflict.faculty}`
        };
    }

    // Check reservations (Priority 3)
    const reservationConflict = prepare('SELECT * FROM reservations WHERE room_id = ? AND slot_id = ? AND date = ?').get(roomId, slotId, date);
    if (reservationConflict) {
        return {
            hasConflict: true,
            type: 'reservation',
            details: `Already reserved: ${reservationConflict.purpose} by ${reservationConflict.booked_by}`
        };
    }

    return { hasConflict: false };
}

function clearExpiredOverrides() {
    const now = new Date().toISOString();
    const rooms = prepare('SELECT id FROM classrooms WHERE override_expires IS NOT NULL AND override_expires < ?').all(now);
    rooms.forEach(room => {
        prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(room.id);
    });
    return rooms.length;
}

module.exports = {
    ensureDB,
    getCurrentTimeSlot,
    getTodayName,
    getTodayDate,
    getRoomStatus,
    getAllRoomsWithStatus,
    checkConflict,
    clearExpiredOverrides,
    getAvailableSlotsForRoom
};
