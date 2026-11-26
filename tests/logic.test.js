// הרצה: node tests/logic.test.js
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const L = require("../js/logic.js");

global.window = {};
const mine = path.join(__dirname, "../data/my-semester.js");
const hasMine = fs.existsSync(mine);
require(hasMine ? mine : "../data/sample-semester.js");
const data = window.SEMESTER_DATA || window.SAMPLE_DATA;
const c = (id) => data.courses.find((x) => x.id === id);

let passed = 0, skipped = 0;
const test = (name, fn) => { fn(); passed++; console.log("✓", name); };
// בדיקות שתלויות בנתונים האישיים – רק כשהקובץ קיים (בגיטהאב הוא לא קיים)
const testMine = (name, fn) => (hasMine ? test(name, fn) : (skipped++, console.log("–", name, "(דילוג)")));

// קורסים קבועים לבדיקות הציונים
const ELEC = { id: "e", credits: 3.5, components: [{ key: "hw", weight: 10, type: "hw" }, { key: "exam", weight: 90, type: "exam" }] };
const HF = { id: "h", credits: 3, components: [{ key: "project", weight: 30, type: "project" }, { key: "exam", weight: 70, type: "exam" }] };
const REG = { id: "r", credits: 3.5, components: [{ key: "hw", weight: 5 }, { key: "quiz", weight: 10 }, { key: "project", weight: 15 }, { key: "exam", weight: 70, type: "exam" }] };

// מעקב קצב – חייב להתאים לטבלה במסמך הדרישות נכון ל-30.10 (סוף שבוע 2)
const fri = new Date(2026, 9, 30, 20, 0);
const held = (id, type) => L.coursePace(c(id), data.semester, fri)[type].held.length;
testMine("ניתוח: 2 הרצאות, 2 תרגולים (כולל השלמה 30.10)", () => { assert.equal(held("sad", "lecture"), 2); assert.equal(held("sad", "tutorial"), 2); });
testMine("חשמל: 2 הרצאות, תרגול 1", () => { assert.equal(held("elec", "lecture"), 2); assert.equal(held("elec", "tutorial"), 1); });
testMine("סימולציה: 2 ו-2", () => { assert.equal(held("sim", "lecture"), 2); assert.equal(held("sim", "tutorial"), 2); });
testMine("רגרסיה: הרצאה 1 (27.10 בחירות), 2 תרגולים", () => { assert.equal(held("reg", "lecture"), 1); assert.equal(held("reg", "tutorial"), 2); });
testMine("קבלת החלטות: 1", () => assert.equal(held("dec", "lecture"), 1));
testMine("גורמי אנוש: 1 (21.10 בוטלה)", () => assert.equal(held("hf", "lecture"), 1));
testMine("ההרצאה הבאה בקבלת החלטות מדלגת על 3.11", () =>
  assert.equal(L.coursePace(c("dec"), data.semester, fri).lecture.next.date, "2026-11-10"));
testMine("סדנה: 5 מפגשים בלבד", () =>
  assert.equal(L.sessionOccurrences(c("comm").sessions[0], data.semester, null).length, 5));

test("ביטול ויום בלי לימודים לא נספרים, השלמה נספרת", () => {
  const sem = { end: "2026-12-31", noStudyDates: ["2026-10-27"] };
  const s = { day: 2, start: "10:00", end: "11:00", from: "2026-10-20", cancelled: ["2026-11-03"], extra: [{ date: "2026-10-30" }] };
  const dates = L.sessionOccurrences(s, sem, new Date(2026, 10, 10)).map((o) => o.date);
  assert.deepEqual(dates, ["2026-10-20", "2026-10-30", "2026-11-10"]);
});
test("כלל 56: מבחן 50 → ציון הקורס 50", () =>
  assert.equal(L.courseGrade(REG, { components: { hw: 100, quiz: 100, project: 100, exam: 50 } }).grade, 50));
