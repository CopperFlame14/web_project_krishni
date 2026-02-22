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

async function getCurrentTimeSlot() {
    const now = getSchoolTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    const slots = await prepare('SELECT * FROM time_slots ORDER BY id').all();
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
async function getRoomStatus(roomId, slotId = null, day = null, date = null) {
    const slot = (slotId !== null && slotId !== undefined) ? parseInt(slotId) : ((await getCurrentTimeSlot())?.id || null);
    const targetDay = day || getTodayName();
    const targetDate = date || getTodayDate();

    if (!slot) {
        return { status: 'available', reason: 'Outside class hours', priority: 5 };
    }

    // ── PRIORITY 1: Manual Override ──────────────────────────────────────
    const room = await prepare('SELECT * FROM classrooms WHERE id = ?').get(roomId);
    if (room && room.status_override) {
        if (room.override_expires) {
            const expiry = new Date(room.override_expires);
            if (expiry > new Date()) {
                return { status: room.status_override, reason: 'Manual override', priority: 1 };
            } else {
                await prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(roomId);
            }
        } else {
            return { status: room.status_override, reason: 'Manual override', priority: 1 };
        }
    }

    // ── PRIORITY 2: Professor Scheduled Class (NEW) ──────────────────────
    const profClass = await prepare(`
        SELECT pc.*, u.full_name as professor_name, s.name as subject_name, s.code as subject_code
        FROM professor_classes pc
        JOIN users u ON pc.professor_id = u.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.room_id = ? AND pc.slot_id = ? AND pc.date = ?::DATE
          AND pc.status = 'scheduled'
    `).get(roomId, slot, targetDate);

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
    const reservation = await prepare(`
        SELECT * FROM reservations
        WHERE room_id = ? AND slot_id = ? AND date = ?::DATE
    `).get(roomId, slot, targetDate);

    if (reservation) {
        return {
            status: 'reserved',
            reason: reservation.purpose || 'Reserved',
            bookedBy: reservation.booked_by,
            priority: 3
        };
    }

    // ── PRIORITY 4: Default Timetable ────────────────────────────────────
    const timetableEntry = await prepare(`
        SELECT * FROM timetable
        WHERE room_id = ? AND slot_id = ? AND day = ?
    `).get(roomId, slot, targetDay);

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

async function getAllRoomsWithStatus(slotId = null, date = null) {
    await ensureDB();
    const rooms = await prepare('SELECT * FROM classrooms ORDER BY block, floor, id').all();

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
        const currentSlot = await getCurrentTimeSlot();
        targetSlotId = currentSlot?.id || null;
        targetDay = getTodayName();
        targetDate = getTodayDate();
    }

    if (!targetSlotId) {
        return rooms.map(r => ({
            ...r,
            amenities: r.amenities ? JSON.parse(r.amenities) : [],
            currentStatus: 'available',
            statusReason: 'Outside class hours',
            statusDetails: { status: 'available', reason: 'Outside class hours', priority: 5 }
        }));
    }

    // Batch fetch data for ALL rooms to improve performance
    const [profClasses, reservations, timetableEntries] = await Promise.all([
        prepare(`
            SELECT pc.*, u.full_name as professor_name, s.name as subject_name, s.code as subject_code
            FROM professor_classes pc
            JOIN users u ON pc.professor_id = u.id
            LEFT JOIN subjects s ON pc.subject_id = s.id
            WHERE pc.slot_id = ? AND pc.date = ?::DATE AND pc.status = 'scheduled'
        `).all(targetSlotId, targetDate),

        prepare(`
            SELECT * FROM reservations
            WHERE slot_id = ? AND date = ?::DATE
        `).all(targetSlotId, targetDate),

        prepare(`
            SELECT * FROM timetable
            WHERE slot_id = ? AND day = ?
        `).all(targetSlotId, targetDay)
    ]);

    // Create lookup maps for O(1) matching
    const profClassMap = Object.fromEntries(profClasses.map(c => [c.room_id, c]));
    const reservationMap = Object.fromEntries(reservations.map(r => [r.room_id, r]));
    const timetableMap = Object.fromEntries(timetableEntries.map(t => [t.room_id, t]));

    const now = new Date();

    const roomsWithStatus = rooms.map(room => {
        let status = { status: 'available', reason: 'No scheduled classes', priority: 5 };

        // 1. Manual Override
        if (room.status_override) {
            let active = true;
            if (room.override_expires && new Date(room.override_expires) <= now) active = false;

            if (active) {
                status = { status: room.status_override, reason: 'Manual override', priority: 1 };
            }
        }

        // 2. Professor Class (if priority 5 or lower)
        if (status.priority >= 2 && profClassMap[room.id]) {
            const pc = profClassMap[room.id];
            status = {
                status: 'occupied',
                reason: pc.subject_name || 'Professor Class',
                faculty: pc.professor_name,
                subjectCode: pc.subject_code,
                classId: pc.id,
                priority: 2
            };
        }

        // 3. Reservation (if priority 5 or lower)
        if (status.priority >= 3 && reservationMap[room.id]) {
            const res = reservationMap[room.id];
            status = {
                status: 'reserved',
                reason: res.purpose || 'Reserved',
                bookedBy: res.booked_by,
                priority: 3
            };
        }

        // 4. Default Timetable (if priority 5 or lower)
        if (status.priority >= 4 && timetableMap[room.id]) {
            const tt = timetableMap[room.id];
            status = {
                status: 'occupied',
                reason: tt.subject,
                faculty: tt.faculty,
                priority: 4
            };
        }

        return {
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            currentStatus: status.status,
            statusReason: status.reason,
            statusDetails: status
        };
    });

    return roomsWithStatus;
}


async function getAvailableSlotsForRoom(roomId, date) {
    const slots = await prepare('SELECT * FROM time_slots ORDER BY id').all();
    const d = new Date(date);
    const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const day = dayNames[d.getDay()];

    const slotsWithAvailability = await Promise.all(slots.map(async (slot) => {
        const status = await getRoomStatus(roomId, slot.id, day, date);
        return {
            ...slot,
            isAvailable: status.status === 'available',
            statusDetails: status
        };
    }));

    return slotsWithAvailability;
}

/**
 * Check for booking conflicts (checks all priority layers)
 */
async function checkConflict(roomId, slotId, date) {
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date(date).getDay()];

    // Check professor_classes (Priority 2)
    const profConflict = await prepare(`
        SELECT pc.*, u.full_name as professor_name, s.name as subject_name
        FROM professor_classes pc
        JOIN users u ON pc.professor_id = u.id
        LEFT JOIN subjects s ON pc.subject_id = s.id
        WHERE pc.room_id = ? AND pc.slot_id = ? AND pc.date = ?::DATE AND pc.status = 'scheduled'
    `).get(roomId, slotId, date);

    if (profConflict) {
        return {
            hasConflict: true,
            type: 'professor_class',
            details: `Professor class: ${profConflict.subject_name || 'Class'} by ${profConflict.professor_name}`
        };
    }

    // Check timetable (Priority 4)
    const timetableConflict = await prepare('SELECT * FROM timetable WHERE room_id = ? AND slot_id = ? AND day = ?').get(roomId, slotId, day);
    if (timetableConflict) {
        return {
            hasConflict: true,
            type: 'timetable',
            details: `Regular class: ${timetableConflict.subject} by ${timetableConflict.faculty}`
        };
    }

    // Check reservations (Priority 3)
    const reservationConflict = await prepare('SELECT * FROM reservations WHERE room_id = ? AND slot_id = ? AND date = ?::DATE').get(roomId, slotId, date);
    if (reservationConflict) {
        return {
            hasConflict: true,
            type: 'reservation',
            details: `Already reserved: ${reservationConflict.purpose} by ${reservationConflict.booked_by}`
        };
    }

    return { hasConflict: false };
}

async function clearExpiredOverrides() {
    const now = new Date().toISOString();
    const rooms = await prepare('SELECT id FROM classrooms WHERE override_expires IS NOT NULL AND override_expires < ?').all(now);

    await Promise.all(rooms.map(async (room) => {
        await prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(room.id);
    }));

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

