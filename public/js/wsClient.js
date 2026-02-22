/**
 * WebSocket client — connects to /ws with JWT token
 * Handles reconnection and notification display
 */
const WS = {
    socket: null,
    reconnectDelay: 3000,
    maxReconnects: 5,
    reconnectCount: 0,
    onNotification: null, // callback set by page

    connect() {
        const token = localStorage.getItem('campus_token');
        if (!token) return;

        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${location.host}/ws?token=${token}`;

        this.socket = new WebSocket(url);

        this.socket.onopen = () => {
            console.log('🔌 WebSocket connected');
            this.reconnectCount = 0;
        };

        this.socket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                this.handleMessage(data);
            } catch (e) { }
        };

        this.socket.onclose = (event) => {
            if (event.code !== 4001 && this.reconnectCount < this.maxReconnects) {
                this.reconnectCount++;
                setTimeout(() => this.connect(), this.reconnectDelay);
            }
        };

        this.socket.onerror = () => { };
    },

    handleMessage(data) {
        // Update notification badge
        const badge = document.getElementById('notif-badge');
        if (badge) {
            const current = parseInt(badge.textContent || '0');
            badge.textContent = current + 1;
            badge.style.display = 'flex';
        }

        // Show toast notification
        this.showToast(data.title || 'Notification', data.message || '', data.type);

        // Call page-specific handler
        if (typeof this.onNotification === 'function') {
            this.onNotification(data);
        }

        // Handle pending notifications batch
        if (data.type === 'pending_notifications' && data.notifications) {
            const badge = document.getElementById('notif-badge');
            if (badge && data.notifications.length > 0) {
                badge.textContent = data.notifications.length;
                badge.style.display = 'flex';
            }
        }
    },

    showToast(title, message, type = 'info') {
        const colors = {
            class_scheduled: '#10b981',
            class_cancelled: '#ef4444',
            class_rescheduled: '#f59e0b',
            info: '#6c63ff'
        };
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed; bottom: 24px; right: 24px; z-index: 9999;
            background: #1e1b4b; border: 1px solid ${colors[type] || colors.info};
            border-left: 4px solid ${colors[type] || colors.info};
            color: #fff; padding: 1rem 1.5rem; border-radius: 12px;
            max-width: 320px; box-shadow: 0 8px 32px rgba(0,0,0,0.4);
            animation: slideIn 0.3s ease; font-family: Inter, sans-serif;
        `;
        toast.innerHTML = `<strong style="display:block;margin-bottom:4px">${title}</strong><span style="font-size:0.85rem;opacity:0.8">${message}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = 'opacity 0.5s'; setTimeout(() => toast.remove(), 500); }, 5000);
    },

    markRead(notificationId) {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'mark_read', notificationId }));
        }
    },

    markAllRead() {
        if (this.socket?.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({ type: 'mark_all_read' }));
        }
    }
};
