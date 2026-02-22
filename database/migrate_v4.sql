-- ============================================================
-- ClassTrack Migration v4
-- Run this in the Supabase SQL Editor — it is idempotent (safe to re-run)
-- ============================================================

-- 1. Add missing columns to `courses` table
ALTER TABLE courses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active'
    CHECK(status IN ('active', 'archived', 'draft'));

ALTER TABLE courses ADD COLUMN IF NOT EXISTS max_capacity INTEGER DEFAULT 60;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS auto_approve BOOLEAN DEFAULT TRUE;

ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_open_at  TIMESTAMPTZ;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS enrollment_close_at TIMESTAMPTZ;

-- Back-fill any existing rows with defaults
UPDATE courses SET status = 'active' WHERE status IS NULL;
UPDATE courses SET max_capacity = 60    WHERE max_capacity IS NULL;
UPDATE courses SET auto_approve  = TRUE WHERE auto_approve  IS NULL;

-- 2. Create the `enrollment_requests` table (used by professor approval workflow)
CREATE TABLE IF NOT EXISTS enrollment_requests (
    id           SERIAL PRIMARY KEY,
    student_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    UUID    NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    status       TEXT    NOT NULL DEFAULT 'pending'
                         CHECK(status IN ('pending','approved','rejected')),
    message      TEXT,                           -- optional rejection reason
    requested_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    resolved_at  TIMESTAMPTZ,
    UNIQUE(student_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_er_course   ON enrollment_requests(course_id);
CREATE INDEX IF NOT EXISTS idx_er_student  ON enrollment_requests(student_id);
CREATE INDEX IF NOT EXISTS idx_er_status   ON enrollment_requests(status);
