/**
 * Migration + Seed Script
 * Seeds: 4 blocks × 4 floors × 4 classrooms = 64 rooms
 * Room IDs follow pattern: A101, A102 ... D404
 * Run: node database/migrate.js
 */
const { initDB, prepare, exec, saveDB } = require('./db');
const bcrypt = require('bcryptjs');

async function migrate() {
    await initDB();
    console.log('✅ DB initialized with new schema');

    // ── Seed Blocks ──────────────────────────────────────────────────────
    const blockNames = ['A', 'B', 'C', 'D'];
    const blockLabels = ['Block A – Science Wing', 'Block B – Arts Wing', 'Block C – Engineering Wing', 'Block D – Commerce Wing'];

    for (let i = 0; i < blockNames.length; i++) {
        try {
            prepare('INSERT INTO blocks (name, label) VALUES (?, ?)').run(blockNames[i], blockLabels[i]);
            console.log(`  📦 Block ${blockNames[i]} created`);
        } catch (e) {
            console.log(`  ⚠️  Block ${blockNames[i]} already exists`);
        }
    }

    // ── Seed Floors ──────────────────────────────────────────────────────
    const blocks = prepare('SELECT * FROM blocks ORDER BY id').all();
    const floorLabels = ['Ground Floor', 'First Floor', 'Second Floor', 'Third Floor'];

    for (const block of blocks) {
        for (let f = 1; f <= 4; f++) {
            try {
                prepare('INSERT INTO floors (block_id, number, label) VALUES (?, ?, ?)').run(block.id, f, floorLabels[f - 1]);
            } catch (e) {
                // already exists
            }
        }
    }
    console.log('  📦 Floors seeded (4 per block)');

    // ── Seed Classrooms ──────────────────────────────────────────────────
    const floors = prepare('SELECT f.*, b.name as block_name FROM floors f JOIN blocks b ON f.block_id = b.id ORDER BY b.name, f.number').all();

    for (const floor of floors) {
        for (let r = 1; r <= 4; r++) {
            const roomId = `${floor.block_name}${floor.number}0${r}`; // e.g. A101, B304
            const existing = prepare('SELECT id FROM classrooms WHERE id = ?').get(roomId);
            if (!existing) {
                prepare(`
                    INSERT INTO classrooms (id, block, floor, capacity, amenities, floor_id)
                    VALUES (?, ?, ?, ?, ?, ?)
                `).run(roomId, floor.block_name, floor.number, 40 + (r * 10), JSON.stringify(['Projector', 'Whiteboard']), floor.id);
            }
        }
    }
    console.log('  📦 Classrooms seeded (4 per floor = 64 total)');

    // ── Seed Time Slots (if not present) ────────────────────────────────
    const slotCount = prepare('SELECT COUNT(*) as c FROM time_slots').get();
    if (slotCount.c === 0) {
        const slots = [
            [1, '08:00', '09:00', 'Period 1'],
            [2, '09:00', '10:00', 'Period 2'],
            [3, '10:15', '11:15', 'Period 3'],
            [4, '11:15', '12:15', 'Period 4'],
            [5, '13:00', '14:00', 'Period 5'],
            [6, '14:00', '15:00', 'Period 6'],
            [7, '15:15', '16:15', 'Period 7'],
            [8, '16:15', '17:15', 'Period 8'],
        ];
        for (const [id, start, end, label] of slots) {
            prepare('INSERT INTO time_slots (id, start_time, end_time, label) VALUES (?, ?, ?, ?)').run(id, start, end, label);
        }
        console.log('  📦 Time slots seeded');
    }

    // ── Seed Demo Users ──────────────────────────────────────────────────
    const demoUsers = [
        { username: 'prof_sharma', email: 'sharma@campus.edu', password: 'prof123', role: 'professor', full_name: 'Dr. Rajesh Sharma' },
        { username: 'prof_gupta', email: 'gupta@campus.edu', password: 'prof123', role: 'professor', full_name: 'Dr. Priya Gupta' },
        { username: 'student_raj', email: 'raj@student.edu', password: 'student123', role: 'student', full_name: 'Raj Kumar' },
        { username: 'student_anu', email: 'anu@student.edu', password: 'student123', role: 'student', full_name: 'Anushka Singh' },
    ];

    for (const u of demoUsers) {
        const existing = prepare('SELECT id FROM users WHERE username = ?').get(u.username);
        if (!existing) {
            const hash = bcrypt.hashSync(u.password, 10);
            prepare('INSERT INTO users (username, email, password, role, full_name) VALUES (?, ?, ?, ?, ?)').run(u.username, u.email, hash, u.role, u.full_name);
            console.log(`  👤 User created: ${u.username} (${u.role})`);
        }
    }

    // ── Seed Demo Subjects ───────────────────────────────────────────────
    const prof1 = prepare("SELECT id FROM users WHERE username = 'prof_sharma'").get();
    const prof2 = prepare("SELECT id FROM users WHERE username = 'prof_gupta'").get();

    if (prof1 && prof2) {
        const subjects = [
            { code: 'CS301', name: 'Data Structures', professor_id: prof1.id },
            { code: 'CS302', name: 'Operating Systems', professor_id: prof1.id },
            { code: 'MA201', name: 'Linear Algebra', professor_id: prof2.id },
            { code: 'MA202', name: 'Probability & Statistics', professor_id: prof2.id },
        ];
        for (const s of subjects) {
            try {
                prepare('INSERT INTO subjects (code, name, professor_id) VALUES (?, ?, ?)').run(s.code, s.name, s.professor_id);
                console.log(`  📚 Subject: ${s.code} – ${s.name}`);
            } catch (e) { /* already exists */ }
        }

        // Enroll demo students
        const student1 = prepare("SELECT id FROM users WHERE username = 'student_raj'").get();
        const student2 = prepare("SELECT id FROM users WHERE username = 'student_anu'").get();
        const cs301 = prepare("SELECT id FROM subjects WHERE code = 'CS301'").get();
        const ma201 = prepare("SELECT id FROM subjects WHERE code = 'MA201'").get();

        if (student1 && cs301) {
            try { prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(student1.id, cs301.id); } catch (e) { }
        }
        if (student2 && cs301) {
            try { prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(student2.id, cs301.id); } catch (e) { }
        }
        if (student1 && ma201) {
            try { prepare('INSERT INTO enrollments (student_id, subject_id) VALUES (?, ?)').run(student1.id, ma201.id); } catch (e) { }
        }
        console.log('  🔗 Demo enrollments created');
    }

    saveDB();
    console.log('\n🎉 Migration complete!');
    console.log('Demo credentials:');
    console.log('  Professor: prof_sharma / prof123');
    console.log('  Professor: prof_gupta  / prof123');
    console.log('  Student:   student_raj / student123');
    console.log('  Student:   student_anu / student123');
    process.exit(0);
}

migrate().catch(err => {
    console.error('Migration failed:', err);
    process.exit(1);
});
