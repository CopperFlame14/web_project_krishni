-- Smart Campus Platform Schema v2 (PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 0. System Configuration & Governance
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Initialize default settings
INSERT INTO system_settings (key, value) VALUES ('enrollment_frozen', 'false') ON CONFLICT DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('current_academic_year', '2025-26') ON CONFLICT DO NOTHING;
INSERT INTO system_settings (key, value) VALUES ('current_semester', '1') ON CONFLICT DO NOTHING;

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
    role TEXT NOT NULL CHECK(role IN ('student','professor','admin')),
    full_name TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- 6. Courses (Formerly Subjects - now UUID based)
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    professor_id INTEGER NOT NULL REFERENCES users(id),
    academic_year TEXT NOT NULL,
    semester INTEGER NOT NULL,
    status TEXT DEFAULT 'active' CHECK(status IN ('active', 'inactive', 'archived')),
    max_capacity INTEGER DEFAULT 60,
    auto_approve BOOLEAN DEFAULT TRUE,
    enrollment_open_at TIMESTAMPTZ,
    enrollment_close_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(code, academic_year, semester)
);

-- 6.1 Enrollment Requests (Pending Approval)
CREATE TABLE IF NOT EXISTS enrollment_requests (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    processed_at TIMESTAMPTZ,
    UNIQUE(student_id, course_id)
);

-- 7. Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'enrolled' CHECK(status IN ('enrolled', 'pending', 'dropped')),
    enrolled_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, course_id)
);

-- 8. Timetable (Regular Master Schedule)
CREATE TABLE IF NOT EXISTS timetable (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    day TEXT NOT NULL,
    course_id UUID REFERENCES courses(id),
    faculty TEXT, -- Legacy fallback
    academic_year TEXT NOT NULL
);

-- 9. Reservations (One-off bookings)
CREATE TABLE IF NOT EXISTS reservations (
    id SERIAL PRIMARY KEY,
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    date DATE NOT NULL,
    purpose TEXT,
    booked_by TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. Student Timetables (Personalized with Clash Check)
CREATE TABLE IF NOT EXISTS student_timetables (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id),
    course_id UUID REFERENCES courses(id),
    day TEXT NOT NULL,
    slot_id INTEGER REFERENCES time_slots(id),
    room_id TEXT,
    subject_name TEXT, -- Fallback for uploaded CSV
    academic_year TEXT NOT NULL,
    uploaded_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(student_id, day, slot_id, academic_year) -- Clash detection at DB level
);

-- 11. Course Sessions (Granular individual lectures)
CREATE TABLE IF NOT EXISTS course_sessions (
    id SERIAL PRIMARY KEY,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    room_id TEXT NOT NULL REFERENCES classrooms(id),
    slot_id INTEGER NOT NULL REFERENCES time_slots(id),
    date DATE NOT NULL,
    status TEXT DEFAULT 'scheduled' CHECK(status IN ('scheduled', 'cancelled', 'rescheduled', 'completed')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_id, slot_id, date) -- Classroom clash detection
);

-- 12. Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    session_id INTEGER REFERENCES course_sessions(id),
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_sessions_date ON course_sessions(date);
CREATE INDEX IF NOT EXISTS idx_st_student_year ON student_timetables(student_id, academic_year);
CREATE INDEX IF NOT EXISTS idx_enroll_course ON enrollments(course_id);

-- ============================================================================
-- STUDENT PLANNER TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS planner_profiles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL UNIQUE,
    full_name TEXT NOT NULL,
    registration_number TEXT NOT NULL,
    mobile_number TEXT,
    preferred_study_hours INTEGER,
    preferred_study_time TEXT,
    user_goal TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_subjects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    color_code TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_tasks (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES planner_subjects(id) ON DELETE SET NULL,
    task_date DATE NOT NULL,
    title TEXT NOT NULL,
    completed BOOLEAN DEFAULT false,
    time_spent_minutes INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_daily_progress (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    progress_date DATE NOT NULL,
    total_tasks_completed INTEGER DEFAULT 0,
    total_time_spent_minutes INTEGER DEFAULT 0,
    UNIQUE(user_id, progress_date)
);

CREATE TABLE IF NOT EXISTS planner_study_sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    subject_id UUID REFERENCES planner_subjects(id) ON DELETE CASCADE NOT NULL,
    duration_minutes INTEGER NOT NULL,
    session_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_daily_moods (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    mood TEXT NOT NULL,
    mood_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, mood_date)
);

CREATE TABLE IF NOT EXISTS planner_habits (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS planner_habit_logs (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    habit_id UUID REFERENCES planner_habits(id) ON DELETE CASCADE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE NOT NULL,
    log_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(habit_id, log_date)
);
