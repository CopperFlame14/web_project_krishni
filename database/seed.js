const { initDB, prepare, exec } = require('./db');
const fs = require('fs');
const path = require('path');

async function seed() {
    console.log('🌱 Seeding database (Smart Campus Phase 2)...');

    try {
        await initDB();

        // 1. Run Schema Setup first (Automated for Render/Production)
        console.log('📜 Applying schema...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');

        // FORCE RESET for Phase 2 (Ensures legacy tables don't block structural changes like UUIDs/Academic Year)
        console.log('🧹 Dropping legacy tables for fresh Phase 2 schema...');
        await exec(`
            DROP TABLE IF EXISTS 
            notifications, reservations, course_sessions, enrollments, 
            student_timetables, timetable, courses, subjects, professor_classes, 
            users, classrooms, floors, blocks, time_slots, system_settings CASCADE
        `);

        await exec(schemaSql);
        console.log('✅ Schema applied successfully');

        // Initialize System Settings
        await prepare("INSERT INTO system_settings (key, value) VALUES ('enrollment_frozen', 'false') ON CONFLICT DO NOTHING").run();
        await prepare("INSERT INTO system_settings (key, value) VALUES ('current_academic_year', '2025-26') ON CONFLICT DO NOTHING").run();
        console.log('✅ System settings initialized');

        // Insert time slots (9 periods)
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

        for (const slot of timeSlots) {
            await prepare('INSERT INTO time_slots (id, start_time, end_time, label) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO NOTHING').run(slot.id, slot.start, slot.end, slot.label);
        }
        console.log('✅ Time slots created');

        // Insert blocks
        const blockNames = ['A', 'B', 'C', 'D'];
        const blockIds = {};
        for (const name of blockNames) {
            const res = await prepare('INSERT INTO blocks (name, label) VALUES (?, ?) ON CONFLICT (name) DO NOTHING RETURNING id').run(name, `Block ${name}`);
            blockIds[name] = res.lastInsertRowid || (await prepare("SELECT id FROM blocks WHERE name = ?").get(name)).id;
        }
        console.log('✅ Blocks created');

        // Insert floors and classrooms
        const amenitiesOptions = [
            '["projector", "ac", "whiteboard"]',
            '["projector", "ac", "whiteboard", "smart_board"]',
            '["projector", "whiteboard"]',
            '["ac", "whiteboard", "lab_equipment"]'
        ];

        for (const blockName of blockNames) {
            for (let fNum = 0; fNum <= 3; fNum++) {
                const floorRes = await prepare('INSERT INTO floors (block_id, number, label) VALUES (?, ?, ?) ON CONFLICT (block_id, number) DO NOTHING RETURNING id').run(blockIds[blockName], fNum, `Floor ${fNum}`);
                const floorId = floorRes.lastInsertRowid || (await prepare("SELECT id FROM floors WHERE block_id = ? AND number = ?").get(blockIds[blockName], fNum)).id;

                for (let rNum = 1; rNum <= 4; rNum++) {
                    const roomId = `${blockName}${fNum}0${rNum}`;
                    const capacity = 30 + (Math.floor(Math.random() * 5) * 20);
                    const amenities = amenitiesOptions[Math.floor(Math.random() * amenitiesOptions.length)];
                    await prepare('INSERT INTO classrooms (id, block, floor, capacity, amenities, floor_id) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT (id) DO NOTHING').run(roomId, blockName, fNum, capacity, amenities, floorId);
                }
            }
        }
        console.log('✅ Classrooms and floors created');

        // Insert users (Admin, Professors, Students)
        const bcrypt = require('bcryptjs');
        const passwordHash = bcrypt.hashSync('password123', 10);
        const adminHash = bcrypt.hashSync('admin123', 10);

        // Required User: admin / admin123
        const mainAdminRes = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('admin', 'admin@smartcampus.edu', ?, 'admin', 'Primary Admin') RETURNING id").run(adminHash);

        const adminRes = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('admin_root', 'admin_root@campus.edu', ?, 'admin', 'System Administrator') RETURNING id").run(passwordHash);
        const prof1Res = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('prof_smith', 'smith@campus.edu', ?, 'professor', 'Dr. Smith') RETURNING id").run(passwordHash);
        const prof2Res = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('prof_johnson', 'johnson@campus.edu', ?, 'professor', 'Prof. Johnson') RETURNING id").run(passwordHash);
        const stud1Res = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('student_1', 'student1@campus.edu', ?, 'student', 'John Doe') RETURNING id").run(passwordHash);

        // User 'krish' / 'password123'
        const krishRes = await prepare("INSERT INTO users (username, email, password, role, full_name) VALUES ('krish', 'krish@student.edu', ?, 'student', 'Krish') RETURNING id").run(passwordHash);

        const prof1Id = prof1Res.lastInsertRowid;
        const prof2Id = prof2Res.lastInsertRowid;
        const stud1Id = stud1Res.lastInsertRowid;
        const krishId = krishRes.lastInsertRowid;
        console.log('✅ Users created (including Admin and Krish)');

        // Insert Courses (UUID based)
        const course1Res = await prepare("INSERT INTO courses (code, name, professor_id, academic_year, semester) VALUES ('CS101', 'Data Structures', ?, '2025-26', 1) RETURNING id").run(prof1Id);
        const course2Res = await prepare("INSERT INTO courses (code, name, professor_id, academic_year, semester) VALUES ('PH201', 'Quantum Physics', ?, '2025-26', 1) RETURNING id").run(prof2Id);

        const course1Id = course1Res.lastInsertRowid; // This is a UUID String
        const course2Id = course2Res.lastInsertRowid;
        console.log('✅ Courses created with UUIDs');

        // Enroll students
        await prepare("INSERT INTO enrollments (student_id, course_id) VALUES (?, ?)").run(krishId, course1Id);
        console.log('✅ Enrollments created for Krish');

        // Master Timetable
        await prepare("INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES ('A001', 1, 'Monday', ?, '2025-26')").run(course1Id);
        console.log('✅ Master timetable created');

        // Course Session (Granular)
        await prepare("INSERT INTO course_sessions (course_id, room_id, slot_id, date, status) VALUES (?, 'A101', 3, '2026-02-23', 'scheduled')").run(course1Id);
        console.log('✅ Course sessions created');

        console.log('🎉 Database seeding complete!');
    } catch (err) {
        console.error('❌ Seeding failed:', err);
        process.exit(1);
    }
}

seed();
