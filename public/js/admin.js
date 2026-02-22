// ===========================
// CLASSTRACK — ADMIN PANEL
// ===========================

const API_BASE = '/api';

// ── State ──────────────────────────────────────────────────────────────
let allUsers = [];
let allCourses = [];
let isFrozen = false;

// ── Init ────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
    const ok = await checkAuth();
    if (!ok) { window.location.href = '/login'; return; }

    updateClock();
    setInterval(updateClock, 60000);
    updateUserIndicator();

    // Load data for the default (Overview) tab
    loadStats();
    loadEnrollments();

    // Wire up forms
    document.getElementById('createUserForm').addEventListener('submit', handleCreateUser);
    document.getElementById('createCourseForm').addEventListener('submit', handleCreateCourse);
    document.getElementById('reservationForm').addEventListener('submit', handleCreateReservation);
    document.getElementById('resRoom').addEventListener('change', handleRoomChange);
    document.getElementById('resSlot').addEventListener('change', handleSlotChange);
    document.getElementById('resDate').addEventListener('change', handleDateChange);

    setDefaultDate();
});

// ── Auth ────────────────────────────────────────────────────────────────
function getToken() { return localStorage.getItem('authToken'); }
function getAuthHeaders() {
    return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${getToken()}` };
}

async function checkAuth() {
    const token = getToken();
    if (!token) return false;
    try {
        const res = await fetch(`${API_BASE}/auth/verify`, { headers: { 'Authorization': `Bearer ${token}` } });
        if (!res.ok) return false;
        const data = await res.json();
        if (data.user?.role !== 'admin') {
            showToast('Access denied — admin accounts only', 'error');
            return false;
        }
        return true;
    } catch { return false; }
}

function updateUserIndicator() {
    const name = localStorage.getItem('authUser') || 'Admin';
    const el = document.getElementById('userIndicator');
    if (el) el.textContent = `👤 ${name}`;
}

async function logout() {
    try { await fetch(`${API_BASE}/auth/logout`, { method: 'POST', headers: { 'Authorization': `Bearer ${getToken()}` } }); } catch { }
    localStorage.removeItem('authToken');
    localStorage.removeItem('authUser');
    window.location.href = '/login';
}

// ── Tabs ────────────────────────────────────────────────────────────────
function switchTab(name) {
    document.querySelectorAll('.admin-tab-pane').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.admin-tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(`tab-${name}`).classList.add('active');
    document.querySelector(`[onclick="switchTab('${name}')"]`).classList.add('active');

    // Lazy-load on first visit
    if (name === 'users' && allUsers.length === 0) loadUsers();
    if (name === 'classes' && allCourses.length === 0) loadCourses();
    if (name === 'reservations') { loadRoomsDropdown(); loadTimeSlots(); loadReservations(); }
    if (name === 'overrides') loadOverrideRooms();
}

// ── Clock ────────────────────────────────────────────────────────────────
function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    fetch(`${API_BASE}/timeslots/current`).then(r => r.ok ? r.json() : null).then(data => {
        const el = document.getElementById('currentSlot');
        el.innerHTML = data?.currentSlot ? `<span>📚 ${data.currentSlot.label}</span>` : `<span>🌙 Outside class hours</span>`;
    }).catch(() => { });
}

// ── Overview ─────────────────────────────────────────────────────────────
async function loadStats() {
    try {
        const res = await fetch(`${API_BASE}/admin/stats`, { headers: getAuthHeaders() });
        const d = await res.json();
        document.getElementById('stat-professors').textContent = d.professors ?? '—';
        document.getElementById('stat-students').textContent = d.students ?? '—';
        document.getElementById('stat-courses').textContent = d.courses ?? '—';
        document.getElementById('stat-enrollments').textContent = d.enrollments ?? '—';
        document.getElementById('stat-classrooms').textContent = d.totalClassrooms ?? '—';
        isFrozen = d.isFrozen;
        updateFreezeUI();
    } catch (e) {
        console.error('Stats error:', e);
        showToast('Could not load stats — check DB migration', 'error');
    }
}

function updateFreezeUI() {
    const el = document.getElementById('freezeStatus');
    el.textContent = isFrozen ? '🔒 FROZEN' : '🔓 Open';
    el.style.color = isFrozen ? '#f87171' : '#4ade80';
}

async function toggleFreeze() {
    try {
        const res = await fetch(`${API_BASE}/admin/freeze`, {
            method: 'POST', headers: getAuthHeaders(),
            body: JSON.stringify({ status: !isFrozen })
        });
        const d = await res.json();
        isFrozen = d.isFrozen;
        updateFreezeUI();
        showToast(`Enrollment ${isFrozen ? 'frozen 🔒' : 'opened 🔓'}`, 'success');
    } catch (e) { showToast('Failed to toggle freeze', 'error'); }
}

async function loadEnrollments() {
    try {
        const res = await fetch(`${API_BASE}/admin/enrollments`, { headers: getAuthHeaders() });
        const rows = await res.json();
        const tbody = document.getElementById('enrollmentsTbody');
        if (!rows.length) {
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">No enrollments yet</td></tr>`;
            return;
        }
        tbody.innerHTML = rows.map(r => `
            <tr>
                <td>${r.student_name || r.student_id}</td>
                <td>${r.course_name} <small style="color:var(--text-muted)">(${r.course_code})</small></td>
                <td>${r.professor_name || '—'}</td>
                <td><span class="badge ${r.status === 'enrolled' ? 'badge-active' : 'badge-archived'}">${r.status}</span></td>
                <td style="color:var(--text-muted)">${r.enrolled_at ? new Date(r.enrolled_at).toLocaleDateString() : '—'}</td>
            </tr>`).join('');
    } catch (e) { console.error('Enrollment load error:', e); }
}

