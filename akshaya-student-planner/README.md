# 🚀 AI Student Planner

An intelligent, AI-powered web application designed to help students plan, organize, and optimize their study routines through structured scheduling, progress tracking, and personalized insights.

---

## 📖 Overview

The AI Student Planner is a productivity-focused platform that enables students to manage their academic activities efficiently. It integrates planning tools, performance tracking, and adaptive motivational feedback to enhance consistency and discipline in study habits.

---

## ✨ Key Features

### 🔐 Authentication
- Secure user registration and login  
- Password recovery functionality  
- Backend powered by Supabase Authentication  

---

### 📅 Interactive Calendar
- Monthly calendar view with navigation  
- Highlights:
  - Current day  
  - Past days (disabled/greyed)  
  - Future days (planning enabled)  
- View daily progress and activity logs  

---

### 📝 Task Management
- Create and manage tasks with:
  - Subject association  
  - Priority levels (High / Medium / Low)  
- Mark tasks as completed  
- Track time spent per task  

---

### 🎨 Subject-Based Color Coding
- Assign unique colors to subjects  
- Visual representation of study distribution  
- Integrated across tasks, sessions, and analytics  

---

### ⏱️ Study Session System
- Customizable study and break durations  
- Countdown timer interface  
- Automatic logging of session data  
- Subject-based color synchronization  

---

### 📊 Progress Tracking
- Daily and weekly study insights  
- Subject-wise time analysis  
- Data-driven performance visualization  

---

### 😊 Mood Tracking
- Record daily emotional state  
- Context-based motivational responses  
- Encourages mental well-being alongside productivity  

---

### 🔥 Habit Tracking
- Daily habit logging system  
- Streak tracking with automatic reset  
- Visual indicators using 🔥 icons  

#### 🏆 Achievement Badges
- 21-day streak → Bronze  
- 50-day streak → Silver  
- 100-day streak → Gold  

---

### 🎮 Break-Time Activities
Interactive games accessible only during break periods:
- Tic Tac Toe  
- Rock Paper Scissors  
- Hangman  
- Sudoku  

---

### 🤖 AI-Driven Personalization
- Adaptive motivational messages  
- Study behavior analysis  
- Personalized productivity suggestions based on:
  - Study patterns  
  - Mood trends  
  - Task completion  

---

## 🛠️ Tech Stack

Frontend:
- HTML  
- CSS  
- JavaScript  

Backend:
- PostgreSQL (via Supabase)  

Tools & Services:
- Supabase (Authentication + Database)  
- Git & GitHub  

---

## 📂 Project Structure

student-planner/

├── frontend/  
│   ├── dashboard.html  
│   ├── login.html  
│   ├── register.html  
│   ├── style.css  
│   ├── calendar.js  
│   ├── dashboard.js  
│   ├── study.js  
│   ├── progress.js  
│   ├── mood.js  
│   ├── habits.js  
│   ├── subjects.js  
│   ├── games.js  
│   └── supabase-client.js  

├── supabase_schema.sql  
└── README.md  

---

## ⚙️ Setup Instructions

1. Clone the Repository  
git clone https://github.com/akshy-yy/student-planner.git  
cd student-planner  

---

2. Configure Supabase  
- Create a new project in Supabase  
- Run the SQL file: supabase_schema.sql  
- Obtain your Project URL and Anon Key  

---

3. Update Configuration  
Open frontend/supabase-client.js and replace:

const SUPABASE_URL = "your-project-url";  
const SUPABASE_KEY = "your-anon-key";  

---

4. Run the Application  
- Open login.html in your browser  
OR  
- Use Live Server in VS Code  

---

## 🚧 Future Enhancements
- AI chatbot assistant  
- Advanced analytics dashboard  
- Notification system  
- Mobile app version  

---

## 🤝 Contributing
Contributions are welcome. Feel free to fork the repository and submit a pull request.

---

## 📜 License
This project is intended for educational purposes.

---

## 👩‍💻 Author
Akshaya  

---

## 🌟 Acknowledgment
This project demonstrates the integration of AI-driven insights with productivity tools to enhance student performance and consistency.
