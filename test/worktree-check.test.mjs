import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { diagnose, scanCheckout, formatText, listWorktrees } from '../skills/implement/scripts/worktree-check.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills', 'implement', 'scripts', 'worktree-check.mjs');
const ENV = { ...process.env, CLAUDE_CODE_REMOTE: '' };
const o = (extra = {}) => ({ env: ENV, ...extra });

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ks-wt-')); roots.push(d); return d; };
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const put = (dir, files) => { for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); } };
const real = (p) => realpathSync.native(p).toLowerCase();

// main checkout + linked worktrees; `committed` goes into every worktree, `local[name]` only into that one
function world(committed, linked = ['wt1'], local = {}) {
  const root = tmp();
  const main = join(root, 'main');
  mkdirSync(main);
  git(main, 'init', '-q', '-b', 'main');
  put(main, { 'README.md': 'x\n', ...committed });
  git(main, 'add', '-A');
  git(main, 'commit', '-qm', 'seed');
  const dirs = { main };
  for (const n of linked) { dirs[n] = join(root, n); git(main, 'worktree', 'add', '-q', '-b', n, dirs[n]); }
  for (const [n, files] of Object.entries(local)) put(dirs[n], files);
  return dirs;
}
const ofKind = (r, kind) => r.conflicts.filter((c) => c.kind === kind).map((c) => c.value);
const res = (s, kind) => s.resources.filter((r) => r.kind === kind).map((r) => r.value);

const COMPOSE = 'services:\n  db:\n    image: postgres\n    container_name: db\n    ports:\n      - "5432:5432"\n';

test('I-1/I-2/I-13: hardcoded port and container_name clash across main and two linked worktrees', () => {
  const w = world({ 'docker-compose.yml': COMPOSE }, ['wt1', 'wt2']);
  const r = diagnose(w.wt1, o());
  assert.equal(r.status, 'conflicts');
  assert.equal(r.checked.length, 3);
  assert.deepEqual(ofKind(r, 'host-port'), ['5432']);
  assert.deepEqual(ofKind(r, 'container-name'), ['db']);
  const where = r.conflicts.find((c) => c.kind === 'host-port').where;
  assert.deepEqual(where.map((x) => x.worktree).sort(), ['main', 'wt1', 'wt2']);
  assert.deepEqual(where[0], { worktree: where[0].worktree, file: 'docker-compose.yml', line: 6 });
  assert.equal(real(r.current), real(w.wt1));
  assert.equal(r.isolation, 'not_verified');
  const text = formatText(r);
  assert.match(text, /\| Ресурс \| Значение \| Где \(worktree · файл:строка\) \|/);
  assert.match(text, /\| host-port \| 5432 \| .*wt1 · docker-compose\.yml:6/);
  assert.match(text, /Не поднимайте эти окружения одновременно/);
  assert.match(text, /\$\{DB_PORT:-5432\}:5432/);
});

test('I-2/I-13: ${DB_PORT} with a different .env in each worktree → no conflict', () => {
  const w = world({ 'docker-compose.yml': 'services:\n  db:\n    ports:\n      - "${DB_PORT}:5432"\n' }, ['wt1'],
    { main: { '.env': 'DB_PORT=5433\n' }, wt1: { '.env': 'DB_PORT=5434\n' } });
  const r = diagnose(w.wt1, o());
  assert.equal(r.status, 'ok', JSON.stringify(r.conflicts));
  assert.equal(r.unknown.length, 0);
  assert.match(formatText(r), /Конфликтов не найдено\./);
  assert.deepEqual(res(scanCheckout(w.wt1), 'host-port'), ['5434', '5434']);
});

test('I-3/I-13: unresolved ${X} and a port range → not checked, never a conflict', () => {
  const w = world({ 'docker-compose.yml': 'services:\n  web:\n    ports:\n      - "${X}:80"\n      - "8000-8010:8000-8010"\n' });
  const r = diagnose(w.wt1, o());
  assert.equal(r.status, 'ok');
  assert.deepEqual(r.conflicts, []);
  const reasons = r.unknown.filter((u) => u.worktree === 'wt1').map((u) => `${u.line} ${u.reason}`);
  assert.deepEqual(reasons, ['4 unresolved ${X}', '5 port-range']);
  assert.match(formatText(r), /Не проверено: wt1 · docker-compose\.yml:4 — host-port: unresolved \$\{X\}/);
});

test('I-8/I-13: secret values and other keys from .env never reach the text or the JSON', () => {
  const w = world({}, ['wt1'], { main: { '.env': 'API_KEY=sk-test-secret-123\nDB_PORT=abc\n' }, wt1: { '.env': 'API_KEY=sk-test-secret-123\nDB_PORT=abc\n' } });
  const r = diagnose(w.wt1, o());
  const out = formatText(r) + JSON.stringify(r);
  for (const s of ['sk-test-secret-123', 'API_KEY', 'abc']) assert.ok(!out.includes(s), s);
  assert.ok(r.unknown.some((u) => u.reason === 'non-numeric port'));
});

