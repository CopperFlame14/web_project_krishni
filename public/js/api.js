/**
 * Shared API client — auto-attaches JWT Authorization header
 */
const API = {
    getToken: () => localStorage.getItem('campus_token'),
    getUser: () => JSON.parse(localStorage.getItem('campus_user') || 'null'),
    getRole: () => localStorage.getItem('campus_role'),

    headers() {
        const h = { 'Content-Type': 'application/json' };
        const token = this.getToken();
        if (token) h['Authorization'] = `Bearer ${token}`;
        return h;
    },

    async get(url) {
        const res = await fetch(url, { headers: this.headers() });
        if (res.status === 401) { this.logout(); return null; }
        return res.json();
    },

    async post(url, body) {
        const res = await fetch(url, { method: 'POST', headers: this.headers(), body: JSON.stringify(body) });
        return { ok: res.ok, status: res.status, data: await res.json() };
    },

    async put(url, body) {
        const res = await fetch(url, { method: 'PUT', headers: this.headers(), body: JSON.stringify(body) });
        return { ok: res.ok, status: res.status, data: await res.json() };
    },

    async delete(url) {
        const res = await fetch(url, { method: 'DELETE', headers: this.headers() });
        return { ok: res.ok, status: res.status, data: await res.json() };
    },

    async uploadFile(url, formData) {
        const token = this.getToken();
        const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
        const res = await fetch(url, { method: 'POST', headers, body: formData });
        return { ok: res.ok, status: res.status, data: await res.json() };
    },

    logout() {
        localStorage.removeItem('campus_token');
        localStorage.removeItem('campus_user');
        localStorage.removeItem('campus_role');
        window.location.href = '/welcome';
    },

    requireAuth(requiredRole = null) {
        const token = this.getToken();
        const role = this.getRole();
        if (!token) { window.location.href = '/login'; return false; }
        if (requiredRole && role !== requiredRole) {
            alert(`Access denied. This page is for ${requiredRole}s only.`);
            window.location.href = '/welcome';
            return false;
        }
        return true;
    }
};
