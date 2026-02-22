const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const fs = require('fs');
const { initDB } = require('./database/db');

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure QR codes directory exists
const qrDir = path.join(__dirname, 'qr-codes');
if (!fs.existsSync(qrDir)) fs.mkdirSync(qrDir);

// ── API Routes ────────────────────────────────────────────────────────────
const authRoutes = require('./routes/auth');
const blockRoutes = require('./routes/blocks');
const classroomRoutes = require('./routes/classrooms');
const reservationRoutes = require('./routes/reservations');
const timetableRoutes = require('./routes/timetable');
const studentRoutes = require('./routes/student');
const professorRoutes = require('./routes/professor');
const enrollmentRoutes = require('./routes/enrollments');
const adminRoutes = require('./routes/admin'); // Added

app.use('/api/auth', authRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/student', studentRoutes);
app.use('/api/professor', professorRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin', adminRoutes); // Added

// Floors → classrooms (delegated to classrooms router)
app.get('/api/floors/:floorId/classrooms', (req, res) => {
    req.url = `/floor/${req.params.floorId}${req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : ''}`;
    require('./routes/classrooms')(req, res, () => { });
});

// Helper to get base URL dynamically
function getBaseUrl(req) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
    const host = req.headers['x-forwarded-host'] || req.headers.host || `localhost:${PORT}`;
    return `${protocol}://${host}`;
}

// QR Code generation endpoint
app.get('/api/qr/:roomId', async (req, res) => {
    try {
        const roomId = req.params.roomId;
        const baseUrl = getBaseUrl(req);
        const roomUrl = `${baseUrl}/room.html?id=${roomId}`;
        const qrDataUrl = await QRCode.toDataURL(roomUrl, { width: 300, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } });
        res.json({ roomId, roomUrl, qrCode: qrDataUrl });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get('/api/qr/:roomId/download', async (req, res) => {
    try {
        const roomId = req.params.roomId;
        const baseUrl = getBaseUrl(req);
        const roomUrl = `${baseUrl}/room.html?id=${roomId}`;
        const qrBuffer = await QRCode.toBuffer(roomUrl, { width: 400, margin: 2 });
        res.set({ 'Content-Type': 'image/png', 'Content-Disposition': `attachment; filename="qr-${roomId}.png"` });
        res.send(qrBuffer);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ── Frontend Page Routes ──────────────────────────────────────────────────
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));
app.get('/welcome', (req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

// Student pages
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'dashboard.html')));
app.get('/student/timetable', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'timetable.html')));
app.get('/student/notifications', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'notifications.html')));

// Professor pages
app.get('/professor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'professor', 'dashboard.html')));
app.get('/professor/schedule', (req, res) => res.sendFile(path.join(__dirname, 'public', 'professor', 'schedule.html')));

// ── Start Server ──────────────────────────────────────────────────────────
async function startServer() {
    try {
        await initDB();
        console.log('📦 Database initialized');

        // Initialize WebSocket
        const { initWS } = require('./services/notificationEngine');
        initWS(httpServer);

        // Initialize cron scheduler
        const { initScheduler } = require('./services/scheduler');
        initScheduler();

        httpServer.listen(PORT, () => {
            console.log(`
╔═══════════════════════════════════════════════════════════╗
║    🏫 Smart Campus Academic Coordination Platform 🏫      ║
╠═══════════════════════════════════════════════════════════╣
║  Welcome:    http://localhost:${PORT}                        ║
║  Student:    http://localhost:${PORT}/student               ║
║  Professor:  http://localhost:${PORT}/professor             ║
║  Admin:      http://localhost:${PORT}/admin                 ║
║  WebSocket:  ws://localhost:${PORT}/ws                      ║
╚═══════════════════════════════════════════════════════════╝
            `);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
