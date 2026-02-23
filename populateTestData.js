const { initDB, prepare } = require('./database/db');
const { hashPassword } = require('./services/authService');
const fs = require('fs');
const path = require('path');

async function populate() {
    console.log('🚀 Starting data population...');
    await initDB();

    const academicYear = '2025-26';
    const semester = 1;
    const subjects = [
        { name: 'Advanced Mathematics', code: 'MATH402' },
        { name: 'Quantum Physics', code: 'PHY305' },
        { name: 'Organic Chemistry', code: 'CHEM201' },
        { name: 'Data Structures', code: 'CS202' },
        { name: 'World Literature', code: 'ENG105' }
    ];

    const timestamp = Date.now();
    const rooms = ['A001', 'A002', 'A003', 'A004', 'A101'];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    const credentials = [];

    // 1. Create 10 Professors (2 for each subject)
    const professors = [];
    for (let i = 1; i <= 10; i++) {
        const username = `prof_${i}_${timestamp}`;
        const password = `pass_prof_${i}`;
        const email = `prof_${i}_${timestamp}@university.edu`;
        const fullName = `Dr. Professor ${String.fromCharCode(64 + i)}`;
        const hash = await hashPassword(password);

        const res = await prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id').run(username, email, hash, 'professor', fullName);
        const profId = res.lastInsertRowid;
        professors.push(profId);
        credentials.push({ role: 'Professor', username, password, fullName });
    }

    // 2. Create 5 Students
    const studentIds = [];
    for (let i = 1; i <= 5; i++) {
        const username = `student_${i}_${timestamp}`;
        const password = `pass_student_${i}`;
        const email = `student_${i}_${timestamp}@student.edu`;
        const fullName = `Student User ${i}`;
        const hash = await hashPassword(password);

        const res = await prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?) RETURNING id').run(username, email, hash, 'student', fullName);
        const studId = res.lastInsertRowid;
        studentIds.push(studId);
        credentials.push({ role: 'Student', username, password, fullName });
    }

    // 3. Create 5 Subjects and Enroll Students
    console.log('📚 Creating courses and enrollments...');
    for (let i = 0; i < subjects.length; i++) {
        const primaryProfId = professors[i * 2]; // Give first teacher the course
        const course = subjects[i];

        const res = await prepare('INSERT INTO courses (code, name, professor_id, academic_year, semester, status) VALUES (?, ?, ?, ?, ?, ?) RETURNING id').run(course.code, course.name, primaryProfId, academicYear, semester, 'active');
        const courseId = res.lastInsertRowid;

        // Populate timetable for this course (Slots 1 & 2 on a specific day)
        const day = days[i];
        const room = rooms[i];

        await prepare('INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(room, 1, day, courseId, academicYear);
        await prepare('INSERT INTO timetable (room_id, slot_id, day, course_id, academic_year) VALUES (?, ?, ?, ?, ?)').run(room, 2, day, courseId, academicYear);

        // Enroll all students and sync their personal timetables
        for (const studId of studentIds) {
            await prepare('INSERT INTO enrollments (student_id, course_id, status) VALUES (?, ?, ?)').run(studId, courseId, 'enrolled');
            // student_timetables unique constraint: (student_id, day, slot_id, academic_year)
            await prepare('INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, academic_year) VALUES (?, ?, ?, ?, ?, ?)').run(studId, courseId, day, 1, room, academicYear);
            await prepare('INSERT INTO student_timetables (student_id, course_id, day, slot_id, room_id, academic_year) VALUES (?, ?, ?, ?, ?, ?)').run(studId, courseId, day, 2, room, academicYear);
        }
    }

    // 4. Save Credentials
    const header = "Smart Campus Credentials\n=========================\n\n";
    const body = credentials.map(c =>
        `Role: ${c.role}\nName: ${c.fullName}\nUsername: ${c.username}\nPassword: ${c.password}\n-------------------------`
    ).join('\n');

    fs.writeFileSync('credentials.txt', header + body);
    console.log('✅ Success! Test data generated and credentials.txt created.');
    process.exit(0);
}

populate().catch(err => {
    console.error('❌ Data generation failed:', err);
    process.exit(1);
});