test('I-2: launch.json and package.json scripts ports; explicit project names volumes, without it volumes are not resources', () => {
  const w = world({
    '.claude/launch.json': '// dev servers\n{\n  "configurations": [\n    { "name": "web", "port": 3000 }\n  ]\n}\n',
    'package.json': '{\n  "scripts": {\n    "dev": "vite --port 5173",\n    "api": "PORT=4000 node server.js"\n  }\n}\n',
    'docker-compose.yml': 'name: app\nservices:\n  db:\n    image: x\nvolumes:\n  data:\n  shared:\n    name: shared-cache\nnetworks:\n  ext:\n    external: true\n',
  });
  const r = diagnose(w.wt1, o());
  assert.deepEqual(ofKind(r, 'host-port'), ['3000', '4000', '5173']);
  assert.deepEqual(ofKind(r, 'compose-project'), ['app']);
  assert.deepEqual(ofKind(r, 'volume'), ['app_data', 'shared-cache']);
  assert.deepEqual(ofKind(r, 'network'), ['ext']);
  const lp = r.conflicts.find((c) => c.value === '3000').where[0];
  assert.deepEqual([lp.file, lp.line], ['.claude/launch.json', 4]);
  const d = tmp();
  put(d, { 'docker-compose.yml': 'services:\n  db:\n    image: x\nvolumes:\n  data:\n' });
  assert.deepEqual(scanCheckout(d).resources, []);
});

test('I-2: compose port forms and .env keys', () => {
  const d = tmp();
  put(d, {
    'compose.yaml': [
      'services:', '  a:', '    ports:', '      - 127.0.0.1:8081:80', '      - "9000"', '      - 8082:80/udp',
      '      - target: 80', '        published: 8083', '      - "${P:-8084}:80"', '      - "${Q-8085}:80"',
      '  b:', '    ports: ["8086:80", "8087:443"]', '    container_name: "${CN:-bee}"',
    ].join('\n') + '\n',
    '.env': 'export APP_PORT="3001" # c\nCOMPOSE_PROJECT_NAME=proj\nSECRET=x\nPORTAL=7\n',
    '.env.example': 'APP_PORT=9999\n',
    '.env.local': 'WEB_PORT=3002\n',
  });
  const s = scanCheckout(d);
  assert.deepEqual(res(s, 'host-port').sort(), ['3001', '3002', '8081', '8082', '8083', '8084', '8085', '8086', '8087']);
  assert.deepEqual(res(s, 'container-name'), ['bee']);
  assert.deepEqual(res(s, 'compose-project'), ['proj']);
  assert.deepEqual(s.unknown, []);
});

test('I-3: anchors and multiline scalars are not checked, the rest of the file still is', () => {
  const d = tmp();
  put(d, { 'docker-compose.yml': 'x-c: &c\n  a: 1\nservices:\n  w:\n    <<: *c\n    command: |\n      echo 1:2\n    ports:\n      - "7001:80"\n' });
  const s = scanCheckout(d);
  assert.deepEqual(res(s, 'host-port'), ['7001']);
  assert.ok(s.unknown.length >= 2 && s.unknown.every((u) => u.reason === 'unsupported-yaml'));
});

test('I-10: walk depth, skipped folders and the 200-file cap', () => {
  const d = tmp();
  const c = (p) => 'services:\n  s:\n    ports:\n      - "' + p + ':1"\n';
  put(d, {
    'a/b/c/docker-compose.yml': c(6003), 'a/b/c/d/docker-compose.yml': c(6004),
    'node_modules/x/docker-compose.yml': c(6100), '.hidden/docker-compose.yml': c(6101), '.git/docker-compose.yml': c(6102),
    '.devcontainer/docker-compose.yml': c(6200),
  });
  const s = scanCheckout(d);
  assert.deepEqual(res(s, 'host-port').sort(), ['6003', '6200']);
  assert.equal(s.partial, false);
  const e = tmp();
  for (let i = 0; i < 201; i++) put(e, { [`.env.${i}`]: 'X=1\n' });
  assert.equal(scanCheckout(e).partial, true);
});

test('I-11: base + override compose files are combined', () => {
  const d = tmp();
  put(d, { 'docker-compose.yml': 'services:\n  db:\n    ports:\n      - "5432:5432"\n', 'docker-compose.override.yml': 'services:\n  cache:\n    ports:\n      - "6379:6379"\n' });
  assert.deepEqual(res(scanCheckout(d), 'host-port').sort(), ['5432', '6379']);
});

