const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { prepare } = require('../database/db');
const { JWT_SECRET } = require('./authService');

// Map: userId (number) → WebSocket instance
const connectedClients = new Map();

let wss = null;

function initWS(httpServer) {
    wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

    wss.on('connection', async (ws, req) => {
        try {
            const url = new URL(req.url, 'http://localhost');
            const token = url.searchParams.get('token');
            if (!token) { ws.close(4001, 'No token'); return; }

            const payload = jwt.verify(token, JWT_SECRET);
            const userId = payload.id;

            connectedClients.set(userId, ws);
            console.log(`🔌 WS connected: user ${userId} (${payload.role})`);

            // Send pending unread notifications on connect
            const pending = await prepare(`
                SELECT * FROM notifications WHERE user_id = ? AND is_read = FALSE ORDER BY created_at DESC LIMIT 20
            `).all(userId);
            if (pending.length > 0) {
                ws.send(JSON.stringify({ type: 'pending_notifications', notifications: pending }));
            }

            ws.on('message', async (data) => {
                try {
                    const msg = JSON.parse(data);
                    if (msg.type === 'mark_read' && msg.notificationId) {
                        await prepare('UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?').run(msg.notificationId, userId);
                    }
                    if (msg.type === 'mark_all_read') {
                        await prepare('UPDATE notifications SET is_read = TRUE WHERE user_id = ?').run(userId);
                    }
                } catch (e) { /* ignore malformed messages */ }
            });

            ws.on('close', () => {
                connectedClients.delete(userId);
                console.log(`🔌 WS disconnected: user ${userId}`);
            });

            ws.on('error', () => connectedClients.delete(userId));

        } catch (err) {
            ws.close(4001, 'Unauthorized');
        }
    });

    console.log('🔌 WebSocket server initialized at /ws');
}

/**
 * Notify all students enrolled in a course
 */
async function notifyEnrolledStudents(courseId, sessionId, type, title, message) {
    const enrollments = await prepare('SELECT student_id FROM enrollments WHERE course_id = ?').all(courseId);

    for (const { student_id } of enrollments) {
        // Insert notification record
        await prepare(`
            INSERT INTO notifications (user_id, type, title, message, session_id)
            VALUES (?, ?, ?, ?, ?)
        `).run(student_id, type, title, message, sessionId);

        // Push to connected client if online
        const client = connectedClients.get(student_id);
        if (client && client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, title, message, sessionId, timestamp: new Date().toISOString() }));
        }
    }
}

/**
 * Send a notification to a specific user
 */
async function notifyUser(userId, type, title, message, sessionId = null) {
    await prepare('INSERT INTO notifications (user_id, type, title, message, session_id) VALUES (?, ?, ?, ?, ?)').run(userId, type, title, message, sessionId);
    const client = connectedClients.get(userId);
    if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify({ type, title, message, sessionId, timestamp: new Date().toISOString() }));
    }
}

function getConnectedCount() {
    return connectedClients.size;
}

module.exports = { initWS, notifyEnrolledStudents, notifyUser, getConnectedCount };
