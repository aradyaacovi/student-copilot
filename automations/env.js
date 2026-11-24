// טוען את הגדרות האוטומציות: מקובץ automations/.env אם קיים, ומשתני סביבה (GitHub Actions).
// משתני סביבה גוברים על הקובץ. הערכים לעולם לא מודפסים.
const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "MOODLE_ICS_URL", "ANTHROPIC_API_KEY"];

// נדרש לכל workflow. מה שחסר מחזיר שגיאה עם שמות בלבד.
const REQUIRED = {
  upload: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
  "1-moodle-sync": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "MOODLE_ICS_URL"],
  "3-briefs": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
  "4-reminders": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
};

function parseEnvFile(text) {
  const env = {};
  for (const l of String(text || "").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l);
    if (m) env[m[1]] = m[2].trim();
  }
  return env;
}

function loadEnv(fileText, processEnv) {
  const env = parseEnvFile(fileText);
  for (const k of KEYS) {
    const v = processEnv && processEnv[k];
    if (v !== undefined && String(v).trim() !== "") env[k] = String(v).trim();
  }
  return env;
}

function missingKeys(env, what) {
  return (REQUIRED[what] || []).filter((k) => !env[k]);
}

module.exports = { loadEnv, parseEnvFile, missingKeys, KEYS, REQUIRED };
