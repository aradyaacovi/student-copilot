// הרצה: node tests/automations.test.js
// בודק את הלוגיקה של האוטומציות, ומריץ את קוד ה-workflows שנבנו בסביבת n8n מדומה (בלי רשת ובלי עלות).
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require("../js/logic.js");
const Moodle = require("../automations/lib/moodle.js");
const Email = require("../automations/lib/email.js");
const Briefs = require("../automations/lib/briefs.js");
global.window = {};
require("../data/sample-semester.js");
const DATA = window.SAMPLE_DATA;

let passed = 0;
const tests = [];
const test = (name, fn) => tests.push([name, fn]);

const ICS = [
  "BEGIN:VCALENDAR",
  "BEGIN:VEVENT", "UID:101@moodle.bgu.ac.il", "SUMMARY:תרגיל בית 4 is due", "CATEGORIES:000100010120271",
  "DTSTART:20261124T215500Z", "URL:https://moodle.bgu.ac.il/x", "END:VEVENT",
  "BEGIN:VEVENT", "UID:102@moodle.bgu.ac.il", "SUMMARY:תרגיל בית 4 opens", "CATEGORIES:000100010120271", "DTSTART:20261117T080000Z", "END:VEVENT",
  "BEGIN:VEVENT", "UID:103@moodle.bgu.ac.il", "SUMMARY:בוחן אמצע – חק״ב", "DTSTART;VALUE=DATE:20261201", "END:VEVENT",
  "END:VCALENDAR",
].join("\r\n");

test("מודל: מזהה קורס לפי מספר, מדלג על 'opens', ממיר UTC לשעון ישראל", () => {
  const ev = Moodle.moodleToEvents(ICS, DATA.courses);
  assert.equal(ev.length, 2);
  assert.deepEqual([ev[0].course_id, ev[0].title, ev[0].date, ev[0].time], ["stats", "תרגיל בית 4", "2026-11-24", "23:55"]);
  assert.deepEqual([ev[1].course_id, ev[1].kind, ev[1].time], ["ops", "quiz", null]);
});

test("מודל: הפורמט האמיתי של בן-גוריון – יש להגיש את 'X' + מספר קורס בקטגוריה", () => {
  const ics = ["BEGIN:VEVENT", "UID:9@moodle.bgu.ac.il", "SUMMARY:יש להגיש את 'תרגיל 1 - תיבת הגשה'", "CATEGORIES:000100010120271", "DTSTART:20261119T215900Z", "END:VEVENT"].join(String.fromCharCode(13, 10));
  const ev = Moodle.moodleToEvents(ics, DATA.courses)[0];
  assert.deepEqual([ev.title, ev.course_id, ev.date, ev.time], ["תרגיל 1", "stats", "2026-11-19", "23:59"]);
});

const mail = { from: "lecturer@bgu.ac.il", subject: "ביטול הרצאה", text: "ההרצאה הקרובה מבוטלת", date: new Date(2026, 10, 16, 18, 0), messageId: "<m1>" };
const item = (o) => ({ course_id: "stats", type: "cancelled", session_type: "lecture", date: "", new_date: "", start_time: "", end_time: "", location: "", title: "", is_my_group: "unknown", confidence: "high", note: "ההרצאה הקרובה", ...o });

