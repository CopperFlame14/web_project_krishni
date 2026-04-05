document.addEventListener('DOMContentLoaded', () => {

  // ── Date Label ──────────────────────────────────────────────────────────
  const dateLabel = document.getElementById('dateLabel');
  if (dateLabel) {
    const now = new Date();
    const opts = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    dateLabel.textContent = now.toLocaleDateString(undefined, opts);
  }

  // ── Helper: today's YYYY-MM-DD ─────────────────────────────────────────
  const todayStr = (() => {
    const d = new Date();
    let m = '' + (d.getMonth() + 1), day = '' + d.getDate();
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return [d.getFullYear(), m, day].join('-');
  })();

  // ── Today's Mood ────────────────────────────────────────────────────────
  const moodEmojis  = { happy:'😄', neutral:'😐', sad:'😔', stressed:'😫' };
  const moodLabels  = { happy:'Happy', neutral:'Neutral', sad:'Sad', stressed:'Stressed' };

  const moodDisplay = document.getElementById('moodDisplay');
  const moodLabel   = document.getElementById('moodLabel');

  const moodsRaw = window.localStorage.getItem('simulatedMoodsDB');
  if (moodsRaw) {
    const moods = JSON.parse(moodsRaw);
    const todayMood = moods.find(m => m.mood_date === todayStr);
    if (todayMood && moodEmojis[todayMood.mood]) {
      moodDisplay.textContent = moodEmojis[todayMood.mood];
      moodLabel.textContent   = moodLabels[todayMood.mood] || todayMood.mood;
    }
  }

  // ── Habits List on Dashboard ────────────────────────────────────────────
  const dashHabitsList = document.getElementById('dashHabitsList');

  const calcStreak = (habitId, habits, logs) => {
    const dates = [...new Set(
      logs.filter(l => l.habit_id === habitId).map(l => l.log_date)
    )].sort((a, b) => new Date(b) - new Date(a));

    if (!dates.length) return 0;
    const last  = new Date(dates[0] + 'T00:00:00');
    const now   = new Date(); now.setHours(0,0,0,0);
    if (Math.round((now - last) / 86400000) > 1) return 0;

    let streak = 0;
    let expected = new Date(dates[0] + 'T00:00:00');
    for (const d of dates) {
      if (new Date(d + 'T00:00:00').getTime() === expected.getTime()) {
        streak++;
        expected.setDate(expected.getDate() - 1);
      } else break;
    }
    return streak;
  };

  const renderDashHabits = () => {
    const habitsRaw = window.localStorage.getItem('simulatedHabitsDB');
    const logsRaw   = window.localStorage.getItem('simulatedHabitLogsDB');
    const habits = habitsRaw ? JSON.parse(habitsRaw) : [];
    const logs   = logsRaw  ? JSON.parse(logsRaw)   : [];

    if (!dashHabitsList) return;

    if (habits.length === 0) {
      dashHabitsList.innerHTML = `<p style="color:var(--text-muted);">No habits yet. <a href="habits.html" style="color:var(--accent-primary);">Add your first habit →</a></p>`;
      return;
    }

    dashHabitsList.innerHTML = '';
    const grid = document.createElement('div');
    grid.style.cssText = 'display:grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap:0.75rem;';

    habits.forEach(h => {
      const streak      = calcStreak(h.id, habits, logs);
      const loggedToday = logs.some(l => l.habit_id === h.id && l.log_date === todayStr);

      // Badge
      let badge = '';
      if (streak >= 100)      badge = '<span style="background:#FFD70020;color:#FFD700;border:1px solid #FFD70050;padding:0.1rem 0.4rem;border-radius:12px;font-size:0.7rem;font-weight:600;">🥇 Gold</span>';
      else if (streak >= 50)  badge = '<span style="background:#C0C0C020;color:#C0C0C0;border:1px solid #C0C0C050;padding:0.1rem 0.4rem;border-radius:12px;font-size:0.7rem;font-weight:600;">🥈 Silver</span>';
      else if (streak >= 21)  badge = '<span style="background:#CD7F3220;color:#CD7F32;border:1px solid #CD7F3250;padding:0.1rem 0.4rem;border-radius:12px;font-size:0.7rem;font-weight:600;">🥉 Bronze</span>';

      const card = document.createElement('div');
      card.style.cssText = 'display:flex;flex-direction:column;gap:0.5rem;padding:0.85rem 1rem;background:var(--card-bg);border:1px solid var(--card-border);border-radius:14px;transition:0.2s;';

      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;">
          <span style="font-weight:600;font-size:0.95rem;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${h.title}">${h.title}</span>
          <span style="font-size:1rem;font-weight:700;color:#ff9800;white-space:nowrap;">${streak} 🔥</span>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:0.5rem;flex-wrap:wrap;">
          <div style="display:flex;gap:0.3rem;align-items:center;flex-wrap:wrap;">
            ${badge}
            <span style="color:var(--text-muted);font-size:0.78rem;">${loggedToday ? '✅ Done today' : '⏳ Pending'}</span>
          </div>
          <button class="dash-log-btn" data-id="${h.id}"
            style="background:${loggedToday ? 'var(--success)' : 'var(--accent-primary)'}; color:#fff; border:none; border-radius:8px; padding:0.25rem 0.7rem; font-size:0.8rem; cursor:${loggedToday ? 'default' : 'pointer'}; opacity:${loggedToday ? '0.7' : '1'}; white-space:nowrap;"
            ${loggedToday ? 'disabled' : ''}>
            ${loggedToday ? 'Logged ✓' : 'Log'}
          </button>
        </div>
      `;

      if (!loggedToday) {
        const btn = card.querySelector('.dash-log-btn');
        btn.addEventListener('click', () => {
          const currentLogs = JSON.parse(window.localStorage.getItem('simulatedHabitLogsDB') || '[]');
          currentLogs.push({ id: Date.now().toString(), habit_id: h.id, log_date: todayStr });
          window.localStorage.setItem('simulatedHabitLogsDB', JSON.stringify(currentLogs));
          if (window.showToast) window.showToast('Habit Logged! Keep the fire burning. 🔥', 'ph-fire');
          renderDashHabits(); // re-render
        });
      }

      grid.appendChild(card);
    });

    dashHabitsList.appendChild(grid);
  };

  renderDashHabits();

  // ── Load Subjects into dropdown ─────────────────────────────────────────
  let subjects = [];
  const subjectDrop = document.getElementById('quickTaskSubject');

  const loadSubjects = () => {
    const raw = window.localStorage.getItem('simulatedSubjectsDB');
    if (raw) {
      subjects = JSON.parse(raw);
      subjects.forEach(s => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = s.name;
        subjectDrop.appendChild(opt);
      });
    }
  };
  loadSubjects();

  // ── Importance config ──────────────────────────────────────────────────
  const importanceMeta = {
    high:   { label: 'High',   color: '#ef4444', dot: '🔴' },
    medium: { label: 'Medium', color: '#f59e0b', dot: '🟡' },
    low:    { label: 'Low',    color: '#10b981', dot: '🟢' },
  };

  // ── Today's To-Do List ──────────────────────────────────────────────────
  let simDB = (() => {
    const raw = window.localStorage.getItem('simulatedCalendarDB');
    return raw ? JSON.parse(raw) : {};
  })();

  const todoList  = document.getElementById('dashTodoList');
  const quickForm = document.getElementById('quickTaskForm');
  const quickInput = document.getElementById('quickTaskInput');

  const renderTodos = () => {
    const tasks = simDB[todayStr]?.tasks || [];
    todoList.innerHTML = '';

    if (tasks.length === 0) {
      todoList.innerHTML = `<li style="color:var(--text-muted); padding:0.5rem 0;">No tasks yet — add one above!</li>`;
      return;
    }

    // Sort: incomplete + high-importance first
    const importanceOrder = { high: 0, medium: 1, low: 2 };
    const sorted = tasks.map((t, i) => ({ ...t, _idx: i }))
      .sort((a, b) => {
        if (a.completed !== b.completed) return a.completed ? 1 : -1;
        return (importanceOrder[a.importance] ?? 1) - (importanceOrder[b.importance] ?? 1);
      });

    sorted.forEach((t) => {
      const i = t._idx;
      const subj = subjects.find(s => s.id === t.subject_id);
      const imp  = importanceMeta[t.importance] || importanceMeta.medium;

      const subjBadge = subj
        ? `<span style="background:${subj.color_code || subj.colorCode}20; color:${subj.color_code || subj.colorCode}; border:1px solid ${subj.color_code || subj.colorCode}50; padding:0.1rem 0.55rem; border-radius:20px; font-size:0.75rem; font-weight:600; white-space:nowrap;">${subj.name}</span>`
        : '';

      const impBadge = `<span style="background:${imp.color}15; color:${imp.color}; border:1px solid ${imp.color}40; padding:0.1rem 0.55rem; border-radius:20px; font-size:0.75rem; font-weight:600; white-space:nowrap;">${imp.dot} ${imp.label}</span>`;

      const li = document.createElement('li');
      li.style.cssText = 'display:flex; align-items:center; gap:0.75rem; padding:0.65rem 1rem; background:var(--card-bg); border:1px solid var(--card-border); border-radius:12px; transition:0.2s; flex-wrap:wrap;';

      li.innerHTML = `
        <i class="ph ${t.completed ? 'ph-check-square' : 'ph-square'}"
           style="font-size:1.3rem; color:${t.completed ? 'var(--success)' : 'var(--text-muted)'}; flex-shrink:0; cursor:pointer;"
           title="${t.completed ? 'Mark incomplete' : 'Mark complete'}"></i>
        <span style="flex:1; cursor:pointer; ${t.completed ? 'text-decoration:line-through; color:var(--text-muted);' : ''}">${t.title}</span>
        <div style="display:flex; gap:0.4rem; align-items:center; flex-wrap:wrap;">
          ${subjBadge}
          ${impBadge}
          <button class="del-task-btn" title="Delete task"
            style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:0.2rem 0.3rem;border-radius:6px;transition:color 0.2s;flex-shrink:0;">
            <i class="ph ph-trash"></i>
          </button>
        </div>
      `;

      // Toggle complete on clicking the checkbox icon or the task text
      const checkIcon = li.querySelector('i.ph');
      const titleSpan = li.querySelector('span');
      const toggleComplete = () => {
        simDB[todayStr].tasks[i].completed = !simDB[todayStr].tasks[i].completed;
        window.localStorage.setItem('simulatedCalendarDB', JSON.stringify(simDB));
        if (window.showToast) {
          window.showToast(
            simDB[todayStr].tasks[i].completed ? "Great job! One step closer to your goals." : "No worries, keep pushing!",
            simDB[todayStr].tasks[i].completed ? "ph-stars" : "ph-hands-clapping"
          );
        }
        renderTodos();
      };
      checkIcon.addEventListener('click', toggleComplete);
      titleSpan.addEventListener('click', toggleComplete);

      // Delete button
      const delBtn = li.querySelector('.del-task-btn');
      delBtn.addEventListener('mouseenter', () => delBtn.style.color = '#ef4444');
      delBtn.addEventListener('mouseleave', () => delBtn.style.color = 'var(--text-muted)');
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        simDB[todayStr].tasks.splice(i, 1);
        window.localStorage.setItem('simulatedCalendarDB', JSON.stringify(simDB));
        renderTodos();
      });

      todoList.appendChild(li);
    });
  };

  // Quick-add with subject + importance
  if (quickForm) {
    quickForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const title      = quickInput.value.trim();
      const subject_id = document.getElementById('quickTaskSubject').value || null;
      const importance = document.getElementById('quickTaskImportance').value || 'medium';

      if (!title) return;

      if (!simDB[todayStr]) simDB[todayStr] = { progress: null, tasks: [] };
      simDB[todayStr].tasks.push({
        title,
        subject_id,
        importance,
        completed: false,
        time_spent_minutes: 0
      });
      window.localStorage.setItem('simulatedCalendarDB', JSON.stringify(simDB));

      quickInput.value = '';
      document.getElementById('quickTaskSubject').value    = '';
      document.getElementById('quickTaskImportance').value = 'medium';
      renderTodos();
    });
  }

  renderTodos();

  // Add responsive grid fallback for small screens
  const form = document.getElementById('quickTaskForm');
  if (form && window.innerWidth < 700) {
    form.style.gridTemplateColumns = '1fr 1fr';
    const btn = form.querySelector('button[type=submit]');
    if (btn) btn.style.gridColumn = '1 / -1';
  }
});
