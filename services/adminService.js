const { prepare } = require('../database/db');

/**
 * Global Admin Governance Service
 */
const AdminService = {
    // 1. Enrollment Freeze Logic
    async isFrozen() {
        const row = await prepare("SELECT value FROM system_settings WHERE key = 'enrollment_frozen'").get();
        return row ? row.value === 'true' : false;
    },

    async setFreeze(status) {
        await prepare("UPDATE system_settings SET value = ?, updated_at = CURRENT_TIMESTAMP WHERE key = 'enrollment_frozen'").run(status ? 'true' : 'false');
        return status;
    },

    // 2. Oversight Metrics
    async getGlobalStats() {
        const [profCount, studCount, courseCount, enrollCount] = await Promise.all([
            prepare("SELECT COUNT(*) as c FROM users WHERE role = 'professor'").get(),
            prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get(),
            prepare("SELECT COUNT(*) as c FROM courses").get(),
            prepare("SELECT COUNT(*) as c FROM enrollments").get()
        ]);

        return {
            professors: parseInt(profCount.c),
            students: parseInt(studCount.c),
            courses: parseInt(courseCount.c),
            enrollments: parseInt(enrollCount.c),
            isFrozen: await this.isFrozen()
        };
    },

    // 3. Detailed Lists for Admin Portal
    async getAllProfessors() {
        return await prepare(`
            SELECT id, full_name, email, (SELECT COUNT(*) FROM courses WHERE professor_id = users.id) as course_count
            FROM users WHERE role = 'professor' ORDER BY full_name
        `).all();
    },

    async getAllCourses() {
        return await prepare(`
            SELECT c.*, u.full_name as professor_name, 
                   (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrolled_count
            FROM courses c
            JOIN users u ON c.professor_id = u.id
            ORDER BY c.code
        `).all();
    },

    async getEnrollmentRequests() {
        // In this simple version, we'll just list all enrollments
        // but can be extended for 'pending' state
        return await prepare(`
            SELECT e.*, u.full_name as student_name, c.name as course_name, c.code as course_code
            FROM enrollments e
            JOIN users u ON e.student_id = u.id
            JOIN courses c ON e.course_id = c.id
            ORDER BY e.enrolled_at DESC
        `).all();
    }
};

module.exports = AdminService;
