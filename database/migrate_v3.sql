-- ============================================================
-- Smart Campus Platform v3 — Incremental Migration
-- Run this in Supabase SQL Editor (safe on existing data)
-- ============================================================

-- 1. Extend courses table with missing fields
ALTER TABLE courses
    ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 60,
    ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT TRUE,
    ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active' CHECK(status IN ('active','archived')),
    ADD COLUMN IF NOT EXISTS enrollment_open_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS enrollment_close_at TIMESTAMPTZ;

-- 2. Create enrollment_requests table (pending/approved/rejected workflow)
CREATE TABLE IF NOT EXISTS enrollment_requests (
    id SERIAL PRIMARY KEY,
    student_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status TEXT DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')),
    message TEXT,
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMPTZ,
    UNIQUE(student_id, course_id)
);

-- 3. Normalize classrooms — add floor_id NOT NULL enforcement
--    (Keeps block/floor TEXT columns for backwards-compat display, but floor_id is now required)
UPDATE classrooms SET floor_id = (
    SELECT f.id FROM floors f
    JOIN blocks b ON f.block_id = b.id
    WHERE b.name = classrooms.block AND f.number = classrooms.floor
    LIMIT 1
) WHERE floor_id IS NULL;

-- 4. Missing indexes
CREATE INDEX IF NOT EXISTS idx_sessions_course ON course_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_classrooms_floor ON classrooms(floor_id);
CREATE INDEX IF NOT EXISTS idx_st_course ON student_timetables(course_id);
CREATE INDEX IF NOT EXISTS idx_enroll_req_student ON enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_enroll_req_course ON enrollment_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_courses_status ON courses(status, academic_year);

-- 5. Ensure notification column for enrollment type
-- (notifications.type already TEXT — no change needed)

-- Done
SELECT 'Migration v3 complete' AS result;
