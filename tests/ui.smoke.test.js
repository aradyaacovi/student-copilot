/*
 * UI smoke tests – no dependencies.
 *
 *   node tests/ui.smoke.test.js
 *
 * Starts tools/serve.js on a free port and drives a headless Chrome/Edge over the DevTools
 * protocol (same technique as tools/shots.js). The clock is pinned with ?today= and ?now=,
 * so nothing here depends on the day the test runs.
 *
 * Network is mocked: personal data (data/my-semester.js), cloud settings (js/config.js),
 * Google Fonts and the Supabase CDN script are answered locally. So the test never sees
 * personal data and never reaches the internet, wherever it runs.
 *
 * No browser found: skipped locally, but fails when CI is set (so CI can never silently skip).
 */
const { spawn, spawnSync } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

// Node 20 has WebSocket only behind a flag (Node 22+ has it built in): run again with the flag.
if (typeof WebSocket === "undefined") {
  const r = spawnSync(process.execPath, ["--experimental-websocket", __filename], { stdio: "inherit" });
  process.exit(r.status === null ? 1 : r.status);
}

const ROOT = path.join(__dirname, "..");
const DATE = "2026-11-17";
const TIME = "09:40";
const PIN = `today=${DATE}&now=${TIME}`;
const STORE = "studentCopilot.v1";

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, what, ms = 15000) {
  const end = Date.now() + ms;
  for (;;) {
    let v;
    try { v = await fn(); } catch { /* page still loading */ }
    if (v) return v;
    if (Date.now() > end) throw new Error("timeout: " + what);
    await wait(50);
  }
}
const freePort = () => new Promise((resolve) => {
  const s = net.createServer().listen(0, "127.0.0.1", () => { const p = s.address().port; s.close(() => resolve(p)); });
});

/** Minimal DevTools protocol client with event subscription. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  const handlers = [];
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("WebSocket failed")));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      return msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
    }
    for (const h of handlers) h(msg.method, msg.params || {});
  });
  return {
    ready,
    on: (h) => handlers.push(h),
    send: (method, params) => new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params: params || {} }));
    }),
    close: () => ws.close(),
  };
}

// ---------- the harness ----------
const results = [];
let cdp, base, errors, requests, mocks;

const ok = (cond, msg) => { if (!cond) throw new Error(msg); };
const evaluate = async (expr) => {
  const r = await cdp.send("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error("evaluate: " + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
  return r.result.value;
};
const click = (sel) => evaluate(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; e.click(); return true; })()`);
const stored = async () => JSON.parse((await evaluate(`localStorage.getItem(${JSON.stringify(STORE)})`)) || "null");

/** Open a page with a clean browser storage and fresh error/request logs. */
async function open(query, { width = 1280, height = 900, mobile = false, seed, config } = {}) {
  mocks.config = config || "";
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile, screenWidth: width, screenHeight: height });
  await cdp.send("Page.navigate", { url: `${base}/tools-smoke-reset` }); // same origin, nothing loaded
  await until(() => evaluate(`location.pathname === "/tools-smoke-reset" && document.readyState === "complete"`), "reset page");
  await evaluate(`localStorage.clear(); ${seed ? `localStorage.setItem(${JSON.stringify(STORE)}, ${JSON.stringify(seed)});` : ""} true`);
  errors.length = 0;
  requests.length = 0;
  await cdp.send("Page.navigate", { url: `${base}/index.html?${query}` });
  await until(() => evaluate(`!!document.querySelector("#view") && document.querySelector("#view").innerHTML.length > 0`), "app render");
}

/** A failing test leaves a screenshot in test-results/ (CI uploads it as an artifact). */
async function shot(name) {
  try {
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png" });
    const dir = path.join(ROOT, "test-results");
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, "ui-" + (results.length) + ".png");
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    console.log("      screenshot:", path.relative(ROOT, file));
  } catch (e) { console.log("      (no screenshot: " + e.message + ")"); }
}

