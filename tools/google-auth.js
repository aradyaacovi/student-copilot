/*
 * התחברות חד-פעמית ל-Google, כדי לקבל אסימון רענון לקריאת היומן (קריאה בלבד).
 *
 *   node tools/google-auth.js
 *
 * דורש ב-automations/.env את GOOGLE_CLIENT_ID ו-GOOGLE_CLIENT_SECRET
 * (להכניס אותם עם: node tools/set-secret.js GOOGLE_CLIENT_ID).
 *
 * הסקריפט פותח כתובת התחברות, מקשיב רק ב-127.0.0.1, מקבל את הקוד מ-Google, מחליף אותו
 * באסימון רענון וכותב אותו ל-GOOGLE_REFRESH_TOKEN ב-automations/.env (עם גיבוי .bak).
 * האסימון לא מודפס ולא נשלח לשום מקום אחר. ההרשאה היא calendar.readonly בלבד.
 */
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { parseEnvFile } = require("../automations/env.js");

const ENV = path.join(__dirname, "..", "automations", ".env");
const PORT = 5398;
const REDIRECT = `http://127.0.0.1:${PORT}/callback`;
const SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

if (!fs.existsSync(ENV)) { console.error("לא נמצא " + ENV); process.exit(1); }
const env = parseEnvFile(fs.readFileSync(ENV, "utf8"));
if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
  console.error("חסרים GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET ב-automations/.env. ראי docs/CALENDAR_SETUP.he.md");
  process.exit(1);
}

const state = crypto.randomBytes(16).toString("hex");
const url = "https://accounts.google.com/o/oauth2/v2/auth?" + new URLSearchParams({
  client_id: env.GOOGLE_CLIENT_ID, redirect_uri: REDIRECT, response_type: "code", scope: SCOPE,
  access_type: "offline", prompt: "consent", state,
});

function saveToken(token) {
  let text = fs.readFileSync(ENV, "utf8");
  fs.writeFileSync(ENV + ".bak", text);
  const line = "GOOGLE_REFRESH_TOKEN=" + token;
  text = /^GOOGLE_REFRESH_TOKEN=.*$/m.test(text) ? text.replace(/^GOOGLE_REFRESH_TOKEN=.*$/m, () => line) : text.replace(/\s*$/, "\n") + line + "\n";
  fs.writeFileSync(ENV, text);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, REDIRECT);
  if (u.pathname !== "/callback") { res.writeHead(404); return res.end(); }
  const done = (code, msg) => { res.writeHead(code, { "Content-Type": "text/html; charset=utf-8" }); res.end(`<meta charset="utf-8"><body dir="rtl" style="font-family:sans-serif;padding:40px">${msg}</body>`); setTimeout(() => process.exit(code === 200 ? 0 : 1), 300); };
  if (u.searchParams.get("state") !== state) return done(400, "בקשה לא תקינה. להריץ מחדש.");
  if (u.searchParams.get("error")) return done(400, "ההתחברות בוטלה. אפשר לסגור את החלון.");
  try {
    const r = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ code: u.searchParams.get("code"), client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, redirect_uri: REDIRECT, grant_type: "authorization_code" }),
    });
    const j = await r.json();
    if (!j.refresh_token) { console.error("Google לא החזיר אסימון רענון:", j.error || "לא ידוע"); return done(500, "לא התקבל אסימון. להריץ מחדש."); }
    saveToken(j.refresh_token);
    console.log("✓ GOOGLE_REFRESH_TOKEN נשמר ב-automations/.env (" + j.refresh_token.length + " תווים). לא מודפס.");
    console.log("הצעד הבא: להעביר אותו ל-GitHub, ראי docs/CALENDAR_SETUP.he.md.");
    done(200, "<h2>הושלם ✓</h2><p>אפשר לסגור את החלון ולחזור לטרמינל.</p>");
  } catch (e) { console.error("נכשל:", e.message); done(500, "שגיאה. ראי את הטרמינל."); }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("פותחת התחברות לגוגל. אם הדפדפן לא נפתח, להעתיק לשם את הכתובת:\n\n" + url + "\n");
  const { exec } = require("child_process");
  exec(process.platform === "win32" ? `start "" "${url}"` : process.platform === "darwin" ? `open "${url}"` : `xdg-open "${url}"`);
});
