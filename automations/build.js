// בונה את קבצי ה-workflow של n8n מתוך הקוד בתיקיית lib (כך הלוגיקה נבדקת, וה-workflows נשארים דקים).
// הרצה: node automations/build.js  → automations/workflows/*.json  → לייבא ב-n8n.
const fs = require("fs");
const path = require("path");
const read = (p) => fs.readFileSync(path.join(__dirname, p), "utf8");

const wrap = (name, src) => `const ${name} = (function () { const module = { exports: {} }; const exports = module.exports;\n${src}\nreturn module.exports; })();`;
const PRELUDE = [
  "// ⚠️ נוצר אוטומטית מ-automations/lib ו-js/logic.js – לא לערוך כאן. לשנות שם ולהריץ: node automations/build.js",
  wrap("L", read("../js/logic.js")),
  wrap("Common", read("lib/common.js")),
  wrap("Moodle", read("lib/moodle.js")),
  wrap("Email", read("lib/email.js")),
  wrap("Briefs", read("lib/briefs.js")),
  `const ENV = { url: $env.SUPABASE_URL, key: $env.SUPABASE_SERVICE_KEY, user: $env.USER_ID };
if (!ENV.url || !ENV.key || !ENV.user) throw new Error("חסרים SUPABASE_URL / SUPABASE_SERVICE_KEY / USER_ID ב-automations/.env");
const http = (o) => this.helpers.httpRequest(o);
const supa = Common.makeSupa(http, ENV.url, ENV.key);
const now = new Date();
const withUser = (rows) => rows.map((r) => ({ ...r, user_id: ENV.user }));
async function postInbox(items) { return supa.upsert("inbox", withUser(items), "user_id,dedupe_key", "ignore"); }`,
].join("\n\n");

const MAIN = {
  moodle: `
if (!$env.MOODLE_ICS_URL) throw new Error("חסר MOODLE_ICS_URL ב-automations/.env");
const ctx = await Common.loadContext(supa, ENV.user, L);
const ics = await http({ method: "GET", url: $env.MOODLE_ICS_URL, json: false });
const found = Moodle.moodleToEvents(String(ics), ctx.base.courses)
  .filter((e) => L.daysUntil(e.date, now) >= -1);
const known = new Set(ctx.events.filter((e) => e.source === "moodle").map((e) => e.external_id));
await supa.upsert("events", withUser(found.map((e) => ({ ...e, updated_at: new Date().toISOString() }))), "user_id,source,external_id", "merge");
const fresh = found.filter((e) => !known.has(e.external_id));
const cn = (id) => { const c = ctx.base.courses.find((x) => x.id === id); return c ? c.short : "לא זוהה קורס"; };
await postInbox(fresh.map((e) => ({ kind: "alert", title: \`חדש במודל: \${cn(e.course_id)} – \${e.title}\`, body: \`\${L.fmtLong(e.date)}\${e.time ? " " + e.time : ""}\${e.url ? "\\n" + e.url : ""}\`, dedupe_key: \`moodle-\${e.external_id}\` })));
return [{ json: { found: found.length, new: fresh.length, unmatched: found.filter((e) => !e.course_id).map((e) => e.title) } }];`,

  email: `
const ctx = await Common.loadContext(supa, ENV.user, L);
const report = [];
for (const item of $input.all()) {
  const e = Email.emailFields(item.json);
  if (!e.subject && !e.text) continue;
  if (!Email.isCandidate(e)) { report.push({ subject: e.subject, skipped: "לא רלוונטי" }); continue; }
  let result, reason;
  if ($env.ANTHROPIC_API_KEY) {
    let res;
    try {
      res = await http({ method: "POST", url: "https://api.anthropic.com/v1/messages", headers: Email.ANTHROPIC_HEADERS($env.ANTHROPIC_API_KEY), body: Email.buildRequest(e, ctx.data, L), json: true, timeout: 180000 });
    } catch (err) {
      await postInbox([{ kind: "alert", title: "לא הצלחתי לנתח מייל", body: \`\${e.subject}\\n\${err.message}\`, dedupe_key: \`mail-err-\${e.messageId}\` }]);
      report.push({ subject: e.subject, error: err.message }); continue;
    }
    ({ result, reason } = Email.readResponse(res));
  } else {
    result = Email.ruleExtract(e, ctx.data, L); // בלי מפתח: חילוץ לפי כללים, בלי מודל ובלי עלות
  }
  if (!result) { await postInbox([{ kind: "alert", title: "מייל לבדיקה ידנית", body: \`\${e.subject}\\n\${reason}\`, dedupe_key: \`mail-err-\${e.messageId}\` }]); report.push({ subject: e.subject, error: reason }); continue; }
  const acts = Email.interpret(result, e, ctx.data, L);
  await supa.upsert("events", withUser(acts.events), "user_id,source,external_id", "merge");
  for (const ch of acts.changes) {
    const { _inbox, ...row } = ch;
    const ins = await supa.upsert("schedule_changes", withUser([row]), "user_id,source_ref,course_id,session_type,change,date", "ignore");
    if (ins.length) await postInbox([{ ..._inbox, ref_id: ins[0].id }]);
  }
  await postInbox(acts.inbox);
  report.push({ subject: e.subject, relevant: result.relevant, changes: acts.changes.length, events: acts.events.length });
}
return report.length ? report.map((r) => ({ json: r })) : [{ json: { empty: true } }];`,

  brief: `
const ctx = await Common.loadContext(supa, ENV.user, L);
const items = [Briefs.dailyBrief(ctx, L, now)];
if (now.getDay() === 0) items.push(Briefs.weeklyBrief(ctx, L, now));
const saved = await postInbox(items);
return [{ json: { saved: saved.length, titles: items.map((i) => i.title) } }];`,

  reminders: `
const ctx = await Common.loadContext(supa, ENV.user, L);
const items = Briefs.reminders(ctx, L, now);
const saved = await postInbox(items);
return [{ json: { candidates: items.length, saved: saved.length } }];`,
};

