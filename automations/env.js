// טוען את הגדרות האוטומציות: מקובץ automations/.env אם קיים, ומשתני סביבה (GitHub Actions).
// משתני סביבה גוברים על הקובץ. הערכים לעולם לא מודפסים.
const KEYS = ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "MOODLE_ICS_URL", "ANTHROPIC_API_KEY", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD"];

// נדרש לכל workflow. מה שחסר מחזיר שגיאה עם שמות בלבד.
const REQUIRED = {
  upload: ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
  "1-moodle-sync": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "MOODLE_ICS_URL"],
  "2-email-changes": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD"],
  "3-briefs": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
  "4-reminders": ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID"],
};

// מנקה ערך שהודבק: רווחים וירידות שורה, מירכאות, קידומת "NAME=" וקו נטוי בסוף כתובת.
function cleanValue(name, raw) {
  let v = String(raw === undefined || raw === null ? "" : raw).replace(/\s+/g, "");
  if (v.startsWith(name + "=")) v = v.slice(name.length + 1);
  v = v.replace(/^["'`]+|["'`]+$/g, "");
  if (/_URL$/.test(name)) v = v.replace(/\/+$/, "");
  return v;
}

function parseEnvFile(text) {
  const env = {};
  for (const l of String(text || "").split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(l);
    if (m) env[m[1]] = cleanValue(m[1], m[2]);
  }
  return env;
}

function loadEnv(fileText, processEnv) {
  const env = parseEnvFile(fileText);
  for (const k of KEYS) {
    const v = processEnv && cleanValue(k, processEnv[k]);
    if (v) env[k] = v;
  }
  return env;
}

// בדיקת צורה בלבד. מחזיר שמות, אף פעם לא ערכים.
function invalidKeys(env, what) {
  const bad = [];
  for (const k of REQUIRED[what] || []) {
    if (!env[k]) continue;
    if (/_URL$/.test(k) && !/^https:\/\/[^\/]+\.[^\/]+/.test(env[k])) bad.push(k);
    if (k === "USER_ID" && !/^[0-9a-f-]{36}$/i.test(env[k])) bad.push(k);
  }
  return bad;
}

function missingKeys(env, what) {
  return (REQUIRED[what] || []).filter((k) => !env[k]);
}

module.exports = { loadEnv, parseEnvFile, cleanValue, invalidKeys, missingKeys, KEYS, REQUIRED };