test("מייל: 'ההרצאה הקרובה' = המופע הבא אחרי שליחת המייל, ומוחל", () => {
  const a = Email.interpret({ relevant: true, summary: "x", items: [item()] }, mail, DATA, L);
  assert.equal(a.changes[0].date, "2026-11-22"); // ראשון אחרי ב׳ 16.11
  assert.equal(a.changes[0].status, "applied");
});
test("מייל: קבוצה אחרת לא נוגעים, ספק נשלח לאישור, תאריך שלא נופל על מופע – לאישור", () => {
  assert.equal(Email.interpret({ relevant: true, summary: "x", items: [item({ is_my_group: "no" })] }, mail, DATA, L).changes.length, 0);
  assert.equal(Email.interpret({ relevant: true, summary: "x", items: [item({ confidence: "low" })] }, mail, DATA, L).changes[0].status, "needs_review");
  assert.equal(Email.interpret({ relevant: true, summary: "x", items: [item({ date: "2026-11-23" })] }, mail, DATA, L).changes[0].status, "needs_review");
  assert.equal(Email.interpret({ relevant: true, summary: "x", items: [item({ session_type: "tutorial" })] }, mail, DATA, L).changes[0].status, "needs_review"); // תרגול + קבוצה לא ידועה
});
test("מייל: סינון ראשוני וקריאת תשובה (סירוב / JSON)", () => {
  assert.ok(Email.isCandidate(mail));
  assert.ok(!Email.isCandidate({ from: "shop@x.com", subject: "מבצע", text: "הנחה" }));
  assert.equal(Email.readResponse({ stop_reason: "refusal", content: [] }).result, null);
  assert.equal(Email.readResponse({ stop_reason: "end_turn", content: [{ type: "text", text: '{"relevant":false,"summary":"","items":[]}' }] }).result.relevant, false);
});
test("בקשה ל-Claude: מודל, פלט מובנה, fallback", () => {
  const r = Email.buildRequest(mail, DATA, L);
  assert.equal(r.model, "claude-opus-5-5");
  assert.equal(r.output_config.format.type, "json_schema");
  assert.equal(r.fallbacks, "default");
  assert.ok(r.output_config.format.schema.properties.items.items.properties.course_id.enum.includes("stats"));
});
test("applyRemote: ביטול מהענן מוריד מפגש, אירוע מהמודל נוסף להגשות", () => {
  const d = L.applyRemote(DATA, {
    events: [{ source: "moodle", course_id: "stats", title: "חדש", date: "2026-11-30", kind: "submission" }],
    changes: [{ course_id: "stats", session_type: "lecture", change: "cancelled", date: "2026-11-22", status: "applied" }],
  });
  assert.ok(d.deadlines.some((x) => x.title === "חדש"));
  assert.ok(d.courses[0].sessions[0].cancelled.includes("2026-11-22"));
  assert.ok(!(DATA.courses[0].sessions[0].cancelled || []).includes("2026-11-22")); // המקור לא השתנה
});
test("תדריכים ותזכורות", () => {
  const ctx = { data: DATA, base: DATA, state: {}, events: [], changes: [] };
  const now = new Date(2026, 10, 19, 7, 23);
  assert.match(Briefs.dailyBrief(ctx, L, now).body, /הכי דחוף/);
  assert.match(Briefs.weeklyBrief(ctx, L, now).body, /תרגיל בית 3/);
  const rem = Briefs.reminders(ctx, L, now);
  assert.ok(rem.some((r) => r.title.startsWith("מחר:"))); // ההגשה ב-20.11
});

// ---------- הרצת ה-workflows עצמם בסביבת n8n מדומה ----------
function runWorkflow(file, { inputs = [], claude, noKey } = {}) {
  const wf = JSON.parse(fs.readFileSync(path.join(__dirname, "../automations/workflows", file), "utf8"));
  const node = wf.nodes.find((n) => n.type === "n8n-nodes-base.code");
  const db = { inbox: [], events: [], schedule_changes: [] };
  const calls = [];
  const http = async (o) => {
    calls.push(o);
    if (o.url.startsWith("https://api.anthropic.com")) return claude;
    if (o.url === "https://moodle.example/ics") return ICS;
    const table = o.url.split("/rest/v1/")[1].split("?")[0];
    if (o.method === "GET") return table === "semester_data" ? [{ data: DATA }] : table === "user_state" ? [{ state: {} }] : [];
    if (o.method === "POST") { const rows = o.body.map((r, i) => ({ id: db[table].length + i + 1, ...r })); db[table].push(...rows); return rows; }
    return [];
  };
  const $env = { SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_KEY: "k", USER_ID: "u1", MOODLE_ICS_URL: "https://moodle.example/ics", ...(noKey ? {} : { ANTHROPIC_API_KEY: "test" }) };
  const $input = { all: () => inputs.map((json) => ({ json })) };
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  // שעון קבוע: נתוני הדוגמה הם מנובמבר 2026, והבדיקה לא תלויה בתאריך ההרצה
  const RealDate = Date;
  class FixedDate extends RealDate { constructor(...a) { super(...(a.length ? a : [2026, 10, 19, 7, 23])); } static now() { return new RealDate(2026, 10, 19, 7, 23).getTime(); } }
  const fn = new AsyncFunction("$env", "$input", "Date", node.parameters.jsCode);
  return fn.call({ helpers: { httpRequest: http } }, $env, $input, FixedDate).then((out) => ({ out, db, calls, wf }));
}

