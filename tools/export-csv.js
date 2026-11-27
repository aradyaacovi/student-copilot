/*
 * Tabular export of the semester, for Excel and Power BI – no dependencies.
 *
 *   node tools/export-csv.js                 writes docs/analysis/*.csv
 *   node tools/export-csv.js --now=2026-12-01 --out=some/dir
 *
 * Always reads the demo data (data/sample-semester.js), never the personal file, so the
 * output is safe to commit. The clock is pinned to the same date as the documentation
 * screenshots, so re-running it does not change the files just because today changed.
 * The rows come from js/logic.js, the same module the app uses, so the session counts
 * match the pace tracker on screen.
 */
const fs = require("fs");
const path = require("path");
const L = require("../js/logic.js");

const DATE = "2026-11-17";
const arg = (name, fallback) => {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

global.window = {};
require("../data/sample-semester.js");
const data = global.window.SAMPLE_DATA;
if (!data) throw new Error("data/sample-semester.js did not define SAMPLE_DATA");

const now = L.withTime(arg("now", DATE), "23:59");
const out = path.resolve(__dirname, "..", arg("out", path.join("docs", "analysis")));
fs.mkdirSync(out, { recursive: true });

const tables = L.exportRows(data, now, (data.demoState || {}).seen);
const FILES = { sessions: "sessions.csv", deadlines: "deadlines.csv", components: "grade-components.csv" };

for (const [name, file] of Object.entries(FILES)) {
  const rows = tables[name];
  // The BOM is what makes Excel read the Hebrew columns as UTF-8 instead of mojibake.
  fs.writeFileSync(path.join(out, file), "\ufeff" + L.toCsv(rows), "utf8");
  console.log(`${file.padEnd(20)} ${String(rows.length).padStart(4)} שורות`);
}

const held = tables.sessions.filter((r) => r.status === "held").length;
console.log(`\nנכתב ל-${path.relative(process.cwd(), out)} לפי התאריך ${arg("now", DATE)}`);
console.log(`מפגשים שהתקיימו: ${held}, מתוכם נצפו: ${tables.sessions.filter((r) => r.watched === "yes").length}`);
