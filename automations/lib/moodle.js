// סנכרון יומן המודל: קריאת קובץ ה-iCal, זיהוי הקורס, והפיכה לשורות בטבלת events.

function unescapeIcs(v) {
  // ב-iCal: "\n" כתוב כשני תווים (לוכסן הפוך + n), ופסיק/נקודה-פסיק/לוכסן מקבלים לוכסן הפוך לפניהם
  const BS = String.fromCharCode(92);
  return v.split(BS + "n").join("\n").split(BS + "N").join("\n").split(BS + ",").join(",").split(BS + ";").join(";").split(BS + BS).join(BS);
}

function parseIcs(text) {
  const lines = String(text).replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out = [];
  let cur = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") cur = {};
    else if (line === "END:VEVENT") { if (cur) out.push(cur); cur = null; }
    else if (cur) {
      const i = line.indexOf(":");
      if (i < 0) continue;
      const [name, ...params] = line.slice(0, i).split(";");
      cur[name.toUpperCase()] = { value: unescapeIcs(line.slice(i + 1)), params };
    }
  }
  return out;
}

/** "20261126T215500Z" / "20261126T235500" / "20261126" → {date, time} בזמן המקומי (TZ של n8n). */
function icsWhen(v) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z?))?$/.exec(v || "");
  if (!m) return null;
  const [, y, mo, d, h, mi, s, z] = m;
  if (h === undefined) return { date: `${y}-${mo}-${d}`, time: null };
  const dt = z ? new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)) : new Date(+y, +mo - 1, +d, +h, +mi, +s);
  const p = (n) => String(n).padStart(2, "0");
  return { date: `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`, time: `${p(dt.getHours())}:${p(dt.getMinutes())}` };
}

/** מזהה קורס לפי מספר הקורס (364-1-1411 ↔ 36411411…) או לפי השם. */
function mapCourse(text, courses) {
  const digits = String(text).replace(/[^\d]+/g, " ");
  for (const c of courses) {
    const code = String(c.code || "").replace(/\D/g, "");
    if (code.length >= 6 && digits.split(" ").some((tok) => tok.includes(code))) return c.id;
  }
  for (const c of courses) {
    if ((c.name && text.includes(c.name)) || (c.short && c.short.length > 2 && text.includes(c.short))) return c.id;
  }
  return null;
}

const SKIP = /(opens|נפתח|פתיחת|פתיחה|starts|מתחיל)/i;
const CLEAN = /\s*(is due|closes|should be completed|יש להגיש|עד לתאריך|הגשה עד|נסגר)\s*$/i;

/** המודל של בן-גוריון כותב: יש להגיש את 'שם המטלה'  →  שם המטלה */
function cleanTitle(summary) {
  let t = summary.replace(CLEAN, "").trim();
  const m = /^יש להגיש את\s+['"׳‘’](.+)['"׳‘’]$/.exec(t);
  if (m) t = m[1];
  return t.replace(/^(.+?)\s*-\s*תיבת הגשה$/, "$1").trim();
}

function moodleToEvents(icsText, courses) {
  const out = [];
  for (const ev of parseIcs(icsText)) {
    const summary = (ev.SUMMARY && ev.SUMMARY.value) || "";
    if (!summary || SKIP.test(summary)) continue;
    const when = icsWhen((ev.DTEND && !ev.DTSTART ? ev.DTEND : ev.DTSTART || {}).value);
    if (!when) continue;
    const hay = [summary, ev.CATEGORIES && ev.CATEGORIES.value, ev.DESCRIPTION && ev.DESCRIPTION.value, ev.LOCATION && ev.LOCATION.value].filter(Boolean).join(" ");
    const kind = /מבחן|exam/i.test(summary) ? "exam" : /בוחן|quiz/i.test(summary) ? "quiz" : "submission";
    out.push({
      source: "moodle",
      external_id: (ev.UID && ev.UID.value) || `${when.date}-${summary}`,
      course_id: mapCourse(hay, courses),
      kind,
      title: cleanTitle(summary),
      date: when.date,
      time: when.time,
      url: (ev.URL && ev.URL.value) || null,
    });
  }
  return out;
}

module.exports = { parseIcs, icsWhen, mapCourse, moodleToEvents };