test("workflow מודל רץ: כותב הגשות והתראה על חדשות", async () => {
  const { out, db } = await runWorkflow("1-moodle-sync.json");
  assert.equal(out[0].json.new, 2);
  assert.ok(db.inbox.some((m) => m.title.includes("חדש במודל") && m.user_id === "u1"));
});
test("workflow מייל רץ: Claude מחזיר ביטול → שינוי לו״ז + הודעה עם קישור לשינוי", async () => {
  const claude = { stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ relevant: true, summary: "בוטל", items: [item()] }) }] };
  const { db, calls } = await runWorkflow("2-email-changes.json", { claude, inputs: [{ from: "x@bgu.ac.il", subject: "ביטול הרצאה", textPlain: "ההרצאה הקרובה מבוטלת", date: "2026-11-16T16:00:00Z", metadata: { "message-id": "<m1>" } }] });
  assert.equal(db.schedule_changes.length, 1);
  assert.equal(db.inbox[0].ref_id, 1);
  const req = calls.find((c) => c.url.includes("anthropic"));
  assert.equal(req.headers["anthropic-version"], "2026-10-21");
});
test("workflow תדריך ותזכורות רצים", async () => {
  assert.ok((await runWorkflow("3-briefs.json")).db.inbox.some((m) => m.kind === "brief"));
  await runWorkflow("4-reminders.json");
});
test("קבצי ה-workflow תקינים: כל חיבור מצביע על node קיים", () => {
  for (const f of fs.readdirSync(path.join(__dirname, "../automations/workflows"))) {
    const wf = JSON.parse(fs.readFileSync(path.join(__dirname, "../automations/workflows", f), "utf8"));
    const names = new Set(wf.nodes.map((n) => n.name));
    for (const [from, c] of Object.entries(wf.connections)) {
      assert.ok(names.has(from), f + ": " + from);
      for (const t of c.main[0]) assert.ok(names.has(t.node), f + ": " + t.node);
    }
  }
});

const Env = require("../automations/env.js");

test("הגדרות: קובץ .env נקרא, ומשתני סביבה גוברים עליו", () => {
  const env = Env.loadEnv("SUPABASE_URL=a\nUSER_ID=u1\n# הערה\n", { USER_ID: "u2", OTHER: "x" });
  assert.equal(env.SUPABASE_URL, "a");
  assert.equal(env.USER_ID, "u2");
  assert.equal(env.OTHER, undefined);
});

test("הגדרות: בענן אין קובץ, ומשתנה ריק לא דורס ערך קיים", () => {
  const cloud = Env.loadEnv("", { SUPABASE_URL: "https://x", SUPABASE_SERVICE_KEY: "k", USER_ID: "u" });
  assert.deepEqual(Env.missingKeys(cloud, "3-briefs"), []);
  const kept = Env.loadEnv("USER_ID=file", { USER_ID: "  " });
  assert.equal(kept.USER_ID, "file");
});

test("הגדרות: ההודעה על חסר מציגה שמות בלבד, ומודל דורש את כתובת היומן", () => {
  const env = Env.loadEnv("", { SUPABASE_URL: "https://x", SUPABASE_SERVICE_KEY: "secret-value", USER_ID: "u" });
  assert.deepEqual(Env.missingKeys(env, "1-moodle-sync"), ["MOODLE_ICS_URL"]);
  assert.ok(!JSON.stringify(Env.missingKeys(env, "1-moodle-sync")).includes("secret-value"));
});

test("הגדרות: הדבקה עם רווחים, מירכאות או קידומת מנוקה, וערך שגוי מדווח בשם בלבד", () => {
  const env = Env.loadEnv("", { SUPABASE_URL: " \"https://abc.supabase.co/\"\n", SUPABASE_SERVICE_KEY: "SUPABASE_SERVICE_KEY=k1 \n", USER_ID: "12345678-1234-1234-1234-123456789012\n" });
  assert.equal(env.SUPABASE_URL, "https://abc.supabase.co");
  assert.equal(env.SUPABASE_SERVICE_KEY, "k1");
  assert.deepEqual(Env.invalidKeys(env, "3-briefs"), []);
  const bad = Env.loadEnv("", { SUPABASE_URL: "abc.supabase.co", SUPABASE_SERVICE_KEY: "secret-value", USER_ID: "short" });
  assert.deepEqual(Env.invalidKeys(bad, "3-briefs"), ["SUPABASE_URL", "USER_ID"]);
});

