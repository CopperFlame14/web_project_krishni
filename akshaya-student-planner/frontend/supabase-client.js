// Initialize the Supabase client
const supabaseUrl = window.APP_CONFIG.SUPABASE_URL;
const supabaseAnonKey = window.APP_CONFIG.SUPABASE_ANON_KEY;

// We check if the supabase window object exists (loaded via CDN in HTML)
if (window.supabase) {
  window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);
} else {
  console.error("Supabase library not found. Ensure the CDN script is included in your HTML.");
}
