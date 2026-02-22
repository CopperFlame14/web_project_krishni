const { prepare } = require('./database/db');

async function reproduce() {
    try {
        const course = await prepare('SELECT id FROM courses LIMIT 1').get();
        if (!course) {
            console.log('No courses found to test with.');
            return;
        }
        console.log('Testing with course_id:', course.id);

        try {
            const result = await prepare(`
                INSERT INTO course_sessions (course_id, room_id, slot_id, date, status)
                VALUES (?, 'A101', 1, '2026-03-01', 'scheduled')
                RETURNING id
            `).run(course.id);
            console.log('Success!', result);
        } catch (e) {
            console.error('FAILED TO INSERT SESSION:', e.message);
        }

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

reproduce();
