/*
 * Student Copilot – pure logic (no DOM).
 * Works in the browser (window.Logic) and in Node (module.exports) for tests.
 */
(function (root) {
  "use strict";

  const DAY_MS = 24 * 60 * 60 * 1000;
  const DAY_NAMES = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
  const SESSION_LABEL = { lecture: "הרצאה", tutorial: "תרגול", workshop: "מפגש" };

  // ---------- dates ----------
  function parseDate(s) {
    const [y, m, d] = String(s).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function iso(d) {
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  }
  function startOfDay(d) {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }
  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }
  function daysUntil(dateStr, now) {
    return Math.round((parseDate(dateStr) - startOfDay(now)) / DAY_MS);
  }
  function fmt(dateStr) {
    const d = parseDate(dateStr);
    return `${d.getDate()}.${d.getMonth() + 1}`;
  }
  function fmtLong(dateStr) {
    const d = parseDate(dateStr);
    return `יום ${DAY_NAMES[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}`;
  }
  function withTime(dateStr, hhmm) {
    const d = parseDate(dateStr);
    const [h, m] = (hhmm || "23:59").split(":").map(Number);
    d.setHours(h, m, 0, 0);
    return d;
  }
  function startOfWeek(d) {
    return addDays(startOfDay(d), -d.getDay()); // Sunday
  }

  // ---------- sessions & pace ----------
  /** All occurrences of one recurring session (plus extras), sorted. */
  function sessionOccurrences(session, semester, untilDate) {
    const out = [];
    const skip = new Set([...(semester.noStudyDates || []), ...(session.cancelled || [])]);
    if (session.day !== undefined && session.from) {
      let d = parseDate(session.from);
      while (d.getDay() !== session.day) d = addDays(d, 1);
      const end = session.until ? parseDate(session.until) : parseDate(semester.end);
      const limit = untilDate && untilDate < end ? untilDate : end;
      let count = 0;
      while (d <= limit) {
        const s = iso(d);
        if (!skip.has(s)) {
          out.push({ date: s, start: session.start, end: session.end, extra: false });
          count++;
          if (session.count && count >= session.count) break;
        }
        d = addDays(d, 7);
      }
    }
    for (const x of session.extra || []) {
      if (!untilDate || parseDate(x.date) <= untilDate) {
        out.push({ date: x.date, start: x.start || session.start, end: x.end || session.end, extra: true, note: x.note || "השלמה" });
      }
    }
    out.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return out;
  }

  /** Held sessions (ended before `now`) and the next one, per session type. */
  function coursePace(course, semester, now) {
    const result = {};
    for (const session of course.sessions || []) {
      const type = session.type;
      const all = sessionOccurrences(session, semester, null);
      if (!result[type]) result[type] = { held: [], upcoming: [], session };
      for (const o of all) {
        const ended = withTime(o.date, o.end) <= now;
        (ended ? result[type].held : result[type].upcoming).push({ ...o, location: session.location, recorded: session.recorded, online: session.online });
      }
    }
    for (const type of Object.keys(result)) {
      const r = result[type];
      r.held.sort((a, b) => a.date.localeCompare(b.date));
      r.upcoming.sort((a, b) => a.date.localeCompare(b.date));
      r.held.forEach((o, i) => (o.n = i + 1));
      r.upcoming.forEach((o, i) => (o.n = r.held.length + i + 1));
      r.next = r.upcoming[0] || null;
    }
    return result;
  }

  function seenKey(courseId, type, n) {
    return `${courseId}|${type}|${n}`;
  }

  /** Per-course pace status given the "seen" map. */
  function paceStatus(course, semester, now, seen) {
    const pace = coursePace(course, semester, now);
    const items = [];
    let behind = 0;
    for (const type of Object.keys(pace)) {
      for (const o of pace[type].held) {
        const key = seenKey(course.id, type, o.n);
        const isSeen = !!(seen && seen[key]);
        const age = -daysUntil(o.date, now);
        const nextTut = pace.tutorial && pace.tutorial.next;
        const blocksTutorial = type === "lecture" && nextTut && !isSeen && daysUntil(nextTut.date, now) <= 3;
        if (!isSeen) behind++;
        items.push({
          key, type, n: o.n, date: o.date, seen: isSeen, age, extra: o.extra,
          label: `${SESSION_LABEL[type] || type} ${o.n}`,
          urgent: !isSeen && (age > 7 || blocksTutorial),
          recorded: o.recorded,
        });
      }
    }
    return { pace, items, behind };
  }

  /** Sessions happening on a given day across all courses. */
  function sessionsOnDate(courses, semester, dateStr) {
    const d = parseDate(dateStr);
    const out = [];
    for (const c of courses) {
      for (const s of c.sessions || []) {
        const occ = sessionOccurrences(s, semester, d).filter((o) => o.date === dateStr);
        for (const o of occ) out.push({ course: c, session: s, ...o });
      }
    }
    return out.sort((a, b) => a.start.localeCompare(b.start));
  }

  /** Recurring + extra sessions inside a week, with cancellations marked. */
  function weekSessions(courses, semester, weekStart) {
    const out = [];
    const weekEnd = addDays(weekStart, 6);
    for (const c of courses) {
      for (const s of c.sessions || []) {
        const skip = new Set([...(semester.noStudyDates || []), ...(s.cancelled || [])]);
        if (s.day !== undefined && s.from) {
          const d = addDays(weekStart, s.day);
          const ds = iso(d);
          const inRange = d >= parseDate(s.from) && d <= parseDate(s.until || semester.end);
          if (inRange) {
            const occ = sessionOccurrences(s, semester, weekEnd);
            const happens = occ.some((o) => o.date === ds && !o.extra);
            const cancelled = skip.has(ds);
            if (happens || cancelled) out.push({ course: c, session: s, date: ds, day: s.day, start: s.start, end: s.end, cancelled, extra: false });
          }
        }
        for (const x of s.extra || []) {
          const d = parseDate(x.date);
          if (d >= weekStart && d <= weekEnd) {
            out.push({ course: c, session: s, date: x.date, day: d.getDay(), start: x.start || s.start, end: x.end || s.end, cancelled: false, extra: true, note: x.note });
          }
        }
      }
    }
    return out;
  }

  // ---------- grades ----------
  function num(v) {
    if (v === "" || v === null || v === undefined) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  /**
   * Course grade from component grades.
   * Rules: if the exam is below `examMin` (default 56 when there is an exam), the course grade
   * is the exam grade. Components with `min` that are below it are flagged as failed conditions.
   */
  function courseGrade(course, g) {
    g = g || {};
    const comps = course.components || [];
    const bonus = num(g.bonus) || 0;
    if (!comps.length) {
      const f = num(g.final);
      return { grade: f, complete: f !== null, projected: f, failed: [], note: f === null ? "להזין ציון סופי" : "" };
    }
    let sum = 0, wEntered = 0, wTotal = 0;
    const failed = [];
    let exam = null;
    for (const c of comps) {
      wTotal += c.weight;
      const v = num(g.components && g.components[c.key]);
      if (c.type === "exam") exam = { comp: c, v };
      if (v === null) continue;
      sum += c.weight * v;
      wEntered += c.weight;
      if (c.min !== undefined && v < c.min) failed.push(`${c.name} מתחת ל-${c.min}`);
    }
    const complete = wEntered === wTotal && wTotal > 0;
    const examMin = course.examMin !== undefined ? course.examMin : exam ? 56 : null;
    let note = "";
    let grade = complete ? Math.min(100, sum / wTotal + bonus) : null;
    if (exam && exam.v !== null && examMin !== null && exam.v < examMin) {
      grade = exam.v;
      note = `מבחן מתחת ל-${examMin}: ציון הקורס = ציון המבחן`;
      failed.push(note);
    }
    const projected = wEntered ? Math.min(100, sum / wEntered + bonus) : null;
    return { grade, complete, projected, failed, note, wEntered, wTotal };
  }

  /** Exam grade needed for a target course grade. Missing non-exam components use `assume`. */
  function neededExam(course, g, target, assume) {
    g = g || {};
    const comps = course.components || [];
    const exam = comps.find((c) => c.type === "exam");
    if (!exam) return null;
    const bonus = num(g.bonus) || 0;
    let other = 0;
    const assumed = [];
    for (const c of comps) {
      if (c === exam) continue;
      let v = num(g.components && g.components[c.key]);
      if (v === null) { v = assume; assumed.push(c.name); }
      other += c.weight * v;
    }
    const wTotal = comps.reduce((s, c) => s + c.weight, 0);
    let x = ((target - bonus) * wTotal - other) / exam.weight;
    const examMin = course.examMin !== undefined ? course.examMin : 56;
    x = Math.max(x, examMin);
    return { needed: Math.ceil(x * 10) / 10, possible: x <= 100, assumed };
  }

  /** Credit-weighted averages. Uses final grade, or projected when `useProjected`. */
  function averages(courses, grades, previous, useProjected) {
    let pts = 0, cr = 0;
    const rows = [];
    for (const c of courses) {
      if (c.graded === false) continue;
      const r = courseGrade(c, grades[c.id]);
      const v = r.grade !== null ? r.grade : useProjected ? r.projected : null;
      rows.push({ course: c, ...r, used: v });
      if (v !== null) { pts += v * c.credits; cr += c.credits; }
    }
    const semester = cr ? pts / cr : null;
    const pc = num(previous && previous.credits), pa = num(previous && previous.average);
    let cumulative = null;
    if (pc && pa !== null) cumulative = (pa * pc + pts) / (pc + cr);
    else if (semester !== null) cumulative = semester;
    return { rows, semester, semesterCredits: cr, cumulative };
  }

  // ---------- priorities ----------
  const TIERS = [
    { id: "now", title: "היום / באיחור" },
    { id: "soon", title: "ב-3 הימים הקרובים" },
    { id: "week", title: "עד 10 ימים" },
    { id: "later", title: "בהמשך" },
  ];

  function examPrepDays(weight) {
    return Math.max(7, Math.round((weight || 50) * 0.25));
  }

  /**
   * Build a prioritized task list.
   * items: {id, date, time?, title, weight?, kind, courseId?, done?}
   */
  function prioritize(items, now) {
    const out = [];
    for (const it of items) {
      if (it.done) continue;
      const days = it.date ? daysUntil(it.date, now) : null;
      if (days !== null && days < -2 && it.kind !== "custom") continue; // long past deadlines drop off
      let tier;
      let flag = "";
      if (days === null) tier = "week";
      else if (days <= 0) { tier = "now"; if (days < 0) flag = "באיחור?"; }
      else if (days <= 3) tier = "soon";
      else if (days <= 10) tier = "week";
      else tier = "later";
      let prepStart = null;
      if (it.kind === "exam" && days !== null) {
        const pd = examPrepDays(it.weight);
        prepStart = iso(addDays(parseDate(it.date), -pd));
        if (tier === "later" && days <= pd) { tier = "week"; flag = "זמן להתחיל ללמוד"; }
      }
      const weight = it.weight || 0;
      const score = (days === null ? 5 : Math.max(days, 0)) - weight / 10;
      out.push({ ...it, days, tier, flag, prepStart, score });
    }
    out.sort((a, b) => a.score - b.score);
    return TIERS.map((t) => ({ ...t, items: out.filter((x) => x.tier === t.id) }));
  }

  // ---------- focus plan: one prioritization logic ----------
  /** Estimated hours of work by kind and grade weight. `effort` on the item overrides. */
  function estimateEffort(it) {
    if (it.effort) return it.effort;
    const w = it.weight || 0;
    switch (it.kind) {
      case "exam": return Math.max(10, Math.round(w * 0.4));
      case "quiz": return 4;
      case "submission": return w >= 10 ? Math.round(w * 0.5) : 2;
      case "catchup": return it.sessionType === "lecture" ? 1.5 : 1;
      case "review": return 0.5;
      default: return 1;
    }
  }

  /**
   * Turn a list of items into a prioritized plan.
   * Each item: {id, title, kind, courseId, due ("YYYY-MM-DD"|null), weight, effort?, snoozeUntil?}
   * Logic: startBy = due − (effort / hoursPerDay) days. slack = days until startBy.
   *   slack ≤ 0  → "must"  (start today or you run out of time)   · due today/tomorrow is always "must"
   *   slack ≤ 3  → "should"
   *   else       → "later"
   * Sorting: smaller slack first; ties broken by grade weight.
   * Today's plan: fill `capacity` hours in order (must, then should, then pulling ahead), at most `maxChunk` hours per item per day.
   */
  function buildPlan(items, now, opts) {
    const o = Object.assign({ hoursPerDay: 3, capacity: 4, maxChunk: 2 }, opts || {});
    const today = iso(now);
    const list = [];
    for (const it of items) {
      const effort = estimateEffort(it);
      const daysLeft = it.due ? daysUntil(it.due, now) : null;
      const needDays = Math.ceil(effort / o.hoursPerDay);
      const slack = daysLeft === null ? 30 : daysLeft - needDays;
      const snoozed = !!(it.snoozeUntil && it.snoozeUntil > today);
      let bucket = slack <= 0 ? "must" : slack <= 3 ? "should" : "later";
      if (daysLeft !== null && daysLeft <= 1) bucket = "must";
      if (it.kind === "review" && bucket === "must") bucket = "should";
      let reason;
      if (daysLeft === null) reason = "בלי תאריך";
      else if (daysLeft < 0) reason = `באיחור של ${-daysLeft} ימים`;
      else if (it.reason) reason = it.reason;
      else if (daysLeft <= 1) reason = daysLeft === 0 ? "עד היום" : "עד מחר";
      else if (effort > o.hoursPerDay) reason = `עוד ${daysLeft} ימים, ~${effort} שעות עבודה → ${slack <= 0 ? "להתחיל היום" : `להתחיל עד ${fmt(iso(addDays(now, slack)))}`}`;
      else reason = `עוד ${daysLeft} ימים`;
      list.push({ ...it, effort, daysLeft, slack, bucket, snoozed, reason, score: slack * 10 - (it.weight || 0) / 5 });
    }
    list.sort((a, b) => a.score - b.score);

    const todayPlan = [];
    let left = o.capacity;
    let overload = 0;
    for (const it of list) {
      // free hours left? pull ahead the next items too – but nothing more than ~10 days from its start date
      if (it.bucket === "later" && it.slack > 10) continue;
      if (it.snoozed && !(it.daysLeft !== null && it.daysLeft <= 1)) continue;
      const chunk = Math.min(it.effort, o.maxChunk);
      const urgentNow = it.daysLeft !== null && it.daysLeft <= 1;
      if (left >= Math.min(chunk, 0.5)) {
        const h = Math.min(chunk, left);
        todayPlan.push({ ...it, hours: h });
        left -= h;
      } else if (urgentNow && it.kind !== "catchup" && it.kind !== "review") {
        // only real deadlines may exceed today's free hours; catch-ups wait for tomorrow
        todayPlan.push({ ...it, hours: chunk });
        overload += chunk;
      }
    }
    const inPlan = new Set(todayPlan.map((x) => x.id));
    const rest = list.filter((x) => !inPlan.has(x.id));
    return {
      today: todayPlan,
      week: rest.filter((x) => x.bucket !== "later"),
      later: rest.filter((x) => x.bucket === "later"),
      capacity: o.capacity,
      planned: todayPlan.reduce((s, x) => s + x.hours, 0),
      overload,
    };
  }

  /**
   * Total minutes covered by `intervals` inside [from, to], counting overlaps once.
   * Each interval is [startMinute, endMinute]. Two classes that overlap, or a class
   * that sits inside a calendar event, must not subtract the same minute twice.
   */
  function busyMinutes(intervals, from, to) {
    const clipped = intervals
      .map(([a, b]) => [Math.max(a, from), Math.min(b, to)])
      .filter(([a, b]) => b > a)
      .sort((x, y) => x[0] - y[0]);
    let total = 0, start = null, end = null;
    for (const [a, b] of clipped) {
      if (end === null) { start = a; end = b; }
      else if (a > end) { total += end - start; start = a; end = b; }
      else if (b > end) { end = b; }
    }
    if (end !== null) total += end - start;
    return total;
  }

  /**
   * Free study hours left today: until dayEnd, minus remaining in-person sessions
   * and anything else already committed, capped.
   *
   * `busy` is an optional list of `{ start, end }` in "HH:MM" — external commitments
   * for today, such as a shift or an appointment read from the student's calendar.
   * Without it the result is the same as before: only classes are subtracted.
   */
  function freeHoursToday(sessions, now, dayEnd, cap, busy) {
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const nowMin = Math.max(now.getHours() * 60 + now.getMinutes(), 8 * 60);
    const end = toMin(dayEnd || "19:30");
    const taken = [];
    for (const s of sessions) {
      if (s.session && (s.session.recorded || s.session.online)) continue; // watched whenever
      taken.push([toMin(s.start), toMin(s.end)]);
    }
    for (const b of busy || []) taken.push([toMin(b.start), toMin(b.end)]);
    const free = Math.max(0, end - nowMin) - busyMinutes(taken, nowMin, end);
    return Math.max(0, Math.min(cap, Math.round((Math.max(0, free) / 60) * 2) / 2));
  }

  // ---------- מדד: כמה מהתוכנית היומית בוצעה ----------
  /**
   * log: { "YYYY-MM-DD": [מזהי משימות שהיו בתוכנית של אותו בוקר] }.
   * isDone(id): האם המשימה הושלמה. נספרים רק ימים שעברו (לא היום), בחלון של `days` ימים אחורה.
   * מחזיר { days: כמה ימים נספרו, planned, done, pct } וב-pct הערך null כשאין עדיין נתונים.
   */
  function adherence(log, isDone, now, days) {
    const today = iso(now), from = iso(addDays(now, -(days || 14)));
    let n = 0, planned = 0, done = 0;
    for (const [d, ids] of Object.entries(log || {})) {
      if (d >= today || d < from || !ids || !ids.length) continue;
      n++; planned += ids.length; done += ids.filter(isDone).length;
    }
    return { days: n, planned, done, pct: planned ? Math.round((done / planned) * 100) : null };
  }

  // ---------- יומן Google: מאירועים לזמן תפוס (שלב 3, פונקציות טהורות) ----------
  const CAL_TZ = "Asia/Jerusalem";

  /** שעון קיר באזור הזמן: מחזיר { date: "YYYY-MM-DD", min: דקות מחצות }. מתחשב במעבר שעון חורף וקיץ. */
  function wallClock(dateTime, tz) {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz || CAL_TZ, hourCycle: "h23",
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(dateTime));
    const g = (t) => parts.find((p) => p.type === t).value;
    return { date: `${g("year")}-${g("month")}-${g("day")}`, min: Number(g("hour")) * 60 + Number(g("minute")) };
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

  /**
   * events: אירועים בצורת Google Calendar (start/end עם dateTime, status, transparency).
   * מחזיר קטעי זמן תפוס ליום אחד, בפורמט שמקבלת freeHoursToday: [{ start: "HH:MM", end: "HH:MM" }].
   * מדלגים על: אירוע שבוטל, אירוע שמסומן "פנוי", אירוע של יום שלם, ואירוע שהאפליקציה עצמה כתבה.
   */
  function calendarBusyForDay(events, dateIso, tz) {
    const out = [];
    for (const e of events || []) {
      if (e.status === "cancelled" || e.transparency === "transparent") continue;
      if (!e.start || !e.start.dateTime || !e.end || !e.end.dateTime) continue; // יום שלם
      if (e.extendedProperties && e.extendedProperties.private && e.extendedProperties.private.copilot) continue;
      const s = wallClock(e.start.dateTime, tz), f = wallClock(e.end.dateTime, tz);
      if (s.date > dateIso || f.date < dateIso) continue;
      const a = s.date < dateIso ? 0 : s.min;
      const b = f.date > dateIso ? 1440 : f.min;
      if (b > a) out.push({ start: hhmm(a), end: hhmm(b) });
    }
    return out.sort((x, y) => x.start.localeCompare(y.start));
  }

  /**
   * שיעור מוקלט או בזום אפשר לצפות בו בכל שעה, ולכן אירוע ביומן שרק משקף אותו לא אמור לתפוס זמן.
   * מסירים קטע תפוס שחופף לפחות 70 אחוז משיעור כזה. שיעור בקמפוס כבר מופחת בנפרד, והאיחוד של
   * busyMinutes מונע ספירה כפולה.
   */
  function dropSessionEchoes(busy, sessions) {
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const flexible = (sessions || []).filter((s) => s.session && (s.session.recorded || s.session.online));
    return (busy || []).filter((b) => {
      const a = toMin(b.start), z = toMin(b.end);
      return !flexible.some((s) => {
        const sa = toMin(s.start), sz = toMin(s.end);
        const overlap = Math.min(z, sz) - Math.max(a, sa);
        return overlap > 0 && overlap / Math.min(z - a, sz - sa) >= 0.7;
      });
    });
  }

  /**
   * Catch-up queue from the pace tracker. Fresh items (≤7 days) are due before the next tutorial
   * (lectures) or within a week. Older backlog is spread out: `perDay` items per day, oldest first,
   * lecture before tutorial – so a big backlog becomes a steady plan instead of a wall of tasks.
   */
  function catchupItems(courses, semester, now, seen, perDay) {
    const fresh = [], backlog = [];
    for (const c of courses) {
      const p = paceStatus(c, semester, now, seen);
      const nextTut = p.pace.tutorial && p.pace.tutorial.next;
      for (const it of p.items.filter((x) => !x.seen)) {
        const base = { id: "pace|" + it.key, paceKey: it.key, kind: "catchup", sessionType: it.type, courseId: c.id, title: `${it.label} (${fmt(it.date)})`, sessionDate: it.date };
        if (it.age <= 7) {
          const due = it.type === "lecture" && nextTut ? nextTut.date : iso(addDays(parseDate(it.date), 7));
          fresh.push({ ...base, due, reason: it.type === "lecture" && nextTut ? `לפני התרגול ב-${fmtLong(nextTut.date)}` : "מהשבוע האחרון" });
        } else backlog.push(base);
      }
    }
    backlog.sort((a, b) => a.sessionDate.localeCompare(b.sessionDate) || (a.sessionType === "lecture" ? -1 : 1));
    const n = perDay || 2;
    backlog.forEach((b, i) => {
      b.due = iso(addDays(now, Math.floor(i / n) + 1));
      b.reason = `השלמת פיגור · ${n} ביום (${i + 1} מתוך ${backlog.length})`;
    });
    return [...fresh, ...backlog];
  }

  // ---------- semester load heatmap ----------
  /** Weeks from semester start to end of exams, with a load score from deadlines/exams. */
  function weekLoad(deadlines, semester, now) {
    const first = startOfWeek(parseDate(semester.start));
    const lastDate = parseDate((semester.examPeriod && semester.examPeriod.end) || semester.end);
    const weeks = [];
    for (let ws = first, i = 1; ws <= lastDate; ws = addDays(ws, 7), i++) {
      const we = addDays(ws, 6);
      const items = deadlines.filter((d) => { const x = parseDate(d.date); return x >= ws && x <= we && !d.moedB; });
      const load = items.reduce((s, d) => s + (d.kind === "exam" ? Math.max(d.weight || 0, 40) : d.weight || 5), 0);
      const teaching = ws <= parseDate(semester.end);
      weeks.push({ n: i, start: iso(ws), end: iso(we), items, load, teaching, current: now >= ws && now <= addDays(we, 1) });
    }
    return weeks;
  }

  /** Teaching week number (1-based) or null outside the semester. */
  function semesterWeek(semester, now) {
    const first = startOfWeek(parseDate(semester.start));
    const n = Math.floor((startOfDay(now) - first) / (7 * DAY_MS)) + 1;
    const total = Math.floor((startOfWeek(parseDate(semester.end)) - first) / (7 * DAY_MS)) + 1;
    return { n: n >= 1 && n <= total ? n : null, total };
  }

  // ---------- spaced review ----------
  const REVIEW_STEPS = [
    { days: 1, label: "יום אחרי" },
    { days: 7, label: "שבוע אחרי" },
    { days: 28, label: "חודש אחרי" },
  ];
  /**
   * seen: {key: true | "YYYY-MM-DD"}; sessionDates: {key: "YYYY-MM-DD"}.
   * Reviews are scheduled only when the session was seen within 10 days of happening
   * (catching up on an old backlog does not flood the list).
   */
  function dueReviews(seen, sessionDates, reviewed, now) {
    const out = [];
    for (const [key, val] of Object.entries(seen || {})) {
      if (typeof val !== "string") continue;
      const sDate = sessionDates[key];
      if (!sDate || daysUntil(sDate, parseDate(val)) < -10) continue;
      for (let i = 0; i < REVIEW_STEPS.length; i++) {
        const step = REVIEW_STEPS[i];
        const rKey = `${key}|r${i}`;
        if (reviewed && reviewed[rKey]) continue;
        const due = iso(addDays(parseDate(val), step.days));
        if (daysUntil(due, now) <= 0) { out.push({ key, rKey, due, step: step.label }); break; }
        break; // later steps wait for the earlier one
      }
    }
    return out;
  }

  // ---------- week view lanes ----------
  /** Side-by-side lanes for overlapping events. Adds .lane and .lanes to each event. */
  function layoutLanes(events) {
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const evs = [...events].sort((a, b) => toMin(a.start) - toMin(b.start));
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const laneEnds = [];
      for (const e of cluster) {
        let lane = laneEnds.findIndex((end) => end <= toMin(e.start));
        if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
        laneEnds[lane] = toMin(e.end);
        e.lane = lane;
      }
      for (const e of cluster) e.lanes = laneEnds.length;
      cluster = [];
    };
    for (const e of evs) {
      if (cluster.length && toMin(e.start) >= clusterEnd) flush();
      cluster.push(e);
      clusterEnd = Math.max(clusterEnd, toMin(e.end));
    }
    if (cluster.length) flush();
    return evs;
  }

  // ---------- remote data (Supabase / automations) ----------
  /** Stable id for a deadline – the app stores "done" marks under it, reminders use it too. */
  function deadlineId(d) {
    return `dl|${d.date}|${d.courseId}|${d.title}`;
  }

  /** Next occurrence of a course session that starts after `after` (used for "the next lecture"). */
  function nextSessionAfter(course, type, semester, after) {
    for (const s of (course.sessions || []).filter((x) => x.type === type)) {
      const occ = sessionOccurrences({ ...s, cancelled: [] }, semester, null);
      const hit = occ.find((o) => withTime(o.date, o.start) > after);
      if (hit) return { ...hit, session: s };
    }
    return null;
  }

  /**
   * Merge what the automations wrote into the base semester data.
   * events: Moodle/email deadlines; changes: cancellations / make-ups / moves (status "applied" only).
   */
  function applyRemote(data, remote) {
    const out = JSON.parse(JSON.stringify(data));
    const events = (remote && remote.events) || [];
    const changes = (remote && remote.changes) || [];
    const have = new Set(out.deadlines.map((d) => `${d.courseId}|${d.date}`));
    for (const e of events) {
      if (!e.date) continue;
      const key = `${e.course_id || ""}|${e.date}`;
      if (e.course_id && have.has(key)) continue; // already in the manual list
      have.add(key);
      out.deadlines.push({ date: e.date, time: e.time || undefined, courseId: e.course_id || null, title: e.title, weight: e.weight || undefined, kind: e.kind || "submission", source: e.source, url: e.url || undefined });
    }
    out.deadlines.sort((a, b) => a.date.localeCompare(b.date));
    for (const ch of changes) {
      if (ch.status && ch.status !== "applied") continue;
      const course = out.courses.find((c) => c.id === ch.course_id);
      const session = course && (course.sessions || []).find((s) => s.type === ch.session_type);
      if (!session) continue;
      const note = ch.note || (ch.change === "extra" ? "השלמה" : "הוזז");
      if (ch.change === "cancelled" || ch.change === "moved") {
        session.cancelled = [...new Set([...(session.cancelled || []), ch.date])];
      }
      const extraDate = ch.change === "extra" ? ch.date : ch.change === "moved" ? ch.new_date : null;
      if (extraDate && !(session.extra || []).some((x) => x.date === extraDate)) {
        session.extra = [...(session.extra || []), { date: extraDate, start: ch.start_time || session.start, end: ch.end_time || session.end, note }];
      }
      if (ch.location && ch.change !== "cancelled") session.extraLocation = ch.location;
    }
    return out;
  }

  // ---------- calendar export ----------
  function buildIcs(deadlines, courses) {
    const byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//student-copilot//HE", "CALSCALE:GREGORIAN"];
    for (const d of deadlines) {
      const c = byId[d.courseId];
      const day = d.date.replace(/-/g, "");
      const next = iso(addDays(parseDate(d.date), 1)).replace(/-/g, "");
      const prefix = d.kind === "exam" ? "📝" : "📌 הגשה:";
      const title = `${prefix} ${c ? c.short || c.name : ""} – ${d.title}`.replace(/[,;]/g, " ");
      lines.push("BEGIN:VEVENT", `UID:${day}-${d.courseId || "x"}-${Math.abs(hash(d.title))}@student-copilot`,
        `DTSTART;VALUE=DATE:${day}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${title}`,
        `DESCRIPTION:${(d.weight ? d.weight + "% · " : "") + (d.time ? "עד " + d.time : "")}`, "END:VEVENT");
    }
    lines.push("END:VCALENDAR");
    return lines.join("\r\n");
  }
  // ---------- בריאות הסנכרון ----------
  // כמה שעות בלי ריצה מוצלחת נחשבות תקינות. סנכרון מודל רץ עד 22:00 ומתחדש ב-07:00, ולכן המרווח הלילי הוא 9 שעות.
  const SYNC_LABEL = { "1-moodle-sync": "סנכרון מודל", "2-email-changes": "סנכרון מייל", "3-briefs": "תדריך בוקר", "4-reminders": "תזכורות" };
  const SYNC_MAX_HOURS = { "1-moodle-sync": 12, "2-email-changes": 10, "3-briefs": 30, "4-reminders": 30 };

  /** rows: שורות sync_state. מחזיר { status: none|ok|stale|failing, text, items } */
  function syncHealth(rows, now) {
    const items = [];
    for (const r of rows || []) {
      if (!SYNC_LABEL[r.source]) continue;
      const age = r.last_success ? (now - new Date(r.last_success)) / 3600000 : Infinity;
      const status = r.failures > 0 ? "failing" : age > SYNC_MAX_HOURS[r.source] ? "stale" : "ok";
      items.push({ source: r.source, label: SYNC_LABEL[r.source], status, ageHours: age, error: r.last_error || "" });
    }
    if (!items.length) return { status: "none", text: "", items };
    const bad = items.filter((i) => i.status !== "ok");
    const status = bad.some((i) => i.status === "failing") ? "failing" : bad.length ? "stale" : "ok";
    const when = (h) => (h === Infinity ? "אף פעם" : h < 1 ? "לפני פחות משעה" : h < 48 ? `לפני ${Math.round(h)} שעות` : `לפני ${Math.round(h / 24)} ימים`);
    const text = bad.length
      ? bad.map((i) => `${i.label}: ${i.status === "failing" ? "נכשל, ההצלחה האחרונה " : "לא רץ, ההצלחה האחרונה "}${when(i.ageHours)}`).join(" · ")
      : "כל האוטומציות רצו בזמן";
    return { status, text, items };
  }

  function hash(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }

  const api = {
    DAY_NAMES, SESSION_LABEL, TIERS,
    parseDate, iso, addDays, daysUntil, fmt, fmtLong, startOfWeek, withTime,
    sessionOccurrences, coursePace, paceStatus, seenKey, sessionsOnDate, weekSessions,
    courseGrade, neededExam, averages, prioritize, examPrepDays, buildIcs,
    weekLoad, semesterWeek, REVIEW_STEPS, dueReviews, layoutLanes,
    deadlineId, nextSessionAfter, applyRemote,
    estimateEffort, buildPlan, freeHoursToday, busyMinutes, catchupItems,
    syncHealth, SYNC_LABEL, calendarBusyForDay, dropSessionEchoes, adherence,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Logic = api;
})(typeof window !== "undefined" ? window : globalThis);
