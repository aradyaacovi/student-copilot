// תדריך בוקר, תדריך שבועי ותזכורות – נכתבים ל-inbox ומוצגים באפליקציה.

function openDeadlines(ctx, L) {
  return ctx.data.deadlines
    .filter((d) => !d.moedB)
    .map((d) => ({ ...d, id: L.deadlineId(d) }))
    .filter((d) => !(ctx.state.done || {})[d.id]);
}
const cname = (ctx, id) => { const c = ctx.data.courses.find((x) => x.id === id); return c ? c.short || c.name : "כללי"; };
const daysText = (n) => (n === 0 ? "היום" : n === 1 ? "מחר" : n < 0 ? "באיחור" : `בעוד ${n} ימים`);

function sessionsToday(ctx, L, now) {
  return L.sessionsOnDate(ctx.data.courses, ctx.data.semester, L.iso(now))
    .map((s) => `• ${s.start}–${s.end} ${s.course.short} · ${L.SESSION_LABEL[s.session.type]} – ${s.extra ? s.note : s.session.location || ""}`);
}

function paceLines(ctx, L, now) {
  return ctx.data.courses
    .map((c) => ({ c, p: L.paceStatus(c, ctx.data.semester, now, ctx.state.seen || {}) }))
    .filter((x) => x.p.behind > 0)
    .map((x) => `• ${x.c.short}: מאחור ב-${x.p.behind}${x.p.items.some((i) => i.urgent) ? " (יש דחוף)" : ""}`);
}

function recentChanges(ctx, L, sinceMs) {
  const since = Date.now() - sinceMs;
  const ev = ctx.events.filter((e) => new Date(e.created_at).getTime() > since).map((e) => `• חדש: ${cname(ctx, e.course_id)} – ${e.title} (${L.fmt(e.date)})`);
  const ch = ctx.changes.filter((c) => new Date(c.created_at).getTime() > since)
    .map((c) => `• ${cname(ctx, c.course_id)} ${L.SESSION_LABEL[c.session_type]} ${L.fmt(c.date)}: ${{ cancelled: "בוטל", extra: "השלמה", moved: "שינוי" }[c.change]}${c.status === "needs_review" ? " (מחכה לאישור שלך)" : ""}`);
  return [...ev, ...ch];
}

function dailyBrief(ctx, L, now) {
  const tiers = L.prioritize(openDeadlines(ctx, L), now);
  const urgent = [...tiers[0].items, ...tiers[1].items, ...tiers[2].items].slice(0, 5)
    .map((t) => `• ${cname(ctx, t.courseId)} – ${t.title} · ${L.fmt(t.date)} (${daysText(t.days)})${t.flag ? " · " + t.flag : ""}`);
  const sessions = sessionsToday(ctx, L, now);
  const pace = paceLines(ctx, L, now);
  const news = recentChanges(ctx, L, 26 * 3600 * 1000);
  const parts = [
    `📅 היום:\n${sessions.length ? sessions.join("\n") : "אין שיעורים"}`,
    `🔥 הכי דחוף:\n${urgent.length ? urgent.join("\n") : "אין משימות ב-10 הימים הקרובים"}`,
  ];
  if (pace.length) parts.push(`⏱️ קצב:\n${pace.join("\n")}`);
  if (news.length) parts.push(`🆕 מאז אתמול:\n${news.join("\n")}`);
  return { kind: "brief", title: `תדריך בוקר – ${L.fmtLong(L.iso(now))}`, body: parts.join("\n\n"), dedupe_key: `brief-${L.iso(now)}` };
}