async function test(name, fn) {
  try { await fn(); results.push({ name, pass: true }); console.log("  ✓", name); }
  catch (e) {
    results.push({ name, pass: false, err: e.message });
    console.log("  ✗", name, "\n     ", e.message);
    await shot(name);
  }
}

const isCloud = (u) => /\.supabase\.co|smoke-test\.invalid/.test(u);
const noErrors = () => ok(!errors.length, "console errors:\n      " + errors.join("\n      "));
const tabs = () => evaluate(`[...document.querySelectorAll("#tabs [data-tab]")].map((b) => b.dataset.tab)`);

// ---------- scenarios ----------
async function scenarios() {
  console.log("UI smoke tests (" + DATE + " " + TIME + ")");

  await test("demo loads with no console errors", async () => {
    await open(`demo=1&${PIN}`);
    await wait(300);
    noErrors();
    ok(await evaluate(`document.title === "Student Copilot"`), "title");
    ok((await evaluate(`document.getElementById("subtitle").textContent`)).length > 0, "subtitle empty");
  });

  await test("today shows exactly one task plus today's plan", async () => {
    await open(`demo=1&${PIN}`);
    const n = await evaluate(`({
      titles: document.querySelectorAll("#focus .focus-title").length,
      primary: document.querySelectorAll("#focus .focus-actions [data-plandone]").length,
      ribbon: document.querySelectorAll("#focus .ribbon li").length,
      title: document.querySelector("#focus .focus-title").textContent.trim(),
      pageTitle: document.getElementById("pageTitle").textContent,
    })`);
    ok(n.titles === 1 && n.primary === 1, `expected one focus task, got ${n.titles} titles / ${n.primary} actions`);
    ok(n.title.length > 0, "focus task has no title");
    ok(n.ribbon >= 1, "today's plan (ribbon) is empty");
    ok(n.pageTitle === "היום", "page title: " + n.pageTitle);
  });

  await test("switching tabs works and keeps the focus panel", async () => {
    await open(`demo=1&${PIN}`);
    const list = await tabs();
    ok(list.length >= 4, "expected at least 4 tabs, got " + list.join(","));
    for (const t of list) {
      await click(`#tabs [data-tab="${t}"]`);
      const title = await evaluate(`document.querySelector("#tabs [data-tab='${t}']").title`);
      await until(() => evaluate(`document.getElementById("pageTitle").textContent === ${JSON.stringify(title)}`), `tab ${t} title`);
      ok(await evaluate(`document.getElementById("view").innerHTML.trim().length > 0`), `tab ${t} is empty`);
      ok(await evaluate(`document.querySelectorAll("#focus .focus-title").length === 1`), `focus panel gone on tab ${t}`);
    }
    noErrors();
  });

  await test("demo never writes to localStorage", async () => {
    await open(`demo=1&${PIN}`);
    await click("#focus .focus-actions [data-plandone]");
    await wait(200);
    ok((await stored()) === null, "demo mode saved state");
  });

  await test("marking the task done is saved in localStorage, survives reload, no cloud", async () => {
    await open(PIN);
    const first = await evaluate(`document.querySelector("#focus .focus-title").textContent.trim()`);
    ok(await click("#focus .focus-actions [data-plandone]"), "no done button");
    const s = await until(async () => {
      const v = await stored();
      return v && (Object.keys(v.done || {}).length + Object.keys(v.seen || {}).length + Object.keys(v.reviewed || {}).length + Object.keys(v.snooze || {}).length) ? v : null;
    }, "state saved");
    ok(s, "nothing saved");
    await cdp.send("Page.reload");
    await until(() => evaluate(`!!document.querySelector("#focus .focus-title")`), "reload render");
    const after = await evaluate(`document.querySelector("#focus .focus-title").textContent.trim()`);
    ok(after !== first, "the same task is still first after reload: " + first);
    ok(!requests.some(isCloud), "cloud request: " + requests.filter(isCloud).join(", "));
    noErrors();
  });

  await test("ticking 'seen' on a course page is saved in localStorage", async () => {
    await open(`${PIN}&tab=courses`);
    ok(await click("#view [data-course]"), "no course link");
    await until(() => evaluate(`!!document.querySelector("#view input[data-seen]")`), "course page");
    const key = await evaluate(`document.querySelector("#view input[data-seen]:not(:checked)").dataset.seen`);
    await evaluate(`document.querySelector("#view input[data-seen]:not(:checked)").click()`);
    const s = await until(async () => { const v = await stored(); return v && v.seen && v.seen[key] ? v : null; }, "seen saved");
    ok(s.seen[key], "seen key missing");
    ok(!requests.some(isCloud), "cloud request");
    noErrors();
  });

  await test("cloud settings present: demo never starts the cloud client", async () => {
    const config = `window.COPILOT_CONFIG = { supabaseUrl: "https://smoke-test.invalid", supabaseAnonKey: "test" };`;
    await open(`demo=1&${PIN}`, { config });
    await wait(300);
    ok((await evaluate(`window.__cloudCalls | 0`)) === 0, "createClient was called in demo mode");
    ok(!requests.some(isCloud), "request to the cloud host");
    noErrors();
  });

  await test("no personal data and no cloud: the app opens with sample data", async () => {
    await open(PIN);
    ok(await evaluate(`!document.getElementById("banner").hidden`), "sample-data banner missing");
    ok(await evaluate(`document.querySelectorAll("#focus .focus-title").length === 1`), "focus missing");
    noErrors();
  });

  await test("a semester with no courses does not break the page", async () => {
    // an imported data file with no courses at all
    const seed = JSON.stringify({ dataOverride: { semester: { name: "ריק", start: "2026-10-01", end: "2027-01-31", dayEnd: "19:30" }, courses: [], deadlines: [] }, tab: "today" });
    await open(PIN, { seed });
    ok(await evaluate(`document.getElementById("view").innerHTML.length > 0`), "empty data: view is blank");
    noErrors();
  });

  await test("grades: a typed grade is saved and the averages render", async () => {
    await open(`${PIN}&tab=grades`);
    ok(await evaluate(`document.querySelectorAll("#view .kpi .v").length >= 2`), "averages missing");
    ok(await evaluate(`(() => { const i = document.querySelector("#view input[data-grade]"); if (!i) return false; i.value = "90"; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`), "no grade input");
    const s = await until(async () => { const v = await stored(); return v && Object.keys(v.grades || {}).length ? v : null; }, "grade saved");
    ok(JSON.stringify(s.grades).includes("90"), "grade value not saved");
    noErrors();
  });

  await test("settings: opens and a changed setting is saved", async () => {
    await open(`${PIN}&tab=settings`);
    ok(await evaluate(`document.getElementById("pageTitle").textContent.length > 0 && document.getElementById("view").innerHTML.length > 200`), "settings view empty");
    await click('#tabs [data-tab="today"]');
    ok(await evaluate(`(() => { const i = document.querySelector("[data-setting='dailyHours']"); if (!i) return false; i.value = "6"; i.dispatchEvent(new Event("change", { bubbles: true })); return true; })()`), "no daily-hours input");
    const s = await until(async () => { const v = await stored(); return v && v.dailyHours === 6 ? v : null; }, "setting saved");
    ok(s.dailyHours === 6, "dailyHours not saved");
    noErrors();
  });

  await test("no horizontal scroll at 375px on any tab", async () => {
    for (const t of ["today", "schedule", "courses", "grades", "settings"]) {
      await open(`demo=1&${PIN}&tab=${t}`, { width: 375, height: 812, mobile: true });
      await wait(150);
      const m = await evaluate(`({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })`);
      ok(m.sw <= m.cw, `tab ${t}: page is ${m.sw}px wide in a ${m.cw}px viewport`);
    }
  });
}

