/*
 * One-shot local page for putting a secret into automations/.env without it passing
 * through a chat, an editor or the clipboard API.
 *
 *   node tools/set-secret.js SUPABASE_SERVICE_KEY
 *
 * Opens on 127.0.0.1 only, serves one small form, writes the value to the named key in
 * automations/.env (keeping a .bak), verifies the line, and exits. Nothing is logged but
 * the length. Close it with Ctrl+C if you change your mind.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");

const NAME = process.argv[2];
const PORT = Number(process.argv[3]) || 5399;
const ENV = path.join(__dirname, "..", "automations", ".env");

if (!NAME || !/^[A-Z_]+$/.test(NAME)) {
  console.error("שימוש: node tools/set-secret.js SUPABASE_SERVICE_KEY");
  process.exit(1);
}
if (!fs.existsSync(ENV)) {
  console.error("לא נמצא " + ENV);
  process.exit(1);
}

const page = `<!DOCTYPE html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>הדבקת ${NAME}</title>
<style>
 body{font-family:Rubik,Arial,sans-serif;background:#f7f5f2;color:#17151f;display:grid;place-items:center;min-height:100vh;margin:0}
 .box{background:#fff;padding:28px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.12);width:min(460px,92vw)}
 h1{font-size:1.2rem;margin:0 0 6px}p{color:#6b6676;font-size:.88rem;margin:0 0 16px}
 input{width:100%;padding:11px;border:1.5px solid #e1dcd6;border-radius:9px;font:inherit;direction:ltr}
 button{margin-top:14px;width:100%;padding:11px;border:0;border-radius:9px;background:#17151f;color:#fff;font:inherit;font-weight:600;cursor:pointer}
 .ok{color:#00a35c;font-weight:600}.bad{color:#d33}
</style>
<div class="box">
 <h1>הדבקת ${NAME}</h1>
 <p>להדביק כאן את הערך. הוא נכתב ישירות ל-automations/.env ולא נשלח לשום מקום אחר.</p>
 <form id="f"><input id="v" type="password" autocomplete="off" autofocus placeholder="הדביקי כאן (Ctrl+V)">
 <button>שמירה</button></form>
 <p id="m"></p>
</div>
<script>
f.onsubmit = async (e) => {
  e.preventDefault();
  const r = await fetch("/set", { method: "POST", body: v.value });
  const t = await r.text();
  m.textContent = t;
  m.className = r.ok ? "ok" : "bad";
  if (r.ok) { v.value = ""; }
};
</script></html>`;

const srv = http.createServer((req, res) => {
  if (req.method === "GET") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    return res.end(page);
  }
  let b = "";
  req.on("data", (d) => (b += d)).on("end", () => {
    const val = b.trim();
    const send = (code, msg) => { res.writeHead(code, { "Content-Type": "text/plain; charset=utf-8" }); res.end(msg); };
    // Only a plausible secret is ever written. An earlier version accepted any non-empty
    // string and wrote the word "stop" over a working key, so the bar is explicit now.
    if (!val || /[\s•]/.test(val) || val.length < 20 || !/^[A-Za-z0-9_.\-]+$/.test(val)) {
      return send(400, "זה לא נראה כמו מפתח מלא – להעתיק שוב את הערך כולו");
    }
    const lines = fs.readFileSync(ENV, "utf8").split(/\r?\n/);
    if (!lines.some((l) => l.startsWith(NAME + "="))) return send(400, "לא נמצאה שורה בשם " + NAME);
    fs.copyFileSync(ENV, ENV + ".bak");
    fs.writeFileSync(ENV, lines.map((l) => (l.startsWith(NAME + "=") ? NAME + "=" + val : l)).join("\n"));
    const written = fs.readFileSync(ENV, "utf8").split(/\r?\n/).find((l) => l.startsWith(NAME + "="));
    if (written !== NAME + "=" + val) return send(500, "הכתיבה לא נקלטה");
    console.log("נכתב " + NAME + " (" + val.length + " תווים). גיבוי: .env.bak");
    send(200, "נשמר ✓ אפשר לסגור את החלון");
    setTimeout(() => { srv.close(); process.exit(0); }, 400);
  });
}).listen(PORT, "127.0.0.1", () => console.log("http://127.0.0.1:" + PORT));

setTimeout(() => { console.log("פג הזמן"); process.exit(0); }, 10 * 60 * 1000);
