// Default Chart.js Font Styling
Chart.defaults.color = '#94a3b8';
Chart.defaults.font.family = "'Outfit', sans-serif";

document.addEventListener('DOMContentLoaded', async () => {
    
    let subjects = [];
    let sessions = [];
    let tasks = [];

    const loadData = async () => {
      try {
        if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
           const { data: { user } } = await window.supabaseClient.auth.getUser();
           if(!user) return;
           
           const [subRes, sessRes, tasksRes] = await Promise.all([
             window.supabaseClient.from('subjects').select('*').eq('user_id', user.id),
             window.supabaseClient.from('study_sessions').select('*').eq('user_id', user.id),
             window.supabaseClient.from('tasks').select('*').eq('user_id', user.id)
           ]);

           subjects = subRes.data || [];
           sessions = sessRes.data || [];
           tasks = tasksRes.data || [];
        } else {
           // Mock Data Fetch
           subjects = window.localStorage.getItem('simulatedSubjectsDB') ? JSON.parse(window.localStorage.getItem('simulatedSubjectsDB')) : [];
           sessions = window.localStorage.getItem('simulatedSessionsDB') ? JSON.parse(window.localStorage.getItem('simulatedSessionsDB')) : [];
           
           // Extract tasks from shared calendar DB
           const calDb = window.localStorage.getItem('simulatedCalendarDB') ? JSON.parse(window.localStorage.getItem('simulatedCalendarDB')) : {};
           Object.keys(calDb).forEach(dateStr => {
              if(calDb[dateStr].tasks) {
                 calDb[dateStr].tasks.forEach(t => {
                   tasks.push({ ...t, task_date: dateStr });
                 });
              }
           });
        }

        renderDashboard();

      } catch (err) {
        console.error("Failed to load progress data", err);
      }
    };

    const renderDashboard = () => {
       // Filter last 7 days
       const today = new Date();
       today.setHours(0,0,0,0);
       
       const past7Days = [];
       for(let i=6; i>=0; i--) {
         const d = new Date(today);
         d.setDate(d.getDate() - i);
         past7Days.push(d);
       }

       // Aggregators
       let totalMinsWeek = 0;
       let totalTasksCompleted = 0;
       const dailyMinsArray = [0,0,0,0,0,0,0]; // mapping to past7Days

       const subjectTimeMap = {}; // subject_id -> minutes

       // Process Sessions
       sessions.forEach(s => {
          // Add to global subject distribution regardless of date, or just 7 days? Let's do all time distribution.
          const sId = s.subject_id;
          if(!subjectTimeMap[sId]) subjectTimeMap[sId] = 0;
          subjectTimeMap[sId] += s.duration_minutes;

          // Check if session falls in last 7 days
          const sessionDate = new Date(s.session_date);
          sessionDate.setHours(0,0,0,0);
          const diffDiff = Math.round((today - sessionDate) / (1000 * 60 * 60 * 24));
          
          if(diffDiff >= 0 && diffDiff <= 6) {
             const index = 6 - diffDiff;
             dailyMinsArray[index] += s.duration_minutes;
             totalMinsWeek += s.duration_minutes;
          }
       });

       // Process Tasks
       tasks.forEach(t => {
          if(t.completed) totalTasksCompleted++;
       });

       // Update Overview HTML
       const hrs = Math.floor(totalMinsWeek / 60);
       const mns = totalMinsWeek % 60;
       document.getElementById('statTotalTime').textContent = `${hrs}h ${mns}m`;
       document.getElementById('statTotalTasks').textContent = totalTasksCompleted;

       // -------------------------------------
       // 1. Daily Hours Bar Chart
       // -------------------------------------
       const dailyHoursArray = dailyMinsArray.map(m => (m / 60).toFixed(1));
       const dayLabels = past7Days.map(d => d.toLocaleDateString('en-US', { weekday: 'short' }));

       const ctxBar = document.getElementById('dailyHoursChart').getContext('2d');
       new Chart(ctxBar, {
         type: 'bar',
         data: {
           labels: dayLabels,
           datasets: [{
             label: 'Study Hours',
             data: dailyHoursArray,
             backgroundColor: 'rgba(139, 92, 246, 0.8)',
             borderRadius: 6
           }]
         },
         options: {
           responsive: true,
           maintainAspectRatio: false,
           plugins: { legend: { display: false } },
           scales: {
             y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.05)' } },
             x: { grid: { display: false } }
           }
         }
       });

       // -------------------------------------
       // 2. Subject Distribution Doughnut
       // -------------------------------------
       const ctxDnut = document.getElementById('subjectDistChart').getContext('2d');
       
       const subjectLabels = [];
       const subjectData = [];
       const subjectColors = [];

       Object.keys(subjectTimeMap).forEach(sId => {
          const sub = subjects.find(s => s.id === sId || s.id == sId); 
          if(sub) {
            subjectLabels.push(sub.name);
            subjectData.push(subjectTimeMap[sId]);
            subjectColors.push(sub.color_code || sub.colorCode || '#8b5cf6');
          }
       });

       if(subjectData.length === 0) {
          // fallback placeholder
          subjectLabels.push("No Sessions Yet");
          subjectData.push(1);
          subjectColors.push("rgba(255,255,255,0.1)");
       }

       new Chart(ctxDnut, {
         type: 'doughnut',
         data: {
           labels: subjectLabels,
           datasets: [{
             data: subjectData,
             backgroundColor: subjectColors,
             borderWidth: 0,
             hoverOffset: 4
           }]
         },
         options: {
           responsive: true,
           maintainAspectRatio: false,
           cutout: '70%',
           plugins: {
             legend: { position: 'right' }
           }
         }
       });

    };

    loadData();
});
