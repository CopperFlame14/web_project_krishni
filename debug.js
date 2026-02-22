const { initDB, prepare } = require('./database/db');
const { getRoomStatus, getCurrentTimeSlot, getTodayName } = require('./services/statusEngine');

async function debug() {
    console.log('🔍 Starting Debug...');
    await initDB();

    const now = new Date();
    console.log(`🕒 Current Time: ${now.toTimeString()}`);
    console.log(`📅 Current Day: ${getTodayName()}`);

    const slot = getCurrentTimeSlot();
    console.log('⏱️ Current Slot:', slot);

    if (!slot) {
        console.log('⚠️ No active time slot found. Most rooms should be "Available" unless manually overridden.');
    } else {
        console.log(`✅ Active Slot ID: ${slot.id} (${slot.start_time} - ${slot.end_time})`);
    }

    console.log('\nChecking status for first 5 rooms...');
    const rooms = prepare('SELECT * FROM classrooms LIMIT 5').all();

    for (const room of rooms) {
        const status = getRoomStatus(room.id);
        console.log(`🏠 Room ${room.id}: ${status.status} (${status.reason})`);

        // Detailed check if status is 'available' but should be 'occupied'
        if (status.status === 'available' && slot) {
            const timetableEntry = prepare(`
                SELECT * FROM timetable 
                WHERE room_id = ? AND slot_id = ? AND day = ?
            `).get(room.id, slot.id, getTodayName());

            if (timetableEntry) {
                console.log(`    ❌ ERROR: Timetable entry found but status is Available!`);
                console.log(`    Expected: Occupied by ${timetableEntry.subject}`);
                console.log(`    Debug Query: SELECT * FROM timetable WHERE room_id='${room.id}' AND slot_id=${slot.id} AND day='${getTodayName()}'`);
            } else {
                console.log(`    ✅ Correct: No timetable entry for this slot.`);
            }
        }
    }
}

debug().catch(console.error);
