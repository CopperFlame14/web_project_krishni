const { prepare } = require('./database/db');

async function check() {
    try {
        const courses = await prepare('SELECT id, code, name, professor_id FROM courses').all();
        console.log('JSON_COURSES_START');
        console.log(JSON.stringify(courses));
        console.log('JSON_COURSES_END');

        const sessions = await prepare('SELECT id, course_id, room_id FROM course_sessions').all();
        console.log('JSON_SESSIONS_START');
        console.log(JSON.stringify(sessions));
        console.log('JSON_SESSIONS_END');

        process.exit(0);
    } catch (err) {
        console.error(err);
        process.exit(1);
    }
}

check();
