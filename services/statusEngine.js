const { initDB, prepare } = require('../database/db');
const { enrichRoomsWithNoise } = require('./noiseEngine');

let dbInitialized = false;

async function ensureDB() {
    if (!dbInitialized) {
        await initDB();
        dbInitialized = true;
    }
}

function getSchoolTime() {
    // Force IST (Asia/Kolkata) using absolute offset or Intl if available
    const now = new Date();
    const istOffset = 5.5 * 60 * 60 * 1000; // 5 hours 30 mins
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const istTime = new Date(utc + istOffset);

    console.log(`[TimeDebug] Server UTC: ${new Date().toISOString()}`);
    console.log(`[TimeDebug] Calculated IST: ${istTime.toLocaleString('en-IN')}`);
    return istTime;
}

async function getCurrentTimeSlot() {
    const now = getSchoolTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const currentTime = `${hours}:${minutes}`;

    const slots = await prepare('SELECT * FROM time_slots ORDER BY id').all();
    console.log(`[SlotDebug] Checking current time: ${currentTime} against ${slots.length} slots`);

    for (const slot of slots) {
        if (currentTime >= slot.start_time && currentTime < slot.end_time) {
            console.log(`[SlotDebug] Found match: Slot ${slot.id} (${slot.label})`);
            return slot;
        }
    }
    console.log('[SlotDebug] No active slot found for current time');
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
 * Get system configuration from DB
 */
async function getSystemConfig(key) {
    await ensureDB();
    const config = await prepare('SELECT value FROM system_settings WHERE key = ?').get(key);
    return config ? config.value : null;
}

async function isEnrollmentFrozen() {
    const val = await getSystemConfig('enrollment_frozen');
    return val === 'true';
}

/**
 * Calculate room status with updated priority hierarchy:
 * 1. Manual Override
 * 2. Course Session (active) - NEW (formerly Professor Class)
 * 3. Reservation
 * 4. Master Timetable (Default)
 * 5. Available
 */
async function getRoomStatus(roomId, slotId = null, day = null, date = null) {
    const slot = (slotId !== null && slotId !== undefined) ? parseInt(slotId) : ((await getCurrentTimeSlot())?.id || null);
    const targetDay = day || getTodayName();
    const targetDate = date || getTodayDate();
    const academicYear = await getSystemConfig('current_academic_year');

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

    // ── PRIORITY 2: Course Session (Lectures/Practicals) ────────────────
    const session = await prepare(`
        SELECT cs.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        JOIN users u ON c.professor_id = u.id
        WHERE cs.room_id = ? AND cs.slot_id = ? AND cs.date = ?::DATE
    `).get(roomId, slot, targetDate);

    if (session && session.status === 'scheduled') {
        return {
            status: 'occupied',
            reason: session.course_name || 'Active Session',
            faculty: session.professor_name,
            courseCode: session.course_code,
            sessionId: session.id,
            priority: 2
        };
    }

    if (session && session.status === 'cancelled') {
        return { status: 'available', reason: 'Class Cancelled', priority: 2 };
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

    // ── PRIORITY 4: Master Timetable ────────────────────────────────────
    const timetableEntry = await prepare(`
        SELECT t.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
        FROM timetable t
        LEFT JOIN courses c ON t.course_id = c.id
        LEFT JOIN users u ON c.professor_id = u.id
        WHERE t.room_id = ? AND t.slot_id = ? AND t.day = ? AND t.academic_year = ?
    `).get(roomId, slot, targetDay, academicYear);

    if (timetableEntry) {
        return {
            status: 'occupied',
            reason: timetableEntry.course_name || timetableEntry.faculty || 'Regular Class',
            faculty: timetableEntry.professor_name || timetableEntry.faculty,
            courseCode: timetableEntry.course_code,
            priority: 4
        };
    }

    // ── PRIORITY 5: Available ────────────────────────────────────────────
    return { status: 'available', reason: 'No scheduled activities', priority: 5 };
}

async function getAllRoomsWithStatus(slotId = null, date = null) {
    await ensureDB();
    const rooms = await prepare('SELECT * FROM classrooms ORDER BY block, floor, id').all();

    let targetSlotId = null;
    let targetDay = null;
    let targetDate = null;
    const academicYear = await getSystemConfig('current_academic_year');

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

    // Batch fetch data for ALL rooms
    const [sessions, reservations, timetableEntries] = await Promise.all([
        prepare(`
            SELECT cs.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
            FROM course_sessions cs
            JOIN courses c ON cs.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE cs.slot_id = ? AND cs.date = ?::DATE
        `).all(targetSlotId, targetDate),

        prepare(`
            SELECT * FROM reservations
            WHERE slot_id = ? AND date = ?::DATE
        `).all(targetSlotId, targetDate),

        prepare(`
            SELECT t.*, c.name as course_name, c.code as course_code, u.full_name as professor_name
            FROM timetable t
            LEFT JOIN courses c ON t.course_id = c.id
            LEFT JOIN users u ON c.professor_id = u.id
            WHERE t.slot_id = ? AND t.day = ? AND t.academic_year = ?
        `).all(targetSlotId, targetDay, academicYear)
    ]);

    const sessionMap = Object.fromEntries(sessions.map(s => [s.room_id, s]));
    const reservationMap = Object.fromEntries(reservations.map(r => [r.room_id, r]));
    const timetableMap = Object.fromEntries(timetableEntries.map(t => [t.room_id, t]));

    const now = new Date();

    const roomsWithStatus = rooms.map(room => {
        let status = { status: 'available', reason: 'No scheduled activities', priority: 5 };

        // 1. Manual Override
        if (room.status_override) {
            let active = true;
            if (room.override_expires && new Date(room.override_expires) <= now) active = false;

            if (active) {
                status = { status: room.status_override, reason: 'Manual override', priority: 1 };
            }
        }

        // 2. Course Session (if priority 5 or lower)
        if (status.priority >= 2 && sessionMap[room.id]) {
            const s = sessionMap[room.id];
            if (s.status === 'scheduled') {
                status = { status: 'occupied', reason: s.course_name, faculty: s.professor_name, courseCode: s.course_code, sessionId: s.id, priority: 2 };
            } else if (s.status === 'cancelled') {
                status = { status: 'available', reason: 'Class Cancelled', priority: 2 };
            }
        }

        // 3. Reservation (if priority 5 or lower)
        if (status.priority >= 3 && reservationMap[room.id]) {
            const r = reservationMap[room.id];
            status = {
                status: 'reserved',
                reason: r.purpose,
                bookedBy: r.booked_by,
                priority: 3
            };
        }

        // 4. Master Timetable (if priority 5 or lower)
        if (status.priority >= 4 && timetableMap[room.id]) {
            const t = timetableMap[room.id];
            status = {
                status: 'occupied',
                reason: t.course_name || t.faculty,
                faculty: t.professor_name || t.faculty,
                courseCode: t.course_code,
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

    // Enrich with noise scores
    return enrichRoomsWithNoise(roomsWithStatus);
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
 * Advanced Clash Detection Algorithm
 */
async function checkStudentClash(studentId, slotId, day, academicYear) {
    const clash = await prepare(`
        SELECT st.*, c.name as course_name
        FROM student_timetables st
        LEFT JOIN courses c ON st.course_id = c.id
        WHERE st.student_id = ? AND st.slot_id = ? AND st.day = ? AND st.academic_year = ?
    `).get(studentId, slotId, day, academicYear);
    return clash ? { hasClash: true, details: `Clash with ${clash.course_name || clash.subject_name}` } : { hasClash: false };
}

async function checkProfessorClash(professorId, slotId, date) {
    const sessionClash = await prepare(`
        SELECT cs.*, c.name as course_name
        FROM course_sessions cs
        JOIN courses c ON cs.course_id = c.id
        WHERE c.professor_id = ? AND cs.slot_id = ? AND cs.date = ?::DATE AND cs.status = 'scheduled'
    `).get(professorId, slotId, date);

    if (sessionClash) return { hasClash: true, details: `Professor already busy with ${sessionClash.course_name}` };

    const d = new Date(date);
    const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()];
    const academicYear = await getSystemConfig('current_academic_year');

    const masterClash = await prepare(`
        SELECT t.*, c.name as course_name
        FROM timetable t
        JOIN courses c ON t.course_id = c.id
        WHERE c.professor_id = ? AND t.slot_id = ? AND t.day = ? AND t.academic_year = ?
    `).get(professorId, slotId, day, academicYear);

    return masterClash ? { hasClash: true, details: `Professor has a master schedule class: ${masterClash.course_name}` } : { hasClash: false };
}

async function checkRoomClash(roomId, slotId, date) {
    const status = await getRoomStatus(roomId, slotId, null, date); // getRoomStatus already handles day internally
    if (status.status !== 'available') {
        return { hasClash: true, details: `Room is ${status.status} due to: ${status.reason}` };
    }
    return { hasClash: false };
}

async function clearExpiredOverrides() {
    const now = new Date().toISOString();
    const rooms = await prepare('SELECT id FROM classrooms WHERE override_expires IS NOT NULL AND override_expires < ?').all(now);

    for (const room of rooms) {
        await prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(room.id);
    }
    return rooms.length;
}

module.exports = {
    ensureDB,
    getCurrentTimeSlot,
    getTodayName,
    getTodayDate,
    getRoomStatus,
    getAllRoomsWithStatus,
    checkStudentClash,
    checkProfessorClash,
    checkRoomClash,
    clearExpiredOverrides,
    getSystemConfig,
    isEnrollmentFrozen,
    getAvailableSlotsForRoom
};
