const { prepare } = require('../database/db');

/**
 * Global Admin Governance Service
 */
const AdminService = {
    // 1. Enrollment Freeze Logic
    async isFrozen() {
        const row = await prepare("SELECT value FROM system_settings WHERE key = $1").get('enrollment_frozen');
        return row ? row.value === 'true' : false;
    },

    async setFreeze(status) {
        await prepare("UPDATE system_settings SET value = $1, updated_at = CURRENT_TIMESTAMP WHERE key = 'enrollment_frozen'").run(status ? 'true' : 'false');
        return status;
    },

    // 2. Global Statistics
    async getGlobalStats() {
        try {
            const [profCount, studCount, courseCount, enrollCount] = await Promise.all([
                prepare("SELECT COUNT(*) as c FROM users WHERE role = 'professor'").get().catch(() => ({ c: 0 })),
                prepare("SELECT COUNT(*) as c FROM users WHERE role = 'student'").get().catch(() => ({ c: 0 })),
                prepare("SELECT COUNT(*) as c FROM courses").get().catch(() => ({ c: 0 })),
                prepare("SELECT COUNT(*) as c FROM enrollments").get().catch(() => ({ c: 0 }))
            ]);

            return {
                professors: parseInt(profCount.c || 0),
                students: parseInt(studCount.c || 0),
                courses: parseInt(courseCount.c || 0),
                enrollments: parseInt(enrollCount.c || 0),
                isFrozen: await this.isFrozen().catch(() => false)
            };
        } catch (err) {
            console.error('Stats fetch error:', err);
            return { professors: 0, students: 0, courses: 0, enrollments: 0, isFrozen: false };
        }
    },

    // 3. Extended stats
    async getStats() {
        try {
            const base = await this.getGlobalStats();
            const [activeCourses, pendingRequests, activeClassrooms] = await Promise.all([
                prepare("SELECT COUNT(*) as c FROM courses WHERE status = 'active'").get().catch(() => ({ c: 0 })),
                prepare("SELECT COUNT(*) as c FROM enrollment_requests WHERE status = 'pending'").get().catch(() => ({ c: 0 })),
                prepare("SELECT COUNT(*) as c FROM classrooms").get().catch(() => ({ c: 0 }))
            ]);

            return {
                ...base,
                activeCourses: parseInt(activeCourses.c || 0),
                pendingRequests: parseInt(pendingRequests.c || 0),
                totalClassrooms: parseInt(activeClassrooms.c || 0)
            };
        } catch (err) {
            return { professors: 0, students: 0, courses: 0, enrollments: 0, isFrozen: false, activeCourses: 0, pendingRequests: 0, totalClassrooms: 0 };
        }
    },

    // 4. User management
    async getAllUsers() {
        return await prepare(`
            SELECT id, username, email, role, full_name, created_at
            FROM users
            ORDER BY role, full_name
        `).all();
    },

    async getAllProfessors() {
        return await prepare(`
            SELECT id, full_name, email, created_at,
                   (SELECT COUNT(*) FROM courses WHERE professor_id = users.id) as course_count,
                   (SELECT COUNT(DISTINCT e.student_id) FROM enrollments e JOIN courses c ON e.course_id = c.id WHERE c.professor_id = users.id) as student_count
            FROM users WHERE role = 'professor' ORDER BY full_name
        `).all();
    },

    async getAllStudents() {
        return await prepare(`
            SELECT id, full_name, email, created_at,
                   (SELECT COUNT(*) FROM enrollments WHERE student_id = users.id) as enrollment_count
            FROM users WHERE role = 'student' ORDER BY full_name
        `).all();
    },

    // 5. Course management
    async getAllCourses() {
        return await prepare(`
            SELECT c.*, u.full_name as professor_name,
                   (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id) as enrolled_count,
                   (c.max_capacity - (SELECT COUNT(*) FROM enrollments WHERE course_id = c.id)) as spots_left
            FROM courses c
            JOIN users u ON c.professor_id = u.id
            ORDER BY c.academic_year DESC, c.code
        `).all();
    },

    async getCourseStudents(courseId) {
        return await prepare(`
            SELECT u.id, u.username, u.email, u.full_name, e.enrolled_at, e.status
            FROM enrollments e
            JOIN users u ON e.student_id = u.id
            WHERE e.course_id = $1
            ORDER BY u.full_name
        `).all(courseId);
    },

    // 6. Enrollment oversight
    async getEnrollmentRequests() {
        return await prepare(`
            SELECT e.*, u.full_name as student_name, c.name as course_name, c.code as course_code,
                   p.full_name as professor_name
            FROM enrollments e
            JOIN users u ON e.student_id = u.id
            JOIN courses c ON e.course_id = c.id
            JOIN users p ON c.professor_id = p.id
            ORDER BY e.enrolled_at DESC
            LIMIT 200
        `).all();
    }
};

module.exports = AdminService;
