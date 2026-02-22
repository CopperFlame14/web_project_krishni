// ===========================
// CLASSROOM TRACKER - DASHBOARD
// ===========================

const API_BASE = '/api';
let rooms = [];
//     block: '',
//     floor: '',
//     capacity: '',
//     status: '',
//     date: ''  // Add date to filters
// };

let currentFilters = {
    search: '',
    block: '',
    floor: '',
    capacity: '',
    status: '',
    date: ''
};

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    updateClock();
    setInterval(updateClock, 1000);

    // Set default date to today
    const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
    const dateInput = document.getElementById('filterDate');
    if (dateInput) {
        dateInput.value = today;
        currentFilters.date = today;
    }

    loadRooms();
    setupFilters();

    // Auto-refresh every 60 seconds
    setInterval(loadRooms, 60000);
});

// ===========================
// CLOCK & TIME SLOT
// ===========================

function updateClock() {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
    });
    document.getElementById('currentTime').textContent = timeStr;

    // Fetch current slot
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
// ROOMS DATA
// ===========================

async function loadRooms() {
    try {
        const params = new URLSearchParams();
        if (currentFilters.search) params.append('search', currentFilters.search);
        if (currentFilters.block) params.append('block', currentFilters.block);
        if (currentFilters.floor !== '') params.append('floor', currentFilters.floor);
        if (currentFilters.capacity) params.append('capacity', currentFilters.capacity);
        if (currentFilters.status) params.append('status', currentFilters.status);
        if (currentFilters.date) params.append('date', currentFilters.date);

        // Add cache buster
        params.append('_t', Date.now());

        const response = await fetch(`${API_BASE}/classrooms?${params}`);
        const data = await response.json();

        rooms = data.rooms;
        updateStats(data.stats);
        renderRooms(rooms);
    } catch (error) {
        console.error('Failed to load rooms:', error);
        showToast('Failed to load rooms', 'error');
    }
}

function updateStats(stats) {
    document.getElementById('statTotal').textContent = stats.total;
    document.getElementById('statAvailable').textContent = stats.available;
    document.getElementById('statOccupied').textContent = stats.occupied;
    document.getElementById('statReserved').textContent = stats.reserved;
}

function renderRooms(rooms) {
    const container = document.getElementById('roomsContainer');

    if (rooms.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-state-icon">🔍</div>
                <h3>No rooms found</h3>
                <p>Try adjusting your filters</p>
            </div>
        `;
        return;
    }

    container.innerHTML = `
        <div class="rooms-grid">
            ${rooms.map(room => createRoomCard(room)).join('')}
        </div>
    `;
}

function createRoomCard(room) {
    const statusIcons = {
        available: '✓',
        occupied: '✗',
        reserved: '⏳'
    };

    const floorLabels = {
        0: 'Ground',
        1: '1st Floor',
        2: '2nd Floor'
    };

    return `
        <div class="room-card ${room.currentStatus}" onclick="viewRoom('${room.id}')">
            <div class="room-header">
                <div class="room-id">${room.id}</div>
                <span class="room-status ${room.currentStatus}">
                    ${statusIcons[room.currentStatus]} ${room.currentStatus}
                </span>
            </div>
            
            <div class="room-details">
                <span class="room-detail">🏢 Block ${room.block}</span>
                <span class="room-detail">🏠 ${floorLabels[room.floor] || `Floor ${room.floor}`}</span>
                <span class="room-detail">👥 ${room.capacity} seats</span>
            </div>
            
            <div class="room-reason">
                ${room.statusReason}
            </div>
            
            <div class="room-actions">
                <button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); showQR('${room.id}')">
                    📱 QR Code
                </button>
                <button class="btn btn-primary btn-sm" onclick="event.stopPropagation(); viewRoom('${room.id}')">
                    View Details
                </button>
            </div>
        </div>
    `;
}

// ===========================
// FILTERS
// ===========================

function setupFilters() {
    // Search with debounce
    let searchTimeout;
    document.getElementById('searchInput').addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentFilters.search = e.target.value;
            loadRooms();
        }, 300);
    });

    // Dropdown filters
    ['filterBlock', 'filterFloor', 'filterCapacity', 'filterStatus'].forEach(id => {
        document.getElementById(id).addEventListener('change', (e) => {
            const filterName = id.replace('filter', '').toLowerCase();
            currentFilters[filterName] = e.target.value;
            loadRooms();
        });
    });

    // Date filter
    document.getElementById('filterDate').addEventListener('change', (e) => {
        currentFilters.date = e.target.value;
        loadRooms();
    });
}

// ===========================
// QR CODE MODAL
// ===========================

async function showQR(roomId) {
    try {
        const response = await fetch(`${API_BASE}/qr/${roomId}`);
        const data = await response.json();

        document.getElementById('qrImage').src = data.qrCode;
        document.getElementById('qrRoomId').textContent = `Room ${roomId}`;
        document.getElementById('downloadQR').onclick = () => {
            window.open(`${API_BASE}/qr/${roomId}/download`);
        };

        document.getElementById('qrModal').classList.add('active');
    } catch (error) {
        console.error('Failed to generate QR:', error);
        showToast('Failed to generate QR code', 'error');
    }
}

function closeQRModal() {
    document.getElementById('qrModal').classList.remove('active');
}

// Close modal on overlay click
document.getElementById('qrModal').addEventListener('click', (e) => {
    if (e.target.id === 'qrModal') {
        closeQRModal();
    }
});

// ===========================
// NAVIGATION
// ===========================

function viewRoom(roomId) {
    window.location.href = `/room.html?id=${roomId}`;
}

// ===========================
// TOAST NOTIFICATIONS
// ===========================

function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;

    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

// ===========================
// KEYBOARD SHORTCUTS
// ===========================

document.addEventListener('keydown', (e) => {
    // ESC to close modal
    if (e.key === 'Escape') {
        closeQRModal();
    }

    // / to focus search
    if (e.key === '/' && document.activeElement.tagName !== 'INPUT') {
        e.preventDefault();
        document.getElementById('searchInput').focus();
    }
});
