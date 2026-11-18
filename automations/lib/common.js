// משותף לכל האוטומציות: גישה ל-Supabase וטעינת ההקשר של הסטודנטית.
// http = this.helpers.httpRequest מתוך n8n (או פונקציה מדומה בבדיקות).

function makeSupa(http, url, key) {
  const base = String(url).replace(/\/$/, "") + "/rest/v1/";
  const headers = { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" };
  const req = (method, path, body, extra) =>
    http({ method, url: base + path, headers: { ...headers, ...(extra || {}) }, body, json: true });
  return {
    select: (table, query) => req("GET", `${table}?${query}`),
    /** mode: "merge" מעדכן קיים, "ignore" מדלג (ומחזיר רק שורות חדשות) */
    upsert: (table, rows, onConflict, mode) =>
      rows.length
        ? req("POST", `${table}?on_conflict=${onConflict}`, rows, {
            Prefer: `resolution=${mode === "merge" ? "merge" : "ignore"}-duplicates,return=representation`,
          })
        : Promise.resolve([]),
    update: (table, query, patch) => req("PATCH", `${table}?${query}`, patch, { Prefer: "return=representation" }),
  };
}

async function loadContext(supa, userId, L) {
  const q = `user_id=eq.${userId}`;
  const [sd, us, ev, ch] = await Promise.all([
    supa.select("semester_data", `${q}&select=data`),
    supa.select("user_state", `${q}&select=state`),
    supa.select("events", `${q}&select=*&order=date`),
    supa.select("schedule_changes", `${q}&select=*&status=neq.rejected`),
  ]);
  if (!sd.length) throw new Error("אין נתוני סמסטר בענן – להעלות מהאפליקציה: גיבוי והגדרות ← העלאת קובץ הנתונים לענן");
  const base = sd[0].data;
  const applied = ch.filter((c) => c.status === "applied");
  return {
    base,
    data: L.applyRemote(base, { events: ev, changes: applied }),
    state: (us[0] && us[0].state) || {},
    events: ev,
    changes: ch,
  };
}

module.exports = { makeSupa, loadContext };
