const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'classroom_tracker.db');
let db = null;
let SQL = null;

// Initialize database
async function initDB() {
    if (db) return db;

    SQL = await initSqlJs();

    try {
        if (fs.existsSync(dbPath)) {
            const buffer = fs.readFileSync(dbPath);
            db = new SQL.Database(buffer);
        } else {
            db = new SQL.Database();
        }
    } catch (err) {
        db = new SQL.Database();
    }

    // ── LEGACY TABLES (kept for backward compat) ──────────────────────────
    db.run(`
        CREATE TABLE IF NOT EXISTS classrooms (
            id TEXT PRIMARY KEY,
            block TEXT NOT NULL,
            floor INTEGER NOT NULL,
            capacity INTEGER NOT NULL,
            amenities TEXT,
            status_override TEXT,
            override_expires TEXT,
            floor_id INTEGER REFERENCES floors(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS time_slots (
            id INTEGER PRIMARY KEY,
            start_time TEXT NOT NULL,
            end_time TEXT NOT NULL,
            label TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS timetable (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            slot_id INTEGER NOT NULL,
            day TEXT NOT NULL,
            subject TEXT,
            faculty TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS reservations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id TEXT NOT NULL,
            slot_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            purpose TEXT,
            booked_by TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    // ── NEW TABLES ────────────────────────────────────────────────────────

    db.run(`
        CREATE TABLE IF NOT EXISTS users (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            username    TEXT    NOT NULL UNIQUE,
            email       TEXT    NOT NULL UNIQUE,
            password    TEXT    NOT NULL,
            role        TEXT    NOT NULL CHECK(role IN ('student','professor')),
            full_name   TEXT,
            created_at  TEXT    DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS blocks (
            id    INTEGER PRIMARY KEY AUTOINCREMENT,
            name  TEXT NOT NULL UNIQUE,
            label TEXT
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS floors (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
            number   INTEGER NOT NULL,
            label    TEXT,
            UNIQUE(block_id, number)
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_floors_block ON floors(block_id)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS subjects (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            code         TEXT NOT NULL UNIQUE,
            name         TEXT NOT NULL,
            professor_id INTEGER NOT NULL REFERENCES users(id)
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS enrollments (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL REFERENCES users(id),
            subject_id INTEGER NOT NULL REFERENCES subjects(id),
            enrolled_at TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(student_id, subject_id)
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_enroll_subject ON enrollments(subject_id)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS student_timetables (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id   INTEGER NOT NULL REFERENCES users(id),
            subject_id   INTEGER REFERENCES subjects(id),
            day          TEXT NOT NULL,
            slot_id      INTEGER REFERENCES time_slots(id),
            room_id      TEXT REFERENCES classrooms(id),
            subject_name TEXT,
            faculty_name TEXT,
            uploaded_at  TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_st_student ON student_timetables(student_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_st_day     ON student_timetables(day)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS professor_classes (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            professor_id INTEGER NOT NULL REFERENCES users(id),
            subject_id   INTEGER REFERENCES subjects(id),
            room_id      TEXT    NOT NULL REFERENCES classrooms(id),
            slot_id      INTEGER NOT NULL REFERENCES time_slots(id),
            date         TEXT    NOT NULL,
            status       TEXT    NOT NULL DEFAULT 'scheduled'
                                 CHECK(status IN ('scheduled','cancelled','completed')),
            notes        TEXT,
            created_at   TEXT DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(room_id, slot_id, date)
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_pc_professor ON professor_classes(professor_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pc_room_date ON professor_classes(room_id, date)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_pc_date      ON professor_classes(date)`);

    db.run(`
        CREATE TABLE IF NOT EXISTS notifications (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    INTEGER NOT NULL REFERENCES users(id),
            type       TEXT NOT NULL,
            title      TEXT NOT NULL,
            message    TEXT NOT NULL,
            class_id   INTEGER REFERENCES professor_classes(id),
            is_read    INTEGER DEFAULT 0,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.run(`CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications(user_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read)`);

    // Try to add floor_id column to classrooms if it doesn't exist (migration)
    try { db.run(`ALTER TABLE classrooms ADD COLUMN floor_id INTEGER REFERENCES floors(id)`); } catch(e) {}

    saveDB();
    return db;
}

// Save database to file
function saveDB() {
    if (db) {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    }
}

// Helper methods to match better-sqlite3 API
function prepare(sql) {
    return {
        run: (...params) => {
            db.run(sql, params);
            saveDB();
            return { changes: db.getRowsModified(), lastInsertRowid: getLastInsertRowId() };
        },
        get: (...params) => {
            const stmt = db.prepare(sql);
            stmt.bind(params);
            if (stmt.step()) {
                const row = stmt.getAsObject();
                stmt.free();
                return row;
            }
            stmt.free();
            return undefined;
        },
        all: (...params) => {
            const results = [];
            const stmt = db.prepare(sql);
            stmt.bind(params);
            while (stmt.step()) {
                results.push(stmt.getAsObject());
            }
            stmt.free();
            return results;
        }
    };
}

function exec(sql) {
    db.exec(sql);
    saveDB();
}

function getLastInsertRowId() {
    const result = db.exec("SELECT last_insert_rowid() as id");
    return result[0]?.values[0]?.[0] || 0;
}

module.exports = {
    initDB,
    prepare,
    exec,
    saveDB,
    getDB: () => db
};
