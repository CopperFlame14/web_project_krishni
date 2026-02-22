// ===========================
// CLASSROOM TRACKER - ROOM PAGE
// ===========================

const API_BASE = '/api';
let roomId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Get room ID from URL
    const params = new URLSearchParams(window.location.search);
    roomId = params.get('id');

    if (!roomId) {
        showError();
        return;
    }

    updateClock();
    setInterval(updateClock, 1000);
    loadRoomData();
    loadQRCode();

    // Auto-refresh every 30 seconds
    setInterval(loadRoomData, 30000);
});

// ===========================
// CLOCK
// ===========================

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;

    fetch(`${API_BASE}/timeslots/current`)
        .then(res => res.json())
        .then(data => {
            const slotEl = document.getElementById('currentSlot');
            if (data.currentSlot) {
                slotEl.innerHTML = `<span>📚 ${data.currentSlot.label}</span>`;
            } else {
                slotEl.innerHTML = `<span>🌙 Outside class hours</span>`;
            }
        })
        .catch(console.error);
}

// ===========================
// LOAD ROOM DATA
// ===========================

async function loadRoomData() {
    try {
        const response = await fetch(`${API_BASE}/classrooms/${roomId}`);

        if (!response.ok) {
            showError();
            return;
        }

        const room = await response.json();
        displayRoom(room);
        displaySchedule(room);

    } catch (error) {
        console.error('Failed to load room:', error);
        showError();
    }
}

function displayRoom(room) {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('roomContent').classList.remove('hidden');

    // Update page title
    document.title = `Room ${room.id} - ClassTrack`;

    // Hero section
    const hero = document.getElementById('roomHero');
    hero.className = `room-hero ${room.currentStatus}`;

    document.getElementById('roomId').textContent = room.id;

    const statusIcons = {
        available: '✓ Available',
        occupied: '✗ Occupied',
        reserved: '⏳ Reserved'
    };

    const statusEl = document.getElementById('roomStatus');
    statusEl.textContent = statusIcons[room.currentStatus];
    statusEl.className = `room-hero-status ${room.currentStatus}`;

    document.getElementById('roomReason').textContent = room.statusReason;

    // Details
    const floorLabels = { 0: 'Ground Floor', 1: '1st Floor', 2: '2nd Floor' };
    document.getElementById('roomBlock').textContent = `Block ${room.block}`;
    document.getElementById('roomFloor').textContent = floorLabels[room.floor] || `Floor ${room.floor}`;
    document.getElementById('roomCapacity').textContent = `${room.capacity} seats`;

    // Amenities
    const amenityIcons = {
        projector: '📽️ Projector',
        ac: '❄️ AC',
        whiteboard: '📝 Whiteboard',
        smart_board: '🖥️ Smart Board',
        lab_equipment: '🔬 Lab Equipment'
    };

    const amenitiesHtml = room.amenities.map(a =>
        `<span style="padding: 0.25rem 0.75rem; background: var(--accent-primary); background: rgba(99, 102, 241, 0.2); border-radius: var(--radius-full); font-size: 0.8rem;">${amenityIcons[a] || a}</span>`
    ).join('');

    document.getElementById('roomAmenities').innerHTML = amenitiesHtml;
}

function displaySchedule(room) {
    const scheduleContainer = document.getElementById('todaySchedule');

    // Combine timetable and reservations
    const allSlots = [];

    // Fetch all time slots for reference
    fetch(`${API_BASE}/timeslots`)
        .then(res => res.json())
        .then(slots => {
            const currentSlotId = room.currentSlot?.id;

            slots.forEach(slot => {
                const timetableEntry = room.todaySchedule.find(t => t.slot_id === slot.id);
                const reservation = room.todayReservations.find(r => r.slot_id === slot.id);

                const isCurrent = slot.id === currentSlotId;
                let content = '';
                let statusClass = '';

                if (reservation) {
                    content = `
                        <div class="schedule-content">
                            <div class="schedule-subject">📌 ${reservation.purpose}</div>
                            <div class="schedule-faculty">Booked by: ${reservation.booked_by}</div>
                        </div>
                        <span class="room-status reserved">Reserved</span>
                    `;
                    statusClass = 'reserved';
                } else if (timetableEntry) {
                    content = `
                        <div class="schedule-content">
                            <div class="schedule-subject">📚 ${timetableEntry.subject}</div>
                            <div class="schedule-faculty">${timetableEntry.faculty}</div>
                        </div>
                        <span class="room-status occupied">Class</span>
                    `;
                    statusClass = 'occupied';
                } else {
                    content = `
                        <div class="schedule-content">
                            <div class="schedule-subject" style="color: var(--text-secondary);">No scheduled class</div>
                        </div>
                        <span class="room-status available">Free</span>
                    `;
                    statusClass = 'available';
                }

                allSlots.push(`
                    <div class="schedule-item ${isCurrent ? 'current' : ''}">
                        <div class="schedule-time">
                            ${slot.start_time}<br>
                            <span style="color: var(--text-muted); font-size: 0.75rem;">${slot.end_time}</span>
                        </div>
                        ${content}
                    </div>
                `);
            });

            scheduleContainer.innerHTML = allSlots.join('');
        })
        .catch(err => {
            console.error('Failed to load schedule:', err);
            scheduleContainer.innerHTML = '<p class="text-muted">Failed to load schedule</p>';
        });
}

// ===========================
// QR CODE
// ===========================

async function loadQRCode() {
    try {
        const response = await fetch(`${API_BASE}/qr/${roomId}`);
        const data = await response.json();

        document.getElementById('qrImage').src = data.qrCode;
        document.getElementById('downloadQR').onclick = () => {
            window.open(`${API_BASE}/qr/${roomId}/download`);
        };
    } catch (error) {
        console.error('Failed to load QR code:', error);
    }
}

// ===========================
// ERROR STATE
// ===========================

function showError() {
    document.getElementById('loadingState').classList.add('hidden');
    document.getElementById('roomContent').classList.add('hidden');
    document.getElementById('errorState').classList.remove('hidden');
}
