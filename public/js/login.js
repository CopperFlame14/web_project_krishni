// ===========================
// CLASSROOM TRACKER - LOGIN
// ===========================

const API_BASE = '/api';

// Check if already logged in
document.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('authToken');

    if (token) {
        // Verify existing token
        try {
            const response = await fetch(`${API_BASE}/auth/verify`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (response.ok) {
                // Already logged in, redirect to admin
                window.location.href = '/admin';
                return;
            }
        } catch (error) {
            // Token invalid, clear it
            localStorage.removeItem('authToken');
            localStorage.removeItem('authUser');
        }
    }

    setupLoginForm();
});

function setupLoginForm() {
    const form = document.getElementById('loginForm');
    const errorEl = document.getElementById('loginError');
    const loginBtn = document.getElementById('loginBtn');

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        // Hide previous error
        errorEl.classList.remove('show');

        // Show loading state
        loginBtn.disabled = true;
        loginBtn.textContent = 'Signing in...';

        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                // Store token and redirect
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('authUser', data.username);

                window.location.href = '/admin';
            } else {
                // Show error
                errorEl.textContent = data.error || 'Invalid username or password';
                errorEl.classList.add('show');

                // Reset button
                loginBtn.disabled = false;
                loginBtn.textContent = 'Sign In';
            }
        } catch (error) {
            console.error('Login error:', error);
            errorEl.textContent = 'Connection error. Please try again.';
            errorEl.classList.add('show');

            // Reset button
            loginBtn.disabled = false;
            loginBtn.textContent = 'Sign In';
        }
    });
}
