-- Smart Campus Platform Schema (PostgreSQL)

-- 1. Blocks
CREATE TABLE IF NOT EXISTS blocks (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    label TEXT
);

-- 2. Floors
CREATE TABLE IF NOT EXISTS floors (
    id SERIAL PRIMARY KEY,
    block_id INTEGER NOT NULL REFERENCES blocks(id) ON DELETE CASCADE,
    number INTEGER NOT NULL,
    label TEXT,
    UNIQUE(block_id, number)
);

CREATE INDEX IF NOT EXISTS idx_floors_block ON floors(block_id);

-- 3. Classrooms
CREATE TABLE IF NOT EXISTS classrooms (
    id TEXT PRIMARY KEY,
    block TEXT NOT NULL,
    floor INTEGER NOT NULL,
    capacity INTEGER NOT NULL,
    amenities TEXT,
    status_override TEXT,
    override_expires TIMESTAMPTZ,
    floor_id INTEGER REFERENCES floors(id)
);

-- 4. Time Slots
CREATE TABLE IF NOT EXISTS time_slots (
    id INTEGER PRIMARY KEY,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    label TEXT
);

-- 5. Users
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('student','professor')),
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role  ON users(role);

-- 6. Subjects
CREATE TABLE IF NOT EXISTS subjects (
    id SERIAL PRIMARY KEY,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    professor_id INTEGER NOT NULL REFERENCES users(id)
);

-- 7. Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    enrolled_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_enroll_student ON enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enroll_subject ON enrollments(subject_id);

-- 8. Timetable (Regular)
CREATE TABLE IF NOT EXISTS timetable (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    day TEXT NOT NULL,
    subject TEXT,
    faculty TEXT
);

-- 9. Reservations
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    date DATE NOT NULL,
    purpose TEXT,
    booked_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Student Timetables (Personal)
CREATE TABLE IF NOT EXISTS student_timetables (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    day TEXT NOT NULL,
    slot_id INTEGER REFERENCES time_slots(id),
    room_id TEXT,
    subject_name TEXT,
    faculty_name TEXT,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_st_student ON student_timetables(student_id);

-- 11. Professor Classes (Scheduled)
CREATE TABLE IF NOT EXISTS professor_classes (
    id SERIAL PRIMARY KEY,
    professor_id INTEGER NOT NULL REFERENCES users(id),
    subject_id INTEGER REFERENCES subjects(id),
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    date DATE NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled','completed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, slot_id, date)
);

CREATE INDEX IF NOT EXISTS idx_pc_professor ON professor_classes(professor_id);
CREATE INDEX IF NOT EXISTS idx_pc_date      ON professor_classes(date);

-- 12. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    class_id INTEGER REFERENCES professor_classes(id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_notif_user   ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notif_unread ON notifications(user_id, is_read);