// ---------- boot ----------
async function main() {
  const browser = CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) {
    const msg = "UI smoke tests: no Chrome/Edge found (set CHROME_PATH).";
    if (process.env.CI) { console.error(msg); process.exit(1); }
    console.log(msg + " Skipped.");
    return;
  }

  const sport = await freePort();
  const server = spawn(process.execPath, [path.join(ROOT, "tools", "serve.js")], { env: { ...process.env, PORT: String(sport) }, stdio: "ignore" });
  base = `http://127.0.0.1:${sport}`;
  const port = await freePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-"));
  let proc, stderr = "";
  const launch = () => {
    const extra = process.platform === "linux" ? ["--no-sandbox", "--disable-dev-shm-usage"] : []; // CI containers
    proc = spawn(browser, [
      "--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", "--disable-extensions", ...extra,
      `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
    ], { stdio: ["ignore", "ignore", "pipe"] });
    proc.stderr.on("data", (d) => { stderr = (stderr + d).slice(-1500); });
  };
  launch();
  const cleanup = async () => {
    try { cdp && cdp.close(); } catch { /* already closed */ }
    proc.kill(); server.kill();
    await wait(300);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold it; it is in temp */ }
  };

  try {
    let target;
    const findTarget = async () => {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
      return target;
    };
    try { await until(findTarget, "browser start", 10000); }
    catch { proc.kill(); await wait(500); launch(); await until(findTarget, "browser start (second try). Browser said: " + stderr, 15000); }
    await until(async () => (await fetch(base + "/index.html")).ok, "server start");

    cdp = connect(target.webSocketDebuggerUrl);
    await cdp.ready;
    errors = []; requests = []; mocks = { config: "" };
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    await cdp.send("Log.enable");
    await cdp.send("Network.enable");
    await cdp.send("Network.setBypassServiceWorker", { bypass: true }); // js/pwa.js registers sw.js, which would hide requests from the mocks
    await cdp.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });

    // The Supabase script is replaced by a stub that only counts calls.
    const STUB = `window.__cloudCalls = 0; window.supabase = { createClient() { window.__cloudCalls++; throw new Error("cloud client must not start"); } };`;
    cdp.on((method, p) => {
      if (method === "Runtime.exceptionThrown") errors.push("exception: " + (p.exceptionDetails.exception?.description || p.exceptionDetails.text));
      else if (method === "Runtime.consoleAPICalled" && p.type === "error") errors.push("console.error: " + p.args.map((a) => a.value ?? a.description).join(" "));
      else if (method === "Log.entryAdded" && p.entry.level === "error") errors.push("log: " + p.entry.text + " " + (p.entry.url || ""));
      else if (method === "Fetch.requestPaused") {
        const url = p.request.url;
        requests.push(url);
        const reply = (type, body) => cdp.send("Fetch.fulfillRequest", {
          requestId: p.requestId, responseCode: 200,
          responseHeaders: [{ name: "Content-Type", value: type }], body: Buffer.from(body).toString("base64"),
        });
        if (url.startsWith(base)) {
          const pathname = new URL(url).pathname;
          if (pathname === "/data/my-semester.js") return reply("text/javascript", "");   // personal data: never loaded
          if (pathname === "/js/config.js") return reply("text/javascript", mocks.config);
          if (pathname === "/favicon.ico") return reply("image/x-icon", "");
          if (pathname === "/tools-smoke-reset") return reply("text/html", "<!doctype html><title>reset</title>");
          return cdp.send("Fetch.continueRequest", { requestId: p.requestId });
        }
        if (url.includes("supabase")) return reply("text/javascript", STUB);
        if (url.includes("fonts.googleapis.com")) return reply("text/css", "");
        return reply("text/plain", ""); // anything else stays offline
      }
    });

    await scenarios();
  } catch (e) {
    results.push({ name: "harness", pass: false, err: e.message });
    console.error("  ✗ harness:", e.message);
  }
  await cleanup();

  const failed = results.filter((r) => !r.pass).length;
  console.log(failed ? `\n${failed} of ${results.length} failed` : `\nAll ${results.length} UI smoke tests passed`);
  process.exit(failed ? 1 : 0);
}

main();
