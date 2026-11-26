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

/**
 * רושם דופק אחרי כל ריצה: הצלחה מאפסת את מונה הכשלונות, כשל מעלה אותו ומוסיף התראה בתיבת ההודעות
 * (אחת ליום לכל workflow). אם הרישום עצמו נכשל לא זורקים, כדי לא להסתיר את השגיאה המקורית.
 */
async function recordRun(supa, userId, source, error, now, labels) {
  const iso = now.toISOString();
  try {
    let failures = 0;
    if (error) {
      const prev = await supa.select("sync_state", `user_id=eq.${userId}&source=eq.${source}&select=failures`);
      failures = ((prev[0] && prev[0].failures) || 0) + 1;
    }
    const row = error
      ? { user_id: userId, source, last_attempt: iso, last_error: String(error).slice(0, 200), failures }
      : { user_id: userId, source, last_attempt: iso, last_success: iso, last_error: null, failures: 0 };
    await supa.upsert("sync_state", [row], "user_id,source", "merge");
    if (error) {
      const label = (labels && labels[source]) || source;
      await supa.upsert("inbox", [{
        user_id: userId, kind: "alert", title: `האוטומציה נכשלה: ${label}`,
        body: String(error).slice(0, 200), dedupe_key: `syncfail|${source}|${iso.slice(0, 10)}`,
      }], "user_id,dedupe_key", "ignore");
    }
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = { makeSupa, loadContext, recordRun };
