// להעתיק לקובץ js/config.js (לא עולה לגיטהאב) ולמלא.
// Supabase ← Project Settings ← API: ה-URL וה-anon public key.
// ה-anon key בטוח לשימוש בדפדפן – ה-RLS מגן על הנתונים. לעולם לא לשים כאן את ה-service_role key.
window.COPILOT_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT.supabase.co",
  supabaseAnonKey: "YOUR-ANON-KEY"
};
