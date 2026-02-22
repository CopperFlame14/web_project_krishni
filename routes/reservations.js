const express = require('express');
const router = express.Router();
const { initDB, prepare } = require('../database/db');
const { checkConflict, getTodayDate } = require('../services/statusEngine');
const requireAuth = require('../middleware/requireAuth');

// GET /api/reservations - List all reservations
router.get('/', async (req, res) => {
    try {
        await initDB();
        const { room_id, date, upcoming } = req.query;

        let query = `
            SELECT r.*, ts.start_time, ts.end_time, ts.label as slot_label,
                   c.block, c.floor, c.capacity
            FROM reservations r
            JOIN time_slots ts ON r.slot_id = ts.id
            JOIN classrooms c ON r.room_id = c.id
        `;
        const conditions = [];
        const params = [];

        if (room_id) {
            conditions.push('r.room_id = ?');
            params.push(room_id);
        }
        if (date) {
            conditions.push('r.date = ?::DATE');
            params.push(date);
        }
        if (upcoming === 'true') {
            conditions.push('r.date >= ?::DATE');
            params.push(getTodayDate());
        }

        if (conditions.length > 0) {
            query += ' WHERE ' + conditions.join(' AND ');
        }

        query += ' ORDER BY r.date, ts.id';

        const reservations = await prepare(query).all(...params);
        res.json(reservations);
    } catch (error) {
        console.error('Error in GET /reservations:', error);
        res.status(500).json({ error: error.message });
    }
});

// POST /api/reservations - Create new reservation with conflict check (requires auth)
router.post('/', requireAuth, async (req, res) => {
    try {
        await initDB();
        const { room_id, slot_id, date, purpose, booked_by } = req.body;

        // Validate required fields
        if (!room_id || !slot_id || !date) {
            return res.status(400).json({ error: 'room_id, slot_id, and date are required' });
        }

        // Check for conflicts
        const conflict = await checkConflict(room_id, slot_id, date);
        if (conflict.hasConflict) {
            return res.status(409).json({
                error: 'Booking conflict detected',
                conflictType: conflict.type,
                details: conflict.details
            });
        }

        // Create reservation - ensure slot_id is stored as integer
        const slotIdInt = parseInt(slot_id);
        const result = await prepare(`
            INSERT INTO reservations (room_id, slot_id, date, purpose, booked_by)
            VALUES (?, ?, ?, ?, ?)
            RETURNING id
        `).run(room_id, slotIdInt, date, purpose || '', booked_by || 'Anonymous');

        console.log(`✅ Reservation created: Room ${room_id}, Slot ${slotIdInt}, Date ${date}`);

        res.status(201).json({
            success: true,
            id: result.lastInsertRowid,
            message: 'Reservation created successfully'
        });
    } catch (error) {
        console.error('Error in POST /reservations:', error);
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/reservations/:id - Cancel reservation (requires auth)
router.delete('/:id', requireAuth, async (req, res) => {
    try {
        await initDB();
        const result = await prepare('DELETE FROM reservations WHERE id = ?').run(parseInt(req.params.id));

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Reservation not found' });
        }

        res.json({ success: true, message: 'Reservation cancelled' });
    } catch (error) {
        console.error('Error in DELETE /reservations/:id:', error);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