test("מייל: קורא רק מיילים שלא טופלו, ומסמן תווית רק אחרי הצלחה", async () => {
  const { fetchNewMail, LABEL } = require("../automations/fetch-mail.js");
  const log = { locks: 0, released: 0, labeled: null, searched: null, logout: 0 };
  class FakeImap {
    constructor(o) { log.cfg = o; }
    async connect() {}
    async getMailboxLock() { log.locks++; return { release: () => log.released++ }; }
    async search(q) { log.searched = q; return [5, 6]; }
    async fetchOne(uid) { return { source: "raw" + uid }; }
    async messageFlagsAdd(uids, labels, o) { log.labeled = { uids, labels, o }; }
    async logout() { log.logout++; }
  }
  const simpleParser = async (src) => ({ from: { text: "מרצה <a@bgu.ac.il>" }, subject: "ביטול " + src, text: "גוף", html: false, date: new Date("2026-11-20T10:00:00Z"), messageId: "<" + src + "@x>" });
  const mail = await fetchNewMail({ address: "me@gmail.com", password: "pw" }, { ImapFlow: FakeImap, simpleParser });
  assert.ok(log.searched.gmraw.includes("-label:" + LABEL));
  assert.equal(log.cfg.logger, false);
  assert.equal(mail.items.length, 2);
  assert.deepEqual(mail.items[0].json.metadata, { "message-id": "<raw5@x>" });
  assert.equal(mail.items[0].json.textHtml, "");
  assert.equal(log.labeled, null); // עוד לא סומן
  await mail.markDone();
  assert.deepEqual(log.labeled.uids, [5, 6]);
  assert.deepEqual(log.labeled.labels, [LABEL]);
  assert.equal(log.released, 1);
  // כשל: משחררים בלי לסמן
  const again = await fetchNewMail({ address: "me@gmail.com", password: "pw" }, { ImapFlow: FakeImap, simpleParser });
  log.labeled = null;
  await again.close();
  assert.equal(log.labeled, null);
  assert.equal(log.released, 2);
});

test("מייל: שדות הפריט מתאימים למה שה-workflow מצפה", () => {
  const { toItem } = require("../automations/fetch-mail.js");
  const Email = require("../automations/lib/email.js");
  const f = Email.emailFields(toItem({ from: { text: "x@bgu.ac.il" }, subject: "ביטול הרצאה", text: "מבוטלת", html: "<p>x</p>", date: new Date("2026-11-20T10:00:00Z"), messageId: "<m9>" }).json);
  assert.equal(f.subject, "ביטול הרצאה");
  assert.equal(f.messageId, "<m9>");
  assert.equal(f.from, "x@bgu.ac.il");
  assert.ok(Email.isCandidate(f));
});

test("מייל בלי מודל: ביטול עם קורס ותאריך מפורשים מזוהה, אבל לא מוחל בלי ודאות לגבי הקבוצה", () => {
  const e = { ...mail, subject: "סטטיסטיקה – ביטול תרגול", text: "תרגול סטטיסטיקה ב-22.11 מבוטל" };
  const r = Email.ruleExtract(e, DATA, L);
  assert.equal(r.relevant, true);
  assert.equal(r.items[0].course_id, "stats");
  assert.equal(r.items[0].type, "cancelled");
  assert.equal(r.items[0].session_type, "tutorial");
  assert.equal(r.items[0].date, "2026-11-22");
  const a = Email.interpret(r, e, DATA, L);
  assert.equal(a.changes[0].status, "needs_review"); // קבוצה לא ידועה בתרגול = לאישור
});

test("מייל בלי מודל: ספק גורר לבדיקה, והודעה לא קשורה מתעלמים ממנה", () => {
  const vague = Email.ruleExtract({ ...mail, subject: "ביטול", text: "ההרצאה הקרובה מבוטלת" }, DATA, L);
  assert.equal(vague.items[0].course_id, "unknown");
  assert.equal(vague.items[0].confidence, "low");
  assert.equal(Email.interpret(vague, mail, DATA, L).inbox[0].title, "מייל לבירור – לא זוהה קורס");
  assert.equal(Email.ruleExtract({ ...mail, subject: "משרת סטודנט", text: "מחפשים עובדים" }, DATA, L).relevant, false);
  const moved = Email.ruleExtract({ ...mail, subject: "אלגוריתמים", text: "ההרצאה מ-24.11 הוזזה ל-26.11 בשעה 10:00, בזום" }, DATA, L).items[0];
  assert.deepEqual([moved.type, moved.date, moved.new_date, moved.start_time, moved.location], ["moved", "2026-11-24", "2026-11-26", "10:00", "זום"]);
});