// ── Users ────────────────────────────────────────────────────────────────
async function loadUsers() {
    try {
        const res = await fetch(`${API_BASE}/admin/users`, { headers: getAuthHeaders() });
        allUsers = await res.json();
        renderUsers(allUsers);
    } catch (e) {
        document.getElementById('usersTbody').innerHTML =
            `<tr><td colspan="6" style="color:#f87171;text-align:center">Failed to load users</td></tr>`;
    }
}

function renderUsers(users) {
    const tbody = document.getElementById('usersTbody');
    const filtered = users.filter(u => u.role !== 'admin');
    if (!filtered.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No users found</td></tr>`;
        return;
    }
    tbody.innerHTML = filtered.map(u => `
        <tr>
            <td><strong>${u.full_name}</strong></td>
            <td style="color:var(--text-muted)">${u.username}</td>
            <td style="color:var(--text-muted)">${u.email}</td>
            <td><span class="badge badge-${u.role}">${u.role}</span></td>
            <td style="color:var(--text-muted)">${u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}</td>
            <td><button class="btn btn-danger btn-sm" onclick="deleteUser(${u.id}, '${u.full_name}')">Delete</button></td>
        </tr>`).join('');
}

function filterUsers() {
    const q = document.getElementById('userSearch').value.toLowerCase();
    renderUsers(allUsers.filter(u => u.full_name?.toLowerCase().includes(q) || u.username?.toLowerCase().includes(q) || u.email?.toLowerCase().includes(q)));
}

async function handleCreateUser(e) {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Creating...';

    const body = {
        full_name: document.getElementById('newFullName').value.trim(),
        username: document.getElementById('newUsername').value.trim(),
        email: document.getElementById('newEmail').value.trim(),
        password: document.getElementById('newPassword').value,
        role: document.getElementById('newRole').value
    };

    try {
        const res = await fetch(`${API_BASE}/admin/users`, {
            method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to create user', 'error'); return; }
        showToast(`✅ ${body.role === 'professor' ? 'Professor' : 'Student'} "${body.full_name}" created!`, 'success');
        e.target.reset();
        allUsers = []; // force reload
        loadUsers();
        // Refresh professor dropdown in Classes tab
        loadProfessorsDropdown();
    } catch { showToast('Network error', 'error'); }
    finally { btn.disabled = false; btn.textContent = '✓ Create User'; }
}

async function deleteUser(id, name) {
    if (!confirm(`Delete user "${name}"? This cannot be undone.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/users/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Delete failed', 'error'); return; }
        showToast(`Deleted "${name}"`, 'success');
        allUsers = allUsers.filter(u => u.id !== id);
        renderUsers(allUsers);
        loadProfessorsDropdown();
        loadStats();
    } catch { showToast('Network error', 'error'); }
}

// ── Classes ──────────────────────────────────────────────────────────────
async function loadCourses() {
    try {
        const res = await fetch(`${API_BASE}/admin/courses`, { headers: getAuthHeaders() });
        allCourses = await res.json();
        renderCourses(allCourses);
    } catch (e) {
        document.getElementById('coursesTbody').innerHTML =
            `<tr><td colspan="6" style="color:#f87171;text-align:center">Failed to load courses</td></tr>`;
    }
    loadProfessorsDropdown();
}