const code = (name, body, pos) => ({
  parameters: { mode: "runOnceForAllItems", jsCode: `${PRELUDE}\n\n// ---------- ${name} ----------${body}` },
  id: `code-${name}`, name: "Copilot", type: "n8n-nodes-base.code", typeVersion: 2, position: pos,
});
const manual = { parameters: {}, id: "manual", name: "בדיקה ידנית", type: "n8n-nodes-base.manualTrigger", typeVersion: 1, position: [0, 200] };
const cron = (expr, name) => ({ parameters: { rule: { interval: [{ field: "cronExpression", expression: expr }] } }, id: "schedule", name, type: "n8n-nodes-base.scheduleTrigger", typeVersion: 1.2, position: [0, 0] });
const link = (from, to) => ({ [from]: { main: [[{ node: to, type: "main", index: 0 }]] } });
const settings = { executionOrder: "v1", timezone: "Asia/Jerusalem", saveManualExecutions: true };

const workflows = {
  "1-moodle-sync": {
    name: "Copilot · סנכרון יומן המודל (כל 3 שעות)",
    nodes: [cron("0 7-22/3 * * *", "כל 3 שעות"), manual, code("moodle", MAIN.moodle, [260, 100])],
    connections: { ...link("כל 3 שעות", "Copilot"), ...link("בדיקה ידנית", "Copilot") },
  },
  "2-email-changes": {
    name: "Copilot · ביטולים ושינויים מהמייל",
    nodes: [
      { parameters: { mailbox: "INBOX", postProcessAction: "nothing", format: "simple", options: { customEmailConfig: '["UNSEEN"]' } }, id: "imap", name: "מייל חדש", type: "n8n-nodes-base.emailReadImap", typeVersion: 2, position: [0, 0] },
      code("email", MAIN.email, [260, 0]),
    ],
    connections: { ...link("מייל חדש", "Copilot") },
  },
  "3-briefs": {
    name: "Copilot · תדריך בוקר (וביום א׳ גם שבועי)",
    nodes: [cron("23 7 * * *", "כל בוקר 07:23"), manual, code("brief", MAIN.brief, [260, 100])],
    connections: { ...link("כל בוקר 07:23", "Copilot"), ...link("בדיקה ידנית", "Copilot") },
  },
  "4-reminders": {
    name: "Copilot · תזכורות הגשה ומבחן (18:00)",
    nodes: [cron("0 18 * * *", "כל ערב 18:00"), manual, code("reminders", MAIN.reminders, [260, 100])],
    connections: { ...link("כל ערב 18:00", "Copilot"), ...link("בדיקה ידנית", "Copilot") },
  },
};

for (const [file, wf] of Object.entries(workflows)) {
  const out = { ...wf, active: false, settings, pinData: {}, meta: { templateCredsSetupCompleted: false } };
  fs.writeFileSync(path.join(__dirname, "workflows", file + ".json"), JSON.stringify(out, null, 2));
  console.log("✓", file + ".json");
}
