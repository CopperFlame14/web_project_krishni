const { initDB, prepare, exec } = require('./database/db');
const bcrypt = require('bcryptjs');
const fs = require('fs');

async function hashPassword(password) {
    return await bcrypt.hash(password, 10);
}

async function seedLiveDemo() {
    console.log('🚀 Starting LIVE demo data population...');
    console.log(`📅 Current date/time: 2026-02-24 (Tuesday) ~10:00 AM IST`);

    try {
        await initDB();

        // Clear previous demo data (professors/students only, keep admin)
        console.log('🧹 Clearing previous demo users & sessions...');
        await exec('DELETE FROM notifications');
        await exec('DELETE FROM student_timetables');
        await exec('DELETE FROM enrollments');
        await exec('DELETE FROM course_sessions');
        await exec('DELETE FROM timetable');
        await exec('DELETE FROM courses');
        await exec('DELETE FROM reservations');
        await exec("DELETE FROM users WHERE role IN ('student', 'professor')");
        console.log('✅ Old demo data cleared');

        const academicYear = '2025-26';
        const semester = 1;
        const todayDate = '2026-02-24';   // Tuesday
        const todayDay = 'Tuesday';
        const credentials = [];

        // ─── PROFESSORS ──────────────────────────────────────────────
        const professors = [
            { fullName: 'Dr. Ramesh Krishnan', username: 'ramesh_k', password: 'prof@123' },
            { fullName: 'Prof. Sunita Sharma', username: 'sunita_s', password: 'prof@123' },
            { fullName: 'Dr. Anil Mehta', username: 'anil_m', password: 'prof@123' },
            { fullName: 'Prof. Priya Nair', username: 'priya_n', password: 'prof@123' },
        ];

        console.log('👨‍🏫 Creating professors...');
        const profIds = [];
        for (const prof of professors) {
            const email = `${prof.username}@smartcampus.edu`;
            const hash = await hashPassword(prof.password);
            const res = await prepare(
                'INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id'
            ).run(prof.username, email, hash, 'professor', prof.fullName);
            profIds.push(res.lastInsertRowid);
            credentials.push({ role: 'Professor', name: prof.fullName, username: prof.username, password: prof.password });
        }
        console.log(`✅ ${professors.length} professors created`);

        // ─── STUDENTS ────────────────────────────────────────────────
        const students = [
            { fullName: 'Aarav Patel', username: 'aarav_p', password: 'stud@123' },
            { fullName: 'Diya Gupta', username: 'diya_g', password: 'stud@123' },
            { fullName: 'Rohan Singh', username: 'rohan_s', password: 'stud@123' },
            { fullName: 'Meera Desai', username: 'meera_d', password: 'stud@123' },
            { fullName: 'Krish', username: 'krish', password: 'stud@123' },
        ];

        console.log('👨‍🎓 Creating students...');
        const studentIds = [];
        for (const student of students) {
            const email = `${student.username}@student.edu`;
            const hash = await hashPassword(student.password);
            const res = await prepare(
                'INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id'
            ).run(student.username, email, hash, 'student', student.fullName);
            studentIds.push(res.lastInsertRowid);
            credentials.push({ role: 'Student', name: student.fullName, username: student.username, password: student.password });
        }
        console.log(`✅ ${students.length} students created`);

        // ─── COURSES ─────────────────────────────────────────────────
        const courses = [
            { code: 'CS301', name: 'Operating Systems', profIdx: 0 },
            { code: 'CS401', name: 'Machine Learning', profIdx: 1 },
            { code: 'IT201', name: 'Web Technologies', profIdx: 2 },
            { code: 'EC302', name: 'Signals & Systems', profIdx: 3 },
            { code: 'CS202', name: 'Data Structures Lab', profIdx: 0 },
            { code: 'MA101', name: 'Engineering Mathematics', profIdx: 1 },
        ];

        console.log('📚 Creating courses...');
        const courseIds = [];
        for (const course of courses) {
            const res = await prepare(
                'INSERT INTO courses (code, name, professor_id, academic_year, semester, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id'
            ).run(course.code, course.name, profIds[course.profIdx], academicYear, semester, 'active');
            courseIds.push(res.lastInsertRowid);
        }
        console.log(`✅ ${courses.length} courses created`);

        // ─── ENROLL STUDENTS ─────────────────────────────────────────
        console.log('📝 Enrolling students into courses...');
        for (let i = 0; i < studentIds.length; i++) {
            // Each student gets 3-4 courses
            const studentCourses = [0, 1, 2]; // first 3 courses for everyone
            if (i % 2 === 0) studentCourses.push(3); // some get 4th course
            for (const cIdx of studentCourses) {
                await prepare('INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, ?)').run(studentIds[i], courseIds[cIdx], 'enrolled');
            }
        }
        console.log('✅ Students enrolled');

        // ─── SCHEDULE CLASSES (CURRENTLY OCCUPIED) ───────────────────
        // Time slots that cover NOW (10:00 AM) through next 4 hours (2:00 PM):
        //   Slot 3: 10:15 - 11:15
        //   Slot 4: 11:15 - 12:15
        //   Slot 5: 13:00 - 14:00
        //   Slot 6: 14:00 - 15:00

        const occupiedSchedule = [
            // Currently running (Slot 3: 10:15-11:15)
            { room: 'A001', courseIdx: 0, slot: 3 },  // Operating Systems in A001
            { room: 'A101', courseIdx: 1, slot: 3 },  // Machine Learning in A101
            { room: 'B202', courseIdx: 2, slot: 3 },  // Web Technologies in B202

            // Next hour (Slot 4: 11:15-12:15)
            { room: 'A001', courseIdx: 3, slot: 4 },  // Signals & Systems in A001
            { room: 'C001', courseIdx: 4, slot: 4 },  // DS Lab in C001
            { room: 'B202', courseIdx: 5, slot: 4 },  // Engineering Math in B202

            // After lunch (Slot 5: 13:00-14:00)
            { room: 'A101', courseIdx: 0, slot: 5 },  // Operating Systems in A101
            { room: 'D304', courseIdx: 2, slot: 5 },  // Web Technologies in D304

            // Afternoon (Slot 6: 14:00-15:00)
            { room: 'A001', courseIdx: 1, slot: 6 },  // Machine Learning in A001
            { room: 'C001', courseIdx: 5, slot: 6 },  // Engineering Math in C001
            { room: 'B202', courseIdx: 4, slot: 6 },  // DS Lab in B202
        ];

        console.log('🏫 Scheduling classes in classrooms (10 AM - 2 PM today)...');
        for (const entry of occupiedSchedule) {
            // Add to master timetable (Tuesday)
            await prepare(
                'INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)'
            ).run(entry.room, entry.slot, todayDay, courseIds[entry.courseIdx], academicYear);

            // Add to course_sessions (specific date → makes room "occupied" RIGHT NOW)
            await prepare(
                'INSERT INTO course_sessions (course_id, room_id, slot_id, date, status) VALUES (?, ?, ?, ?, ?)'
            ).run(courseIds[entry.courseIdx], entry.room, entry.slot, todayDate, 'scheduled');
        }
        console.log('✅ Classrooms occupied for slots 3-6 (10:15 AM – 3:00 PM)');

        // Also add a reservation for extra realism
        await prepare(
            "INSERT INTO reservations (room_id, slot_id, date, purpose, booked_by) VALUES ('D304', ?, ?, 'Faculty Meeting - CS Department', 'Dr. Ramesh Krishnan')"
        ).run(4, todayDate);
        console.log('✅ Reservation added for D304 (slot 4)');

        // ─── STUDENT TIMETABLES ──────────────────────────────────────
        console.log('📋 Creating student timetables...');
        for (let i = 0; i < studentIds.length; i++) {
            const studentCourses = [0, 1, 2];
            if (i % 2 === 0) studentCourses.push(3);
            for (const cIdx of studentCourses) {
                // Find the timetable entries for this course
                const relevantEntries = occupiedSchedule.filter(e => e.courseIdx === cIdx);
                for (const entry of relevantEntries) {
                    await prepare(
                        'INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, academic_year) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT DO NOTHING'
                    ).run(studentIds[i], courseIds[cIdx], todayDay, entry.slot, entry.room, academicYear);
                }
            }
        }
        console.log('✅ Student timetables created');

        // ─── SAVE CREDENTIALS ────────────────────────────────────────
        const header = `Smart Campus – Live Demo Credentials
=====================================
Generated: 2026-02-24 10:00 AM IST
NOTE: Classes are scheduled from 10:15 AM to 3:00 PM today (Tuesday)

ADMIN ACCOUNT
─────────────
Username: admin
Password: admin_campus_99

`;
        const body = credentials.map(c =>
            `Role: ${c.role}\nName: ${c.name}\nUsername: ${c.username}\nPassword: ${c.password}\n-------------------------`
        ).join('\n');

        const summary = `

OCCUPIED CLASSROOMS RIGHT NOW
─────────────────────────────
Room A001 → Operating Systems (Dr. Ramesh Krishnan) [10:15-11:15]
Room A101 → Machine Learning (Prof. Sunita Sharma) [10:15-11:15]
Room B202 → Web Technologies (Dr. Anil Mehta) [10:15-11:15]

UPCOMING (11:15 - 12:15)
Room A001 → Signals & Systems (Prof. Priya Nair)
Room C001 → Data Structures Lab (Dr. Ramesh Krishnan)
Room B202 → Engineering Mathematics (Prof. Sunita Sharma)
Room D304 → [RESERVED] Faculty Meeting - CS Department

AFTER LUNCH (13:00 - 14:00)
Room A101 → Operating Systems (Dr. Ramesh Krishnan)
Room D304 → Web Technologies (Dr. Anil Mehta)

AFTERNOON (14:00 - 15:00)
Room A001 → Machine Learning (Prof. Sunita Sharma)
Room C001 → Engineering Mathematics (Prof. Sunita Sharma)
Room B202 → Data Structures Lab (Dr. Ramesh Krishnan)
`;

        fs.writeFileSync('live_demo_credentials.txt', header + body + summary);
        console.log('✅ Credentials saved to live_demo_credentials.txt');

        console.log('\n🎉 LIVE DEMO READY! Classrooms are occupied right now.');
        console.log('   Open the dashboard to see rooms marked as occupied.');
        process.exit(0);

    } catch (error) {
        console.error('❌ Population failed:', error);
        process.exit(1);
    }
}

seedLiveDemo();