function renderCourses(courses) {
    const tbody = document.getElementById('coursesTbody');
    if (!courses.length) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">No courses yet</td></tr>`;
        return;
    }
    tbody.innerHTML = courses.map(c => `
        <tr>
            <td><strong>${c.code}</strong></td>
            <td>${c.name}</td>
            <td>${c.professor_name || '—'}</td>
            <td>${c.enrolled_count ?? 0} / ${c.max_capacity ?? '∞'}</td>
            <td><span class="badge badge-${c.status === 'active' ? 'active' : 'archived'}">${c.status ?? 'active'}</span></td>
            <td>
                <button class="btn btn-danger btn-sm" onclick="deleteCourse('${c.id}', '${c.code}')">Delete</button>
            </td>
        </tr>`).join('');
}

function filterCourses() {
    const q = document.getElementById('courseSearch').value.toLowerCase();
    renderCourses(allCourses.filter(c => c.code?.toLowerCase().includes(q) || c.name?.toLowerCase().includes(q) || c.professor_name?.toLowerCase().includes(q)));
}

async function loadProfessorsDropdown() {
    try {
        const res = await fetch(`${API_BASE}/admin/professors`, { headers: getAuthHeaders() });
        const profs = await res.json();
        const sel = document.getElementById('courseProfessor');
        sel.innerHTML = `<option value="">Select professor...</option>` +
            profs.map(p => `<option value="${p.id}">${p.full_name} (${p.email})</option>`).join('');
    } catch { }
}

async function handleCreateCourse(e) {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true; btn.textContent = 'Creating...';

    const body = {
        code: document.getElementById('courseCode').value.trim().toUpperCase(),
        name: document.getElementById('courseName').value.trim(),
        professor_id: parseInt(document.getElementById('courseProfessor').value),
        semester: parseInt(document.getElementById('courseSemester').value),
        max_capacity: parseInt(document.getElementById('courseCapacity').value) || 60
    };

    if (!body.professor_id) {
        showToast('Please select a professor', 'error');
        btn.disabled = false; btn.textContent = '✓ Create Class';
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/admin/courses`, {
            method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body)
        });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Failed to create course', 'error'); return; }
        showToast(`✅ Course "${body.code} – ${body.name}" created!`, 'success');
        e.target.reset();
        allCourses = [];
        loadCourses();
        loadStats();
    } catch { showToast('Network error', 'error'); }
    finally { btn.disabled = false; btn.textContent = '✓ Create Class'; }
}

async function deleteCourse(id, code) {
    if (!confirm(`Delete course "${code}"? This will remove all enrollments.`)) return;
    try {
        const res = await fetch(`${API_BASE}/admin/courses/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        const data = await res.json();
        if (!res.ok) { showToast(data.error || 'Delete failed', 'error'); return; }
        showToast(`Deleted course "${code}"`, 'success');
        allCourses = allCourses.filter(c => c.id !== id);
        renderCourses(allCourses);
        loadStats();
    } catch { showToast('Network error', 'error'); }
}

// ── Reservations ──────────────────────────────────────────────────────────
async function loadRoomsDropdown(rooms = null) {
    try {
        const roomList = rooms || (await (await fetch(`${API_BASE}/classrooms`)).json()).rooms;
        const sel = document.getElementById('resRoom');
        const cur = sel.value;
        sel.innerHTML = `<option value="">Select a room...</option>` +
            roomList.map(r => `<option value="${r.id}">${r.id} (Block ${r.block}, ${r.capacity} seats)</option>`).join('');
        if (roomList.find(r => r.id === cur)) sel.value = cur;
    } catch { }
}

async function loadOverrideRooms() {
    try {
        const roomList = (await (await fetch(`${API_BASE}/classrooms`)).json()).rooms;
        const sel = document.getElementById('overrideRoom');
        sel.innerHTML = `<option value="">Select a room...</option>` +
            roomList.map(r => `<option value="${r.id}">${r.id}</option>`).join('');
    } catch { }
}

async function loadTimeSlots(slots = null) {
    try {
        const slotList = slots || await (await fetch(`${API_BASE}/timeslots`)).json();
        const sel = document.getElementById('resSlot');
        const cur = sel.value;
        sel.innerHTML = `<option value="">Select a slot...</option>` +
            slotList.map(s => {
                const unavail = s.isAvailable === false;
                return `<option value="${s.id}" ${unavail ? 'disabled style="color:#64748b"' : ''}>${s.label} (${s.start_time} - ${s.end_time})${unavail ? ' (Unavailable)' : ''}</option>`;
            }).join('');
        if (slotList.find(s => s.id == cur && s.isAvailable !== false)) sel.value = cur;
    } catch { }
}

async function handleRoomChange() {
    const roomId = document.getElementById('resRoom').value;
    const date = document.getElementById('resDate').value;
    if (roomId && date) {
        try {
            const slots = await (await fetch(`${API_BASE}/classrooms/${roomId}/slots?date=${date}`)).json();
            loadTimeSlots(slots);
        } catch { }
    } else if (!roomId) loadTimeSlots();
}

