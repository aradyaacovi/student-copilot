// מריץ אוטומציה אחת מהמחשב, בלי n8n – לבדיקה מול Supabase האמיתי.
//   node automations/run-local.js upload     מעלה את data/my-semester.js לענן
//   node automations/run-local.js 3-briefs   מריץ workflow (1-moodle-sync / 3-briefs / 4-reminders)
const fs = require("fs");
const path = require("path");
const { loadEnv, missingKeys, invalidKeys } = require("./env.js");
const { makeSupa, recordRun } = require("./lib/common.js");
const L = require("../js/logic.js");
const envPath = path.join(__dirname, ".env");
// בענן (GitHub Actions) אין קובץ .env: ההגדרות מגיעות ממשתני סביבה.
const env = loadEnv(fs.existsSync(envPath) ? fs.readFileSync(envPath, "utf8") : "", process.env);
const http = async (o) => {
  const res = await fetch(o.url, { method: o.method, headers: o.headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${o.method} ${o.url.split("?")[0]} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (o.json === false) return text;
  return text ? JSON.parse(text) : [];
};

(async () => {
  const what = process.argv[2];
  const missing = missingKeys(env, what);
  if (missing.length) throw new Error("חסרות הגדרות: " + missing.join(", ") + " (בקובץ automations/.env או כסוד ב-GitHub)");
  const bad = invalidKeys(env, what);
  if (bad.length) throw new Error("הערך נראה שגוי (כתובת חייבת להתחיל ב-https://, USER_ID הוא 36 תווים): " + bad.join(", "));
  if (what === "upload") {
    global.window = {};
    require("../data/my-semester.js");
    const data = { ...window.SEMESTER_DATA, updated: new Date().toISOString().slice(0, 10) };
    const key = env.SUPABASE_SERVICE_KEY;
    const rows = await http({ method: "POST", url: `${env.SUPABASE_URL}/rest/v1/semester_data?on_conflict=user_id`, json: true,
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=representation" },
      body: [{ user_id: env.USER_ID, data, updated_at: new Date().toISOString() }] });
    return console.log(`הועלה: ${rows[0].data.courses.length} קורסים, ${rows[0].data.deadlines.length} הגשות ומבחנים`);
  }
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, "workflows", what + ".json"), "utf8"));
  const code = wf.nodes.find((n) => n.type === "n8n-nodes-base.code").parameters.jsCode;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  const supa = makeSupa(http, env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const heartbeat = (err) => recordRun(supa, env.USER_ID, what, err, new Date(), L.SYNC_LABEL);
  // המייל נקרא מג׳ימייל (IMAP). הספריות מותקנות בענן בלבד, ומעבירים אותן פנימה כדי שהבדיקות ירוצו בלי רשת.
  let mail = null;
  if (what === "2-email-changes") {
    const { fetchNewMail } = require("./fetch-mail.js");
    mail = await fetchNewMail({ address: env.GMAIL_ADDRESS, password: env.GMAIL_APP_PASSWORD }, { ImapFlow: require("imapflow").ImapFlow, simpleParser: require("mailparser").simpleParser });
  }
  const inputs = mail ? mail.items : [];
  let out;
  try {
    out = await new AsyncFunction("$env", "$input", code).call({ helpers: { httpRequest: http } }, env, { all: () => inputs });
  } catch (e) {
    if (mail) await mail.close();
    await heartbeat(e.message); // הדופק נרשם גם בכשל, כדי שהאפליקציה תדע ולא תשתוק
    throw e;
  }
  if (mail) await mail.markDone();
  await heartbeat(null);
  console.log(wf.name, "→", JSON.stringify(out.map((o) => o.json)));
})().catch((e) => { const why = e.cause && (e.cause.code || e.cause.name); // קוד שגיאה בלבד (למשל ENOTFOUND), בלי כתובות וערכים
  console.error("נכשל:", e.message + (why ? " (" + why + ")" : "")); process.exit(1); });
