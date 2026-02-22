const express = require('express');
const router = express.Router();
const AdminService = require('../services/adminService');
const requireAuth = require('../middleware/requireAuth');
const requireRole = require('../middleware/requireRole');

// All admin routes require JWT + admin role
router.use(requireAuth, requireRole('admin'));

// GET /api/admin/dashboard — global stats
router.get('/dashboard', async (req, res) => {
    try {
        const stats = await AdminService.getGlobalStats();
        res.json(stats);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST /api/admin/freeze — toggle enrollment freeze
router.post('/freeze', async (req, res) => {
    try {
        const { status } = req.body; // true or false
        const newStatus = await AdminService.setFreeze(status === true);
        res.json({ success: true, isFrozen: newStatus });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/professors — list all professors
router.get('/professors', async (req, res) => {
    try {
        const professors = await AdminService.getAllProfessors();
        res.json(professors);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/courses — list all courses
router.get('/courses', async (req, res) => {
    try {
        const courses = await AdminService.getAllCourses();
        res.json(courses);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET /api/admin/enrollments — list all enrollments
router.get('/enrollments', async (req, res) => {
    try {
        const enrollments = await AdminService.getEnrollmentRequests();
        res.json(enrollments);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
