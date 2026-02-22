require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

// Initialize database (Handled via schema.sql in Supabase Editor)
async function initDB() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Supabase PostgreSQL');
        client.release();
    } catch (err) {
        console.error('❌ Database connection error:', err.message);
        throw err;
    }
}

/**
 * Modernized prepare helper for PostgreSQL
 * Returns an object with async methods matching the previous API
 */
function prepare(sql) {
    // Convert SQLite style ? placeholders to PostgreSQL $1, $2, ...
    let pgSql = sql;
    let i = 1;
    while (pgSql.includes('?')) {
        pgSql = pgSql.replace('?', `$${i++}`);
    }

    return {
        run: async (...params) => {
            const res = await pool.query(pgSql, params);
            return {
                changes: res.rowCount,
                lastInsertRowid: res.rows[0]?.id || null // Assumes 'id' is the PK returning
            };
        },
        get: async (...params) => {
            const res = await pool.query(pgSql, params);
            return res.rows[0];
        },
        all: async (...params) => {
            const res = await pool.query(pgSql, params);
            return res.rows;
        }
    };
}

async function exec(sql) {
    return await pool.query(sql);
}

module.exports = {
    initDB,
    prepare,
    exec,
    pool,
    query: (text, params) => pool.query(text, params)
};

