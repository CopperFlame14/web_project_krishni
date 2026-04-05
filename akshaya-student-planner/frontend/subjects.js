document.addEventListener('DOMContentLoaded', () => {
  const createSubjectForm = document.getElementById('createSubjectForm');
  const subjectNameInput = document.getElementById('subjectName');
  const subjectColorInput = document.getElementById('subjectColor');
  const colorHexDisplay = document.getElementById('colorHexDisplay');
  const subjectsList = document.getElementById('subjectsList');

  // Update hex display when color changes
  subjectColorInput.addEventListener('input', (e) => {
    colorHexDisplay.textContent = e.target.value;
  });

  // Mock DB state for subjects
  if (!window.simulatedSubjectsDB) {
     window.simulatedSubjectsDB = window.localStorage.getItem('simulatedSubjectsDB') 
        ? JSON.parse(window.localStorage.getItem('simulatedSubjectsDB')) 
        : [];
  }

  const saveToLocal = (data) => {
     window.localStorage.setItem('simulatedSubjectsDB', JSON.stringify(data));
  };

  const loadSubjects = async () => {
    subjectsList.innerHTML = `<div class="loader" style="display:block; margin: 2rem auto; border-top-color: var(--accent-primary);"></div>`;

    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        if(!user) throw new Error("No User");

        const { data: subjects, error } = await window.supabaseClient
          .from('subjects')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if(error) throw error;
        renderSubjects(subjects);

      } else {
        // Fallback to local storage for demo mode
        setTimeout(() => {
          renderSubjects(window.simulatedSubjectsDB);
        }, 300);
      }
    } catch (err) {
       console.error(err);
       subjectsList.innerHTML = `<div class="no-data-msg">Failed to load subjects.</div>`;
    }
  };

  const renderSubjects = (subjects) => {
    if(!subjects || subjects.length === 0) {
      subjectsList.innerHTML = `<div style="grid-column: 1 / -1;" class="no-data-msg">You haven't created any subjects yet.</div>`;
      return;
    }

    subjectsList.innerHTML = '';
    subjects.forEach(sub => {
      const card = document.createElement('div');
      card.className = 'subject-card';
      card.style.setProperty('--color-code', sub.color_code || sub.colorCode); // Compatibility check

      card.innerHTML = `
        <div class="subject-info">
          <h3>${sub.name}</h3>
          <p>${sub.color_code || sub.colorCode}</p>
        </div>
        <div class="subject-actions">
          <button title="Delete (Demo Only)" onclick="alert('Delete functionality isolated for this demo.')">
             <i class="ph ph-trash"></i>
          </button>
        </div>
      `;
      subjectsList.appendChild(card);
    });
  };

  createSubjectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = subjectNameInput.value.trim();
    const colorCode = subjectColorInput.value;

    if(!name) return;

    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        const { error } = await window.supabaseClient
          .from('subjects')
          .insert([{
             user_id: user.id,
             name: name,
             color_code: colorCode
          }]);
        
        if (error) throw error;
      } else {
        // Demo mode logic
        window.simulatedSubjectsDB.unshift({
           id: Date.now().toString(),
           name,
           color_code: colorCode
        });
        saveToLocal(window.simulatedSubjectsDB);
      }

      subjectNameInput.value = '';
      await loadSubjects();

    } catch (err) {
      console.error("Failed to create subject", err);
      alert("Failed to save subject.");
    }
  });

  // Init
  loadSubjects();
});
