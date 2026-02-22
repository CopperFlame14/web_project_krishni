const express = require('express');
const cors = require('cors');
const path = require('path');
const http = require('http');
const QRCode = require('qrcode');
const fs = require('fs');
const { initDB } = require('./database/db');

// SECURITY: Verify JWT_SECRET before doing anything else
require('./services/authService'); // will process.exit(1) if JWT_SECRET missing

const app = express();
const httpServer = http.createServer(app);
const PORT = process.env.PORT || 3000;

app.set('trust proxy', 1);
app.use(cors()); // Permissive CORS for academic coordination platform
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
const adminRoutes = require('./routes/admin');
const noiseRoutes = require('./routes/noise');

app.use('/api/auth', authRoutes);
app.use('/api/blocks', blockRoutes);
app.use('/api/classrooms', classroomRoutes);
app.use('/api/reservations', reservationRoutes);
app.use('/api/timetable', timetableRoutes);
app.use('/api/timeslots', timetableRoutes); // Alias for backward compatibility
app.use('/api/student', studentRoutes);
app.use('/api/professor', professorRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/noise', noiseRoutes);

// Compatibility alias for old admin stats
app.get('/api/admin/stats', (req, res) => {
    req.url = '/stats';
    adminRoutes(req, res, () => { });
});

// Fix for CSS MIME type error (serving /styles.css from /css/styles.css)
app.get('/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'css', 'styles.css')));
app.get('/admin/styles.css', (req, res) => res.sendFile(path.join(__dirname, 'public', 'css', 'styles.css')));

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
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/welcome', (req, res) => res.sendFile(path.join(__dirname, 'public', 'welcome.html')));
app.get('/login', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/register', (req, res) => res.sendFile(path.join(__dirname, 'public', 'register.html')));
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/room', (req, res) => res.sendFile(path.join(__dirname, 'public', 'room.html')));

// Student pages
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'dashboard.html')));
app.get('/student/timetable', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'timetable.html')));
app.get('/student/notifications', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'notifications.html')));
app.get('/student/enrollment', (req, res) => res.sendFile(path.join(__dirname, 'public', 'student', 'enrollment.html')));

// Professor pages
app.get('/professor', (req, res) => res.sendFile(path.join(__dirname, 'public', 'professor', 'dashboard.html')));
app.get('/professor/schedule', (req, res) => res.sendFile(path.join(__dirname, 'public', 'professor', 'schedule.html')));

// Global JSON Error Handler — prevents HTML error pages
app.use((err, req, res, next) => {
    console.error('SERVER ERROR:', err);
    res.status(err.status || 500).json({
        error: err.message || 'Internal Server Error',
        path: req.path
    });
});

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
