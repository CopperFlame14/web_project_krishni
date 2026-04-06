document.addEventListener('DOMContentLoaded', async () => {
    
    const moodGrid = document.getElementById('moodGrid');
    const aiFeedbackArea = document.getElementById('aiFeedbackArea');
    const aiFeedbackText = document.getElementById('aiFeedbackText');

    const moods = [
      { id: 'happy', emoji: '😄', title: 'Happy', color: '#10b981', message: "That's wonderful! Keep riding this positive wave and let it fuel your productivity." },
      { id: 'neutral', emoji: '😐', title: 'Neutral', color: '#8b5cf6', message: "Consistency is key. A balanced, calm state is perfect for steady progress." },
      { id: 'sad', emoji: '😔', title: 'Sad', color: '#3b82f6', message: "It's completely okay to feel this way. Treat yourself with kindness today and just do what you can." },
      { id: 'stressed', emoji: '😫', title: 'Stressed', color: '#ef4444', message: "Take a deep breath. Break your tasks into smaller pieces and remember to step away for a bit." }
    ];

    let savedMoodToday = null;

    // Load Mock DB
    const getMoodsDB = () => {
       return window.localStorage.getItem('simulatedMoodsDB') 
          ? JSON.parse(window.localStorage.getItem('simulatedMoodsDB')) 
          : [];
    };

    const loadTodayMood = async () => {
      const d = new Date();
      let month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear();
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      const todayStr = [year, month, day].join('-');

      try {
        if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
           const { data: { user } } = await window.supabaseClient.auth.getUser();
           const { data } = await window.supabaseClient.from('daily_moods').select('mood').eq('user_id', user.id).eq('mood_date', todayStr).single();
           if(data) savedMoodToday = data.mood;
        } else {
           const db = getMoodsDB();
           const match = db.find(m => m.mood_date === todayStr);
           if(match) savedMoodToday = match.mood;
        }
      } catch (err) { }
      
      renderMoods();
    };

    const renderMoods = () => {
      moodGrid.innerHTML = '';
      
      moods.forEach(m => {
        const card = document.createElement('div');
        card.className = `mood-card ${savedMoodToday === m.id ? 'selected' : ''}`;
        card.innerHTML = `
          <div class="mood-emoji">${m.emoji}</div>
          <div class="mood-title" style="color: ${m.color}">${m.title}</div>
        `;

        card.addEventListener('click', () => saveMood(m));
        moodGrid.appendChild(card);
      });

      if(savedMoodToday) {
         const m = moods.find(x => x.id === savedMoodToday);
         if(m) showAI(m.message);
      }
    };

    const showAI = (message) => {
       aiFeedbackArea.style.display = 'flex';
       
       // Simple typewriter effect
       aiFeedbackText.textContent = "";
       let i = 0;
       clearInterval(window.aiTyper);
       window.aiTyper = setInterval(() => {
          if(i < message.length) {
            aiFeedbackText.textContent += message.charAt(i);
            i++;
          } else {
            clearInterval(window.aiTyper);
          }
       }, 20); // 20ms per char
    };

    const saveMood = async (moodObj) => {
      // Opt-out double saving
      if(savedMoodToday === moodObj.id) return;
      
      const d = new Date();
      let month = '' + (d.getMonth() + 1), day = '' + d.getDate(), year = d.getFullYear();
      if (month.length < 2) month = '0' + month;
      if (day.length < 2) day = '0' + day;
      const todayStr = [year, month, day].join('-');

      try {
        if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
           const { data: { user } } = await window.supabaseClient.auth.getUser();
           
           if (savedMoodToday) {
              await window.supabaseClient.from('daily_moods').update({ mood: moodObj.id }).eq('user_id', user.id).eq('mood_date', todayStr);
           } else {
              await window.supabaseClient.from('daily_moods').insert([{ user_id: user.id, mood: moodObj.id, mood_date: todayStr }]);
           }
        } else {
           const db = getMoodsDB();
           const idx = db.findIndex(m => m.mood_date === todayStr);
           if(idx > -1) {
             db[idx].mood = moodObj.id;
           } else {
             db.push({ id: Date.now().toString(), mood: moodObj.id, mood_date: todayStr });
           }
           window.localStorage.setItem('simulatedMoodsDB', JSON.stringify(db));
        }

        savedMoodToday = moodObj.id;
        renderMoods();

      } catch (err) {
        console.error("Failed to save mood", err);
      }
    };

    loadTodayMood();
});
