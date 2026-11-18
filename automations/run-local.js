// מריץ אוטומציה אחת מהמחשב, בלי n8n – לבדיקה מול Supabase האמיתי.
//   node automations/run-local.js upload     מעלה את data/my-semester.js לענן
//   node automations/run-local.js 3-briefs   מריץ workflow (1-moodle-sync / 3-briefs / 4-reminders)
const fs = require("fs");
const path = require("path");
const env = {};
for (const l of fs.readFileSync(path.join(__dirname, ".env"), "utf8").split(/\r?\n/)) {
  const m = /^([A-Z_]+)=(.*)$/.exec(l);
  if (m) env[m[1]] = m[2].trim();
}
const http = async (o) => {
  const res = await fetch(o.url, { method: o.method, headers: o.headers, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${o.method} ${o.url.split("?")[0]} → HTTP ${res.status}: ${text.slice(0, 300)}`);
  if (o.json === false) return text;
  return text ? JSON.parse(text) : [];
};

(async () => {
  const what = process.argv[2];
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
  const out = await new AsyncFunction("$env", "$input", code).call({ helpers: { httpRequest: http } }, env, { all: () => [] });
  console.log(wf.name, "→", JSON.stringify(out.map((o) => o.json)));
})().catch((e) => { console.error("נכשל:", e.message); process.exit(1); });