test("ציון משוקלל רגיל", () => assert.equal(L.courseGrade(ELEC, { components: { hw: 100, exam: 80 } }).grade, 82));
test("כמה צריך במבחן", () => assert.equal(L.neededExam(ELEC, { components: { hw: 100 } }, 90, 85).needed, 88.9));
test("ממוצע משוקלל לפי נק״ז + מצטבר", () => {
  const a = L.averages([ELEC, HF], { e: { components: { hw: 100, exam: 80 } }, h: { components: { project: 90, exam: 90 } } }, { credits: 60, average: 80 }, false);
  assert.ok(Math.abs(a.semester - (82 * 3.5 + 90 * 3) / 6.5) < 1e-9);
  assert.ok(a.cumulative > 80 && a.cumulative < a.semester);
});
test("תעדוף: הגשה בעוד יומיים ב-soon, מבחן רחוק ב-later", () => {
  const t = L.prioritize([
    { id: "a", date: "2026-11-26", title: "x", kind: "submission", weight: 20 },
    { id: "b", date: "2027-01-26", title: "y", kind: "exam", weight: 90 },
  ], new Date(2026, 10, 24, 9));
  assert.equal(t.find((x) => x.id === "soon").items[0].id, "a");
  assert.equal(t.find((x) => x.id === "later").items[0].id, "b");
});
test("קובץ ה-ICS תקין", () => assert.ok(L.buildIcs(data.deadlines, data.courses).includes("BEGIN:VEVENT")));

console.log(`\n${passed} בדיקות עברו${skipped ? `, ${skipped} דולגו (אין קובץ אישי)` : ""}`);

// --- UX additions ---
test("layoutLanes: שני אירועים חופפים מקבלים 2 נתיבים", () => {
  const ev = L.layoutLanes([{ start: "08:00", end: "11:00" }, { start: "10:00", end: "12:00" }, { start: "14:00", end: "17:00" }]);
  assert.deepEqual(ev.map((e) => [e.lane, e.lanes]), [[0, 2], [1, 2], [0, 1]]);
});
test("dueReviews: חזרה יום אחרי, ובלי הצפה כשמשלימים פיגור ישן", () => {
  const now = new Date(2026, 10, 17, 9);
  const r = L.dueReviews({ a: "2026-11-16", b: "2026-11-16" }, { a: "2026-11-15", b: "2026-10-19" }, {}, now);
  assert.deepEqual(r.map((x) => x.key), ["a"]);
  assert.equal(L.dueReviews({ a: "2026-11-16" }, { a: "2026-11-15" }, { "a|r0": true }, now).length, 0);
});
test("weekLoad + semesterWeek", () => {
  const sem = { start: "2026-10-18", end: "2027-01-15", examPeriod: { end: "2027-02-28" } };
  const w = L.weekLoad([{ date: "2026-11-26", weight: 20, kind: "submission" }], sem, new Date(2026, 10, 24));
  assert.equal(w.find((x) => x.current).load, 20);
  assert.equal(L.semesterWeek(sem, new Date(2026, 10, 16)).n, 5);
});
console.log(`${passed} בדיקות עברו בסך הכול`);

