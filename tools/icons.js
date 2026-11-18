/*
 * Generates the app icons from one SVG source – no dependencies, no design tool.
 *   node tools/icons.js     writes icons/*.png and icons/icon.svg
 * Uses the same headless browser as tools/shots.js to rasterise.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const os = require("os");

const OUT = path.join(__dirname, "..", "icons");
const BLUE = "#2f54eb";
const YELLOW = "#ffd23f";
const CORAL = "#ff5a47";
const INK = "#141a3c";

/** The mark: a cobalt square, a yellow quarter-circle and a coral dot – the hero shapes, in miniature. */
const svg = (bleed) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="${bleed ? 0 : 112}" fill="${BLUE}"/>
  <!-- circles centred on the corners: the viewBox clips each to a clean quarter -->
  <circle cx="0" cy="512" r="226" fill="${YELLOW}"/>
  <circle cx="404" cy="124" r="78" fill="${CORAL}"/>
  <g fill="#fff" font-family="Rubik, Arial, sans-serif" font-weight="700" text-anchor="middle">
    <text x="256" y="330" font-size="188" letter-spacing="-6">SC</text>
  </g>
</svg>`;

const SIZES = [
  { name: "icon-192.png", size: 192, bleed: false },
  { name: "icon-512.png", size: 512, bleed: false },
  { name: "icon-maskable-512.png", size: 512, bleed: true },
  { name: "apple-touch-icon.png", size: 180, bleed: true },
  { name: "favicon-32.png", size: 32, bleed: false },
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

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function connect(wsUrl) {
  const ws = new WebSocket(wsUrl);
  const pending = new Map();
  let id = 0;
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener("open", () => resolve());
    ws.addEventListener("error", () => reject(new Error("WebSocket failed")));
  });
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    const p = pending.get(m.id);
    if (!p) return;
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  });
  return {
    ready,
    send: (method, params) => new Promise((res, rej) => { const n = ++id; pending.set(n, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: n, method, params: params || {} })); }),
    close: () => ws.close(),
  };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "icon.svg"), svg(false));

  const browser = CANDIDATES.find((p) => fs.existsSync(p));
  if (!browser) throw new Error("לא נמצא דפדפן. להגדיר CHROME_PATH.");
  const port = 9334;
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "icons-"));
  const proc = spawn(browser, ["--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
    `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });

  let target;
  for (let i = 0; i < 40 && !target; i++) {
    await wait(250);
    try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === "page"); } catch {}
  }
  if (!target) { proc.kill(); throw new Error("הדפדפן לא עלה"); }

  const cdp = connect(target.webSocketDebuggerUrl);
  await cdp.ready;
  await cdp.send("Page.enable");

  for (const s of SIZES) {
    const html = `<!DOCTYPE html><meta charset="utf-8">
      <link href="https://fonts.googleapis.com/css2?family=Rubik:wght@700&display=swap" rel="stylesheet">
      <style>html,body{margin:0;background:${s.bleed ? BLUE : "transparent"}}svg{display:block;width:100vw;height:100vh}</style>
      ${svg(s.bleed)}`;
    await cdp.send("Emulation.setDeviceMetricsOverride", { width: s.size, height: s.size, deviceScaleFactor: 1, mobile: false });
    await cdp.send("Page.navigate", { url: "data:text/html;charset=utf-8," + encodeURIComponent(html) });
    await wait(1200);
    const { data } = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
    fs.writeFileSync(path.join(OUT, s.name), Buffer.from(data, "base64"));
    console.log("✓", s.name, `${s.size}×${s.size}`);
  }

  cdp.close();
  proc.kill();
  await wait(500);
  try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
}

main().catch((e) => { console.error("נכשל:", e.message); process.exit(1); });