function weeklyBrief(ctx, L, now) {
  const dl = openDeadlines(ctx, L).map((d) => ({ ...d, days: L.daysUntil(d.date, now) }));
  const subs = dl.filter((d) => d.kind !== "exam" && d.days >= 0 && d.days <= 14);
  const exams = dl.filter((d) => d.kind === "exam" && d.days >= 0 && d.days <= 21);
  const week = L.weekLoad(ctx.data.deadlines, ctx.data.semester, now).find((w) => w.current);
  const thisWeek = dl.filter((d) => d.days >= 0 && d.days <= 6);
  const load = !week ? "" : week.load >= 40 ? "שבוע עמוס" : week.load > 0 ? "שבוע בינוני" : "שבוע רגוע";
  const head = `${load ? load + ": " : ""}${thisWeek.length ? `${thisWeek.length} הגשות/מבחנים השבוע. הכי חשוב: ${cname(ctx, thisWeek.sort((a, b) => (b.weight || 0) - (a.weight || 0))[0].courseId)} – ${thisWeek[0].title}` : "אין הגשות השבוע"}`;
  const fmtD = (d) => `• ${L.fmt(d.date)} ${cname(ctx, d.courseId)} – ${d.title}${d.weight ? ` (${d.weight}%)` : ""} · ${daysText(d.days)}`;
  const news = recentChanges(ctx, L, 7 * 24 * 3600 * 1000);
  const plan = subs.slice(0, 5).map((d, i) => `${i + 1}. ${cname(ctx, d.courseId)} – ${d.title}`);
  const parts = [
    `השבוע במשפט: ${head}`,
    `📌 הגשות ב-14 הימים הקרובים:\n${subs.length ? subs.map(fmtD).join("\n") : "אין"}`,
    `📝 מבחנים ב-21 הימים הקרובים:\n${exams.length ? exams.map(fmtD).join("\n") : "אין"}`,
  ];
  if (news.length) parts.push(`🆕 השבוע שעבר:\n${news.join("\n")}`);
  if (plan.length) parts.push(`🧱 סדר מומלץ לבלוקי העבודה:\n${plan.join("\n")}`);
  return { kind: "weekly", title: `תדריך שבועי – ${L.fmtLong(L.iso(now))}`, body: parts.join("\n\n"), dedupe_key: `weekly-${L.iso(now)}` };
}

function reminders(ctx, L, now) {
  const out = [];
  const today = L.iso(now);
  const tomorrow = L.iso(L.addDays(now, 1));
  for (const d of openDeadlines(ctx, L)) {
    const days = L.daysUntil(d.date, now);
    if (d.kind !== "exam" && days === 1) out.push({ kind: "reminder", title: `מחר: ${cname(ctx, d.courseId)} – ${d.title}${d.time ? " עד " + d.time : ""}`, body: d.weight ? `${d.weight}% מהציון` : "", dedupe_key: `rem-1d-${d.id}` });
    if (d.kind !== "exam" && days === 3 && (d.weight || 0) >= 10) out.push({ kind: "reminder", title: `עוד 3 ימים: ${cname(ctx, d.courseId)} – ${d.title}`, body: `${d.weight}% מהציון. כדאי לשריין זמן.`, dedupe_key: `rem-3d-${d.id}` });
    if (d.kind === "exam") {
      const prep = L.iso(L.addDays(L.parseDate(d.date), -L.examPrepDays(d.weight)));
      if (prep === today) out.push({ kind: "reminder", title: `להתחיל ללמוד: ${cname(ctx, d.courseId)} – ${d.title}`, body: `המבחן ב-${L.fmtLong(d.date)} (${d.weight}%). נשארו ${days} ימים.`, dedupe_key: `rem-prep-${d.id}` });
    }
  }
  // הרצאה שלא ראית לפני תרגול של מחר
  for (const c of ctx.data.courses) {
    const p = L.paceStatus(c, ctx.data.semester, now, ctx.state.seen || {});
    const tut = p.pace.tutorial && p.pace.tutorial.next;
    if (tut && tut.date === tomorrow) {
      const unseen = p.items.filter((i) => i.type === "lecture" && !i.seen).map((i) => i.label);
      if (unseen.length) out.push({ kind: "reminder", title: `${c.short}: תרגול מחר, ועוד לא ראית ${unseen.slice(-2).join(", ")}`, body: `התרגול ב-${tut.start}, ${tut.location || ""}`, dedupe_key: `rem-lec-${c.id}-${tomorrow}` });
    }
  }
  return out;
}

module.exports = { dailyBrief, weeklyBrief, reminders };
