/**
 * Migration Helper for PostgreSQL
 * Runs: npm run migrate
 */
const { initDB, exec } = require('./db');
const fs = require('fs');
const path = require('path');

async function migrate() {
    try {
        await initDB();
        console.log('📜 Applying schema to Supabase...');
        const schemaPath = path.join(__dirname, 'schema.sql');
        const schemaSql = fs.readFileSync(schemaPath, 'utf8');
        await exec(schemaSql);
        console.log('✅ Migration complete!');
    } catch (err) {
        console.error('❌ Migration failed:', err.message);
        process.exit(1);
    }
}

migrate();
