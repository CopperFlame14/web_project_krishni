document.addEventListener('DOMContentLoaded', async () => {
  const sidebar = document.getElementById('sidebar');
  const hamburgerBtn = document.getElementById('hamburgerBtn');
  const closeSidebarBtn = document.getElementById('closeSidebarBtn');
  const mobileOverlay = document.getElementById('mobileOverlay');
  const logoutBtn = document.getElementById('logoutBtn');
  const welcomeText = document.getElementById('welcomeText');

  // Sidebar toggling for mobile
  const openSidebar = () => {
    sidebar.classList.add('open');
    mobileOverlay.classList.add('active');
  };

  const closeSidebar = () => {
    sidebar.classList.remove('open');
    mobileOverlay.classList.remove('active');
  };

  hamburgerBtn?.addEventListener('click', openSidebar);
  closeSidebarBtn?.addEventListener('click', closeSidebar);
  mobileOverlay?.addEventListener('click', closeSidebar);

  // Retrieve user data to display name
  let userName = "Student";

  try {
    if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
      const { data: { user } } = await window.supabaseClient.auth.getUser();
      
      if (user) {
        // Fetch extended profile
        const { data: profile } = await window.supabaseClient
          .from('user_profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .single();

        if (profile && profile.full_name) {
          // Get first name
          userName = profile.full_name.split(' ')[0];
        } else if (user.email) {
          userName = user.email.split('@')[0];
        }
      } else {
        // Not logged in, redirect to login
        window.location.href = '/login';
      }
    } else {
      // Demo mode - try to read saved name from localStorage (set during registration)
      const savedName = window.localStorage.getItem('demoUserName');
      userName = savedName ? savedName.split(' ')[0] : "Student";
    }
  } catch (err) {
    console.error("Error fetching user session:", err);
  }

  // Update Welcome Text (some pages reuse this script without the element)
  if (welcomeText) {
    welcomeText.textContent = `Welcome back, ${userName}`;
  }

  // Logout Logic
  logoutBtn?.addEventListener('click', async () => {
    try {
      if (window.supabaseClient && !window.APP_CONFIG.SUPABASE_URL.includes('placeholder')) {
        await window.supabaseClient.auth.signOut();
      }
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      window.location.href = '/login';
    }
  });

});