async function handleSlotChange() {
    const slotId = document.getElementById('resSlot').value;
    const date = document.getElementById('resDate').value;
    if (slotId && date) {
        try {
            const data = await (await fetch(`${API_BASE}/classrooms?slot_id=${slotId}&date=${date}&status=available`)).json();
            loadRoomsDropdown(data.rooms);
        } catch { }
    } else if (!slotId) loadRoomsDropdown();
}

function handleDateChange() {
    if (document.getElementById('resRoom').value) handleRoomChange();
    else if (document.getElementById('resSlot').value) handleSlotChange();
}

function setDefaultDate() {
    const today = new Date().toISOString().split('T')[0];
    const el = document.getElementById('resDate');
    if (el) { el.value = today; el.min = today; }
}

async function loadReservations() {
    try {
        const res = await (await fetch(`${API_BASE}/reservations?upcoming=true`)).json();
        const wrap = document.getElementById('reservationsTable');
        if (!res.length) {
            wrap.innerHTML = `<div class="empty-state"><div class="empty-state-icon">📭</div><p>No upcoming reservations</p></div>`;
            return;
        }
        wrap.innerHTML = `<table class="data-table">
            <thead><tr><th>Room</th><th>Date</th><th>Time</th><th>Purpose</th><th>Booked By</th><th></th></tr></thead>
            <tbody>${res.map(r => `<tr>
                <td><strong>${r.room_id}</strong></td>
                <td>${new Date(r.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</td>
                <td>${r.start_time} - ${r.end_time}</td>
                <td>${r.purpose}</td>
                <td>${r.booked_by}</td>
                <td><button class="btn btn-danger btn-sm" onclick="cancelReservation(${r.id})">Cancel</button></td>
            </tr>`).join('')}</tbody>
        </table>`;
    } catch { }
}

async function handleCreateReservation(e) {
    e.preventDefault();
    document.getElementById('conflictAlert').classList.add('hidden');
    const data = {
        room_id: document.getElementById('resRoom').value,
        slot_id: parseInt(document.getElementById('resSlot').value),
        date: document.getElementById('resDate').value,
        purpose: document.getElementById('resPurpose').value,
        booked_by: document.getElementById('resBookedBy').value
    };
    try {
        const res = await fetch(`${API_BASE}/reservations`, { method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(data) });
        const result = await res.json();
        if (!res.ok) {
            if (res.status === 409) {
                document.getElementById('conflictMessage').textContent = result.details || result.error;
                document.getElementById('conflictAlert').classList.remove('hidden');
            } else showToast(result.error || 'Failed', 'error');
            return;
        }
        showToast('Reservation created!', 'success');
        e.target.reset(); setDefaultDate();
        loadReservations(); loadRoomsDropdown(); loadTimeSlots();
    } catch { showToast('Network error', 'error'); }
}

async function cancelReservation(id) {
    if (!confirm('Cancel this reservation?')) return;
    try {
        const res = await fetch(`${API_BASE}/reservations/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (!res.ok) throw new Error();
        showToast('Reservation cancelled', 'success');
        loadReservations();
    } catch { showToast('Failed to cancel', 'error'); }
}

// ── Room Overrides ────────────────────────────────────────────────────────
async function applyOverride() {
    const roomId = document.getElementById('overrideRoom').value;
    const status = document.getElementById('overrideStatus').value;
    const duration = parseInt(document.getElementById('overrideDuration').value);
    if (!roomId) { showToast('Select a room first', 'error'); return; }
    try {
        const res = await fetch(`${API_BASE}/classrooms/${roomId}/status`, { method: 'PUT', headers: getAuthHeaders(), body: JSON.stringify({ status, expiresIn: duration }) });
        if (!res.ok) throw new Error();
        showToast(`Override applied to ${roomId}`, 'success');
    } catch { showToast('Failed to apply override', 'error'); }
}

async function clearOverride() {
    const roomId = document.getElementById('overrideRoom').value;
    if (!roomId) { showToast('Select a room first', 'error'); return; }
    try {
        const res = await fetch(`${API_BASE}/classrooms/${roomId}/status`, { method: 'DELETE', headers: { 'Authorization': `Bearer ${getToken()}` } });
        if (!res.ok) throw new Error();
        showToast(`Override cleared for ${roomId}`, 'success');
    } catch { showToast('Failed to clear override', 'error'); }
}

// ── Toast ────────────────────────────────────────────────────────────────
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type} show`;
    setTimeout(() => toast.classList.remove('show'), 3500);
}