// --- focus plan ---
test("buildPlan: פרויקט גדול מקדים הגשה קטנה קרובה יותר, ומתמלא לפי השעות הפנויות", () => {
  const now = new Date(2026, 10, 16, 9);
  const p = L.buildPlan([
    { id: "hw", title: "תרגיל", kind: "submission", due: "2026-11-21", weight: 0 },        // 2 שעות, 5 ימים
    { id: "proj", title: "פרויקט", kind: "submission", due: "2026-11-26", weight: 20 },     // 10 שעות, 10 ימים
    { id: "far", title: "רחוק", kind: "submission", due: "2026-12-20", weight: 0 },
  ], now, { capacity: 3, hoursPerDay: 3 });
  assert.equal(p.today[0].id, "hw");           // slack 4 מול 6 → התרגיל קודם
  assert.deepEqual(p.today.map((x) => x.hours), [2, 1]);
  assert.equal(p.later[0].id, "far");
  assert.match(p.today[1].reason, /~10 שעות/);
});
test("buildPlan: עד מחר תמיד נכנס גם בלי מקום, ונספר כעומס יתר; דחייה מסתירה", () => {
  const now = new Date(2026, 10, 16, 9);
  const p = L.buildPlan([{ id: "a", kind: "submission", due: "2026-11-17", weight: 0 }, { id: "b", kind: "submission", due: "2026-11-17", weight: 0 }], now, { capacity: 2 });
  assert.equal(p.today.length, 2);
  assert.equal(p.overload, 2);
  const q = L.buildPlan([{ id: "a", kind: "submission", due: "2026-11-20", weight: 0, snoozeUntil: "2026-11-17" }], now, { capacity: 4 });
  assert.equal(q.today.length, 0);
});
test("catchupItems: פיגור מתפזר 2 ביום, הרצאה לפני תרגול", () => {
  const sem = { start: "2026-10-18", end: "2026-12-31" };
  const course = { id: "c", sessions: [{ type: "lecture", day: 0, start: "10:00", end: "12:00", from: "2026-10-18" }, { type: "tutorial", day: 0, start: "13:00", end: "14:00", from: "2026-10-18" }] };
  const items = L.catchupItems([course], sem, new Date(2026, 10, 3, 9), {}, 2); // ג׳ 3.11: התקיימו 18.10, 25.10, 1.11
  const backlog = items.filter((i) => /פיגור/.test(i.reason));
  assert.deepEqual(backlog.map((i) => i.sessionType), ["lecture", "tutorial", "lecture", "tutorial"]);
  assert.deepEqual(backlog.map((i) => i.due), ["2026-11-04", "2026-11-04", "2026-11-05", "2026-11-05"]);
  assert.equal(items.length, 6); // + 2 טריים מ-1.11
});
test("freeHoursToday: מוריד שיעור בקמפוס, לא מוקלט", () => {
  const now = new Date(2026, 10, 16, 13, 30);
  const s = [{ start: "14:00", end: "17:00", session: {} }, { start: "17:00", end: "19:00", session: { recorded: true } }];
  assert.equal(L.freeHoursToday(s, now, "19:30", 6), 3); // 6 שעות עד 19:30 פחות 3
});
test("freeHoursToday: מוריד גם התחייבות מהיומן, לא רק שיעורים", () => {
  const now = new Date(2026, 10, 16, 13, 30);
  const s = [{ start: "14:00", end: "16:00", session: {} }];
  const busy = [{ start: "17:00", end: "19:30" }]; // משמרת בעבודה
  assert.equal(L.freeHoursToday(s, now, "19:30", 6), 4);
  assert.equal(L.freeHoursToday(s, now, "19:30", 6, busy), 1.5);
});
test("freeHoursToday: חפיפה בין שיעור להתחייבות נספרת פעם אחת", () => {
  const now = new Date(2026, 10, 16, 13, 30);
  const s = [{ start: "14:00", end: "17:00", session: {} }];
  const busy = [{ start: "16:00", end: "18:00" }]; // שעה אחת חופפת לשיעור
  assert.equal(L.freeHoursToday(s, now, "19:30", 6), 3);
  // התפוס הוא 14:00–18:00, כלומר 4 שעות מתוך 6. ספירה כפולה הייתה נותנת שעה אחת.
  assert.equal(L.freeHoursToday(s, now, "19:30", 6, busy), 2);
});
test("freeHoursToday: התחייבות שנגמרה או שאחרי סוף היום לא משנה כלום", () => {
  const now = new Date(2026, 10, 16, 13, 30);
  const busy = [{ start: "08:00", end: "12:00" }, { start: "20:00", end: "22:00" }];
  assert.equal(L.freeHoursToday([], now, "19:30", 6), 6);
  assert.equal(L.freeHoursToday([], now, "19:30", 6, busy), 6);
});
test("busyMinutes: מאחד קטעים חופפים וסמוכים וגוזר לחלון", () => {
  assert.equal(L.busyMinutes([[60, 120], [90, 150]], 0, 600), 90);
  assert.equal(L.busyMinutes([[60, 120], [120, 180]], 0, 600), 120);
  assert.equal(L.busyMinutes([[60, 120], [300, 360]], 0, 600), 120);
  assert.equal(L.busyMinutes([[0, 600]], 100, 200), 100);
  assert.equal(L.busyMinutes([], 0, 600), 0);
});
const ev = (s, e, extra) => ({ start: { dateTime: s }, end: { dateTime: e }, ...extra });
test("יומן: אירוע רגיל הופך לקטע תפוס בשעון ישראל (קיץ ואחר כך חורף)", () => {
  // 24.10.2026 עוד שעון קיץ (UTC+3), 26.10.2026 כבר שעון חורף (UTC+2)
  assert.deepEqual(L.calendarBusyForDay([ev("2026-10-24T09:00:00Z", "2026-10-24T10:30:00Z")], "2026-10-24"), [{ start: "12:00", end: "13:30" }]);
  assert.deepEqual(L.calendarBusyForDay([ev("2026-10-26T09:00:00Z", "2026-10-26T10:30:00Z")], "2026-10-26"), [{ start: "11:00", end: "12:30" }]);
});
test("יומן: מדלגים על ביטול, 'פנוי', יום שלם ואירוע שהאפליקציה כתבה", () => {
  const day = "2026-11-26";
  const t = ["2026-11-26T08:00:00Z", "2026-11-26T09:00:00Z"];
  assert.equal(L.calendarBusyForDay([ev(...t, { status: "cancelled" })], day).length, 0);
  assert.equal(L.calendarBusyForDay([ev(...t, { transparency: "transparent" })], day).length, 0);
  assert.equal(L.calendarBusyForDay([{ start: { date: day }, end: { date: "2026-11-27" } }], day).length, 0);
  assert.equal(L.calendarBusyForDay([ev(...t, { extendedProperties: { private: { copilot: "1" } } })], day).length, 0);
  assert.equal(L.calendarBusyForDay([ev(...t)], day).length, 1);
  assert.equal(L.calendarBusyForDay(null, day).length, 0);
});
test("יומן: אירוע שחוצה חצות נחתך ליום המבוקש", () => {
  const e = [ev("2026-11-26T20:00:00Z", "2026-11-26T23:30:00Z")]; // 22:00 עד 01:30 למחרת
  assert.deepEqual(L.calendarBusyForDay(e, "2026-11-26"), [{ start: "22:00", end: "24:00" }]);
  assert.deepEqual(L.calendarBusyForDay(e, "2026-11-27"), [{ start: "00:00", end: "01:30" }]);
  assert.equal(L.calendarBusyForDay(e, "2026-11-28").length, 0);
});
test("יומן: אירוע שמשקף הרצאה מוקלטת לא תופס זמן, אירוע אחר כן", () => {
  const sessions = [{ start: "10:00", end: "12:00", session: { recorded: true } }, { start: "14:00", end: "16:00", session: {} }];
  const busy = [{ start: "10:00", end: "12:00" }, { start: "14:00", end: "16:00" }, { start: "12:30", end: "13:00" }];
  assert.deepEqual(L.dropSessionEchoes(busy, sessions), [{ start: "14:00", end: "16:00" }, { start: "12:30", end: "13:00" }]);
});
test("יומן: השעות הפנויות יורדות לפי האירועים, בלי ספירה כפולה עם שיעור קיים", () => {
  const now = new Date(2026, 10, 26, 8, 0);
  const cls = [{ start: "10:00", end: "12:00", session: {} }];
  const busy = L.calendarBusyForDay([ev("2026-11-26T08:00:00Z", "2026-11-26T09:00:00Z")], "2026-11-26"); // 10:00 עד 11:00 בישראל
  assert.equal(L.freeHoursToday(cls, now, "19:30", 12, busy), L.freeHoursToday(cls, now, "19:30", 12)); // האירוע בתוך השיעור
  const other = L.calendarBusyForDay([ev("2026-11-26T12:00:00Z", "2026-11-26T14:00:00Z")], "2026-11-26"); // 14:00 עד 16:00
  assert.equal(L.freeHoursToday([], now, "19:30", 12) - L.freeHoursToday([], now, "19:30", 12, other), 2);
});
test("syncHealth: תקין, ישן, נכשל, וללא נתונים", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const ago = (h) => new Date(now - h * 3600000).toISOString();
  assert.equal(L.syncHealth([], now).status, "none");
  assert.equal(L.syncHealth(null, now).status, "none");
  assert.equal(L.syncHealth([{ source: "1-moodle-sync", last_success: ago(3), failures: 0 }], now).status, "ok");
  // הפער הלילי הרגיל של סנכרון מודל (9 שעות) לא נחשב תקלה
  assert.equal(L.syncHealth([{ source: "1-moodle-sync", last_success: ago(10), failures: 0 }], now).status, "ok");
  const stale = L.syncHealth([{ source: "1-moodle-sync", last_success: ago(14), failures: 0 }], now);
  assert.equal(stale.status, "stale");
  assert.ok(stale.text.includes("סנכרון מודל") && stale.text.includes("14"));
  const failing = L.syncHealth([{ source: "3-briefs", last_success: ago(2), failures: 2, last_error: "x" }, { source: "1-moodle-sync", last_success: ago(30), failures: 0 }], now);
  assert.equal(failing.status, "failing");
  assert.equal(L.syncHealth([{ source: "unknown", last_success: ago(500), failures: 5 }], now).status, "none");
  assert.ok(L.syncHealth([{ source: "4-reminders", last_success: null, failures: 0 }], now).text.includes("אף פעם"));
});
console.log(`${passed} בדיקות עברו בסך הכול`);
