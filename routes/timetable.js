const express = require('express');
const router = express.Router();
const { initDB, prepare } = require('../database/db');
const { getCurrentTimeSlot } = require('../services/statusEngine');

// GET /api/timeslots - Get all time slots
router.get('/', async (req, res) => {
    try {
        await initDB();
        const slots = prepare('SELECT * FROM time_slots ORDER BY id').all();
        res.json(slots);
    } catch (error) {
        console.error('Error in GET /timeslots:', error);
        res.status(500).json({ error: error.message });
    }
});

// GET /api/timeslots/current - Get current time slot
router.get('/current', async (req, res) => {
    try {
        await initDB();
        const currentSlot = getCurrentTimeSlot();
        const now = new Date();

        res.json({
            currentSlot,
            currentTime: now.toTimeString().slice(0, 5),
            isClassHours: currentSlot !== null
        });
    } catch (error) {
        console.error('Error in GET /timeslots/current:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
