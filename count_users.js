const { pool } = require('./database/db');

async function countUsers() {
    try {
        const res = await pool.query('SELECT role, count(*) FROM users GROUP BY role');
        console.log('USER_COUNT_START');
        console.log(JSON.stringify(res.rows));
        console.log('USER_COUNT_END');
        process.exit(0);
    } catch (err) {
        console.error('Error counting users:', err);
        process.exit(1);
    }
}

countUsers();
