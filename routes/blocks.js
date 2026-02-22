const express = require('express');
const router = express.Router();
const { prepare } = require('../database/db');
const requireAuth = require('../middleware/requireAuth');

// GET /api/blocks — list all blocks
router.get('/', requireAuth, (req, res) => {
    try {
        const blocks = prepare('SELECT * FROM blocks ORDER BY name').all();
        res.json(blocks);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/blocks/:blockId/floors — floors in a block
router.get('/:blockId/floors', requireAuth, (req, res) => {
    try {
        const { blockId } = req.params;
        const block = prepare('SELECT * FROM blocks WHERE id = ?').get(blockId);
        if (!block) return res.status(404).json({ error: 'Block not found' });

        const floors = prepare('SELECT * FROM floors WHERE block_id = ? ORDER BY number').all(blockId);
        res.json({ block, floors });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
