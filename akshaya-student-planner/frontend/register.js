document.addEventListener('DOMContentLoaded', () => {
  const registerForm = document.getElementById('registerForm');
  const registerBtn = document.getElementById('registerBtn');
  const alertBox = document.getElementById('alertBox');

  const showMessage = (msg, isError = false) => {
    alertBox.textContent = msg;
    alertBox.className = `alert-box d-block ${isError ? 'alert-error' : 'alert-success'}`;
  };

  const hideMessage = () => {
    alertBox.classList.remove('d-block');
  };

  const setLoading = (isLoading) => {
    if (isLoading) {
      registerBtn.classList.add('loading');
      registerBtn.disabled = true;
    } else {
      registerBtn.classList.remove('loading');
      registerBtn.disabled = false;
    }
  };

  registerForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading(true);

    const formData = {
      fullName: document.getElementById('fullName').value.trim(),
      regNumber: document.getElementById('regNumber').value.trim(),
      mobile: document.getElementById('mobile').value.trim(),
      email: document.getElementById('email').value.trim(),
      password: document.getElementById('password').value,
      studyHours: parseInt(document.getElementById('studyHours').value, 10),
      studyTime: document.getElementById('studyTime').value,
      userGoal: document.getElementById('userGoal').value.trim()
    };

    try {
      if (!window.supabaseClient) throw new Error("Supabase client not initialized.");

      // 1. Sign up user via Auth
      const { data: authData, error: authError } = await window.supabaseClient.auth.signUp({
        email: formData.email,
        password: formData.password
      });

      if (authError) throw authError;

      // Ensure user was actually created
      const userId = authData.user?.id;
      if (!userId) {
        throw new Error("Failed to retrieve user ID after signup.");
      }

      // 2. Insert extended metadata into 'user_profiles' table
      const { error: dbError } = await window.supabaseClient
        .from('user_profiles')
        .insert([{
          user_id: userId,
          full_name: formData.fullName,
          registration_number: formData.regNumber,
          mobile_number: formData.mobile,
          preferred_study_hours: formData.studyHours,
          preferred_study_time: formData.studyTime,
          user_goal: formData.userGoal
        }]);

      if (dbError) throw dbError;

      showMessage('Registration successful! Redirecting to login...', false);
      
      setTimeout(() => {
        window.location.href = 'login.html';
      }, 2000);

    } catch (err) {
      if (window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        console.warn('Using placeholder credentials - Demo Mode.');
        // Save name so dashboard can greet with real name
        window.localStorage.setItem('demoUserName', formData.fullName);
        showMessage('(Demo Mode) Registration successful! Redirecting...', false);
        setTimeout(() => {
          window.location.href = 'login.html';
        }, 1500);
      } else {
        console.error('Registration error:', err);
        showMessage(err.message || 'An error occurred during registration.', true);
      }
    } finally {
      if (!window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        setLoading(false);
      }
    }
  });
});
