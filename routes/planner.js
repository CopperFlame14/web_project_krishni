const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');

// All planner routes require authentication
router.use(requireAuth);

// ============================================
// PROFILE
// ============================================
router.get('/profile', async (req, res) => {
    try {
        const profile = await prepare('SELECT * FROM planner_profiles WHERE user_id = $1').get(req.user.id);
        res.json(profile || null);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/profile', async (req, res) => {
    try {
        const { full_name, registration_number, mobile_number, preferred_study_hours, preferred_study_time, user_goal } = req.body;
        
        const existing = await prepare('SELECT id FROM planner_profiles WHERE user_id = $1').get(req.user.id);
        
        let result;
        if (existing) {
            result = await prepare(`
                UPDATE planner_profiles 
                SET full_name = $1, registration_number = $2, mobile_number = $3, 
                    preferred_study_hours = $4, preferred_study_time = $5, user_goal = $6, updated_at = NOW()
                WHERE user_id = $7 RETURNING *
            `).run(full_name, registration_number, mobile_number, preferred_study_hours, preferred_study_time, user_goal, req.user.id);
        } else {
            result = await prepare(`
                INSERT INTO planner_profiles (user_id, full_name, registration_number, mobile_number, preferred_study_hours, preferred_study_time, user_goal)
                VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
            `).run(req.user.id, full_name, registration_number, mobile_number, preferred_study_hours, preferred_study_time, user_goal);
        }
        res.json({ success: true, profile: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// SUBJECTS
// ============================================
router.get('/subjects', async (req, res) => {
    try {
        const subjects = await prepare('SELECT * FROM planner_subjects WHERE user_id = $1 ORDER BY created_at DESC').all(req.user.id);
        res.json(subjects);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/subjects', async (req, res) => {
    try {
        const { name, color_code } = req.body;
        const result = await prepare('INSERT INTO planner_subjects (user_id, name, color_code) VALUES ($1, $2, $3) RETURNING *').run(req.user.id, name, color_code);
        res.json({ success: true, subject: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/subjects/:id', async (req, res) => {
    try {
        await prepare('DELETE FROM planner_subjects WHERE id = $1 AND user_id = $2').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// TASKS
// ============================================
router.get('/tasks', async (req, res) => {
    try {
        const tasks = await prepare('SELECT * FROM planner_tasks WHERE user_id = $1 ORDER BY created_at DESC').all(req.user.id);
        res.json(tasks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/tasks', async (req, res) => {
    try {
        let { subject_id, task_date, title, completed, time_spent_minutes } = req.body;
        if (subject_id === "") subject_id = null; // Handle empty subject correctly maps to null
        
        await prepare(`
            INSERT INTO planner_tasks (user_id, subject_id, task_date, title, completed, time_spent_minutes)
            VALUES ($1, $2, $3, $4, $5, $6)
        `).run(req.user.id, subject_id, task_date, title, completed || false, time_spent_minutes || 0);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/tasks/:id', async (req, res) => {
    try {
        const { completed, time_spent_minutes } = req.body;
        
        let query = 'UPDATE planner_tasks SET ';
        const params = [];
        let i = 1;

        if (completed !== undefined) {
             query += `completed = $${i++}, `;
             params.push(completed);
        }
        if (time_spent_minutes !== undefined) {
             query += `time_spent_minutes = $${i++}, `;
             params.push(time_spent_minutes);
        }

        if (params.length === 0) return res.json({ success: true });

        query = query.slice(0, -2); // remove last comma
        query += ` WHERE id = $${i++} AND user_id = $${i}`;
        params.push(req.params.id, req.user.id);

        await prepare(query).run(...params);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/tasks/:id', async (req, res) => {
    try {
        await prepare('DELETE FROM planner_tasks WHERE id = $1 AND user_id = $2').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// DAILY PROGRESS
// ============================================
router.get('/progress', async (req, res) => {
    try {
        const { limit = 30 } = req.query;
        const result = await prepare('SELECT * FROM planner_daily_progress WHERE user_id = $1 ORDER BY progress_date DESC LIMIT $2').all(req.user.id, limit);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/progress', async (req, res) => {
    try {
        const { progress_date, task_increment, time_increment } = req.body;
        
        const existing = await prepare('SELECT * FROM planner_daily_progress WHERE user_id = $1 AND progress_date = $2').get(req.user.id, progress_date);
        
        if (existing) {
            await prepare(`
                UPDATE planner_daily_progress 
                SET total_tasks_completed = total_tasks_completed + $1,
                    total_time_spent_minutes = total_time_spent_minutes + $2
                WHERE user_id = $3 AND progress_date = $4
            `).run(task_increment || 0, time_increment || 0, req.user.id, progress_date);
        } else {
            await prepare(`
                INSERT INTO planner_daily_progress (user_id, progress_date, total_tasks_completed, total_time_spent_minutes)
                VALUES ($1, $2, $3, $4)
            `).run(req.user.id, progress_date, task_increment || 0, time_increment || 0);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// STUDY SESSIONS
// ============================================
router.get('/sessions', async (req, res) => {
    try {
        const result = await prepare('SELECT * FROM planner_study_sessions WHERE user_id = $1 ORDER BY created_at DESC').all(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/sessions', async (req, res) => {
    try {
        const { subject_id, duration_minutes, session_date } = req.body;
        await prepare(`
            INSERT INTO planner_study_sessions (user_id, subject_id, duration_minutes, session_date)
            VALUES ($1, $2, $3, $4)
        `).run(req.user.id, subject_id, duration_minutes, session_date);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// MOODS
// ============================================
router.get('/moods', async (req, res) => {
    try {
        const result = await prepare('SELECT * FROM planner_daily_moods WHERE user_id = $1 ORDER BY mood_date DESC').all(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/moods', async (req, res) => {
    try {
        const { mood, mood_date } = req.body;
        
        const existing = await prepare('SELECT * FROM planner_daily_moods WHERE user_id = $1 AND mood_date = $2').get(req.user.id, mood_date);
        
        if (existing) {
             await prepare('UPDATE planner_daily_moods SET mood = $1 WHERE user_id = $2 AND mood_date = $3').run(mood, req.user.id, mood_date);
        } else {
             await prepare('INSERT INTO planner_daily_moods (user_id, mood, mood_date) VALUES ($1, $2, $3)').run(req.user.id, mood, mood_date);
        }
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// HABITS
// ============================================
router.get('/habits', async (req, res) => {
    try {
        const result = await prepare('SELECT * FROM planner_habits WHERE user_id = $1 ORDER BY created_at DESC').all(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/habits', async (req, res) => {
    try {
        const { title } = req.body;
        const result = await prepare('INSERT INTO planner_habits (user_id, title) VALUES ($1, $2) RETURNING *').run(req.user.id, title);
        res.json({ success: true, habit: result });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/habits/:id', async (req, res) => {
    try {
        await prepare('DELETE FROM planner_habits WHERE id = $1 AND user_id = $2').run(req.params.id, req.user.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ============================================
// HABIT LOGS
// ============================================
router.get('/habits/logs', async (req, res) => {
    try {
        const result = await prepare('SELECT * FROM planner_habit_logs WHERE user_id = $1 ORDER BY log_date DESC').all(req.user.id);
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/habits/logs', async (req, res) => {
    try {
        const { habit_id, log_date } = req.body;
        await prepare('INSERT INTO planner_habit_logs (habit_id, user_id, log_date) VALUES ($1, $2, $3)').run(habit_id, req.user.id, log_date);
        res.json({ success: true });
    } catch (err) {
        // Ignore unique constraint violation (duplicate log) silently as successful check
        if (err.message && err.message.includes('unique constraint')) {
            return res.json({ success: true });
        }
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