test('I-9: broken worktree skipped; single worktree, not git, cloud, not linked → one line', () => {
  const w = world({ 'docker-compose.yml': COMPOSE }, ['wt1', 'wt2']);
  rmSync(w.wt2, { recursive: true, force: true });
  const r = diagnose(w.wt1, o());
  assert.equal(r.checked.length, 2);
  assert.equal(r.skipped.length, 1);
  assert.equal(basename(r.skipped[0].path), 'wt2');
  assert.match(r.skipped[0].reason, /^(prunable|missing)/);
  assert.match(formatText(r), /Пропущен: .*wt2 — /);

  const one = world({}, []);
  const s = diagnose(one.main, o());
  assert.deepEqual([s.status, s.reason], ['nothing-to-check', 'single-worktree']);
  assert.equal(formatText(s), 'worktree-check: соседних worktree нет — проверять нечего');
  assert.equal(diagnose(tmp(), o()).reason, 'not-git');
  assert.equal(diagnose(w.wt1, { env: { CLAUDE_CODE_REMOTE: 'true' } }).reason, 'cloud');
  const nl = diagnose(w.main, o({ linkedOnly: true }));
  assert.deepEqual([nl.status, nl.reason], ['nothing-to-check', 'not-linked']);
  assert.equal(diagnose(w.wt1, o({ linkedOnly: true })).status, 'conflicts');
  assert.equal(listWorktrees(w.main).length, 3);
});

test('I-5/I-7: CLI --json and text; nothing in either worktree changes', () => {
  const w = world({ 'docker-compose.yml': COMPOSE }, ['wt1'], { wt1: { '.env': 'DB_PORT=1\n' } });
  const tree = (d) => {
    const out = [];
    const walk = (p) => { for (const e of readdirSync(p, { withFileTypes: true })) { const f = join(p, e.name); if (e.isDirectory()) walk(f); else { const st = statSync(f); out.push(`${f} ${st.mtimeMs} ${st.size}`); } } };
    walk(d);
    return out.sort().join('\n');
  };
  const before = [git(w.main, 'status', '--porcelain'), git(w.wt1, 'status', '--porcelain'), tree(w.main), tree(w.wt1)];
  diagnose(w.wt1, o());
  const cj = spawnSync(process.execPath, [SCRIPT, '--json', '--cwd', w.wt1], { encoding: 'utf8', env: ENV });
  assert.equal(cj.status, 0, cj.stderr);
  const j = JSON.parse(cj.stdout);
  for (const k of ['status', 'current', 'checked', 'skipped', 'conflicts', 'unknown', 'isolation']) assert.ok(k in j, k);
  assert.equal(j.status, 'conflicts');
  assert.equal(j.isolation, 'not_verified');
  const ct = spawnSync(process.execPath, [SCRIPT, '--cwd', w.wt1], { encoding: 'utf8', env: ENV });
  assert.equal(ct.status, 0);
  assert.match(ct.stdout, /^worktree-check · статически, только чтение · изоляция не доказана/);
  const cl = spawnSync(process.execPath, [SCRIPT, '--linked-only', '--cwd', w.main], { encoding: 'utf8', env: ENV });
  assert.equal(cl.stdout.trim(), 'worktree-check: основной checkout, проверка — из linked worktree');
  // trees first: a later `git status` may refresh the index on its own
  const trees = [tree(w.main), tree(w.wt1)];
  const after = [git(w.main, 'status', '--porcelain'), git(w.wt1, 'status', '--porcelain'), ...trees];
  assert.deepEqual(after, before);
});

test('I-7/I-12: the script spawns only git, imports only node:*, never names AI Factory files; no dependencies', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  const spawns = src.match(/spawnSync\(\s*[^,]+/g);
  assert.deepEqual(spawns, ["spawnSync('git'"]);
  assert.doesNotMatch(src, /\bexec(Sync|File)?\(|\bspawn\(|\bfork\(/);
  for (const m of src.matchAll(/^import .* from '([^']+)';$/gm)) assert.match(m[1], /^node:/);
  assert.ok(!src.includes('.ai-' + 'factory'));
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  assert.equal(pkg.dependencies, undefined);
});

test('I-1/I-4: implement Step 0 and fix Step 0 (existing fix plan) run worktree-check --linked-only, warn and go on', () => {
  const section = (file, from, to) => { const t = readFileSync(join(ROOT, file), 'utf8'); return t.slice(t.indexOf(from), t.indexOf(to, t.indexOf(from))); };
  const impl = section('skills/implement/SKILL.md', '3. **Runtime resources (worktree).**', '4. **Settings**');
  assert.match(impl, /node "\$\{CLAUDE_SKILL_DIR\}\/scripts\/worktree-check\.mjs" --linked-only/);
  assert.match(impl, /go on: no question, no stop/);
  assert.match(impl, /not release mode/);
  assert.doesNotMatch(impl, /AskUserQuestion|STOP/);
  const fix = section('skills/fix/SKILL.md', '**Runtime resources (worktree):**', 'Go to Step 2');
  assert.match(fix, /node "\$\{CLAUDE_SKILL_DIR\}\/\.\.\/implement\/scripts\/worktree-check\.mjs" --linked-only/);
  assert.match(fix, /go on, no question, no stop/);
  assert.doesNotMatch(fix, /AskUserQuestion|STOP/);
  assert.ok(readFileSync(join(ROOT, 'skills/fix/SKILL.md'), 'utf8').indexOf('--stage fix') > 0);
});
