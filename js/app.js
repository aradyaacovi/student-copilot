/* Student Copilot – UI. Plain JS, no build step. */
(function () {
  "use strict";
  const L = window.Logic;
  const STORE = "studentCopilot.v1";

  // ---------- state ----------
  const state = Object.assign(
    { seen: {}, done: {}, reviewed: {}, grades: {}, tasks: [], notes: {}, moodle: { at: null, grades: {} }, previous: null, dataOverride: null, target: 85, assume: 85, tab: "today", theme: "auto", reviews: true, courseId: null, snooze: {}, dailyHours: 4 },
    new URLSearchParams(location.search).has("demo") ? {} : JSON.parse(localStorage.getItem(STORE) || "{}")
  );
  if (new URLSearchParams(location.search).has("demo") && window.SAMPLE_DATA.demoState) Object.assign(state, JSON.parse(JSON.stringify(window.SAMPLE_DATA.demoState)));
  { const q = new URLSearchParams(location.search); if (q.get("tab")) state.tab = q.get("tab"); if (q.get("theme")) state.theme = q.get("theme"); if (q.get("look")) state.look = q.get("look"); if (q.get("course")) state.courseId = q.get("course"); }
  let cloudPushTimer;
  const save = () => {
    if (new URLSearchParams(location.search).has("demo")) return;
    localStorage.setItem(STORE, JSON.stringify(state));
    clearTimeout(cloudPushTimer);
    cloudPushTimer = setTimeout(cloudPushState, 1200);
  };

  // ---------- data (local file / import / cloud) ----------
  // ?demo=1 → always the sample data, no cloud, nothing saved (for screenshots and the public site)
  const DEMO = new URLSearchParams(location.search).has("demo");
  let source = DEMO ? "sample" : state.dataOverride ? "import" : window.SEMESTER_DATA ? "mine" : "sample";
  let baseData = DEMO ? window.SAMPLE_DATA : state.dataOverride || window.SEMESTER_DATA || window.SAMPLE_DATA;
  let data, courses, byId, previous;
  const remote = { events: [], changes: [], inbox: [], sync: [], busy: [] };
  function setData() {
    data = L.applyRemote(baseData, remote);
    courses = data.courses;
    byId = Object.fromEntries(courses.map((c) => [c.id, c]));
    previous = state.previous || data.previous || {};
  }
  setData();

  // ?today=YYYY-MM-DD lets you look at any day (for testing / planning)
  const qp = new URLSearchParams(location.search).get("today");
  // ?today=YYYY-MM-DD and ?now=HH:MM pin the clock (used for screenshots and for planning ahead)
  const nowQp = new URLSearchParams(location.search).get("now");
  const now = (() => {
    const real = new Date();
    const d = qp ? L.parseDate(qp) : real;
    const [h, m] = nowQp && /^\d{1,2}:\d{2}$/.test(nowQp) ? nowQp.split(":").map(Number) : [real.getHours(), real.getMinutes()];
    d.setHours(h, m, 0, 0);
    return d;
  })();
  const todayIso = L.iso(now);
  let weekOffset = 0;
  let summaryCourse = courses[0] && courses[0].id;

  // ---------- helpers ----------
  const esc = L.escapeHtml;
  const cname = (id) => (byId[id] ? byId[id].short || byId[id].name : "");
  const ccolor = (id) => (byId[id] ? byId[id].color : "#94a3b8");
  const chip = (id) => (id ? `<button class="chip" data-course="${esc(id)}" style="--c:${esc(ccolor(id))}" title="לדף הקורס">${esc(cname(id))}</button>` : "");
  let toastTimer;
  // a reversible action says so: the toast carries an undo button (no confirm dialogs)
  let undoSnap = null;
  const toast = (msg, snap) => {
    let el = document.getElementById("toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; document.body.appendChild(el); }
    undoSnap = snap || null;
    el.textContent = msg;
    if (snap) { const b = document.createElement("button"); b.className = "undo"; b.dataset.undo = "1"; b.textContent = "ביטול"; el.append(" ", b); }
    el.classList.toggle("act", !!snap); el.classList.add("show");
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove("show"), snap ? 5000 : 1600);
  };
  const snapState = () => JSON.stringify({ seen: state.seen, reviewed: state.reviewed, snooze: state.snooze, done: state.done });
  const applyTheme = () => {
    const dark = state.theme === "dark" || (state.theme === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    const look = state.look || "spectrum"; if (look !== "spectrum") document.documentElement.dataset.look = look; else delete document.documentElement.dataset.look;
  };
  const r1 = (n) => (n === null || n === undefined ? "—" : (Math.round(n * 10) / 10).toString());
  const daysText = (d) => (d === 0 ? "היום" : d === 1 ? "מחר" : d < 0 ? `לפני ${-d} ימים` : `בעוד ${d} ימים`);
  const download = (name, text, type) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: type || "text/plain;charset=utf-8" }));
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ---------- derived data ----------
  function deadlineItems() {
    return data.deadlines.map((d) => ({ ...d, id: `dl|${d.date}|${d.courseId}|${d.title}` }));
  }
  function allTaskItems() {
    const items = deadlineItems().filter((d) => !d.moedB).map((d) => ({ ...d, done: !!state.done[d.id] }));
    for (const t of state.tasks) items.push({ ...t, kind: "custom", done: !!state.done[t.id] });
    // catch-up tasks from the pace tracker
    for (const c of courses) {
      const p = L.paceStatus(c, data.semester, now, state.seen);
      const urgent = p.items.filter((x) => x.urgent);
      if (urgent.length === 1) {
        const it = urgent[0];
        items.push({ id: "pace|" + it.key, kind: "pace", courseId: c.id, title: `השלמה – ${it.label} (${L.fmt(it.date)})`, date: todayIso, weight: 4, paceKey: it.key });
      } else if (urgent.length > 1) {
        items.push({ id: "pace|" + c.id, kind: "paceGroup", courseId: c.id, title: `השלמות: ${urgent.length} מפגשים (${urgent.slice(0, 3).map((i) => i.label).join(", ")}${urgent.length > 3 ? " ועוד " + (urgent.length - 3) : ""})`, date: todayIso, weight: 3 + urgent.length });
      }
    }
    if (state.reviews) {
      const dates = {}, labels = {};
      for (const c of courses) for (const it of L.paceStatus(c, data.semester, now, state.seen).items) { dates[it.key] = it.date; labels[it.key] = [c.id, it.label]; }
      for (const r of L.dueReviews(state.seen, dates, state.reviewed, now)) {
        const [cid, label] = labels[r.key];
        items.push({ id: "rev|" + r.rKey, kind: "review", courseId: cid, title: `חזרה על ${label} (${r.step})`, date: r.due, weight: 2, reviewKey: r.rKey });
      }
    }
    return items;
  }

  // ---------- cloud (Supabase) ----------
  const cfg = window.COPILOT_CONFIG || {};
  const cloud = { client: null, user: null, status: "off", error: "" };
  const STATE_KEYS = ["snooze", "dailyHours", "seen", "done", "reviewed", "grades", "tasks", "notes", "moodle", "previous", "target", "assume", "reviews", "log"];

  async function cloudInit() {
    if (DEMO || !cfg.supabaseUrl || !cfg.supabaseAnonKey) return;
    if (!window.supabase) { cloud.status = "error"; cloud.error = "ספריית Supabase לא נטענה (אין אינטרנט?)"; return render(); }
    cloud.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
    const { data: s } = await cloud.client.auth.getSession();
    cloud.user = s.session ? s.session.user : null;
    cloud.status = cloud.user ? "on" : "signedOut";
    if (cloud.user) await cloudPull();
    render();
  }

  async function cloudPull() {
    const c = cloud.client;
    const [sd, us, ev, ch, ib, sy, cb] = await Promise.all([
      c.from("semester_data").select("data,updated_at").maybeSingle(),
      c.from("user_state").select("state,updated_at").maybeSingle(),
      c.from("events").select("*").order("date"),
      c.from("schedule_changes").select("*").neq("status", "rejected"),
      c.from("inbox").select("*").order("created_at", { ascending: false }).limit(40),
      c.from("sync_state").select("*"), // אם הטבלה עוד לא נוצרה: מתעלמים בשקט ולא מציגים חיווי
      c.from("calendar_busy").select("date,start_time,end_time").gte("date", todayIso),
    ]);
    const err = [sd, us, ev, ch, ib].find((r) => r.error);
    if (err) { cloud.status = "error"; cloud.error = err.error.message; return; }
    if (sd.data && !state.dataOverride) { baseData = sd.data.data; source = "cloud"; }
    if (us.data) { for (const k of STATE_KEYS) if (k in us.data.state) state[k] = us.data.state[k]; localStorage.setItem(STORE, JSON.stringify(state)); }
    else cloudPushState(); // first sign-in: upload what this browser has
    remote.events = ev.data || [];
    remote.changes = (ch.data || []).filter((x) => x.status === "applied");
    remote.review = (ch.data || []).filter((x) => x.status === "needs_review");
    remote.inbox = ib.data || [];
    remote.sync = sy.error ? [] : sy.data || [];
    remote.busy = cb.error ? [] : cb.data || [];
    setData();
  }

  async function cloudPushState() {
    if (!cloud.user) return;
    const payload = Object.fromEntries(STATE_KEYS.map((k) => [k, state[k]]));
    const { error } = await cloud.client.from("user_state").upsert({ user_id: cloud.user.id, state: payload, updated_at: new Date().toISOString() });
    if (error) toast("שגיאה בשמירה לענן");
  }

  async function cloudAction(a, el) {
    const c = cloud.client;
    if (a === "login") {
      const email = document.getElementById("cloudEmail").value.trim();
      if (!email) return;
      const { error } = await c.auth.signInWithOtp({ email, options: { emailRedirectTo: location.origin + (location.pathname === "/" ? "" : location.pathname) } });
      toast(error ? "שגיאה: " + error.message : "נשלח קישור התחברות למייל ✉️");
    } else if (a === "logout") {
      await c.auth.signOut(); location.reload();
    } else if (a === "uploadData") {
      const src = state.dataOverride || window.SEMESTER_DATA;
      if (!src) return toast("אין קובץ נתונים להעלות");
      const { error } = await c.from("semester_data").upsert({ user_id: cloud.user.id, data: { ...src, updated: todayIso }, updated_at: new Date().toISOString() });
      toast(error ? "שגיאה: " + error.message : "הנתונים הועלו לענן ✓");
      if (!error) { await cloudPull(); render(); }
    } else if (a === "refresh") {
      await cloudPull(); render(); toast("עודכן מהענן ✓");
    } else if (a === "readAll") {
      const ids = remote.inbox.filter((m) => !m.read).map((m) => m.id);
      if (ids.length) await c.from("inbox").update({ read: true }).in("id", ids);
      remote.inbox.forEach((m) => (m.read = true)); render();
    } else if (a === "approve" || a === "reject") {
      const id = Number(el.dataset.id);
      const { error } = await c.from("schedule_changes").update({ status: a === "approve" ? "applied" : "rejected" }).eq("id", id);
      if (error) return toast("שגיאה: " + error.message);
      await c.from("inbox").update({ read: true }).eq("ref_id", id).eq("kind", "review");
      await cloudPull(); render(); toast(a === "approve" ? "השינוי הוחל ✓" : "השינוי נדחה");
    }
  }

  const inboxIcon = { brief: "☀️", weekly: "🗓️", reminder: "⏰", alert: "⚠️", review: "❓" };
  function inboxCard() {
    if (!cloud.user) return "";
    const items = remote.inbox.slice(0, 8);
    const unread = remote.inbox.filter((m) => !m.read).length;
    const reviewIds = new Set((remote.review || []).map((r) => r.id));
    const health = L.syncHealth(remote.sync, now);
    return `<div class="card span inbox">
      <div class="row"><h3>📬 עדכונים מהאוטומציות ${unread ? `<span class="badge now">${unread} חדשים</span>` : ""}</h3><span class="spacer"></span>
        <button class="link small" data-cloud="refresh">רענון</button> ${unread ? `<button class="link small" data-cloud="readAll">סימון הכול כנקרא</button>` : ""}</div>
      ${health.status === "stale" || health.status === "failing" ? `<div class="warn small">⚠️ ${esc(health.text)}</div>` : ""}
      ${items.length ? items.map((m) => `<details class="msg ${m.read ? "" : "unread"}" ${!m.read && (m.kind === "brief" || m.kind === "review") ? "open" : ""}>
        <summary>${inboxIcon[m.kind] || "•"} <b>${esc(m.title)}</b> <span class="muted small">${new Date(m.created_at).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" })}</span></summary>
        <div class="msg-body">${esc(m.body)}</div>
        ${m.kind === "review" && reviewIds.has(m.ref_id) ? `<div class="row"><button class="btn" data-cloud="approve" data-id="${m.ref_id}">לאשר ולעדכן את הלו״ז</button><button class="btn ghost" data-cloud="reject" data-id="${m.ref_id}">לא נכון</button></div>` : ""}
      </details>`).join("") : `<div class="empty">עוד אין עדכונים. כשהאוטומציות ירוצו, התדריכים וההתראות יופיעו כאן.</div>`}
    </div>`;
  }

  function cloudCard() {
    if (!cfg.supabaseUrl) return `<div class="card"><h3>☁️ ענן ואוטומציות</h3>
      <p class="small muted">לא מוגדר. כדי לחבר: להעתיק את <code>js/config.example.js</code> ל-<code>js/config.js</code> ולמלא את פרטי Supabase (ראי automations/README.md).</p></div>`;
    if (cloud.status === "error") return `<div class="card"><h3>☁️ ענן ואוטומציות</h3><p class="warn small">${esc(cloud.error)}</p></div>`;
    if (!cloud.user) return `<div class="card"><h3>☁️ ענן ואוטומציות</h3>
      <p class="small muted">התחברות עם קישור למייל – בלי סיסמה.</p>
      <div class="row"><input id="cloudEmail" type="email" placeholder="המייל שלך" style="flex:1"><button class="btn" data-cloud="login">שליחת קישור</button></div></div>`;
    return `<div class="card"><h3>☁️ ענן ואוטומציות <span class="badge ok">מחובר</span></h3>
      <p class="small">${esc(cloud.user.email)} · מקור הנתונים: <b>${source === "cloud" ? "הענן" : "קובץ מקומי (עוד לא הועלה)"}</b></p>
      <p class="small muted">מזהה המשתמש ל-n8n (USER_ID בקובץ automations/.env):</p>
      <code class="uid">${esc(cloud.user.id)}</code>
      <div class="row" style="margin-top:8px"><button class="btn" data-cloud="uploadData">העלאת קובץ הנתונים לענן</button>
        <button class="btn ghost" data-cloud="refresh">רענון</button><button class="btn ghost" data-cloud="logout">התנתקות</button></div>
      <p class="small muted">אחרי שינוי ב-my-semester.js – ללחוץ "העלאה" כדי שגם האוטומציות יראו אותו.</p></div>`;
  }

  // ---------- views ----------
  const VIEWS = {
    today: { title: "היום", render: viewToday },
    schedule: { title: "לו״ז", render: viewSchedule },
    courses: { title: "קורסים", render: viewCourses },
    grades: { title: "ממוצע", render: viewGrades },
    tasks: { title: "כל המשימות", render: viewTasks, hidden: true, parent: "today" },
    reqs: { title: "דרישות", render: viewReqs, hidden: true, parent: "courses" },
    summaries: { title: "סיכומים", render: viewSummaries, hidden: true, parent: "courses" },
    course: { title: "קורס", render: viewCourse, hidden: true, parent: "courses" },
    settings: { title: "הגדרות", render: viewSettings, hidden: true },
  };


  // ---------- the plan: one prioritization logic for everything ----------
  function planItems() {
    const items = [];
    for (const d of deadlineItems()) {
      if (d.moedB || state.done[d.id] || L.daysUntil(d.date, now) < -2) continue;
      items.push({ id: d.id, title: d.title, kind: ["submission", "quiz", "exam"].includes(d.kind) ? d.kind : "other", courseId: d.courseId, due: d.date, time: d.time, weight: d.weight });
    }
    for (const t of state.tasks) if (!state.done[t.id]) items.push({ id: t.id, title: t.title, kind: "custom", courseId: t.courseId, due: t.date, time: t.time, weight: t.weight, effort: t.hours || undefined });
    items.push(...L.catchupItems(courses, data.semester, now, state.seen, 2));
    if (state.reviews) {
      const dates = {}, labels = {};
      for (const c of courses) for (const it of L.paceStatus(c, data.semester, now, state.seen).items) { dates[it.key] = it.date; labels[it.key] = [c.id, it.label]; }
      for (const r of L.dueReviews(state.seen, dates, state.reviewed, now)) {
        const [cid, label] = labels[r.key];
        items.push({ id: "rev|" + r.rKey, kind: "review", courseId: cid, title: `חזרה על ${label}`, due: todayIso, reason: `חזרה מרווחת · ${r.step}` });
      }
    }
    for (const it of items) it.snoozeUntil = state.snooze[it.id];
    return items;
  }
  function currentPlan() {
    const todays = L.sessionsOnDate(courses, data.semester, todayIso);
    const capacity = L.freeHoursToday(todays, now, data.semester.dayEnd, Number(state.dailyHours) || 4, calendarBusyToday(todays));
    const plan = L.buildPlan(planItems(), now, { capacity, hoursPerDay: Math.max(1, (Number(state.dailyHours) || 4) - 1) });
    logTodaysPlan(plan);
    return { todays, plan };
  }
  // זמן תפוס מהיומן להיום. אם סנכרון היומן ישן או נכשל, מתעלמים ממנו וחוזרים להנחה הקודמת במקום להסתמך על מידע לא עדכני.
  function calendarBusyToday(todays) {
    const cal = L.syncHealth(remote.sync, now).items.find((i) => i.source === "5-calendar-sync");
    if (!cal || cal.status !== "ok") return [];
    const busy = remote.busy.filter((r) => r.date === todayIso).map((r) => ({ start: r.start_time, end: r.end_time }));
    return L.dropSessionEchoes(busy, todays);
  }
  // מצלמים את תוכנית הבוקר פעם אחת ביום, כדי שאפשר יהיה למדוד כמה ממנה בוצע. לא בדמו ולא בתאריך מקובע.
  function logTodaysPlan(plan) {
    const q = new URLSearchParams(location.search);
    if (DEMO || q.has("today") || q.has("now") || !plan.today.length) return;
    state.log = state.log || {};
    if (state.log[todayIso]) return;
    state.log[todayIso] = plan.today.map((i) => i.id);
    const keep = L.iso(L.addDays(now, -60));
    for (const d of Object.keys(state.log)) if (d < keep) delete state.log[d];
    save();
  }
  const planItemDone = (id) => id.startsWith("pace|") ? !!state.seen[id.slice(5)] : id.startsWith("rev|") ? !!state.reviewed[id.slice(4)] : !!state.done[id];
  const KIND_ICON = { submission: "📌", quiz: "✏️", exam: "📝", catchup: "▶️", review: "🔁", custom: "•", other: "•" };
  const hoursText = (h) => (h >= 1 ? `${h % 1 ? h.toFixed(1) : h} ש׳` : `${Math.round(h * 60)} דק׳`);
  const doneLabel = (it) => (it.kind === "exam" ? "למדתי היום" : it.kind === "catchup" ? "ראיתי" : "סיימתי");

  function planRow(it, withHours) {
    const badge = L.dueBadge(it.daysLeft);
    const meta = [badge && it.daysLeft < 0 ? "" : it.reason, it.weight ? `${it.weight}%` : "", it.snoozed ? "נדחה" : ""].filter(Boolean).map(esc).join(" · ");
    return `<div class="task" style="--c:${ccolor(it.courseId)}">
      <span class="kind">${KIND_ICON[it.kind] || "•"}</span>
      <div style="flex:1"><div class="t">${chip(it.courseId)} ${esc(it.title)} ${badge ? `<span class="badge ${badge.cls}">${esc(badge.text)}</span>` : ""}</div>
        <div class="meta">${meta}</div></div>
      ${withHours ? `<span class="hrs">${hoursText(it.hours)}</span>` : ""}
      <button class="btn ghost sm" data-plandone="${esc(it.id)}" title="${doneLabel(it)}">✓</button>
      ${withHours ? `<button class="link sm" data-snooze="${esc(it.id)}" title="לדחות למחר">⏭</button>` : ""}
    </div>`;
  }

  const ICONS = {
    today: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 7v5l3 2"/><circle cx="12" cy="12" r="9"/></svg>',
    schedule: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
    courses: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5h7v14H4zM13 5h7v9h-7z"/></svg>',
    grades: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 20V10M12 20V4M19 20v-7"/></svg>',
    settings: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="12" cy="12" r="3.2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9L17 7M7 17l-2.1 2.1"/></svg>',
  };

  /** The panel that never leaves: one task, today's ribbon, today's numbers. */
  function renderFocus() {
    const el = document.getElementById("focus");
    const { todays, plan } = currentPlan();
    const first = plan.today[0];
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const c = first && byId[first.courseId];
    el.style.setProperty("--c", c ? c.color : "var(--accent)");

    // the ribbon: classes that are still ahead, then the planned work
    const ribbon = [
      ...todays.filter((s) => toMin(s.end) > nowMin).map((s) => ({
        time: s.start, title: s.course.short + " · " + L.SESSION_LABEL[s.session.type],
        note: s.extra ? s.note : s.session.location || "", color: s.course.color,
        live: toMin(s.start) <= nowMin,
      })),
      ...plan.today.map((t) => ({ time: null, title: t.title, note: hoursText(t.hours), color: ccolor(t.courseId), task: true })),
    ];
    const behind = courses.reduce((s, x) => s + L.paceStatus(x, data.semester, now, state.seen).behind, 0);
    const nextDl = deadlineItems().find((d) => !d.moedB && !state.done[d.id] && L.daysUntil(d.date, now) >= 0);

    el.innerHTML = `
      <div class="focus-now">
        <div class="focus-eyebrow">${first ? "עכשיו" : "סיימת להיום"}</div>
        ${first ? `
          <div class="focus-course">${esc(cname(first.courseId))}</div>
          <h2 class="focus-title">${esc(first.title)}</h2>
          <p class="focus-why">${esc(first.reason)}</p>
          <div class="focus-actions">
            <button class="btn" data-plandone="${esc(first.id)}">${doneLabel(first)}</button>
            <button class="btn ghost" data-snooze="${esc(first.id)}">מחר</button>
          </div>
          <div class="focus-dur">${hoursText(first.hours)} <span>להיום</span></div>`
          : `<h2 class="focus-title">הכול סגור 🎉</h2>
             <p class="focus-why">אפשר להקדים משהו מ״בהמשך השבוע״.</p>`}
      </div>
      <div class="focus-rest">
        <div class="focus-head"><span>היום</span><span class="muted">${hoursText(plan.capacity)} פנויות</span></div>
        ${ribbon.length ? `<ol class="ribbon">${ribbon.map((r) => `
          <li class="${r.live ? "live" : ""} ${r.task ? "is-task" : ""}" style="--c:${r.color}">
            <span class="rb-time">${r.time || "·"}</span>
            <span class="rb-body"><b>${esc(r.title)}</b>${r.note ? `<i>${esc(r.note)}</i>` : ""}</span>
          </li>`).join("")}</ol>` : `<p class="empty small">אין עוד שיעורים או משימות היום.</p>`}
        <div class="focus-nums">
          <div><b class="${behind ? "hot" : ""}">${behind}</b><span>לא נראו</span></div>
          <div><b>${nextDl ? L.daysUntil(nextDl.date, now) : "—"}</b><span>${nextDl ? (L.daysUntil(nextDl.date, now) === 1 ? "יום ל" : "ימים ל") + cname(nextDl.courseId) : "אין הגשה"}</span></div>
          ${plan.overload ? `<div><b class="hot">+${hoursText(plan.overload)}</b><span>מעבר לזמן</span></div>` : ""}
        </div>
      </div>`;
  }

  function viewToday() {
    const { plan } = currentPlan();
    // the first item lives in the focus panel; everything else is the day's list
    const restToday = plan.today.slice(1);
    const fold = (title, items, open) => items.length
      ? `<details class="fold" ${open ? "open" : ""}><summary>${title} <span class="muted small">(${items.length})</span></summary>${items.map((i) => planRow(i, false)).join("")}</details>`
      : "";
    return `
      ${restToday.length ? `<div class="card" style="margin-bottom:16px">
        <div class="row"><h3>אחר כך היום</h3><span class="spacer"></span><span class="muted small">${hoursText(plan.planned)} מתוכננות · פנויות היום: ${hoursText(plan.capacity)}</span></div>
        ${restToday.map((i) => planRow(i, true)).join("")}
        ${plan.overload ? `<div class="warn small">⚠️ יש היום יותר ממה שנכנס בזמן הפנוי (עוד ${hoursText(plan.overload)}). שווה לדחות משהו שאינו ליום-יומיים הקרובים.</div>` : ""}
      </div>` : ""}
      ${inboxCard()}
      ${fold("בהמשך השבוע", plan.week, false)}
      ${fold("יכול לחכות", plan.later, false)}
      <div class="row small" style="margin-top:14px"><button class="link" data-tab="tasks">+ משימה חדשה / כל המשימות</button>
        <span class="spacer"></span><button class="link" data-action="why">איך נקבע הסדר?</button></div>
      <div id="why" class="card small" hidden style="margin-top:10px">
        <b>איך נקבע הסדר:</b> לכל משימה יש הערכת שעות (לפי הסוג והמשקל בציון). מזה נגזר <b>מתי חייבים להתחיל</b> כדי להספיק.
        ככל שקרובים יותר למועד ההתחלה – המשימה גבוהה יותר; בשוויון, מה ששוקל יותר בציון קודם.
        התוכנית להיום מתמלאת עד מספר השעות הפנויות (עד שעתיים למשימה ביום). פיגור בהרצאות מתפזר: 2 ביום, מהישן לחדש, הרצאה לפני תרגול.
        <div class="row" style="margin-top:6px">שעות לימוד ביום: <input type="number" min="1" max="10" step="0.5" data-setting="dailyHours" value="${esc(state.dailyHours)}"></div>
      </div>`;
  }

  function viewCourses() {
    const open = (data.openItems || []).filter((o) => !state.done["open|" + o.id]);
    const cards = courses.map((c) => {
      const p = L.paceStatus(c, data.semester, now, state.seen);
      const seenCount = p.items.filter((i) => i.seen).length;
      const pct = p.items.length ? Math.round((seenCount / p.items.length) * 100) : 0;
      const next = deadlineItems().find((d) => d.courseId === c.id && !d.moedB && L.daysUntil(d.date, now) >= 0 && !state.done[d.id]);
      const unseen = p.items.filter((i) => !i.seen);
      // שורת מצב אחת: כמה מטלות פתוחות, מתי הדחופה, וצפי ציון רק אם הוזנו ציונים
      const openTasks = deadlineItems().filter((d) => d.courseId === c.id && !d.moedB && L.daysUntil(d.date, now) >= 0 && !state.done[d.id]);
      const gr = state.grades[c.id] ? L.courseGrade(c, state.grades[c.id]) : null;
      const status = [
        openTasks.length ? `${openTasks.length} ${openTasks.length === 1 ? "מטלה פתוחה" : "מטלות פתוחות"} · הדחופה ${daysText(L.daysUntil(next.date, now))}` : "אין מטלות פתוחות",
        gr && (gr.grade !== null || gr.projected !== null) ? `צפי ציון ${r1(gr.grade !== null ? gr.grade : gr.projected)}` : "",
        state.moodle.grades[c.id] !== undefined ? `ב-Moodle ${r1(state.moodle.grades[c.id])}` : "",
      ].filter(Boolean).join(" · ");
      return `<div class="card course-bar" style="--c:${c.color}">
        <h3><button class="link title" data-course="${c.id}">${esc(c.name)}</button><span class="spacer"></span>
          ${p.behind ? `<span class="badge ${p.items.some((i) => i.urgent) ? "now" : "soon"}">מאחור ב-${p.behind}</span>` : p.items.length ? `<span class="badge ok">בקצב</span>` : ""}</h3>
        <div class="small">${status}</div>
        <div class="progress"><span style="width:${pct}%"></span></div>
        ${unseen.length ? `<details><summary class="small">לסמן מה ראיתי (${unseen.length} לא מסומנים)</summary>
          <div class="seen-list" style="margin-top:8px">${p.items.map((i) => `
            <label class="seen-item ${i.seen ? "seen" : i.urgent ? "urgent" : ""}"><input type="checkbox" data-seen="${esc(i.key)}" ${i.seen ? "checked" : ""}> ${i.label} <span class="muted">${L.fmt(i.date)}</span></label>`).join("")}</div>
          <button class="link small" data-seenall="${c.id}" style="margin-top:8px">ראיתי הכול עד היום</button></details>` : ""}
      </div>`;
    }).join("");
    const mg = courses.filter((c) => state.moodle.grades[c.id] !== undefined);
    const mgW = mg.reduce((a, c) => a + (c.credits || 1), 0);
    const mgAvg = mgW ? mg.reduce((a, c) => a + state.moodle.grades[c.id] * (c.credits || 1), 0) / mgW : null;
    return `<div class="grid">${cards}</div>
      ${mgAvg !== null ? `<div class="card" style="margin-top:16px"><b>ממוצע לפי Moodle: ${r1(mgAvg)}</b> <span class="muted small">(${mg.length} קורסים, משוקלל בנקודות זכות · עודכן ${L.fmt(state.moodle.at)}). זה סכום ה-Moodle ולא הציון הרשמי.</span></div>` : ""}
      ${open.length ? `<div class="card" style="margin-top:16px"><h3>❓ פתוח לבירור</h3>${open.map((o) => `<label class="row"><input type="checkbox" data-done="open|${esc(o.id)}"> ${chip(o.courseId)} ${esc(o.text)}</label>`).join("")}</div>` : ""}
      <div class="row small" style="margin-top:14px"><button class="link" data-tab="reqs">טבלת הדרישות המלאה</button> · <button class="link" data-tab="summaries">כל הסיכומים</button></div>`;
  }

  function taskRow(t) {
    const when = t.date ? `${L.fmtLong(t.date)}${t.time ? " " + t.time : ""} · ${daysText(t.days)}` : "בלי תאריך";
    const extra = [
      t.weight && !String(t.kind).startsWith("pace") ? `${t.weight}%` : "",
      t.flag ? `<b class="warn">${esc(t.flag)}</b>` : "",
      t.prepStart ? `להתחיל ללמוד מ-${L.fmt(t.prepStart)}` : "",
    ].filter(Boolean).join(" · ");
    const box = t.kind === "pace"
      ? `<input type="checkbox" data-seen="${esc(t.paceKey)}" title="ראיתי">`
      : t.kind === "review" ? `<input type="checkbox" data-review="${esc(t.reviewKey)}" title="עשיתי חזרה">`
      : t.kind === "paceGroup" ? `<button class="link" data-tab="pace" title="לסמן במעקב הקצב">⏱️</button>`
      : t.kind === "exam" ? `<span>📝</span>` : `<input type="checkbox" data-done="${esc(t.id)}" ${t.done ? "checked" : ""}>`;
    const del = t.kind === "custom" ? `<button class="link small" data-deltask="${esc(t.id)}">מחיקה</button>` : "";
    return `<div class="task ${t.done ? "done" : ""}" style="--c:${ccolor(t.courseId)}">${box}
      <div><div class="t">${chip(t.courseId)} ${esc(t.title)}</div><div class="meta">${when}${extra ? " · " + extra : ""} ${del}</div></div></div>`;
  }

  function viewTasks() {
    const tiers = L.prioritize(allTaskItems(), now);
    const icons = { now: "🔴", soon: "🟠", week: "🔵", later: "⚪" };
    return `
      <div class="card" style="margin-bottom:16px">
        <h3>➕ משימה חדשה</h3>
        <form class="row" id="addTask">
          <input name="title" placeholder="מה לעשות" required style="flex:2;min-width:200px">
          <select name="courseId"><option value="">כללי</option>${courses.map((c) => `<option value="${c.id}">${esc(c.short)}</option>`).join("")}</select>
          <input type="date" name="date">
          <input type="time" name="time">
          <input type="number" name="weight" placeholder="משקל %" min="0" max="100">
          <input type="number" name="hours" placeholder="שעות" min="0" step="0.5">
          <button class="btn">הוספה</button>
        </form>
        <div class="muted small">התעדוף: קודם לפי כמה ימים נשארו, ובתוך זה לפי המשקל בציון. מבחנים עולים לרשימה כשמגיע הזמן להתחיל ללמוד אליהם.</div>
      </div>
      ${tiers.map((t) => `
        <div class="tier"><h3>${icons[t.id]} ${t.title} <span class="muted small">(${t.items.length})</span></h3>
        ${t.items.length ? t.items.map(taskRow).join("") : `<div class="empty">אין</div>`}</div>`).join("")}
      ${data.undated && data.undated.length ? `<div class="card"><h3>🗂️ עוד בלי תאריך</h3><ul>${data.undated.map((u) => `<li>${esc(u)}</li>`).join("")}</ul></div>` : ""}`;
  }

  function heatCard() {
    const weeks = L.weekLoad(data.deadlines, data.semester, now);
    const maxLoad = Math.max(60, ...weeks.map((w) => w.load));
    return `<div class="card span"><h3>🗓️ עומס לאורך הסמסטר <span class="muted small">כהה = שבוע עמוס יותר</span></h3>
      <div class="heat">${weeks.map((w) => `<div class="hw ${w.current ? "cur" : ""} ${w.teaching ? "" : "exam"}" style="--a:${(w.load / maxLoad).toFixed(2)}"
        title="${L.fmt(w.start)}–${L.fmt(w.end)}${w.items.length ? ": " + w.items.map((d) => cname(d.courseId) + " " + d.title).join(" · ").replace(/"/g, "") : ""}"><span>${w.teaching ? w.n : ""}</span></div>`).join("")}</div></div>`;
  }

  function viewSchedule() {
    const ws = L.addDays(L.startOfWeek(now), weekOffset * 7);
    const evs = L.weekSessions(courses, data.semester, ws);
    const startH = 8, endH = 20, pxH = 48;
    const top = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return (h + m / 60 - startH) * pxH; };
    const height = (endH - startH) * pxH;
    const days = [0, 1, 2, 3, 4, 5].map((i) => L.iso(L.addDays(ws, i)));
    const dls = deadlineItems();
    const nowTop = top(`${now.getHours()}:${now.getMinutes()}`);
    const cols = days.map((ds, i) => {
      const dayEvs = L.layoutLanes(evs.filter((e) => e.date === ds));
      const dayDls = dls.filter((d) => d.date === ds);
      const isToday = ds === todayIso;
      return `<div class="col ${isToday ? "today" : ""}" style="height:${height}px">
        ${dayEvs.map((e) => `<div class="ev ${e.cancelled ? "cancelled" : ""} ${top(e.end) - top(e.start) < 70 ? "short" : ""}" style="--c:${e.course.color};top:${top(e.start)}px;height:${top(e.end) - top(e.start) - 2}px;width:calc(${100 / e.lanes}% - 4px);inset-inline-start:calc(${(100 / e.lanes) * e.lane}% + 2px)"
          title="${esc(e.course.name)} · ${esc(e.session.location || "")}">
          <b>${esc(e.course.short)}</b>${L.SESSION_LABEL[e.session.type]} ${e.start}–${e.end}<br>
          <span class="muted">${esc(e.cancelled ? "בוטל" : e.extra ? e.note : e.session.location || "")}</span></div>`).join("")}
        ${isToday && nowTop > 0 && nowTop < height ? `<div class="now-line" style="top:${nowTop}px"></div>` : ""}
      </div>`;
    }).join("");
    const hours = Array.from({ length: endH - startH }, (_, i) => `<div style="top:${i * pxH}px">${startH + i}:00</div>`).join("");
    const allday = days.map((ds) => {
      const list = dls.filter((d) => d.date === ds);
      return `<div class="allday ${ds === todayIso ? "today" : ""}">${list.map((d) =>
        `<span class="pin" style="--c:${ccolor(d.courseId)}" title="${esc(cname(d.courseId))}: ${esc(d.title)}">${d.kind === "exam" ? "מבחן" : "הגשה"} · ${esc(cname(d.courseId))}</span>`).join("")}</div>`;
    }).join("");
    const upcoming = dls.filter((d) => { const x = L.daysUntil(d.date, now); return x >= 0 && x <= 45; });
    return `
      <div class="row" style="margin-bottom:12px">
        <button class="btn ghost" data-week="-1">→ שבוע קודם</button>
        <button class="btn ghost" data-week="0">השבוע</button>
        <button class="btn ghost" data-week="1">שבוע הבא ←</button>
        <b>${L.fmt(days[0])} – ${L.fmt(L.iso(L.addDays(ws, 6)))}</b>
        <span class="spacer"></span>
        <button class="btn" data-action="ics">ייצוא הגשות ומבחנים ליומן (.ics)</button>
      </div>
      <div class="week">
        <div class="head"></div>${days.map((ds) => `<div class="head ${ds === todayIso ? "today" : ""}">${L.fmtLong(ds).replace("יום ", "")}</div>`).join("")}
        <div class="allday corner"></div>${allday}
        <div class="hours" style="height:${height}px">${hours}</div>${cols}
      </div>
      <div class="grid" style="margin-top:16px">
        ${heatCard()}
        <div class="card"><h3>📌 45 הימים הקרובים</h3>
          <ul class="clean">${upcoming.map((d) => `<li class="row">${chip(d.courseId)} ${esc(d.title)}<span class="spacer"></span><span class="muted small">${L.fmt(d.date)} · ${daysText(L.daysUntil(d.date, now))}</span></li>`).join("") || `<li class="empty">אין</li>`}</ul></div>
        <div class="card"><h3>📏 כללי הלו״ז שלי</h3><ul>${(data.rules || []).map((r) => `<li>${esc(r)}</li>`).join("")}</ul></div>
      </div>`;
  }

  function viewPace() {
    const cards = courses.map((c) => {
      const p = L.paceStatus(c, data.semester, now, state.seen);
      const seenCount = p.items.filter((i) => i.seen).length;
      const pct = p.items.length ? Math.round((seenCount / p.items.length) * 100) : 0;
      const lines = Object.entries(p.pace).map(([type, r]) => `
        <div class="small">${L.SESSION_LABEL[type]}: <b>${r.held.length}</b> התקיימו
        ${r.next ? ` · הבא: #${r.next.n} ב-${L.fmtLong(r.next.date)} ${r.next.start}` : " · הסתיים"}</div>`).join("");
      return `<div class="card course-bar" style="--c:${c.color}">
        <h3><button class="link title" data-course="${c.id}">${esc(c.name)}</button> <span class="spacer"></span>${p.behind ? `<span class="badge ${p.items.some((i) => i.urgent) ? "now" : "soon"}">מאחור ב-${p.behind}</span>` : p.items.length ? `<span class="badge ok">בקצב</span>` : ""}</h3>
        ${lines}
        <div class="progress"><span style="width:${pct}%"></span></div>
        <div class="seen-list">${p.items.map((i) => `
          <label class="seen-item ${i.seen ? "seen" : i.urgent ? "urgent" : ""}" title="${L.fmtLong(i.date)}${i.extra ? " · השלמה" : ""}">
            <input type="checkbox" data-seen="${esc(i.key)}" ${i.seen ? "checked" : ""}> ${i.label} <span class="muted">${L.fmt(i.date)}</span></label>`).join("") || `<span class="empty">עוד לא התקיימו מפגשים</span>`}</div>
      </div>`;
    }).join("");
    return `<div class="card span" style="margin-bottom:16px">
        <b>איך זה עובד:</b> המפגשים נספרים אוטומטית מהלו״ז הקבוע בקובץ הנתונים, בלי מפגשים שבוטלו ועם השלמות.
        מסמנים מה כבר ראית. <span class="chip" style="--c:var(--now)">אדום</span> = עבר יותר משבוע, או הרצאה שלא ראית לפני תרגול שמתקרב – זה עולה אוטומטית ל"משימות".
        <div class="muted small">ביטול או השלמה חדשים? מעדכנים ב-<code>data/my-semester.js</code> (שדות cancelled / extra), או מבקשים מ-Claude לפי prompts/weekly-pace.md.</div>
      </div><div class="grid wide">${cards}</div>`;
  }

  function viewGrades() {
    const avgFinal = L.averages(courses, state.grades, previous, false);
    const avgProj = L.averages(courses, state.grades, previous, true);
    const cards = courses.map((c) => {
      const g = state.grades[c.id] || {};
      const r = L.courseGrade(c, g);
      const need = L.neededExam(c, g, Number(state.target), Number(state.assume));
      const inputs = c.components.length
        ? `<table><tr><th>רכיב</th><th>משקל</th><th>ציון</th></tr>${c.components.map((k) => `
            <tr><td>${esc(k.name)}${k.min ? ` <span class="muted small">(מינ׳ ${k.min})</span>` : ""}</td><td>${k.weight}%</td>
            <td><input type="number" min="0" max="100" step="0.5" data-grade="${c.id}|${k.key}" value="${esc(g.components && g.components[k.key] != null ? g.components[k.key] : "")}"></td></tr>`).join("")}
            <tr><td>בונוס / קנס (נק׳)</td><td></td><td><input type="number" step="0.5" data-grade="${c.id}|_bonus" value="${esc(g.bonus != null ? g.bonus : "")}"></td></tr></table>`
        : `<div class="row">ציון סופי: <input type="number" min="0" max="100" data-grade="${c.id}|_final" value="${esc(g.final != null ? g.final : "")}"></div>`;
      return `<div class="card course-bar" style="--c:${c.color}">
        <h3><button class="link title" data-course="${c.id}">${esc(c.name)}</button> <span class="spacer"></span><span class="muted small">${c.credits} נק״ז</span></h3>
        ${inputs}
        <div class="row" style="margin-top:10px">
          <div><div class="grade-big">${r1(r.grade !== null ? r.grade : r.projected)}</div>
          <div class="muted small">${r.complete ? "ציון סופי" : r.projected !== null ? `צפי לפי ${r.wEntered}% שהוזנו` : "עוד לא הוזנו ציונים"}</div></div>
          <span class="spacer"></span>
          ${need ? `<div class="small" style="max-width:220px">ל-${state.target} בקורס צריך <b>${need.possible ? r1(need.needed) : "יותר מ-100"}</b> במבחן${need.assumed.length ? ` <span class="muted">(בהנחת ${state.assume} ב: ${esc(need.assumed.join(", "))})</span>` : ""}</div>` : ""}
        </div>
        ${r.failed.length ? `<div class="warn small">⚠️ ${esc(r.failed.join(" · "))}</div>` : ""}
      </div>`;
    }).join("");
    return `
      <div class="kpis">
        <div class="kpi"><div class="v">${r1(avgFinal.semester)}</div><div class="l">ממוצע סמסטר – ציונים סופיים (${avgFinal.semesterCredits} נק״ז)</div></div>
        <div class="kpi"><div class="v">${r1(avgProj.semester)}</div><div class="l">ממוצע סמסטר – צפי</div></div>
        <div class="kpi"><div class="v">${r1(avgProj.cumulative)}</div><div class="l">ממוצע מצטבר – צפי</div></div>
      </div>
      <div class="card" style="margin-bottom:16px"><div class="row">
        <b>ממוצע קודם:</b> <input type="number" step="0.01" data-prev="average" value="${esc(previous.average != null ? previous.average : "")}" placeholder="ממוצע">
        על <input type="number" step="0.5" data-prev="credits" value="${esc(previous.credits != null ? previous.credits : "")}" placeholder="נק״ז"> נק״ז
        <span class="spacer"></span>
        יעד לכל קורס: <input type="number" data-setting="target" value="${esc(state.target)}">
        הנחה לרכיבים שלא הוזנו: <input type="number" data-setting="assume" value="${esc(state.assume)}">
      </div><div class="muted small">כלל ה-56: מבחן מתחת ל-56 – ציון הקורס הוא ציון המבחן. המחשבון מציג גם כמה צריך במבחן כדי להגיע ליעד.</div></div>
      <div class="grid">${cards}</div>`;
  }

  function viewReqs() {
    const total = courses.reduce((s, c) => s + c.credits, 0);
    return `
      <div class="card" style="margin-bottom:16px">
        <h3>📚 ${esc(data.semester.name)} · ${courses.length} קורסים · ${total} נק״ז</h3>
        <table><tr><th>קורס</th><th>נק״ז</th><th>מרכיבי הציון</th><th>תנאים</th></tr>
        ${courses.map((c) => `<tr><td><span class="dot" style="--c:${c.color}"></span> <b>${esc(c.name)}</b><div class="muted small">${esc(c.code)}</div></td>
          <td>${c.credits}</td>
          <td>${c.components.map((k) => `${esc(k.name)} ${k.weight}%`).join("<br>") || "לא ידוע"}</td>
          <td class="small">${(c.conditions || []).map(esc).join("<br>")}</td></tr>`).join("")}
        </table>
      </div>
      <div class="grid wide">${courses.map((c) => `
        <div class="card course-bar" style="--c:${c.color}">
          <h3><button class="link title" data-course="${c.id}">${esc(c.name)}</button></h3>
          ${(c.staff || []).length ? `<div class="small">👥 ${c.staff.map(esc).join(" · ")}</div>` : ""}
          <div class="small">🕑 ${(c.sessions || []).map((s) => `${L.SESSION_LABEL[s.type]} ${L.DAY_NAMES[s.day]} ${s.start}–${s.end} (${esc(s.location || "")})`).join(" · ")}</div>
          ${(c.notes || []).length ? `<ul class="small">${c.notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul>` : ""}
          ${(c.links || []).length ? `<div class="row small">🔗 ${c.links.map((l) => `<a href="${esc(L.safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join(" · ")}</div>` : ""}
        </div>`).join("")}</div>`;
  }

  function viewSummaries() {
    const c = byId[summaryCourse] || courses[0];
    const mine = state.notes[c.id] || [];
    const entries = [...(c.summaries || []).map((s) => ({ ...s, fromData: true })), ...mine];
    return `
      <div class="tabs-inline">${courses.map((x) => `<button data-sumcourse="${x.id}" class="${x.id === c.id ? "active" : ""}" style="--c:${x.color}">${esc(x.short)}</button>`).join("")}</div>
      <div class="grid wide">
        <div class="card span course-bar" style="--c:${c.color}">
          <div class="row"><h3>📖 הסיכום המצטבר – ${esc(c.name)}</h3><span class="spacer"></span>
            <button class="btn ghost" data-action="md">הורדה כ-Markdown</button>
            <button class="btn ghost" data-action="print">הדפסה / PDF</button></div>
          ${entries.length ? entries.map((s, i) => `
            <div class="summary-entry" style="--c:${c.color}">
              <div class="row"><b>${esc(s.session || "")}${s.title ? " – " + esc(s.title) : ""}</b>
                <span class="muted small">${s.date ? L.fmt(s.date) : ""}</span><span class="spacer"></span>
                ${s.link && L.safeUrl(s.link) ? `<a class="small" href="${esc(L.safeUrl(s.link))}" target="_blank" rel="noopener">לסיכום המלא</a>` : ""}
                ${s.fromData ? "" : `<button class="link small" data-delnote="${i - (c.summaries || []).length}">מחיקה</button>`}</div>
              <ul>${(s.points || []).map((p) => `<li>${esc(p)}</li>`).join("")}</ul>
            </div>`).join("") : `<div class="empty">עוד אין סיכומים בקורס הזה.</div>`}
        </div>
        <div class="card span">
          <h3>➕ להוסיף סיכום של מפגש</h3>
          <form id="addNote" class="stack">
            <div class="row"><input name="session" placeholder="למשל: הרצאה 4" required>
              <input name="title" placeholder="נושא" style="flex:1"><input type="date" name="date" value="${todayIso}"></div>
            <textarea name="points" placeholder="נקודה בכל שורה: מה חובה לדעת, נוסחה, מלכודת נפוצה..."></textarea>
            <input name="link" placeholder="קישור לסיכום מלא (לא חובה)" style="width:100%">
            <button class="btn">שמירה</button>
          </form>
        </div>
      </div>`;
  }

  function viewCourse() {
    const c = byId[state.courseId] || courses[0];
    const p = L.paceStatus(c, data.semester, now, state.seen);
    const r = L.courseGrade(c, state.grades[c.id]);
    const dls = deadlineItems().filter((d) => d.courseId === c.id);
    const upcoming = dls.filter((d) => L.daysUntil(d.date, now) >= 0);
    const notes = [...(c.summaries || []), ...(state.notes[c.id] || [])];
    const open = (data.openItems || []).filter((o) => o.courseId === c.id && !state.done["open|" + o.id]);
    return `
      <div class="course-hero" style="--c:${c.color}">
        <h2>${esc(c.name)}</h2>
        <div class="muted">${esc(c.code)} · ${c.credits} נק״ז ${(c.staff || []).length ? "· " + c.staff.map(esc).join(" · ") : ""}</div>
        <div class="tabs-inline" style="margin-top:10px">${courses.map((x) => `<button data-course="${x.id}" class="${x.id === c.id ? "active" : ""}" style="--c:${x.color}">${esc(x.short)}</button>`).join("")}</div>
      </div>
      <div class="kpis">
        <div class="kpi"><div class="v" style="color:${p.behind ? "var(--now)" : "var(--ok)"}">${p.behind}</div><div class="l">מפגשים שעוד לא ראית</div></div>
        <div class="kpi"><div class="v">${upcoming[0] ? L.daysUntil(upcoming[0].date, now) : "—"}</div><div class="l">ימים ל: ${upcoming[0] ? esc(upcoming[0].title) : "אין"}</div></div>
        <div class="kpi"><div class="v">${r1(r.grade !== null ? r.grade : r.projected)}</div><div class="l">${r.complete ? "ציון סופי" : "צפי ציון"}</div></div>
      </div>
      <div class="grid wide">
        <div class="card"><h3>⏱️ מה ראיתי</h3>
          <div class="seen-list">${p.items.map((i) => `
            <label class="seen-item ${i.seen ? "seen" : i.urgent ? "urgent" : ""}"><input type="checkbox" data-seen="${esc(i.key)}" ${i.seen ? "checked" : ""}> ${i.label} <span class="muted">${L.fmt(i.date)}</span></label>`).join("") || `<span class="empty">עוד לא התקיימו מפגשים</span>`}</div>
          <div class="small" style="margin-top:8px">${Object.entries(p.pace).map(([type, x]) => x.next ? `${L.SESSION_LABEL[type]} הבא: #${x.next.n} ${L.fmtLong(x.next.date)} ${x.next.start} · ${esc(x.session.location || "")}` : "").filter(Boolean).join("<br>")}</div>
        </div>
        <div class="card"><h3>📌 הגשות ומבחנים</h3>
          <ul class="clean">${dls.map((d) => { const x = L.daysUntil(d.date, now); return `<li class="row ${x < 0 ? "muted" : ""}">${d.kind === "exam" ? "📝" : "📌"} ${esc(d.title)}${d.weight ? ` <span class="muted small">${d.weight}%</span>` : ""}<span class="spacer"></span><span class="small">${L.fmt(d.date)}${x >= 0 ? " · " + daysText(x) : ""}</span></li>`; }).join("") || `<li class="empty">אין</li>`}</ul>
        </div>
        <div class="card"><h3>📋 דרישות</h3>
          <div class="small">${c.components.map((k) => `${esc(k.name)} <b>${k.weight}%</b>`).join(" · ") || "מרכיבי הציון לא ידועים"}</div>
          <ul class="small">${(c.conditions || []).concat(c.notes || []).map((n) => `<li>${esc(n)}</li>`).join("")}</ul>
          ${open.length ? `<div class="small warn">❓ ${open.map((o) => esc(o.text)).join(" · ")}</div>` : ""}
          ${(c.links || []).length ? `<div class="row small">🔗 ${c.links.map((l) => `<a href="${esc(L.safeUrl(l.url))}" target="_blank" rel="noopener">${esc(l.title)}</a>`).join(" · ")}</div>` : ""}
        </div>
        <div class="card"><h3>📖 הסיכום המצטבר</h3>
          ${notes.length ? notes.map((s) => `<div class="summary-entry" style="--c:${c.color}"><b>${esc(s.session || "")}${s.title ? " – " + esc(s.title) : ""}</b>
            ${s.link && L.safeUrl(s.link) ? ` <a class="small" href="${esc(L.safeUrl(s.link))}" target="_blank" rel="noopener">לסיכום</a>` : ""}<ul>${(s.points || []).map((x) => `<li>${esc(x)}</li>`).join("")}</ul></div>`).join("") : `<div class="empty">עוד אין סיכומים.</div>`}
          <button class="link" data-sumcourse="${c.id}" data-tab="summaries">להוסיף סיכום ←</button>
        </div>
      </div>`;
  }

  function appCard() {
    const p = window.PWA || { state: "unsupported" };
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let body;
    if (p.state === "update") body = `<p class="small">יש גרסה חדשה של האפליקציה.</p><button class="btn" data-action="pwaUpdate">עדכון עכשיו</button>`;
    else if (p.standalone || p.state === "installed") body = `<p class="small">האפליקציה מותקנת ✓ היא עובדת גם בלי אינטרנט. הנתונים שלך מסונכרנים דרך הענן, כשיש חיבור.</p>`;
    else if (p.state === "installable") body = `<p class="small muted">להתקין כאפליקציה: אייקון במסך הבית, בלי שורת כתובת, ועובד גם בלי אינטרנט.</p>
        <button class="btn" data-action="pwaInstall">📲 התקנת האפליקציה</button>`;
    else if (ios) body = `<p class="small muted">באייפון: לפתוח ב-Safari ← כפתור <b>שיתוף</b> ← <b>הוספה למסך הבית</b>.</p>`;
    else if (p.state === "ready") body = `<p class="small">מוכנה לעבודה בלי אינטרנט ✓</p>
        <p class="small muted">להתקנה כאפליקציה: בכרום או אדג׳ – תפריט ⋮ ← <b>התקנת האפליקציה</b>, או סמל ההתקנה בשורת הכתובת. בדפדפן הזה אין התקנה.</p>`;
    else body = `<p class="small muted">כדי להתקין ולעבוד בלי אינטרנט צריך לפתוח את האפליקציה ב-localhost או בכתובת מאובטחת (https), לא כקובץ מהמחשב.</p>`;
    return `<div class="card"><h3>📱 האפליקציה</h3>${body}</div>`;
  }

  // מדד הצלחה: כמה ממשימות הבוקר בוצעו בשבועיים האחרונים. יעד ראשוני: 70 אחוז ומעלה.
  function adherenceCard() {
    const a = L.adherence(state.log, planItemDone, now, 14);
    const text = a.days < 3
      ? "עוד אין מספיק ימים למדידה. המערכת שומרת את תוכנית הבוקר כל יום, והמספר יופיע אחרי שלושה ימים."
      : `<b>${a.pct}%</b> ממשימות הבוקר בוצעו (${a.done} מתוך ${a.planned}, ב-${a.days} ימים). היעד: 70% ומעלה.`;
    return `<div class="card"><details><summary><h3 style="display:inline">📈 ביצוע התוכנית</h3></summary><p class="small">${text}</p>
      <p class="small muted">נספרים ימים שעברו בלבד. משימה שהושלמה בדיעבד נחשבת. הנתונים נשמרים רק אצלך.</p></details></div>`;
  }

  function moodleBookmarklet() {
    const app = location.origin + location.pathname;
    const code = "(()=>{const rows=[...document.querySelectorAll('table tr')].map(tr=>{const c=tr.querySelectorAll('td,th');return c.length>=2?{name:c[0].innerText.trim(),grade:c[1].innerText.trim()}:null}).filter(Boolean);if(!rows.length){alert('לא נמצאה טבלת ציונים. פתחי את דוח הציונים הכללי.');return}window.open('" + app + "#moodle='+encodeURIComponent(JSON.stringify(rows)))})()";
    return "javascript:" + encodeURIComponent(code);
  }
  function importMoodleFromHash() {
    if (!location.hash.startsWith("#moodle=") || new URLSearchParams(location.search).has("demo")) return;
    let rows = [];
    try { rows = JSON.parse(decodeURIComponent(location.hash.slice(8))).slice(0, 200); } catch { rows = []; }
    history.replaceState(null, "", location.pathname + location.search);
    const m = L.matchMoodleGrades(rows, courses);
    if (!m.length) { toast("לא נמצאו ציונים שמתאימים לקורסים שלך"); return; }
    const lines = m.map((x) => x.courseName + ": " + x.grade);
    if (!confirm(["לשמור את הציונים האלה?", "", ...lines].join(String.fromCharCode(10)))) return;
    state.moodle = { at: todayIso, grades: Object.fromEntries(m.map((x) => [x.courseId, x.grade])) };
    save();
    toast("הציונים נשמרו ✓");
  }
  function viewSettings() {
    const srcText = { sample: "נתוני הדגמה (data/sample-semester.js)", mine: "הקובץ שלך (data/my-semester.js)", import: "נתונים שייבאת לדפדפן הזה", cloud: "הענן (Supabase)" }[source];
    return `<div class="grid">
      ${appCard()}
      ${cloudCard()}
      ${adherenceCard()}
      <div class="card"><h3>🎓 ייבוא ציונים מ-Moodle</h3><div class="small">גררי את הכפתור לסרגל הסימניות. ב-Moodle, בדוח "ציונים", לחצי עליו פעם אחת: הציונים יעברו לכאן דרך הדפדפן בלבד, ותאשרי לפני השמירה.</div><p><a class="btn" href="${esc(moodleBookmarklet())}" onclick="return false">שאיבת ציונים</a></p></div>
      <div class="card"><h3>💾 גיבוי ההתקדמות שלך</h3>
        <p class="small muted">מה שסימנת (ראיתי / בוצע), ציונים, משימות וסיכומים שהוספת נשמרים רק בדפדפן. כדאי לגבות מדי פעם.</p>
        <div class="row"><button class="btn" data-action="export">ייצוא גיבוי</button>
        <label class="btn ghost" style="cursor:pointer">ייבוא גיבוי<input type="file" accept=".json" data-import="state" hidden></label></div></div>
      <div class="card"><h3>🗃️ מקור הנתונים</h3>
        <p class="small">כרגע: <b>${srcText}</b> · עודכן ${esc(data.updated || "—")}</p>
        <p class="small muted">באתר בגיטהאב (GitHub Pages) הקובץ האישי לא קיים, אז אפשר לטעון אותו כאן פעם אחת והוא יישמר בדפדפן.</p>
        <div class="row"><label class="btn ghost" style="cursor:pointer">טעינת my-semester.js<input type="file" accept=".js,.json" data-import="data" hidden></label>
        ${source === "import" ? `<button class="btn danger" data-action="clearData">חזרה לקובץ המקומי</button>` : ""}</div></div>
      <div class="card"><h3>🎨 תצוגה</h3>
        <div class="row">סגנון: <select data-setting-str="look">${[["spectrum", "ספקטרום (ברירת מחדל)"], ["board", "לוח"], ["garden", "גן"], ["berry", "פירות יער"]].map(([v, l]) => `<option value="${v}" ${(state.look || "spectrum") === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <div class="row" style="margin-top:8px">מצב כהה: <select data-setting-str="theme">${[["auto", "לפי המחשב"], ["light", "בהיר"], ["dark", "כהה"]].map(([v, l]) => `<option value="${v}" ${state.theme === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
        <label class="row" style="margin-top:8px"><input type="checkbox" data-setting-bool="reviews" ${state.reviews ? "checked" : ""}> חזרות מרווחות: יום, שבוע וחודש אחרי שראית הרצאה</label>
        <div class="muted small">קיצורי מקלדת: 1–4 מעבר בין לשוניות.</div></div>
      <div class="card"><h3>🧪 לבדוק יום אחר</h3>
        <p class="small muted">להוסיף לכתובת <code>?today=2026-12-01</code> כדי לראות איך ייראה יום מסוים.</p></div>
    </div>`;
  }

  // ---------- render & events ----------
  function render() {
    if (!VIEWS[state.tab]) state.tab = "today";
    applyTheme();
    document.body.dataset.view = state.tab;
    const unread = remote.inbox.filter((m) => !m.read).length;
    document.getElementById("tabs").innerHTML = Object.entries(VIEWS).filter(([, v]) => !v.hidden)
      .map(([k, v]) => `<button data-tab="${k}" class="${k === state.tab || VIEWS[state.tab].parent === k ? "active" : ""}" title="${v.title}">
        <i>${ICONS[k] || ""}</i><span>${v.title}</span>${k === "today" && unread ? `<em class="dotn">${unread}</em>` : ""}</button>`).join("");
    document.getElementById("railFoot").innerHTML =
      `<button data-tab="settings" class="${state.tab === "settings" ? "active" : ""}" title="הגדרות"><i>${ICONS.settings}</i><span>הגדרות</span></button>
       <button data-action="theme" title="מצב כהה / בהיר"><i>${document.documentElement.dataset.theme === "dark" ? "☀" : "☾"}</i><span>${document.documentElement.dataset.theme === "dark" ? "בהיר" : "כהה"}</span></button>`;
    document.getElementById("pageTitle").textContent = VIEWS[state.tab].title;
    const sw = L.semesterWeek(data.semester, now);
    document.getElementById("subtitle").textContent =
      `${data.student && data.student.name ? data.student.name + " · " : ""}${data.semester.name}${sw.n ? ` · שבוע ${sw.n} מתוך ${sw.total}` : ""} · ${L.fmtLong(todayIso)}${qp ? " (תצוגת יום אחר)" : ""}`;
    const banner = document.getElementById("banner");
    banner.hidden = source !== "sample";
    banner.textContent = DEMO ? "מצב הדגמה · נתונים לדוגמה, שום דבר לא נשמר" : "מצב הדגמה: מוצגים נתונים לדוגמה. כדי לראות את שלך – ליצור data/my-semester.js (ראי README) או לטעון אותו בהגדרות.";
    renderFocus();
    const v = VIEWS[state.tab];
    document.getElementById("view").innerHTML = (v.parent ? `<button class="link back" data-tab="${v.parent}">→ חזרה ל${VIEWS[v.parent].title}</button>` : "") + v.render();
  }

  document.addEventListener("click", (e) => {
    if (e.target.closest("[data-undo]") && undoSnap) {
      Object.assign(state, JSON.parse(undoSnap)); undoSnap = null; save(); toast("בוטל");
      return render();
    }
    const cb = e.target.closest("[data-cloud]");
    if (cb) return cloudAction(cb.dataset.cloud, cb);
    const t = e.target.closest("[data-plandone],[data-snooze],[data-seenall],[data-course],[data-tab],[data-week],[data-action],[data-deltask],[data-sumcourse],[data-delnote]");
    if (!t) return;
    if (t.dataset.plandone) {
      const id = t.dataset.plandone, snap = snapState();
      if (id.startsWith("pace|")) state.seen[id.slice(5)] = todayIso;
      else if (id.startsWith("rev|")) state.reviewed[id.slice(4)] = true;
      else if ((planItems().find((i) => i.id === id) || {}).kind === "exam") state.snooze[id] = L.iso(L.addDays(now, 1));
      else state.done[id] = true;
      save(); toast("יפה! ✓", snap);
    }
    else if (t.dataset.snooze) { const snap = snapState(); state.snooze[t.dataset.snooze] = L.iso(L.addDays(now, 1)); save(); toast("נדחה למחר", snap); }
    else if (t.dataset.seenall) {
      const c = byId[t.dataset.seenall];
      for (const it of L.paceStatus(c, data.semester, now, state.seen).items) if (!it.seen) state.seen[it.key] = true;
      save(); toast("סומן: ראיתי הכול ✓");
    }
    else if (t.dataset.course) { e.preventDefault(); state.tab = "course"; state.courseId = t.dataset.course; save(); window.scrollTo(0, 0); }
    else if (t.dataset.tab) { if (t.dataset.sumcourse) summaryCourse = t.dataset.sumcourse; state.tab = t.dataset.tab; save(); window.scrollTo(0, 0); }
    else if (t.dataset.week !== undefined) weekOffset = t.dataset.week === "0" ? 0 : weekOffset + Number(t.dataset.week);
    else if (t.dataset.deltask) { state.tasks = state.tasks.filter((x) => x.id !== t.dataset.deltask); save(); }
    else if (t.dataset.sumcourse) summaryCourse = t.dataset.sumcourse;
    else if (t.dataset.delnote !== undefined) { (state.notes[summaryCourse] || []).splice(Number(t.dataset.delnote), 1); save(); }
    else if (t.dataset.action) return action(t.dataset.action);
    render();
  });

  function action(a) {
    if (a === "ics") download("student-copilot-deadlines.ics", L.buildIcs(data.deadlines, courses), "text/calendar;charset=utf-8");
    if (a === "export") download(`student-copilot-backup-${todayIso}.json`, JSON.stringify({ ...state, dataOverride: undefined }, null, 2), "application/json");
    if (a === "clearData") { state.dataOverride = null; save(); location.reload(); }
    if (a === "print") window.print();
    if (a === "pwaInstall") return window.PWA.install().then((ok) => { if (ok) toast("מותקן ✓"); render(); });
    if (a === "pwaUpdate") { toast("מעדכן…"); return window.PWA.update(); }
    if (a === "why") { const w = document.getElementById("why"); w.hidden = !w.hidden; }
    if (a === "theme") { state.theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark"; save(); render(); }
    if (a === "md") {
      const c = byId[summaryCourse];
      const all = [...(c.summaries || []), ...(state.notes[c.id] || [])];
      const md = `# ${c.name} – סיכום מצטבר\n\n` + all.map((s) =>
        `## ${s.session || ""}${s.title ? " – " + s.title : ""}${s.date ? ` (${L.fmt(s.date)})` : ""}\n` +
        (s.points || []).map((p) => `- ${p}`).join("\n") + (s.link ? `\n\n[לסיכום המלא](${s.link})` : "")).join("\n\n");
      download(`${c.short || c.id}-summary.md`, md, "text/markdown;charset=utf-8");
    }
  }

  document.addEventListener("change", (e) => {
    const t = e.target;
    const d = t.dataset;
    if (d.done) { state.done[d.done] = t.checked; toast(t.checked ? "סומן כבוצע ✓" : "בוטל הסימון"); }
    else if (d.seen) { if (t.checked) state.seen[d.seen] = todayIso; else delete state.seen[d.seen]; toast(t.checked ? "סומן: ראיתי ✓" : "בוטל הסימון"); }
    else if (d.review) { state.reviewed[d.review] = true; toast("חזרה סומנה ✓"); }
    else if (d.settingStr) { state[d.settingStr] = t.value; }
    else if (d.settingBool) { state[d.settingBool] = t.checked; }
    else if (d.grade) {
      const [cid, key] = d.grade.split("|");
      const g = (state.grades[cid] = state.grades[cid] || { components: {} });
      g.components = g.components || {};
      const v = t.value === "" ? null : Number(t.value);
      if (key === "_bonus") g.bonus = v; else if (key === "_final") g.final = v; else g.components[key] = v;
    } else if (d.prev) {
      state.previous = Object.assign({}, previous, state.previous, { [d.prev]: t.value === "" ? null : Number(t.value) });
      Object.assign(previous, state.previous);
    } else if (d.setting) { state[d.setting] = Number(t.value); }
    else if (d.import) return importFile(t, d.import);
    else return;
    save();
    render();
  });

  function importFile(input, kind) {
    const f = input.files[0];
    if (!f) return;
    f.text().then((txt) => {
      try {
        if (kind === "data") {
          const json = txt.slice(txt.indexOf("{"), txt.lastIndexOf("}") + 1);
          const parsed = JSON.parse(json);
          if (!parsed.courses || !parsed.semester) throw new Error("חסרים courses או semester");
          state.dataOverride = parsed;
        } else {
          const parsed = JSON.parse(txt);
          for (const k of ["seen", "done", "reviewed", "grades", "tasks", "notes", "previous", "target", "assume"]) if (k in parsed) state[k] = parsed[k];
        }
        save();
        location.reload();
      } catch (err) {
        alert("הקובץ לא נקרא: " + err.message);
      }
    });
  }

  document.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    if (e.target.id === "addTask") {
      state.tasks.push({
        id: "t" + Date.now(), title: f.get("title"), courseId: f.get("courseId") || null,
        date: f.get("date") || null, time: f.get("time") || null, weight: Number(f.get("weight")) || 0, hours: Number(f.get("hours")) || 0,
      });
    } else if (e.target.id === "addNote") {
      (state.notes[summaryCourse] = state.notes[summaryCourse] || []).push({
        session: f.get("session"), title: f.get("title"), date: f.get("date"), link: f.get("link"),
        points: String(f.get("points")).split("\n").map((s) => s.trim()).filter(Boolean),
      });
    }
    save();
    render();
  });

  document.addEventListener("keydown", (e) => {
    if (e.target.closest("input,textarea,select") || e.ctrlKey || e.metaKey || e.altKey) return;
    const keys = Object.keys(VIEWS).filter((k) => !VIEWS[k].hidden);
    const i = Number(e.key) - 1;
    if (i >= 0 && i < keys.length) { state.tab = keys[i]; save(); render(); }
  });
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", render);

  document.addEventListener("pwa-change", () => { if (state.tab === "settings") render(); });

  importMoodleFromHash();
  render();
  cloudInit().catch((err) => { cloud.status = "error"; cloud.error = err.message; render(); });
})();
