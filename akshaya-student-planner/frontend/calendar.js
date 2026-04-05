document.addEventListener('DOMContentLoaded', () => {
  const currentMonthYear = document.getElementById('currentMonthYear');
  const calendarDays = document.getElementById('calendarDays');
  const prevMonthBtn = document.getElementById('prevMonthBtn');
  const nextMonthBtn = document.getElementById('nextMonthBtn');
  
  const selectedDateDisplay = document.getElementById('selectedDateDisplay');
  const selectedDateRelative = document.getElementById('selectedDateRelative');
  const sidePanelContent = document.getElementById('sidePanelContent');

  let currentDate = new Date();
  let today = new Date();
  today.setHours(0,0,0,0);

  let selectedDate = null;

  // Shared key with dashboard-home.js and study.js
  const getSimDB = () => {
    const raw = window.localStorage.getItem('simulatedCalendarDB');
    return raw ? JSON.parse(raw) : {};
  };
  const setSimDB = (db) => window.localStorage.setItem('simulatedCalendarDB', JSON.stringify(db));

  // Utility format: YYYY-MM-DD
  const formatDate = (date) => {
    const d = new Date(date);
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();

    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return [year, month, day].join('-');
  };

  const strToDate = (dateStr) => {
    // Avoid timezone shift by splitting string
    const [y, m, d] = dateStr.split('-');
    return new Date(y, m - 1, d);
  };

  const fetchDayData = async (dateStr) => {
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if(!user) throw new Error("No user");

        const { data: dailyProgress } = await window.supabaseClient
          .from('daily_progress')
          .select('*')
          .eq('user_id', user.id)
          .eq('progress_date', dateStr)
          .single();

        const { data: tasks } = await window.supabaseClient
          .from('tasks')
          .select('*')
          .eq('user_id', user.id)
          .eq('task_date', dateStr);

        return {
          progress: dailyProgress || null,
          tasks: tasks || []
        };
      }
      throw new Error("Placeholder mode");
    } catch (err) {
      // Demo mode — read from shared localStorage
      const db = getSimDB();
      const dayData = db[dateStr] || { tasks: [] };
      const tasks = dayData.tasks || [];

      // --- Compute stats live ---
      const completedCount = tasks.filter(t => t.completed).length;

      // Sum study minutes from simulatedSessionsDB for this date
      const sessionsRaw = window.localStorage.getItem('simulatedSessionsDB');
      const sessions = sessionsRaw ? JSON.parse(sessionsRaw) : [];
      const timeSpent = sessions
        .filter(s => s.session_date === dateStr)
        .reduce((sum, s) => sum + (s.duration_minutes || 0), 0);

      // Build a synthetic progress object if there's anything to show
      const progress = (completedCount > 0 || timeSpent > 0)
        ? { total_tasks_completed: completedCount, total_time_spent_minutes: timeSpent }
        : null;

      return { progress, tasks };
    }
  };

  const renderCalendar = async () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    currentMonthYear.textContent = `${monthNames[month]} ${year}`;

    // Clear days
    calendarDays.innerHTML = '';

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Fill blank days at start
    for (let i = 0; i < firstDay; i++) {
       const emptyDiv = document.createElement('div');
       emptyDiv.classList.add('calendar-cell', 'empty');
       calendarDays.appendChild(emptyDiv);
    }

    // Render days
    for (let i = 1; i <= daysInMonth; i++) {
       const cell = document.createElement('div');
       cell.classList.add('calendar-cell');
       cell.textContent = i;

       const cellDate = new Date(year, month, i);
       // Reset time to start of day for comparison
       cellDate.setHours(0,0,0,0);
       const dateStr = formatDate(cellDate);

       // Check states
       if (cellDate.getTime() === today.getTime()) {
         cell.classList.add('current');
       } else if (cellDate.getTime() < today.getTime()) {
         cell.classList.add('past');
       } else {
         cell.classList.add('future');
       }

       if(selectedDate === dateStr) {
         cell.classList.add('selected');
       }

       // Look up if has data
       const { tasks } = await fetchDayData(dateStr);
       if (tasks.length > 0) {
          const dot = document.createElement('div');
          dot.classList.add('data-dot');
          cell.appendChild(dot);
       }

       cell.addEventListener('click', () => {
          handleDayClick(dateStr, cellDate);
       });

       calendarDays.appendChild(cell);
    }
  };

  const handleDayClick = async (dateStr, dateObj) => {
    selectedDate = dateStr;
    renderCalendar(); // Re-render to show selection highlight
    
    // Format Display
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    selectedDateDisplay.textContent = dateObj.toLocaleDateString('en-US', options);

    if (dateObj.getTime() === today.getTime()) {
      selectedDateRelative.textContent = "Today";
    } else if (dateObj.getTime() < today.getTime()) {
      selectedDateRelative.textContent = "Past";
    } else {
      selectedDateRelative.textContent = "Future";
    }

    await loadSidePanel(dateStr, dateObj);
  };

  const fetchSubjects = async () => {
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if(!user) return [];
        const { data } = await window.supabaseClient.from('subjects').select('*').eq('user_id', user.id);
        return data || [];
      }
      return window.localStorage.getItem('simulatedSubjectsDB') ? JSON.parse(window.localStorage.getItem('simulatedSubjectsDB')) : [];
    } catch(err) {
      return window.localStorage.getItem('simulatedSubjectsDB') ? JSON.parse(window.localStorage.getItem('simulatedSubjectsDB')) : [];
    }
  };

  const loadSidePanel = async (dateStr, dateObj) => {
    sidePanelContent.innerHTML = `<div class="loader" style="display:block; margin: 2rem auto; border-top-color: var(--accent-primary);"></div>`;
    
    // Fetch data and subjects in parallel
    const [{ progress, tasks }, subjectsList] = await Promise.all([
      fetchDayData(dateStr),
      fetchSubjects()
    ]);
    
    const isFuture = dateObj.getTime() > today.getTime();

    let html = '';

    if (!progress && tasks.length === 0) {
       html += `
         <div class="no-data-msg">
            ${isFuture ? "No tasks planned yet." : "No Progress"}
         </div>
       `;
    } else {
       const totalTasks = progress ? progress.total_tasks_completed : 0;
       const timeSpent = progress ? progress.total_time_spent_minutes : 0;
       
       html += `
         <div class="progress-view">
            <div class="stat">
              <span><i class="ph ph-check-circle"></i> Tasks Completed</span>
              <span>${totalTasks}</span>
            </div>
            <div class="stat">
              <span><i class="ph ph-clock"></i> Time Spent</span>
              <span>${timeSpent}m</span>
            </div>
         </div>
       `;

       if(tasks.length > 0) {
         html += `<ul class="task-list" id="calendarTaskList">`;
         tasks.forEach((t, i) => {
           // Find related subject if any
           const subj = t.subject_id ? subjectsList.find(s => s.id === t.subject_id) : null;
           const pill = subj ? `<span class="subject-pill" style="border-color: ${subj.color_code || subj.colorCode}; color: ${subj.color_code || subj.colorCode}"><span class="list-subject-badge" style="background:${subj.color_code || subj.colorCode}"></span>${subj.name}</span>` : '';

           html += `
             <li class="task-item ${t.completed ? 'completed' : ''}" style="flex-wrap: wrap; cursor: pointer;" data-index="${i}" data-id="${t.id || ''}">
                <div style="display:flex; align-items:center; gap:0.75rem; width:100%; pointer-events:none;">
                  <i class="ph ${t.completed ? 'ph-check-square' : 'ph-square'}"></i>
                  <span style="flex:1;">${t.title}</span>
                  ${pill}
                </div>
             </li>
           `;
         });
         html += `</ul>`;
       }
    }

    if (dateObj.getTime() >= today.getTime()) {
      let subjectOptions = `<option value="">No Subject</option>`;
      subjectsList.forEach(s => {
         subjectOptions += `<option value="${s.id}">${s.name}</option>`;
      });

      html += `
        <div class="add-task-form">
           <h4>Plan a Task</h4>
           <form id="planTaskForm">
              <input type="text" id="newTaskInput" placeholder="What do you need to study?" required style="margin-bottom: 0.75rem;">
              <select id="newTaskSubject" style="margin-bottom: 0.75rem;">
                 ${subjectOptions}
              </select>
              <button type="submit" class="btn btn-primary">Add Task</button>
           </form>
        </div>
      `;
    }

    sidePanelContent.innerHTML = html;

    const taskListUl = document.getElementById('calendarTaskList');
    if (taskListUl) {
      taskListUl.addEventListener('click', async (e) => {
         const li = e.target.closest('.task-item');
         if(!li) return;
         
         const idx = li.getAttribute('data-index');
         const taskId = li.getAttribute('data-id');
         
         try {
           let isCompletedNow = false;

           if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
             // Real DB Logic
             const { data: taskData } = await window.supabaseClient.from('tasks').select('completed').eq('id', taskId).single();
             if(!taskData) return;
             isCompletedNow = !taskData.completed;
             await window.supabaseClient.from('tasks').update({ completed: isCompletedNow }).eq('id', taskId);
           } else {
             // Mock DB — use shared localStorage
             const db = getSimDB();
             isCompletedNow = !db[dateStr].tasks[idx].completed;
             db[dateStr].tasks[idx].completed = isCompletedNow;
             setSimDB(db);
           }

           // Toggle Feedback AI
           if(isCompletedNow) {
             showToast("Great job! One step closer to your goals.", "ph-stars");
           } else {
             showToast("No worries, keep pushing!", "ph-hands-clapping");
           }

           await loadSidePanel(dateStr, dateObj); // Refresh
         } catch(err) {
           console.error("Failed to toggle task", err);
         }
      });
    }

    const form = document.getElementById('planTaskForm');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const input = document.getElementById('newTaskInput');
        const subjectDrop = document.getElementById('newTaskSubject');
        const title = input.value.trim();
        const subject_id = subjectDrop.value;

        if(!title) return;

        try {
          if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
             const { data: { user } } = await window.supabaseClient.auth.getUser();
             await window.supabaseClient.from('tasks').insert([{
               user_id: user.id,
               subject_id: subject_id || null,
               task_date: dateStr,
               title: title,
               completed: false
             }]);
          } else {
             const db = getSimDB();
             if(!db[dateStr]) db[dateStr] = { tasks: [] };
             db[dateStr].tasks.push({ title, subject_id: subject_id || null, completed: false, time_spent_minutes: 0 });
             setSimDB(db);
          }
          await loadSidePanel(dateStr, dateObj);
          renderCalendar();
        } catch(err) {
          console.error("Failed to save task", err);
        }
      });
    }
  };

  prevMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() - 1);
    renderCalendar();
  });

  nextMonthBtn.addEventListener('click', () => {
    currentDate.setMonth(currentDate.getMonth() + 1);
    renderCalendar();
  });

  // Init
  renderCalendar();
});

// AI Feedback Toast API
window.showToast = (message, icon = "ph-info") => {
  let container = document.getElementById('toastContainer');
  if(!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<i class="ph ${icon}"></i> <span>${message}</span>`;
  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Remove after 4 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400); // 400ms transition buffer
  }, 4000);
};
