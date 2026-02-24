const { initDB, prepare, exec } = require('./database/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');

// Helper to hash passwords (matching authService logic)
async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

async function populateDemo() {
    console.log('🚀 Starting demonstration data population...');

    try {
        await initDB();

        console.log('🧹 Clearing existing demo data...');
        // Clear tables in order of dependencies
        await exec('DELETE FROM notifications');
        await exec('DELETE FROM student_timetables');
        await exec('DELETE FROM enrollments');
        await exec('DELETE FROM timetable');
        await exec('DELETE FROM course_sessions');
        await exec('DELETE FROM courses');
        await exec("DELETE FROM users WHERE role IN ('student', 'professor')");
        console.log('✅ Tables cleared');

        const academicYear = '2025-26';
        const semester = 1;
        const timestamp = Date.now();

        const subjects = [
            { name: 'Introduction to Computer Science', code: 'CS101', dept: 'CS' },
            { name: 'Data Structures & Algorithms', code: 'CS201', dept: 'CS' },
            { name: 'Database Management Systems', code: 'IT302', dept: 'IT' },
            { name: 'Quantum Mechanics', code: 'PHY401', dept: 'Physics' },
            { name: 'Digital Logic Design', code: 'ECE205', dept: 'ECE' },
            { name: 'Business Ethics', code: 'BUS110', dept: 'Business' }
        ];

        const professorsData = [
            { fullName: 'Dr. Alan Turing', username: 'turing_a' },
            { fullName: 'Prof. Ada Lovelace', username: 'lovelace_a' },
            { fullName: 'Dr. Richard Feynman', username: 'feynman_r' },
            { fullName: 'Prof. Grace Hopper', username: 'hopper_g' },
            { fullName: 'Dr. Nikola Tesla', username: 'tesla_n' },
            { fullName: 'Prof. Marie Curie', username: 'curie_m' }
        ];

        const studentsData = [
            { fullName: 'Alice Johnson', username: 'alice_j' },
            { fullName: 'Bob Smith', username: 'bob_s' },
            { fullName: 'Charlie Davis', username: 'charlie_d' },
            { fullName: 'Diana Prince', username: 'diana_p' },
            { fullName: 'Ethan Hunt', username: 'ethan_h' }
        ];

        const rooms = ['A001', 'A101', 'B202', 'C001', 'D304'];
        const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
        const credentials = [];

        console.log('👨‍🏫 Creating professors...');
        const profIds = [];
        for (const prof of professorsData) {
            const password = 'password123';
            const email = `${prof.username}@smartcampus.edu`;
            const hash = await hashPassword(password);

            const res = await prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id').run(prof.username, email, hash, 'professor', prof.fullName);
            profIds.push(res.lastInsertRowid);
            credentials.push({ role: 'Professor', name: prof.fullName, username: prof.username, password });
        }

        console.log('👨‍🎓 Creating students...');
        const studentIds = [];
        for (const student of studentsData) {
            const password = 'password123';
            const email = `${student.username}@student.edu`;
            const hash = await hashPassword(password);

            const res = await prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id').run(student.username, email, hash, 'student', student.fullName);
            studentIds.push(res.lastInsertRowid);
            credentials.push({ role: 'Student', name: student.fullName, username: student.username, password });
        }

        console.log('📚 Creating courses and scheduling sessions...');
        for (let i = 0; i < subjects.length; i++) {
            const subject = subjects[i];
            const profId = profIds[i % profIds.length];

            const res = await prepare('INSERT INTO courses (code, name, professor_id, academic_year, semester, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').run(subject.code, subject.name, profId, academicYear, semester, 'active');
            const courseId = res.lastInsertRowid;

            // Schedule in timetable
            const day = days[i % days.length];
            const room = rooms[i % rooms.length];
            // Period 1 and 2
            await prepare('INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(room, 1, day, courseId, academicYear);
            await prepare('INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(room, 2, day, courseId, academicYear);

            // Enroll all students in the first 3 courses
            if (i < 3) {
                for (const studentId of studentIds) {
                    await prepare('INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, ?)').run(studentId, courseId, 'enrolled');
                    await prepare('INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, academic_year) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(studentId, courseId, day, 1, room, academicYear);
                    await prepare('INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, academic_year) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(studentId, courseId, day, 2, room, academicYear);
                }
            }
        }

        console.log('⚡ Occupying classrooms for current time (Monday Evening)...');
        const todayStr = '2026-02-23';
        const currentSlot = 9; // Period 9 (17:15 - 19:30)

        // Let's occupy A001, A101, and B202 with currently running classes
        const occupiedRooms = [
            { id: 'A001', courseIdx: 0, purpose: 'Lecture' },
            { id: 'A101', courseIdx: 1, purpose: 'Practical' },
            { id: 'B202', courseIdx: 2, purpose: 'Seminar' }
        ];

        for (const occ of occupiedRooms) {
            const courseId = (await prepare("SELECT id FROM courses WHERE code = ?").get(subjects[occ.courseIdx].code)).id;

            // Add to master timetable
            await prepare('INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(occ.id, currentSlot, 'Monday', courseId, academicYear);

            // Add to granular course sessions (marking it as active today)
            await prepare('INSERT INTO course_sessions (course_id, room_id, slot_id, date, status) VALUES (?, ?, ?, ?, ?)').run(courseId, occ.id, currentSlot, todayStr, 'scheduled');
        }

        // Create a separate Reservation for C001
        await prepare("INSERT INTO reservations (room_id, slot_id, date, purpose, booked_by) VALUES ('C001', ?, ?, 'Emergency Lab Meeting', 'Dr. Turing')").run(currentSlot, todayStr);

        // Save credentials
        const header = "Smart Campus Demonstration Credentials\n====================================\n\n";
        const body = credentials.map(c =>
            `Role: ${c.role}\nName: ${c.name}\nUsername: ${c.username}\nPassword: ${c.password}\n-------------------------`
        ).join('\n');

        fs.writeFileSync('demo_credentials.txt', header + body);
        console.log('✅ Success! Demonstration data generated and demo_credentials.txt created.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Population failed:', error);
        process.exit(1);
    }
}

populateDemo();
