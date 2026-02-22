const express = require('express');
const router = express.Router();
const { initDB, prepare } = require('../database/db');
const { getRoomStatus, getAllRoomsWithStatus, getCurrentTimeSlot, getTodayName, getTodayDate, getAvailableSlotsForRoom } = require('../services/statusEngine');
const requireAuth = require('../middleware/requireAuth');

// GET /api/classrooms - List all classrooms with status (filterable)
router.get('/', async (req, res) => {
    try {
        await initDB();
        const { block, floor, capacity, status, search, slot_id, date } = req.query;

        let rooms = await getAllRoomsWithStatus(slot_id, date);

        if (block) rooms = rooms.filter(r => r.block === block);
        if (floor !== undefined && floor !== '') rooms = rooms.filter(r => r.floor === parseInt(floor));
        if (capacity) rooms = rooms.filter(r => r.capacity >= parseInt(capacity));
        if (status) rooms = rooms.filter(r => r.currentStatus === status);
        if (search) rooms = rooms.filter(r => r.id.toLowerCase().includes(search.toLowerCase()));

        const stats = {
            total: rooms.length,
            available: rooms.filter(r => r.currentStatus === 'available').length,
            occupied: rooms.filter(r => r.currentStatus === 'occupied').length,
            reserved: rooms.filter(r => r.currentStatus === 'reserved').length
        };

        res.json({ rooms, stats });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/floors/:floorId/classrooms — classrooms on a floor with live status
router.get('/floor/:floorId', requireAuth, async (req, res) => {
    try {
        await initDB();
        const { floorId } = req.params;
        const { slot_id, date } = req.query;

        const floor = await prepare('SELECT f.*, b.name as block_name, b.label as block_label FROM floors f JOIN blocks b ON f.block_id = b.id WHERE f.id = ?').get(floorId);
        if (!floor) return res.status(404).json({ error: 'Floor not found' });

        const rooms = await prepare('SELECT * FROM classrooms WHERE floor_id = ? ORDER BY id').all(floorId);
        const allRoomsWithStatus = await getAllRoomsWithStatus(slot_id, date);
        const statusMap = Object.fromEntries(allRoomsWithStatus.map(r => [r.id, r]));

        const roomsWithStatus = rooms.map(room => ({
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            ...(statusMap[room.id] || { currentStatus: 'available', statusReason: 'No data' })
        }));

        res.json({ floor, rooms: roomsWithStatus });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/classrooms/:id - Get single classroom
router.get('/:id', async (req, res) => {
    try {
        await initDB();
        const room = await prepare('SELECT * FROM classrooms WHERE id = ?').get(req.params.id);
        if (!room) return res.status(404).json({ error: 'Classroom not found' });

        const statusInfo = await getRoomStatus(room.id);
        const currentSlot = await getCurrentTimeSlot();
        const today = getTodayName();
        const todayDate = getTodayDate();

        const todaySchedule = await prepare(`
            SELECT t.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM timetable t
            JOIN time_slots ts ON t.slot_id = ts.id
            WHERE t.room_id = ? AND t.day = ?
            ORDER BY ts.id
        `).all(room.id, today);

        const todayReservations = await prepare(`
            SELECT r.*, ts.start_time, ts.end_time, ts.label as slot_label
            FROM reservations r
            JOIN time_slots ts ON r.slot_id = ts.id
            WHERE r.room_id = ? AND r.date = ?::DATE
            ORDER BY ts.id
        `).all(room.id, todayDate);

        const todayProfClasses = await prepare(`
            SELECT cs.*, ts.start_time, ts.end_time, ts.label as slot_label,
                   u.full_name as professor_name, c.name as course_name
            FROM course_sessions cs
            JOIN time_slots ts ON cs.slot_id = ts.id
            JOIN courses c ON cs.course_id = c.id
            JOIN users u ON c.professor_id = u.id
            WHERE cs.room_id = ? AND cs.date = ?::DATE AND cs.status = 'scheduled'
            ORDER BY ts.id
        `).all(room.id, todayDate);

        res.json({
            ...room,
            amenities: room.amenities ? JSON.parse(room.amenities) : [],
            currentStatus: statusInfo.status,
            statusReason: statusInfo.reason,
            statusDetails: statusInfo,
            currentSlot,
            todaySchedule,
            todayReservations,
            todayProfClasses
        });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/classrooms/:id/slots - Get available slots for a room
router.get('/:id/slots', async (req, res) => {
    try {
        await initDB();
        const { date } = req.query;
        if (!date) return res.status(400).json({ error: 'Date is required' });
        const slots = await getAvailableSlotsForRoom(req.params.id, date);
        res.json(slots);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/classrooms/:id/status - Override room status (requires auth)
router.put('/:id/status', requireAuth, async (req, res) => {
    try {
        await initDB();
        const { status, expiresIn } = req.body;
        const validStatuses = ['available', 'occupied', 'reserved'];
        if (!validStatuses.includes(status)) return res.status(400).json({ error: 'Invalid status' });

        let expiresAt = null;
        if (expiresIn) expiresAt = new Date(Date.now() + expiresIn * 60000).toISOString();

        await prepare('UPDATE classrooms SET status_override = ?, override_expires = ? WHERE id = ?').run(status, expiresAt, req.params.id);
        res.json({ success: true, message: `Status updated to ${status}`, expiresAt });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// DELETE /api/classrooms/:id/status - Clear status override
router.delete('/:id/status', requireAuth, async (req, res) => {
    try {
        await initDB();
        await prepare('UPDATE classrooms SET status_override = NULL, override_expires = NULL WHERE id = ?').run(req.params.id);
        res.json({ success: true, message: 'Status override cleared' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;

