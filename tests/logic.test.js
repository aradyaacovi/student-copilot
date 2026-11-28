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
test("index.html: סקריפט Supabase מקובע לגרסה מדויקת, עם SRI ו-crossorigin", () => {
  const html = fs.readFileSync(path.join(__dirname, "../index.html"), "utf8");
  const tag = html.match(/<script[^>]*jsdelivr[^>]*supabase-js[^>]*>/);
  assert.ok(tag, "נמצא תג הסקריפט");
  assert.ok(/supabase-js@\d+\.\d+\.\d+\/dist\//.test(tag[0]), "גרסה מדויקת, לא טווח");
  assert.ok(/integrity="sha384-[A-Za-z0-9+/]{64}"/.test(tag[0]), "יש integrity sha384");
  assert.ok(/crossorigin="anonymous"/.test(tag[0]));
});
// ייצוא לטבלה – השורות נגזרות מאותה לוגיקה שמציגה את מעקב הקצב
const expNow = L.withTime("2026-11-17", "23:59");
test("exportRows: מספר המפגשים שהתקיימו שווה למעקב הקצב, ולכל שורה שעות ושבוע", () => {
  const t = L.exportRows(data, expNow, (data.demoState || {}).seen);
  let held = 0, upcoming = 0;
  for (const course of data.courses) {
    const pace = L.coursePace(course, data.semester, expNow);
    for (const type of Object.keys(pace)) {
      held += pace[type].held.length;
      upcoming += pace[type].upcoming.length;
    }
  }
  assert.equal(t.sessions.filter((r) => r.status === "held").length, held);
  assert.equal(t.sessions.filter((r) => r.status === "upcoming").length, upcoming);
  assert.equal(t.sessions.length, held + upcoming);
  // כל שורה: שעות חיוביות, שבוע סמסטר מ-1 ומעלה, ותאריך בפורמט אחד
  for (const r of t.sessions) {
    assert.ok(r.hours > 0 && r.hours <= 12, `שעות לא תקינות: ${r.hours}`);
    assert.ok(r.semester_week >= 1, `שבוע לא תקין: ${r.semester_week}`);
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(r.date));
    assert.ok(["held", "upcoming"].includes(r.status));
  }
  // מפגש עתידי לא מסומן כנצפה, ושיעור שבוטל לא מופיע בכלל
  assert.ok(t.sessions.filter((r) => r.status === "upcoming").every((r) => r.watched === ""));
  assert.ok(t.sessions.every((r) => !(data.semester.noStudyDates || []).includes(r.date)));
  // מטלות ורכיבי ציון: שורה לכל פריט, ושם הקורס מתורגם מהמזהה
  assert.equal(t.deadlines.length, data.deadlines.length);
  assert.equal(t.components.length, data.courses.reduce((s, c) => s + (c.components || []).length, 0));
  for (const d of data.deadlines.filter((x) => x.courseId)) {
    const course = data.courses.find((x) => x.id === d.courseId);
    if (course) assert.ok(t.deadlines.some((r) => r.date === d.date && r.course === course.name), `${d.title}: שם הקורס לא תורגם`);
  }
  // סך המשקלים בכל קורס שהוגדרו לו רכיבים הוא 100 (קורס בלי רכיבים לא מייצר שורות)
  for (const course of data.courses.filter((x) => (x.components || []).length)) {
    const sum = t.components.filter((r) => r.course === course.name).reduce((s, r) => s + Number(r.weight), 0);
    assert.equal(sum, 100, `${course.name}: סך המשקלים ${sum}`);
  }
});
// סמסטר מינימלי לבדיקה, כדי שהתוצאה לא תשתנה עם הנתונים שנטענו
const EXP_FIX = {
  semester: { start: "2026-10-18", end: "2026-11-30", noStudyDates: ["2026-10-25"] },
  courses: [{
    id: "x", name: "קורס לדוגמה", code: "000-0", credits: 3,
    components: [{ key: "hw", name: "תרגילים", type: "hw", weight: 40 }, { key: "exam", name: "מבחן", type: "exam", weight: 60 }],
    sessions: [{ type: "lecture", day: 0, start: "10:00", end: "12:00", from: "2026-10-18", location: "בניין 1, חדר 101", cancelled: ["2026-11-01"], extra: [{ date: "2026-11-03", start: "16:00", end: "17:00" }] }],
  }],
  deadlines: [{ date: "2026-11-05", time: "23:55", courseId: "x", title: "תרגיל 1", weight: 5, kind: "submission" }],
};
test("exportRows: ביטול ויום בלי לימודים יורדים, השלמה מסומנת, ונצפה נקרא ממפתח האפליקציה", () => {
  const t = L.exportRows(EXP_FIX, expNow, { [L.seenKey("x", "lecture", 1)]: true });
  const dates = t.sessions.map((r) => r.date);
  assert.deepEqual(dates, ["2026-10-18", "2026-11-03", "2026-11-08", "2026-11-15", "2026-11-22", "2026-11-29"]);
  assert.equal(t.sessions.filter((r) => r.status === "held").length, 4);
  assert.equal(t.sessions.filter((r) => r.status === "upcoming").length, 2);
  // ההשלמה מסומנת כהשלמה, ושעה אחת בלבד
  const makeup = t.sessions.find((r) => r.date === "2026-11-03");
  assert.equal(makeup.makeup, "yes");
  assert.equal(makeup.hours, 1);
  // מצב הצפייה: רק המפגש הראשון סומן
  assert.deepEqual(t.sessions.map((r) => r.watched), ["yes", "no", "no", "no", "", ""]);
  assert.deepEqual(L.exportRows(EXP_FIX, expNow, null).sessions.map((r) => r.watched), ["no", "no", "no", "no", "", ""]);
  // מספור המפגש, שבוע הסמסטר ושם היום
  assert.deepEqual(t.sessions.map((r) => r.occurrence), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(t.sessions.map((r) => r.semester_week), [1, 3, 4, 5, 6, 7]);
  assert.equal(t.sessions[0].weekday, "א׳");
  assert.equal(t.sessions[0].location, "בניין 1, חדר 101");
  // מטלה: שם הקורס במקום המזהה
  assert.equal(t.deadlines[0].course, "קורס לדוגמה");
  assert.equal(t.deadlines[0].semester_week, 3);
  assert.deepEqual(t.components.map((r) => [r.component, r.weight]), [["תרגילים", 40], ["מבחן", 60]]);
});
test("toCsv: כותרות מהמפתחות, פסיק ומירכאות בתוך תא, ושורות בסיום שורה של אקסל", () => {
  const csv = L.toCsv([{ a: 'x,y', b: 'he said "no"', c: "" }, { a: "1", b: null, c: 2 }]);
  assert.equal(csv, 'a,b,c\r\n"x,y","he said ""no""",\r\n1,,2\r\n');
  assert.equal(L.toCsv([]), "");
  assert.equal(L.toCsv(null), "");
  // התא עם הפסיק נשאר תא אחד בקריאה חזרה
  assert.equal(csv.split("\r\n")[1].split('","')[0], '"x,y');
});
test("semesterWeekOf: שבוע ראשון הוא 1, וכל שבוע קלנדרי מתקדם באחד", () => {
  const sem = { start: "2026-10-18" };
  assert.equal(L.semesterWeekOf(sem, "2026-10-18"), 1);
  assert.equal(L.semesterWeekOf(sem, "2026-10-24"), 1);
  assert.equal(L.semesterWeekOf(sem, "2026-10-25"), 2);
  assert.equal(L.semesterWeekOf(sem, "2026-11-17"), 5);
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
test("dueBadge: באיחור, היום, מחר ועוד יומיים. מעבר לכך אין תווית", () => {
  assert.deepEqual(L.dueBadge(-3), { text: "באיחור של 3 ימים", cls: "now" });
  assert.equal(L.dueBadge(-1).text, "באיחור של יום");
  assert.deepEqual(L.dueBadge(0), { text: "היום", cls: "now" });
  assert.deepEqual(L.dueBadge(1), { text: "מחר", cls: "soon" });
  assert.equal(L.dueBadge(2).text, "עוד יומיים");
  for (const x of [3, 30, null, undefined, NaN]) assert.equal(L.dueBadge(x), null);
});
test("adherence: סופרת רק ימים שעברו, בחלון, ומשימה שהושלמה אחר כך נחשבת", () => {
  const now = new Date(2026, 10, 26, 9, 0);
  const log = { "2026-11-26": ["x", "y"], "2026-11-25": ["a", "b", "c", "d"], "2026-11-24": ["e"], "2026-11-20": [], "2026-10-01": ["old"] };
  const done = new Set(["a", "b", "c", "e", "x"]);
  const r = L.adherence(log, (id) => done.has(id), now, 14);
  assert.deepEqual(r, { days: 2, planned: 5, done: 4, pct: 80 }); // היום, יום ריק וחודש ישן לא נספרים
  assert.deepEqual(L.adherence({}, () => true, now), { days: 0, planned: 0, done: 0, pct: null });
  assert.equal(L.adherence(null, () => true, now).pct, null);
});
test("syncHealth: סנכרון יומן נחשב ישן אחרי 3 שעות", () => {
  const now = new Date("2026-11-26T12:00:00Z");
  const row = (h) => ({ source: "5-calendar-sync", last_success: new Date(now - h * 3600000).toISOString(), failures: 0 });
  assert.equal(L.syncHealth([row(2)], now).status, "ok");
  const r = L.syncHealth([row(5)], now);
  assert.equal(r.status, "stale");
  assert.ok(r.text.includes("סנכרון יומן"));
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
test("escapeHtml and safeUrl block markup and javascript: links", () => {
  assert.equal(L.escapeHtml(`<img src=x onerror="a()">'&`), "&lt;img src=x onerror=&quot;a()&quot;&gt;&#39;&amp;");
  assert.equal(L.escapeHtml(null), "");
  assert.equal(L.safeUrl("https://moodle.bgu.ac.il/x?a=1"), "https://moodle.bgu.ac.il/x?a=1");
  assert.equal(L.safeUrl("  HTTP://a.b"), "HTTP://a.b");
  assert.equal(L.safeUrl("mailto:a@b.c"), "mailto:a@b.c");
  for (const bad of ["javascript:alert(1)", " JaVaScRiPt:alert(1)", "data:text/html,<script>", "//evil.com", "vbscript:x", "", null, undefined]) assert.equal(L.safeUrl(bad), "");
});
console.log(`${passed} בדיקות עברו בסך הכול`);

test("matchMoodleGrades: מתאים לפי שם מנורמל, מדלג על ציון ריק, ולא מנחש", () => {
  const courses = [{ id: "sad", name: "ניתוח ועיצוב מערכות מידע" }, { id: "sim", name: "סימולציה" }, { id: "reg", name: "מודלים של רגרסיה ליניארית" }];
  const rows = [
    { name: "סימולציה סמ 1", grade: "100.00" },
    { name: "ניתוח ועיצוב מערכות מידע - סמסטר א' - תשפ\"ז", grade: "-" },
    { name: "מודלים של רגרסיה ליניארית סמ 1", grade: "91.5" },
    { name: "קורס אחר לגמרי", grade: "90" },
    { name: "סימולציה סמ 1 תגבור", grade: "80" },
  ];
  const m = L.matchMoodleGrades(rows, courses);
  assert.deepEqual(m.map((x) => [x.courseId, x.grade]), [["sim", 100], ["reg", 91.5]]); // סימולציה פעם אחת בלבד
  assert.deepEqual(L.matchMoodleGrades(null, courses), []);
});

test("matchSubmitted: מסמן רק התאמה חד-משמעית של קורס ושם מטלה", () => {
  const courses = [{ id: "sad", name: "ניתוח ועיצוב מערכות מידע" }, { id: "sim", name: "סימולציה" }];
  const deadlines = [{ id: "d1", courseId: "sad", title: "תרגיל בית 1" }, { id: "d2", courseId: "sad", title: "תרגיל בית 2" }, { id: "d3", courseId: "sim", title: "תרגיל בית 1" }];
  const sub = [
    { course: "ניתוח ועיצוב מערכות מידע - סמסטר א'", item: "תרגיל בית 1" },
    { course: "קורס אחר", item: "תרגיל בית 1" },
    { course: "סימולציה סמ 1", item: "מטלה שלא קיימת" },
  ];
  assert.deepEqual(L.matchSubmitted(sub, courses, deadlines).map((x) => x.id), ["d1"]);
  assert.deepEqual(L.matchSubmitted(null, courses, deadlines), []);
});
