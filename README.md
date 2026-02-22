# 🏫 Classroom Availability Tracker


> A real-time, intelligent classroom management system built for smart campuses.
## 🔑 Demo Credentials

To access the Admin Panel during the demo:

- **Login URL**: `http://localhost:3000/admin`
- **Username**: `admin`
- **Password**: `admin123`
![Dashboard Preview](public/images/dashboard-preview.png)

## 🚀 Key Features

### 🌟 Smart Dashboard
- **Real-time Status**: Instantly see which rooms are Available, Occupied, or Reserved.
- **Dynamic Filtering**: Bi-directional filtering logic (Select a Room → See Valid Slots | Select a Slot → See Available Rooms).
- **Calendar Integration**: Check room availability for future dates.
- **Premium UI**: Clean, professional light theme designed for clarity and usability.

### 🔐 Admin Portal
- **Secure Authentication**: Protected admin login for managing reservations.
- **Conflict Detection**: Prevents double-booking logic automatically.
- **Status Override**: Manually override room status (e.g., for ad-hoc maintenance).

### ⚡ Technical Highlights
- **Backend Service**: Robust Node.js/Express architecture.
- **Database**: SQLite with `sql.js` for fast, server-side data management.
- **QR Code System**: Generate unique QR codes for physical room signage.



## 🛠️ Quick Start

**Prerequisites**: Node.js installed.

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Initialize Database with Demo Data**
   *(Includes a special "Evening Slot" (Period 9) for late-day demos)*
   ```bash
   npm run seed
   ```

3. **Start the Server**
   ```bash
   npm start
   ```

4. **Access the Application**
   - Dashboard: [http://localhost:3000](http://localhost:3000)
   - Admin Login: [http://localhost:3000/login](http://localhost:3000/login)

## 🏗️ tech Stack

- **Backend**: Node.js, Express.js
- **Database**: SQLite
- **Frontend**: Vanilla JS (ES6+), CSS3 Variables
- **Design System**: Custom "Clean Professional" Theme

---

*Built for the 2026 Campus Innovation Hackathon.*
