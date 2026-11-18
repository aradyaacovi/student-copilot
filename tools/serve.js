// שרת מקומי קטן בלי התקנות: node tools/serve.js  →  http://localhost:5180
const http = require("http"), fs = require("fs"), path = require("path");
const root = path.join(__dirname, "..");
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".md": "text/markdown", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml", ".ics": "text/calendar" };
const noCharset = new Set([".png", ".svg"]);
http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(req.url.split("?")[0])).replace(/^[\/\\]+/, "");
  const file = path.join(root, p || "index.html");
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    const ext = path.extname(file);
    const type = types[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type + (noCharset.has(ext) ? "" : "; charset=utf-8"), "Cache-Control": "no-store" });
    res.end(buf);
  });
}).listen(Number(process.env.PORT) || 5180, function () { console.log("http://localhost:" + this.address().port); });
