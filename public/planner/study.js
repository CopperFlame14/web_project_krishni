document.addEventListener('DOMContentLoaded', async () => {
  const timerSubject = document.getElementById('timerSubject');
  const studyDur = document.getElementById('studyDur');
  const breakDur = document.getElementById('breakDur');
  
  const timerDisplay = document.getElementById('timerDisplay');
  const timeDigits = document.getElementById('timeDigits');
  const timePhaseLabel = document.getElementById('timePhaseLabel');
  const timerStatusLabel = document.getElementById('timerStatusLabel');
  
  const playPauseBtn = document.getElementById('playPauseBtn');
  const playIcon = document.getElementById('playIcon');
  const stopBtn = document.getElementById('stopBtn');
  const skipBtn = document.getElementById('skipBtn');

  let subjects = [];
  let timerInterval = null;
  let timeLeft = 25 * 60; // default 25m in seconds
  
  // States: 'idle', 'study', 'break', 'paused_study', 'paused_break'
  let state = 'idle'; 
  
  let currentSubjectId = null;
  let currentSubjectColor = null;
  let initialStudyMinutes = 25;

  // Load Subjects
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

  subjects = await fetchSubjects();
  subjects.forEach(s => {
     timerSubject.innerHTML += `<option value="${s.id}">${s.name}</option>`;
  });

  // Mock DB Setup for sessions
  if (!window.simulatedSessionsDB) {
     window.simulatedSessionsDB = window.localStorage.getItem('simulatedSessionsDB') 
        ? JSON.parse(window.localStorage.getItem('simulatedSessionsDB')) 
        : [];
  }

  const logSession = async (mins) => {
    // Only log if real time passed (or just strictly trust the initial config)
    if(mins < 1) return; 

    // Current local YYYY-MM-DD
    const d = new Date();
    let month = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    let year = d.getFullYear();
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    const dateStr = [year, month, day].join('-');

    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
         const { data: { user } } = await window.supabaseClient.auth.getUser();
         await window.supabaseClient.from('study_sessions').insert([{
           user_id: user.id,
           subject_id: currentSubjectId,
           duration_minutes: mins,
           session_date: dateStr
         }]);
      } else {
         window.simulatedSessionsDB.push({
           id: Date.now().toString(),
           subject_id: currentSubjectId,
           duration_minutes: mins,
           session_date: dateStr
         });
         window.localStorage.setItem('simulatedSessionsDB', JSON.stringify(window.simulatedSessionsDB));
      }
      console.log(`Logged ${mins}m to subject ${currentSubjectId}`);
    } catch (err) {
      console.error("Failed to log session", err);
    }
  };

  const updateDisplay = () => {
    let m = Math.floor(timeLeft / 60);
    let s = timeLeft % 60;
    m = m < 10 ? '0' + m : m;
    s = s < 10 ? '0' + s : s;
    timeDigits.textContent = `${m}:${s}`;
  };

  const applyColor = (color) => {
    if(color) {
      timerDisplay.style.setProperty('--timer-color', color);
      // Generate a faint glow
      timerDisplay.style.setProperty('--timer-glow', color + '40'); 
    } else {
      timerDisplay.style.removeProperty('--timer-color');
      timerDisplay.style.removeProperty('--timer-glow');
    }
  };

  const setPhase = (newPhase) => {
    if(timerInterval) clearInterval(timerInterval);

    state = newPhase;
    window.localStorage.setItem('activeTimerPhase', state);
    playIcon.className = 'ph ph-pause'; // Active

    if (state === 'study') {
       timeLeft = parseInt(studyDur.value) * 60;
       initialStudyMinutes = parseInt(studyDur.value);
       timePhaseLabel.textContent = "Focus";
       timerStatusLabel.textContent = "You're in the zone. Keep going.";
       applyColor(currentSubjectColor || 'var(--accent-primary)');

    } else if (state === 'break') {
       timeLeft = parseInt(breakDur.value) * 60;
       timePhaseLabel.textContent = "Break";
       timerStatusLabel.textContent = "Time to relax and recharge.";
       applyColor('var(--success)'); // Green for break
    }

    updateDisplay();
    startTicker();
  };

  const startTicker = () => {
    timerInterval = setInterval(() => {
      if (timeLeft > 0) {
        timeLeft--;
        updateDisplay();
      } else {
        clearInterval(timerInterval);
        handlePhaseEnd();
      }
    }, 1000);
  };

  const handlePhaseEnd = async () => {
    // Notify
    let audio = new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YU'); // dummy tiny audio just to clear errors, a real app uses an mp3
    try { audio.play(); } catch(e) {} 

    if (state === 'study') {
      // Log session
      await logSession(initialStudyMinutes);
      // Switch to break
      if(parseInt(breakDur.value) > 0) {
         setPhase('break');
      } else {
         stopTimer();
      }
    } else if (state === 'break') {
      stopTimer();
      timePhaseLabel.textContent = "Done";
    }
  };

  const stopTimer = () => {
    if(timerInterval) clearInterval(timerInterval);
    state = 'idle';
    window.localStorage.removeItem('activeTimerPhase');
    timeLeft = parseInt(studyDur.value) * 60;
    updateDisplay();
    timePhaseLabel.textContent = "Ready";
    timerStatusLabel.textContent = "Configure your session.";
    playIcon.className = 'ph ph-play';
    applyColor(null);
  };

  // Subject Dropdown Changes => immediately change color if idle
  timerSubject.addEventListener('change', () => {
    currentSubjectId = timerSubject.value;
    const sub = subjects.find(s => s.id === currentSubjectId);
    currentSubjectColor = sub ? (sub.color_code || sub.colorCode) : null;
    if(state === 'idle') applyColor(currentSubjectColor);
  });

  // Inputs change => update idle timer
  [studyDur, breakDur].forEach(el => {
     el.addEventListener('change', () => {
       if(state === 'idle') {
          timeLeft = parseInt(studyDur.value) * 60;
          updateDisplay();
       }
     });
  });

  // Controls
  playPauseBtn.addEventListener('click', () => {
    if (state === 'idle') {
       if(!timerSubject.value) {
         alert("Please select a subject first."); return;
       }
       setPhase('study');
    } else if (state === 'study' || state === 'break') {
       clearInterval(timerInterval);
       state = state === 'study' ? 'paused_study' : 'paused_break';
       window.localStorage.setItem('activeTimerPhase', state);
       playIcon.className = 'ph ph-play';
       timerStatusLabel.textContent = "Paused.";
    } else if (state === 'paused_study' || state === 'paused_break') {
       state = state === 'paused_study' ? 'study' : 'break';
       window.localStorage.setItem('activeTimerPhase', state);
       playIcon.className = 'ph ph-pause';
       timerStatusLabel.textContent = state === 'study' ? "You're in the zone. Keep going." : "Time to relax.";
       startTicker();
    }
  });

  stopBtn.addEventListener('click', stopTimer);

  skipBtn.addEventListener('click', () => {
    if(state === 'study' || state === 'paused_study') {
       clearInterval(timerInterval);
       handlePhaseEnd(); // Logs partial? We configured to log full study config amount.
    } else if (state === 'break' || state === 'paused_break') {
       stopTimer();
    }
  });

  updateDisplay();
});
