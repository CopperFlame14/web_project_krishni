const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const { getCurrentTimeSlot, getSystemConfig } = require('../services/statusEngine');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// GET /api/timetable/slots - Get all time slots
router.get('/slots', async (req, res) => {
    try {
        const slots = await prepare('SELECT * FROM time_slots ORDER BY id').all();
        res.json(slots);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/timetable/current - Get current status
router.get('/current', async (req, res) => {
    try {
        const currentSlot = await getCurrentTimeSlot();
        const academicYear = await getSystemConfig('current_academic_year');
        res.json({
            currentSlot,
            academicYear,
            isClassHours: currentSlot !== null
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/timetable/master - Get master timetable for a room or day
router.get('/master', async (req, res) => {
    try {
        const { roomId, day } = req.query;
        const academicYear = await getSystemConfig('current_academic_year');

        let sql = `
            SELECT t.*, c.name as course_name, c.code as course_code, u.full_name as professor_name,
                   ts.label as slot_label, ts.start_time, ts.end_time
            FROM timetable t
            JOIN courses c ON t.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            JOIN time_slots ts ON t.slot_id = ts.id
            WHERE t.academic_year = ?
        `;
        const params = [academicYear];

        if (roomId) {
            sql += " AND t.room_id = ?";
            params.push(roomId);
        }
        if (day) {
            sql += " AND t.day = ?";
            params.push(day);
        }

        sql += " ORDER BY t.day, ts.start_time";
        const entries = await prepare(sql).all(...params);
        res.json(entries);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