test("workflow מייל רץ גם בלי מפתח Anthropic ולא קורא ל-API", async () => {
  const { db, calls } = await runWorkflow("2-email-changes.json", { noKey: true, inputs: [{ from: "x@bgu.ac.il", subject: "סטטיסטיקה ביטול הרצאה", textPlain: "הרצאה סטטיסטיקה ב-22.11 מבוטלת", date: "2026-11-16T16:00:00Z", metadata: { "message-id": "<m2>" } }] });
  assert.ok(!calls.some((c) => c.url.includes("anthropic")));
  assert.equal(db.schedule_changes.length, 1);
  assert.ok(db.inbox.length >= 1);
});

test("workflow מתוזמן: קיים, משתמש בסודות לפי שם ובהרשאת קריאה בלבד", () => {
  const y = fs.readFileSync(path.join(__dirname, "../.github/workflows/automations.yml"), "utf8");
  for (const k of ["SUPABASE_URL", "SUPABASE_SERVICE_KEY", "USER_ID", "MOODLE_ICS_URL"]) assert.ok(y.includes("secrets." + k), k);
  assert.ok(/permissions:\s*\n\s*contents: read/.test(y));
  for (const k of ["ANTHROPIC_API_KEY", "GMAIL_ADDRESS", "GMAIL_APP_PASSWORD"]) assert.ok(y.includes("secrets." + k), k);
  assert.ok(y.includes("imapflow@") && y.includes("mailparser@"), "ספריות המייל מקובעות לגרסה");
});

test("דופק: הצלחה מאפסת כשלונות, כשל מעלה אותם ומוסיף התראה אחת ליום", async () => {
  const { makeSupa, recordRun } = require("../automations/lib/common.js");
  const calls = [];
  const db = { failures: 2 };
  const http = async (o) => {
    calls.push(o);
    if (o.method === "GET") return [{ failures: db.failures }];
    return [];
  };
  const supa = makeSupa(http, "https://x.supabase.co/", "k");
  const t = new Date("2026-11-26T08:00:00Z");
  assert.equal(await recordRun(supa, "u1", "1-moodle-sync", null, t, { "1-moodle-sync": "סנכרון מודל" }), true);
  let post = calls.find((c) => c.method === "POST" && c.url.includes("sync_state"));
  assert.equal(post.body[0].failures, 0);
  assert.equal(post.body[0].last_success, t.toISOString());
  assert.ok(post.url.includes("on_conflict=user_id,source"));
  assert.ok(!calls.some((c) => c.url.includes("inbox")), "הצלחה לא יוצרת התראה");

  calls.length = 0;
  await recordRun(supa, "u1", "1-moodle-sync", "HTTP 500", t, { "1-moodle-sync": "סנכרון מודל" });
  post = calls.find((c) => c.method === "POST" && c.url.includes("sync_state"));
  assert.equal(post.body[0].failures, 3);
  assert.ok(!("last_success" in post.body[0]), "כשל לא נוגע בהצלחה האחרונה");
  const alert = calls.find((c) => c.url.includes("inbox"));
  assert.equal(alert.body[0].dedupe_key, "syncfail|1-moodle-sync|2026-11-26");
  assert.equal(alert.body[0].kind, "alert");
});
test("דופק: כשל ברישום עצמו לא זורק ולא מסתיר את השגיאה המקורית", async () => {
  const { recordRun } = require("../automations/lib/common.js");
  const supa = { select: async () => { throw new Error("down"); }, upsert: async () => { throw new Error("down"); } };
  assert.equal(await recordRun(supa, "u1", "3-briefs", "boom", new Date(), {}), false);
});
test("workflow מתוזמן: כשל באוטומציה אחת לא עוצר את האחרות והריצה נכשלת", () => {
  const y = fs.readFileSync(path.join(__dirname, "../.github/workflows/automations.yml"), "utf8");
  assert.ok(/\|\| \{[^}]*rc=1/.test(y) && y.includes("exit $rc"));
});

(async () => {
  for (const [name, fn] of tests) {
    try { await fn(); passed++; console.log("✓", name); }
    catch (e) { console.log("✗", name, "\n   ", e.message); process.exitCode = 1; }
  }
  console.log(`\n${passed}/${tests.length} בדיקות אוטומציה עברו`);
})();
