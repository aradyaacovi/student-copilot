// Zero-dependency checks that run in CI: `npm run lint`.
// 1. Every .js file parses (node --check).
// 2. Every .json / .webmanifest file is valid JSON.
// 3. index.html keeps the basics: lang, dir, viewport, title, landmarks, img alt.
// 4. Public CI logs must not carry content: no console.log in logic.js or automations/lib.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.join(__dirname, '..');
const SKIP = new Set(['node_modules', '.git', '.claude', '.archive-studyflow-research', 'test-results']);
const problems = [];

function walk(dir, out = []) {
  for (const name of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP.has(name.name)) continue;
    const p = path.join(dir, name.name);
    if (name.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

const files = walk(root);
const rel = (f) => path.relative(root, f).replace(/\\/g, '/');

for (const f of files.filter((f) => f.endsWith('.js') && !f.endsWith('config.js'))) {
  const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
  if (r.status !== 0) problems.push(`${rel(f)}: syntax error\n${r.stderr.split('\n').slice(0, 4).join('\n')}`);
}

for (const f of files.filter((f) => /\.(json|webmanifest)$/.test(f))) {
  try { JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { problems.push(`${rel(f)}: invalid JSON (${e.message})`); }
}

const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const need = [
  [/<html[^>]*\blang="/, 'index.html: <html> needs lang'],
  [/<html[^>]*\bdir="/, 'index.html: <html> needs dir'],
  [/<meta name="viewport"/, 'index.html: missing viewport meta'],
  [/<title>[^<]+<\/title>/, 'index.html: missing title'],
  [/<main[\s>]/, 'index.html: missing <main> landmark'],
  [/<nav[^>]*aria-label=/, 'index.html: <nav> needs aria-label'],
];
for (const [re, msg] of need) if (!re.test(html)) problems.push(msg);
for (const m of html.matchAll(/<img\b[^>]*>/g)) if (!/\balt=/.test(m[0])) problems.push(`index.html: <img> without alt: ${m[0].slice(0, 60)}`);

const noLog = [path.join(root, 'js', 'logic.js'), ...walk(path.join(root, 'automations', 'lib'))].filter((f) => f.endsWith('.js'));
for (const f of noLog) {
  fs.readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
    if (/console\.log\(/.test(line)) problems.push(`${rel(f)}:${i + 1}: console.log (CI logs are public)`);
  });
}

if (problems.length) {
  console.error(problems.join('\n'));
  console.error(`\n${problems.length} problem(s)`);
  process.exit(1);
}
console.log(`lint ok: ${files.filter((f) => f.endsWith('.js')).length} scripts parsed, JSON valid, html basics present`);
