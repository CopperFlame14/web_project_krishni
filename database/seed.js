const { initDB, prepare, exec } = require('./db');

async function seed() {
    console.log('🌱 Seeding database...');

    await initDB();

    // Clear existing data
    exec('DELETE FROM reservations');
    exec('DELETE FROM timetable');
    exec('DELETE FROM classrooms');
    exec('DELETE FROM time_slots');

    // Insert time slots (8 periods)
    const timeSlots = [
        { id: 1, start: '08:00', end: '09:00', label: 'Period 1' },
        { id: 2, start: '09:00', end: '10:00', label: 'Period 2' },
        { id: 3, start: '10:15', end: '11:15', label: 'Period 3' },
        { id: 4, start: '11:15', end: '12:15', label: 'Period 4' },
        { id: 5, start: '13:00', end: '14:00', label: 'Period 5' },
        { id: 6, start: '14:00', end: '15:00', label: 'Period 6' },
        { id: 7, start: '15:15', end: '16:15', label: 'Period 7' },
        { id: 8, start: '16:15', end: '17:15', label: 'Period 8' },
        { id: 9, start: '17:15', end: '19:30', label: 'Period 9 (Evening)' }
    ];

    const insertSlot = prepare('INSERT INTO time_slots (id, start_time, end_time, label) VALUES (?, ?, ?, ?)');
    timeSlots.forEach(slot => {
        insertSlot.run(slot.id, slot.start, slot.end, slot.label);
    });
    console.log('✅ Time slots created');

    // Insert classrooms (4 blocks, 4 floors, 4 rooms each = 64 rooms)
    const blocks = ['A', 'B', 'C', 'D'];
    const amenitiesOptions = [
        '["projector", "ac", "whiteboard"]',
        '["projector", "ac", "whiteboard", "smart_board"]',
        '["projector", "whiteboard"]',
        '["ac", "whiteboard", "lab_equipment"]'
    ];

    const insertRoom = prepare('INSERT INTO classrooms (id, block, floor, capacity, amenities) VALUES (?, ?, ?, ?, ?)');

    blocks.forEach((block, blockIndex) => {
        for (let floor = 0; floor <= 3; floor++) {
            for (let roomNum = 1; roomNum <= 4; roomNum++) {
                const roomId = `${block}${floor}0${roomNum}`;
                const capacity = 30 + (Math.floor(Math.random() * 5) * 20);
                const amenities = amenitiesOptions[Math.floor(Math.random() * amenitiesOptions.length)];
                insertRoom.run(roomId, block, floor, capacity, amenities);
            }
        }
    });
    console.log('✅ Classrooms created');

    // Insert sample timetable entries
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const subjects = [
        'Mathematics', 'Physics', 'Chemistry', 'Computer Science',
        'Electronics', 'Data Structures', 'Machine Learning', 'Networks',
        'Database Systems', 'Operating Systems', 'Software Engineering', 'Algorithms'
    ];
    const faculty = [
        'Dr. Smith', 'Prof. Johnson', 'Dr. Williams', 'Prof. Brown',
        'Dr. Davis', 'Prof. Miller', 'Dr. Wilson', 'Prof. Moore'
    ];

    const insertTimetable = prepare('INSERT INTO timetable (room_id, slot_id, day, subject, faculty) VALUES (?, ?, ?, ?, ?)');
    const allRooms = prepare('SELECT id FROM classrooms').all();

    // Create a realistic timetable (not every slot is filled)
    days.forEach(day => {
        allRooms.forEach(room => {
            // Each room has 3-5 classes per day
            const numClasses = 3 + Math.floor(Math.random() * 3);
            const usedSlots = new Set();

            for (let i = 0; i < numClasses; i++) {
                let slotId;
                do {
                    slotId = Math.floor(Math.random() * 9) + 1;
                } while (usedSlots.has(slotId));
                usedSlots.add(slotId);

                const subject = subjects[Math.floor(Math.random() * subjects.length)];
                const prof = faculty[Math.floor(Math.random() * faculty.length)];
                insertTimetable.run(room.id, slotId, day, subject, prof);
            }
        });
    });
    console.log('✅ Timetable entries created');

    // Insert a few sample reservations for today
    const today = new Date().toISOString().split('T')[0];
    const insertReservation = prepare('INSERT INTO reservations (room_id, slot_id, date, purpose, booked_by) VALUES (?, ?, ?, ?, ?)');

    const checkFree = prepare(`
        SELECT COUNT(*) as count FROM timetable 
        WHERE room_id = ? AND slot_id = ? AND day = ?
    `);

    const todayDay = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][new Date().getDay()];

    const sampleReservations = [
        { room: 'A101', slot: 6, purpose: 'Faculty Meeting', by: 'Admin Office' },
        { room: 'B202', slot: 7, purpose: 'Workshop', by: 'Prof. Johnson' },
        { room: 'C101', slot: 5, purpose: 'Guest Lecture', by: 'HOD Office' },
        { room: 'D001', slot: 9, purpose: 'Evening Lab', by: 'Dr. Smith' },
        { room: 'A201', slot: 9, purpose: 'Study Group', by: 'Students Union' }
    ];

    sampleReservations.forEach(res => {
        const isFree = checkFree.get(res.room, res.slot, todayDay);
        if (!isFree || isFree.count === 0) {
            insertReservation.run(res.room, res.slot, today, res.purpose, res.by);
        }
    });
    console.log('✅ Sample reservations created');

    console.log('🎉 Database seeding complete!');
}

seed().catch(console.error);
