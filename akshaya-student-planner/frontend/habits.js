document.addEventListener('DOMContentLoaded', async () => {
  const habitsGrid      = document.getElementById('habitsGrid');
  const createHabitForm = document.getElementById('createHabitForm');
  const newHabitInput   = document.getElementById('newHabitInput');

  let habits    = [];
  let habitLogs = [];

  // ── Helpers ──────────────────────────────────────────────────────────────

  const getLocalDateStr = (d = new Date()) => {
    let m   = '' + (d.getMonth() + 1);
    let day = '' + d.getDate();
    if (m.length   < 2) m   = '0' + m;
    if (day.length < 2) day = '0' + day;
    return [d.getFullYear(), m, day].join('-');
  };
  const todayStr = getLocalDateStr();

  // Always read / write the same two localStorage keys
  const readLocal = () => {
    habits    = JSON.parse(window.localStorage.getItem('simulatedHabitsDB')    || '[]').reverse();
    habitLogs = JSON.parse(window.localStorage.getItem('simulatedHabitLogsDB') || '[]');
    // keep window cache in sync so deleteHabit filter works
    window.simulatedHabitsDB    = [...habits].reverse(); // unreversed
    window.simulatedHabitLogsDB = [...habitLogs];
  };

  const saveLocal = () => {
    window.localStorage.setItem('simulatedHabitsDB',    JSON.stringify(window.simulatedHabitsDB));
    window.localStorage.setItem('simulatedHabitLogsDB', JSON.stringify(window.simulatedHabitLogsDB));
  };

  // ── Streak Calculation ────────────────────────────────────────────────────

  const calculateStreak = (habitId) => {
    const dates = [...new Set(
      habitLogs.filter(l => l.habit_id === habitId).map(l => l.log_date)
    )].sort((a, b) => new Date(b) - new Date(a));

    if (!dates.length) return 0;

    const last  = new Date(dates[0] + 'T00:00:00');
    const today = new Date(); today.setHours(0,0,0,0);
    if (Math.round((today - last) / 86400000) > 1) return 0;

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

  // ── Render ────────────────────────────────────────────────────────────────

  const renderHabits = () => {
    habitsGrid.innerHTML = '';

    if (habits.length === 0) {
      habitsGrid.innerHTML = `
        <div class="no-data-msg" style="grid-column:1/-1; text-align:center; padding:3rem 1rem; color:var(--text-muted);">
          No habits yet. Add your first habit above! 🌱
        </div>`;
      return;
    }

    habits.forEach(h => {
      const streak       = calculateStreak(h.id);
      const isLoggedToday = habitLogs.some(l => l.habit_id === h.id && l.log_date === todayStr);

      // Milestone badges
      const badgesHtml = [];
      if (streak >= 100) badgesHtml.push(`<span class="h-badge badge-gold"><i class="ph ph-medal"></i> 100 Days</span>`);
      else if (streak >= 50) badgesHtml.push(`<span class="h-badge badge-silver"><i class="ph ph-medal"></i> 50 Days</span>`);
      else if (streak >= 21) badgesHtml.push(`<span class="h-badge badge-bronze"><i class="ph ph-medal"></i> 21 Days</span>`);

      const card = document.createElement('div');
      card.className = 'habit-card';
      card.innerHTML = `
        <div class="habit-header">
          <h3 style="flex:1; margin:0; font-size:1.1rem;">${h.title}</h3>
          <button class="delete-habit-btn" title="Delete habit"
            style="background:none;border:none;cursor:pointer;color:var(--text-muted);font-size:1.1rem;padding:0.2rem;border-radius:6px;transition:color 0.2s;">
            <i class="ph ph-trash"></i>
          </button>
        </div>

        <!-- Streak display -->
        <div style="display:flex;align-items:center;gap:1rem;padding:0.75rem 1rem;
             background:rgba(255,152,0,0.08);border:1px solid rgba(255,152,0,0.2);border-radius:14px;">
          <span style="font-size:2rem;">🔥</span>
          <div>
            <div style="font-size:1.8rem;font-weight:800;color:#ff9800;line-height:1;">${streak}</div>
            <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">day streak</div>
          </div>
        </div>

        <!-- Badges -->
        <div class="habit-badges">
          ${badgesHtml.length > 0
            ? badgesHtml.join('')
            : '<span style="color:var(--text-muted);font-size:0.8rem;">Keep going to earn badges!</span>'}
        </div>

        <!-- Footer -->
        <div class="habit-footer">
          <span style="color:${isLoggedToday ? 'var(--success)' : 'var(--text-muted)'};font-size:0.85rem;font-weight:500;">
            ${isLoggedToday ? '✅ Completed Today' : '⏳ Not logged yet'}
          </span>
          <button class="log-btn ${isLoggedToday ? 'done' : ''}" data-id="${h.id}"
            ${isLoggedToday ? 'disabled' : ''}>
            ${isLoggedToday ? '<i class="ph ph-check"></i> Logged' : 'Log Habit'}
          </button>
        </div>
      `;

      // Log button
      if (!isLoggedToday) {
        card.querySelector('.log-btn').addEventListener('click', () => logHabit(h.id));
      }

      // Delete button
      const delBtn = card.querySelector('.delete-habit-btn');
      delBtn.addEventListener('mouseenter', () => delBtn.style.color = '#ef4444');
      delBtn.addEventListener('mouseleave', () => delBtn.style.color = 'var(--text-muted)');
      delBtn.addEventListener('click', () => deleteHabit(h.id));

      habitsGrid.appendChild(card);
    });
  };

  // ── Data Actions ──────────────────────────────────────────────────────────

  const loadHabits = async () => {
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        const [hRes, lRes] = await Promise.all([
          window.supabaseClient.from('habits').select('*').eq('user_id', user.id).order('created_at', { ascending: false }),
          window.supabaseClient.from('habit_logs').select('*').eq('user_id', user.id)
        ]);
        habits    = hRes.data || [];
        habitLogs = lRes.data || [];
      } else {
        readLocal(); // always read fresh
      }
      renderHabits();
    } catch (err) {
      console.error('Failed loading habits', err);
    }
  };

  const logHabit = async (habitId) => {
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        await window.supabaseClient.from('habit_logs').insert([{
          habit_id: habitId, user_id: user.id, log_date: todayStr
        }]);
      } else {
        const currentLogs = JSON.parse(window.localStorage.getItem('simulatedHabitLogsDB') || '[]');
        currentLogs.push({
          id: Date.now().toString(), habit_id: habitId, log_date: todayStr
        });
        window.localStorage.setItem('simulatedHabitLogsDB', JSON.stringify(currentLogs));
      }
      await loadHabits();
      if (window.showToast) {
        window.showToast('Habit Logged! Keep the fire burning. 🔥', 'ph-fire');
      }
    } catch (err) {
      console.error('Failed to log habit', err);
    }
  };

  const deleteHabit = async (habitId) => {
    if (!confirm('Delete this habit and all its logs? This cannot be undone.')) return;
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        await window.supabaseClient.from('habit_logs').delete().eq('habit_id', habitId);
        await window.supabaseClient.from('habits').delete().eq('id', habitId);
      } else {
        window.simulatedHabitsDB    = window.simulatedHabitsDB.filter(h => h.id !== habitId);
        window.simulatedHabitLogsDB = window.simulatedHabitLogsDB.filter(l => l.habit_id !== habitId);
        saveLocal();
      }
      await loadHabits();
    } catch (err) {
      console.error('Failed to delete habit', err);
    }
  };

  // ── Create Habit Form ─────────────────────────────────────────────────────

  createHabitForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const title = newHabitInput.value.trim();
    if (!title) return;

    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        await window.supabaseClient.from('habits').insert([{ user_id: user.id, title }]);
      } else {
        // Read current state fresh, then push
        const current = JSON.parse(window.localStorage.getItem('simulatedHabitsDB') || '[]');
        current.push({ id: Date.now().toString(), title });
        window.localStorage.setItem('simulatedHabitsDB', JSON.stringify(current));
      }
      newHabitInput.value = '';
      await loadHabits();
    } catch (err) {
      console.error('Failed creating habit', err);
    }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  readLocal(); // initialise window cache before first render
  await loadHabits();
});
