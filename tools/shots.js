/*
 * Reproducible documentation screenshots – no dependencies.
 *
 *   node tools/serve.js            (in another terminal)
 *   node tools/shots.js            writes docs/screenshots/*.png
 *
 * Drives a headless Chrome/Edge over the DevTools protocol so the viewport is emulated
 * properly (the --window-size flag alone does not give a real mobile layout).
 * Always renders the demo data on a fixed date, so screenshots never leak personal data
 * and never change just because today changed.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const BASE = process.env.SHOTS_URL || "http://localhost:5180";
const DATE = "2026-11-17";
const OUT = path.join(__dirname, "..", "docs", "screenshots");

const SHOTS = [
  { name: "today", query: "tab=today" },
  { name: "schedule", query: "tab=schedule", height: 1150 },
  { name: "courses", query: "tab=courses", height: 900 },
  { name: "course", query: "tab=course&course=algo", height: 1000 },
  { name: "grades", query: "tab=grades", height: 1000 },
  { name: "today-dark", query: "tab=today&theme=dark" },
  { name: "mobile", query: "tab=today", width: 390, height: 844, mobile: true },
];

const CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].filter(Boolean);

function findBrowser() {
  const hit = CANDIDATES.find((p) => fs.existsSync(p));
  if (!hit) throw new Error("לא נמצא דפדפן. להגדיר CHROME_PATH לנתיב של Chrome או Edge.");
  return hit;
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal DevTools protocol client over the built-in WebSocket. */
function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", (e) => reject(new Error("WebSocket: " + (e.message || "failed"))));
  });
  ws.addEventListener("message", (ev) => {
    const msg = JSON.parse(ev.data);
    const p = pending.get(msg.id);
    if (!p) return;
    pending.delete(msg.id);
    msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result);
  });
  return {
    ready,
    send: (method, params) =>
      new Promise((resolve, reject) => {
        const n = ++id;
        pending.set(n, { resolve, reject });
        ws.send(JSON.stringify({ id: n, method, params: params || {} }));
      }),
    close: () => ws.close(),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = findBrowser();
  const port = 9333;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "shots-"));
  const proc = spawn(browser, [
    "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await wait(250);
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      target = list.find((t) => t.type === "page");
    } catch { /* not up yet */ }
  }
  if (!target) { proc.kill(); throw new Error("הדפדפן לא עלה"); }

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");

  for (const s of SHOTS) {
    const width = s.width || 1280;
    const height = s.height || 1000;
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 2, mobile: !!s.mobile,
      screenWidth: width, screenHeight: height,
    });
    const url = `${BASE}/?demo=1&today=${DATE}&now=09:40&theme=light&${s.query}`;
    await cdp.send("Page.navigate", { url });
    await wait(1800); // fonts and layout
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    const file = path.join(OUT, s.name + ".png");
    fs.writeFileSync(file, Buffer.from(data, "base64"));
    console.log("✓", s.name + ".png", `${width}×${height}`);
  }

  cdp.close();
  proc.kill();
  await wait(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold the profile; it is in temp */ }
}

main().catch((e) => { console.error("נכשל:", e.message); process.exit(1); });
