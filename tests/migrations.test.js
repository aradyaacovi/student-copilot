// Checks that supabase/migrations and supabase/schema.sql describe the same database:
// files are numbered without gaps, every table in schema.sql is created by a migration,
// and every table has row-level security with the own_rows policy.
const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dir = path.join(__dirname, '..', 'supabase');
const files = fs.readdirSync(path.join(dir, 'migrations')).filter((f) => f.endsWith('.sql')).sort();
const schema = fs.readFileSync(path.join(dir, 'schema.sql'), 'utf8');
const tablesIn = (sql) => [...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1]).sort();

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log('ok  ' + name); }
  catch (e) { console.error('FAIL ' + name + '\n  ' + e.message); process.exitCode = 1; }
}

test('migration files are numbered 0001.. without gaps', () => {
  assert.ok(files.length > 0, 'no migrations found');
  files.forEach((f, i) => assert.ok(f.startsWith(String(i + 1).padStart(4, '0') + '_'), `unexpected name ${f}`));
});

test('migrations create exactly the tables in schema.sql', () => {
  const all = files.map((f) => fs.readFileSync(path.join(dir, 'migrations', f), 'utf8')).join('\n');
  assert.deepStrictEqual(tablesIn(all), tablesIn(schema));
});

test('every migration that creates a table enables RLS with own_rows', () => {
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, 'migrations', f), 'utf8');
    for (const t of tablesIn(sql)) {
      assert.ok(sql.includes(`'${t}'`) && sql.includes('enable row level security') && sql.includes('own_rows'),
        `${f}: table ${t} has no RLS policy`);
    }
  }
});

test('migrations are safe to re-run', () => {
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, 'migrations', f), 'utf8');
    assert.ok(!/create table (?!if not exists)/i.test(sql), `${f}: create table without "if not exists"`);
    assert.ok(!/drop table/i.test(sql), `${f}: contains drop table`);
  }
});

console.log(`${passed} migration tests passed`);
