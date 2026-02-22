const express = require('express');
const router = express.Router();
const { getAllRoomsWithStatus } = require('../services/statusEngine');

// GET /api/noise — all rooms with live noise scores
router.get('/', async (req, res) => {
    try {
        const { slotId, date } = req.query;
        // getAllRoomsWithStatus already calls noiseEngine internally
        const rooms = await getAllRoomsWithStatus(slotId || null, date || null);
        res.json(rooms);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/noise/floor/:floorId — noise summary for one floor
router.get('/floor/:floorId', async (req, res) => {
    try {
        const { slotId, date } = req.query;
        const allRooms = await getAllRoomsWithStatus(slotId || null, date || null);
        const floorRooms = allRooms.filter(r =>
            String(r.floor_id) === req.params.floorId ||
            `${r.block}-${r.floor}` === req.params.floorId
        );
        if (floorRooms.length === 0) return res.status(404).json({ error: 'Floor not found' });
        res.json({
            floorId: req.params.floorId,
            noiseScore: floorRooms[0]?.noiseScore ?? 0,
            noiseLevel: floorRooms[0]?.noiseLevel ?? 'LOW',
            rooms: floorRooms
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
