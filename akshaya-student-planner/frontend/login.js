document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('loginForm');
  const loginBtn = document.getElementById('loginBtn');
  const forgotPwdBtn = document.getElementById('forgotPwdBtn');
  const alertBox = document.getElementById('alertBox');
  const emailInput = document.getElementById('email');
  const passwordInput = document.getElementById('password');

  // Utility to show messages
  const showMessage = (msg, isError = false) => {
    alertBox.textContent = msg;
    alertBox.className = `alert-box d-block ${isError ? 'alert-error' : 'alert-success'}`;
  };

  const hideMessage = () => {
    alertBox.classList.remove('d-block');
  };

  const setLoading = (isLoading) => {
    if (isLoading) {
      loginBtn.classList.add('loading');
      loginBtn.disabled = true;
    } else {
      loginBtn.classList.remove('loading');
      loginBtn.disabled = false;
    }
  };

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    hideMessage();
    setLoading(true);

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (!email || !password) {
      showMessage('Please fill in both email and password.', true);
      setLoading(false);
      return;
    }

    // Since we're using mock keys locally without a real DB setup, we'll try/catch block
    try {
      if (!window.supabaseClient) {
         throw new Error("Supabase client not initialized.");
      }

      // Supabase Auth SignIn Call
      const { data, error } = await window.supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        throw error;
      }

      // Success
      showMessage('Login successful! Redirecting...', false);
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = 'dashboard.html';
      }, 1500);

    } catch (err) {
      // If we are using placeholders, Supabase will throw a network/Auth error.
      // We'll mock a successful login if the URL contains 'placeholder' just to demonstrate flow.
      if (window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        console.warn('Using placeholder credentials - bypassing real authentication for demo mode.');
        showMessage('(Demo Mode) Login successful! Redirecting...', false);
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 1500);
      } else {
        console.error('Login error:', err.message);
        showMessage(err.message || 'An error occurred during login.', true);
      }
    } finally {
      if (!window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        setLoading(false);
      }
    }
  });

  forgotPwdBtn.addEventListener('click', async () => {
    hideMessage();
    const email = emailInput.value.trim();
    if (!email) {
      showMessage('Please enter your email address to reset password.', true);
      return;
    }

    try {
      if (!window.supabaseClient) throw new Error("Supabase client not initialized.");

      const { data, error } = await window.supabaseClient.auth.resetPasswordForEmail(email);
      
      if (error) throw error;
      
      showMessage('Password reset instructions sent to your email.', false);
    } catch (err) {
       if (window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
          showMessage('(Demo Mode) Password reset link sent.', false);
       } else {
          showMessage(err.message, true);
       }
    }
  });
});
