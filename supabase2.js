
const SUPABASE_URL = "https://fookafzcsnlmxjlormlf.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZvb2thZnpjc25sbXhqbG9ybWxmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE5MDA5NjYsImV4cCI6MjEwNzQ3Njk2Nn0.ZCmFbGxrx6M0bKya7ymuHXeAH-R_g-VPhjP0486v-kc";

if (!window.supabase) {
  console.error("Supabase library did not load.");
} else {
  window.nexoraSupabase = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
  );
  console.log("NEXORA admin Supabase client configured.");
}


