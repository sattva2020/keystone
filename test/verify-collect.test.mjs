import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, utimesSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, findBase, taskFiles, git, parseRows, history, trend, releaseRefs, findings, parseAccepted, lateWatch } from '../skills/verify/scripts/collect.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'verify', 'scripts', 'collect.mjs');
const PLAN = 'docs/keystone/2026-10-18-x/plan.md';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ks-collect-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  return root;
}
function put(root, files) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
}
function commit(root, files, msg) {
  put(root, files);
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
const plan = (settings = 'Settings: tests — yes') => `# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\n${settings}\n`;

test('collect: base is the parent of the first commit after the plan', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  const p = commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  commit(root, { 'src/b.js': '2' }, 'feat: b');
  const { base, rule } = findBase(root, PLAN);
  assert.equal(base, p);
  assert.match(rule, /parent of the first commit/);
  assert.deepEqual(taskFiles(root, base).files, ['src/a.js', 'src/b.js']);
});

test('collect: no commit after the plan → base = P; outside files in P → P^; a given ref wins', () => {
  const root = repo();
  const start = commit(root, { 'README.md': 'x' }, 'start');
  const p = commit(root, { [PLAN]: plan() }, 'docs(plan)');
  assert.deepEqual(findBase(root, PLAN), { base: p, rule: 'P — no commit after the plan' });
  assert.equal(findBase(root, PLAN, start).base, start);

  const r2 = repo();
  const s2 = commit(r2, { 'README.md': 'x' }, 'start');
  commit(r2, { [PLAN]: plan(), 'src/early.js': '0' }, 'plan and code together');
  commit(r2, { 'src/a.js': '1' }, 'feat: a');
  const b2 = findBase(r2, PLAN);
  assert.equal(b2.base, s2);
  assert.match(b2.rule, /outside the task folder/);
});

test('collect: a root commit with the plan and code has no P^ — the base is the commit after it, never an error', () => {
  const root = repo();
  const p = commit(root, { [PLAN]: plan(), 'src/seed.js': '0' }, 'base: plan approved');
  commit(root, { 'src/a.js': '1' }, 'impl');
  const b = findBase(root, PLAN);
  assert.equal(b.base, p);
  assert.deepEqual(taskFiles(root, b.base).files, ['src/a.js']);
  assert.doesNotMatch(collect(root, PLAN), /^error:/m);
});

test('collect: files of a merge commit are not counted; uncommitted files are', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  const p = commit(root, { [PLAN]: plan() }, 'docs(plan)');
  git(root, 'checkout', '-q', '-b', 'other');
  commit(root, { 'other/x.js': 'o' }, 'other work');
  git(root, 'checkout', '-q', 'main');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-ff', '--no-edit', 'other');
  put(root, { 'src/dirty.js': 'd' });
  const t = taskFiles(root, findBase(root, PLAN).base);
  assert.ok(t.commits.some((c) => c.merge));
  assert.deepEqual(t.files, ['src/a.js', 'src/dirty.js']);
  assert.equal(findBase(root, PLAN).base, p);
});

test('collect: a committed file modified without staging is listed under its full path', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  put(root, { 'src/a.js': '2' });
  const t = taskFiles(root, findBase(root, PLAN).base);
  assert.deepEqual(t.dirty, ['src/a.js']);
  assert.deepEqual(t.files, ['src/a.js']);
});

test('collect: a missing tool is "not run", and a ./ plan path gives the same base', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', 'phpunit.xml': '<phpunit/>' }, 'start');
  const p = commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  assert.match(collect(root, PLAN), /^test: \.\/vendor\/bin\/phpunit → not run \(\.\/vendor\/bin\/phpunit not found\)/m);
  assert.equal(findBase(root, './' + PLAN).base, findBase(root, PLAN).base);
  assert.equal(findBase(root, PLAN).base, p);
});

test('collect: a ./vendor/bin tool that exists is run (cmd.exe cannot launch a ./ path)', () => {
  const win = process.platform === 'win32';
  const root = repo();
  const body = win ? '@echo phpunit-ran\r\n' : '#!/bin/sh\necho phpunit-ran\n';
  commit(root, { 'README.md': 'x', 'phpunit.xml': '<phpunit/>', [win ? 'vendor/bin/phpunit.cmd' : 'vendor/bin/phpunit']: body }, 'start');
  if (!win) chmodSync(join(root, 'vendor/bin/phpunit'), 0o755);
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const out = collect(root, PLAN);
  assert.match(out, /^test: \.\/vendor\/bin\/phpunit → pass/m);
  assert.match(out, /phpunit-ran/);
});

test('collect: test pass / fail from package.json, tests — no, nothing configured', () => {
  const ok = repo();
  commit(ok, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }) }, 'start');
  commit(ok, { [PLAN]: plan() }, 'docs(plan)');
  commit(ok, { 'src/a.js': '1' }, 'feat: a');
  const out = collect(ok, PLAN);
  assert.match(out, /^test: npm test → pass/m);
  assert.match(out, /^build: not run \(no build config\)/m);
  assert.match(out, /^lint: not run \(no lint config\)/m);
  assert.match(out, /^imports: not run/m);
  assert.match(out, /^Architecture gate: n\/a/m);

  const bad = repo();
  commit(bad, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "console.log(\'boom\');process.exit(1)"' } }) }, 'start');
  commit(bad, { [PLAN]: plan() }, 'docs(plan)');
  commit(bad, { 'src/a.js': '1' }, 'feat: a');
  const fail = collect(bad, PLAN);
  assert.match(fail, /^test: npm test → fail/m);
  assert.match(fail, /boom/);

  const nf = repo();
  commit(nf, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "console.log(\'user not found\');process.exit(1)"' } }) }, 'start');
  commit(nf, { [PLAN]: plan() }, 'docs(plan)');
  commit(nf, { 'src/a.js': '1' }, 'feat: a');
  assert.match(collect(nf, PLAN), /^test: npm test → fail/m);

  const off = repo();
  commit(off, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }) }, 'start');
  commit(off, { [PLAN]: plan('Settings: tests — no (none) · logging — minimal · docs — no') }, 'docs(plan)');
  assert.match(collect(off, PLAN), /^test: not run \(Settings tests — no\)/m);
});

test('collect: the architecture gate runs each MUST NOT check on the changed files', () => {
  const root = repo();
  commit(root, { 'docs/architecture.md': '- MUST NOT: ui imports db — check: `grep -n "from \'db\'"`\n- MUST NOT: layers leak — check: review\n' }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/ui.js': "import x from 'db'\n" }, 'feat: ui');
  const out = collect(root, PLAN);
  assert.match(out, /^Architecture gate: fail — - MUST NOT: ui imports db —, src\/ui\.js:1:/m);
  assert.match(out, /^review: - MUST NOT: layers leak/m);
});

test('collect: the CLI prints the lines, and an unknown plan is an error with exit 1', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  const ok = spawnSync(process.execPath, [SCRIPT, PLAN], { cwd: root, encoding: 'utf8' });
  assert.equal(ok.status, 0);
  assert.match(ok.stdout, /^base: [0-9a-f]{7} — P — no commit after the plan/m);
  const bad = spawnSync(process.execPath, [SCRIPT, 'docs/keystone/none/plan.md'], { cwd: root, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^error: /m);
});

test('collect: a pass is reused only while the code is unchanged; a failure is measured again', () => {
  const root = repo();
  const runs = (s) => /^test: npm test → pass\b/m.test(s) && !/reused/.test(s);
  commit(root, { 'src/a.js': '1', 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }) }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '2' }, 'feat: a');
  assert.ok(runs(collect(root, PLAN)), 'first run measures');
  assert.match(collect(root, PLAN), /^test: npm test → pass \(reused: code unchanged since that run\)/m);
  commit(root, { 'docs/keystone/2026-10-18-x/verify.md': 'x', 'docs/notes/n.md': 'x' }, 'docs: verify');
  assert.match(collect(root, PLAN), /^test: npm test → pass \(reused/m, 'task folder and docs do not count');
  writeFileSync(join(root, 'src/a.js'), '3');
  assert.ok(runs(collect(root, PLAN)), 'an uncommitted code change drops it');
  commit(root, { 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }) }, 'break');
  assert.match(collect(root, PLAN), /^test: npm test → fail/m);
  assert.match(collect(root, PLAN), /^test: npm test → fail/m, 'a failure is never reused');
});

test('collect: a check over the time limit is "not run", not a failure', () => {
  const root = repo();
  commit(root, { 'src/a.js': '1', 'package.json': JSON.stringify({ scripts: { test: 'node -e "setTimeout(()=>{},4000)"' } }) }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  const r = spawnSync(process.execPath, [SCRIPT, PLAN], { cwd: root, encoding: 'utf8', env: { ...process.env, KEYSTONE_CHECK_TIMEOUT_MS: '500' } });
  assert.match(r.stdout, /^test: npm test → not run \(timeout after 0\.5 s\)/m);
});

// --- Between runs (verify → fix convergence): carried rows, full runs, history ---
const VERIFY = 'docs/keystone/2026-10-18-x/verify.md';
const INTENT = 'docs/keystone/2026-10-18-x/intent.md';
const taskPlan = (extra = '') => `# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\nAuthority: intent.md — \`${INTENT}\` (accepted)\nSettings: tests — yes\n\n## Tasks\n- [ ] 1. a — files: src/a.js — check: npm test\n- [ ] 2. b — files: src/b.js — check: npm test\n${extra}`;
const vmd = (base, report, { checks = '', carried = '', verdict = 'FAIL' } = {}) =>
  `# Verify: x\nDate: 2026-11-01 · Base: ${base.slice(0, 7)} · Verdict: ${verdict}\n\n## Checks\n- base: ${base.slice(0, 7)}\n${checks}\n## Carried\n${carried}\n## Report\nKeystone verify: ${PLAN} · base ${base.slice(0, 7)}\n${report}\n\n## Verdict\n${verdict}\n`;
const REPORT = '- Task 1 — ok — src/a.js:1 does it\n- Task 2 — ok — the call works\n- Task 3 — wrong — the thing is missing. Repro: x\n- Task 4 — ok — b.js:3 checks it\n- Task 5 — ok — fine\n  see src/b.js for more\n';
function looped() {
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
  const base = findBase(root, PLAN).base;
  const v1 = commit(root, { [VERIFY]: vmd(base, REPORT) }, 'docs: verify 1');
  return { root, base, v1 };
}
const line = (out, re) => out.split('\n').find((l) => re.test(l)) || '';
const MARK = '--- record only (not for the verifier) ---';

test('collect: the first verify is a full run', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  assert.match(collect(root, PLAN), /^delta: full — first verify$/m);
});

test('collect: a second run carries ok rows whose files did not change', () => {
  const { root, v1 } = looped();
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const out = collect(root, PLAN);
  assert.match(out, new RegExp(`^delta: since ${v1.slice(0, 7)} — 1 files changed since the last verify$`, 'm'));
  assert.doesNotMatch(out, /base moved/);
  assert.match(out, new RegExp(`^carried: Task 1 — ok — carried from verify ${v1.slice(0, 7)} — src/a\\.js:1 does it$`, 'm'));
  const judge = line(out, /^judge: /);
  for (const id of ['Task 2', 'Task 3', 'Task 4', 'Task 5']) assert.ok(judge.includes(id), `${id} in ${judge}`);
  assert.match(out, /^carried ids: Task 1$/m);
  const ls = out.split('\n');
  assert.ok(ls.findIndex((l) => l.startsWith('carried ids:')) < ls.indexOf(MARK));
  assert.ok(ls.indexOf(MARK) < ls.findIndex((l) => l.startsWith('carried: ')));
  assert.match(out, /^rules scope: files changed since [0-9a-f]{7} \+ files on the last run's failing rule lines: none$/m);
});

test('collect: a task whose files: names a folder or a short file name is judged again when a file under it changes', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: taskPlan('- [ ] 3. c — files: lib/ — check: npm test\n- [ ] 4. d — files: deep.js — check: npm test\n- [ ] 5. e — files: pkg — check: npm test\n') }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'lib/x.js': '1', 'src/deep.js': '1', 'pkg/y.js': '1', 'src/notdeep.js': '1' }, 'feat');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — fine\n- Task 3 — ok — the call works\n- Task 4 — ok — fine\n- Task 5 — ok — fine\n') }, 'docs: verify');
  commit(root, { 'lib/x.js': '2', 'src/deep.js': '2', 'pkg/y.js': '2' }, 'fix');
  const judge = line(collect(root, PLAN), /^judge: /);
  for (const id of ['Task 3', 'Task 4', 'Task 5']) assert.ok(judge.includes(id), `${id} in ${judge}`);
  assert.ok(!judge.includes('Task 1'), judge);
  commit(root, { 'src/notdeep.js': '2' }, 'fix 2');
  const v2 = commit(root, { [VERIFY]: vmd(base, '- Task 4 — ok — fine\n') }, 'docs: verify 2');
  commit(root, { 'src/notdeep.js': '3' }, 'fix 3');
  assert.match(collect(root, PLAN), new RegExp(`^carried: Task 4 — ok — carried from verify ${v2.slice(0, 7)}`, 'm'), 'deep.js is not a suffix of notdeep.js');
});

test('collect: a task whose files: is a glob is judged again when a matching file changes', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: taskPlan('- [ ] 3. c — files: skills/*/SKILL.md — check: npm test\n- [ ] 4. d — files: old/** — check: npm test\n- [ ] 5. e — files: docs/*.md — check: npm test\n') }, 'docs(plan)');
  commit(root, { 'skills/fix/SKILL.md': '1', 'old/a/b.yml': '1', 'docs/deep/x.md': '1' }, 'feat');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 3 — ok — fine\n- Task 4 — ok — fine\n- Task 5 — ok — fine\n') }, 'docs: verify');
  commit(root, { 'skills/fix/SKILL.md': '2', 'old/a/b.yml': '2', 'docs/deep/x.md': '2' }, 'fix');
  const out = collect(root, PLAN);
  const judge = line(out, /^judge: /);
  for (const id of ['Task 3', 'Task 4']) assert.ok(judge.includes(id), `${id} in ${judge}`);
  assert.match(out, /^carried: Task 5 — ok/m, 'docs/*.md does not reach docs/deep/x.md');
});

test('collect: block-form Decisions and Unrequested count one finding per item; notes under "none" do not', () => {
  const { root, base } = looped();
  const block = '- Task 3 — wrong — a\nUnrequested:\n  - src/z.js — new file\n  - docs/x.md — extra\nDecisions:\n  - Decision: intent.md:I-2 — contradicted\n';
  commit(root, { [VERIFY]: vmd(base, block) }, 'verify 2');
  assert.match(history(root, PLAN)[2], /open 4 · new 3 · closed 0/);
  commit(root, { [VERIFY]: vmd(base, '- Task 3 — wrong — a\nDecisions: none — I grepped:\n  - Decision: old wording is honoured\nUnrequested: none (all traced)\n  - src/z.js traces to Task 1\n') }, 'verify 3');
  assert.match(history(root, PLAN)[3], /open 1 · new 0 · closed 3/);
});

test('collect: "Unrequested: none (…)" is not a finding', () => {
  const { root, base } = looped();
  commit(root, { [VERIFY]: vmd(base, '- Task 3 — wrong — a\nUnrequested: none (each changed file traces to a task)\n') }, 'verify 2');
  assert.match(history(root, PLAN)[2], /open 1 · new 0 · closed 0/);
});

test('collect: the delta Rules gate names the files of the last run\'s failing rule lines', () => {
  const { root, base } = looped();
  const v = commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — fine\nrule CLAUDE.md:3 — fail — src/a.js:4; src/b.js:7\n') }, 'docs: verify 2');
  commit(root, { 'src/c.js': '1' }, 'fix: c');
  assert.match(collect(root, PLAN), new RegExp(`^rules scope: files changed since ${v.slice(0, 7)} \\+ files on the last run's failing rule lines: src/a\\.js, src/b\\.js$`, 'm'));
});

test('collect: --history with one committed run prints its trend line, never an error', () => {
  const { root } = looped();
  assert.equal(trend(root, PLAN).at(-1), 'trend: not converging');
  const cli = spawnSync(process.execPath, [SCRIPT, PLAN, '--history'], { cwd: root, encoding: 'utf8' });
  assert.equal(cli.status, 0, cli.stdout);
  assert.match(cli.stdout, /^trend: not converging$/m);
});

test('collect: after an accept commit the delta and carried rows name the run, not the accept', () => {
  const { root, base, v1 } = looped();
  commit(root, { [VERIFY]: `${vmd(base, REPORT)}Accepted unproven by me 2026-11-03: Task 3\n` }, 'docs(verify): accept x');
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const out = collect(root, PLAN);
  assert.match(out, new RegExp(`^delta: since ${v1.slice(0, 7)} — 1 files changed since the last verify$`, 'm'));
  assert.match(out, new RegExp(`^carried: Task 1 — ok — carried from verify ${v1.slice(0, 7)} — `, 'm'));
});

test('collect: three runs — a re-carried row keeps the sha of the run that judged it; a change to its file sends it back', () => {
  const { root, base, v1 } = looped();
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const carried = collect(root, PLAN).split('\n').filter((l) => l.startsWith('carried: ')).join('\n');
  commit(root, { [VERIFY]: vmd(base, '- Task 2 — ok — src/b.js:1 works\n', { carried }) }, 'docs: verify 2');
  commit(root, { 'src/c.js': '1' }, 'feat: c');
  const third = collect(root, PLAN);
  assert.match(third, new RegExp(`^carried: Task 1 — ok — carried from verify ${v1.slice(0, 7)} — src/a\\.js:1 does it$`, 'm'));
  writeFileSync(join(root, 'src/a.js'), '2');
  const fourth = collect(root, PLAN);
  assert.ok(line(fourth, /^judge: /).includes('Task 1'));
  assert.doesNotMatch(fourth, /^carried: Task 1/m);
});

test('collect: full-run reasons — --full, another base, merge, plan text, intent', () => {
  let r = looped();
  assert.match(collect(r.root, PLAN, undefined, { full: true }), /^delta: full — --full$/m);
  assert.match(collect(r.root, PLAN, git(r.root, 'rev-list', '--max-parents=0', 'HEAD')), /^delta: full — base moved$/m);

  r = looped();
  git(r.root, 'checkout', '-q', '-b', 'other');
  commit(r.root, { 'other/x.js': 'o' }, 'other work');
  git(r.root, 'checkout', '-q', 'main');
  git(r.root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-ff', '--no-edit', 'other');
  assert.match(collect(r.root, PLAN), /^delta: full — merge since the last verify$/m);

  r = looped();
  commit(r.root, { [PLAN]: taskPlan().replace('- [ ] 1. a', '- [x] 1. a').replace('Status: implementing', 'Status: verified') + '\n## Implementation notes\n- 2026-11-01 Task 1 — x\n' }, 'fix: notes');
  assert.match(collect(r.root, PLAN), /^delta: since /m, 'ticks, Status and notes are not a plan change');
  commit(r.root, { [PLAN]: taskPlan().replace('1. a', '1. a and more') }, 'plan edit');
  const pe = collect(r.root, PLAN);
  assert.match(pe, /^delta: since /m, 'a task text edit judges that task, not every row');
  assert.ok(ids(pe, /^judge: /).includes('Task 1'), line(pe, /^judge: /));
  assert.ok(line(pe, /^carried ids: /).includes('Task 2'), line(pe, /^carried ids: /));

  r = looped();
  commit(r.root, { [INTENT]: 'I-1 b\n' }, 'intent edit');
  const ie = collect(r.root, PLAN);
  assert.match(ie, /^delta: since /m);
  assert.ok(ids(ie, /^judge: /).includes('I-1'), line(ie, /^judge: /));
});

test('collect: a verify.md without Base is a full run, never an error', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: plan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', [VERIFY]: 'x' }, 'feat + verify');
  const out = collect(root, PLAN);
  assert.match(out, /^delta: full — base moved$/m);
  assert.doesNotMatch(out, /^error:/m);
});

test('collect: an amended task commit below the verify commit → history rewritten', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  const p = commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  const a = commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  const body = vmd(base, REPORT, { checks: `- commits: 1 — ${a.slice(0, 7)}\n` });
  commit(root, { [VERIFY]: body }, 'docs: verify');
  git(root, 'reset', '-q', '--hard', p);
  commit(root, { 'src/a.js': '1 amended' }, 'feat: a');
  commit(root, { [VERIFY]: body }, 'docs: verify again');
  assert.match(collect(root, PLAN), /^delta: full — history rewritten$/m);
});

test('collect: a failing test stops the run before the verifier; a timed-out test sends test-backed ok rows to judge', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }) }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — src/a.js:1\n- Task 9 — ok — npm test 5 pass\n') }, 'docs: verify');
  const stop = collect(root, PLAN);
  assert.match(stop, /^verifier: not called — test failed$/m);
  assert.doesNotMatch(stop, /^delta: /m);
  commit(root, { 'package.json': JSON.stringify({ scripts: { test: 'node -e "setTimeout(()=>{},4000)"' } }) }, 'slow test');
  const r = spawnSync(process.execPath, [SCRIPT, PLAN], { cwd: root, encoding: 'utf8', env: { ...process.env, KEYSTONE_CHECK_TIMEOUT_MS: '500' } });
  assert.match(r.stdout, /^test: npm test → not run \(timeout/m);
  assert.match(r.stdout, /^delta: since /m);
  assert.ok(line(r.stdout, /^judge: /).includes('Task 9'));
  assert.match(r.stdout, /^carried: Task 1 — ok/m);
});

test('collect: test-backed evidence in other spellings goes to judge when the test is not run', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', 'package.json': JSON.stringify({ scripts: { test: 'node -e "setTimeout(()=>{},4000)"' } }) }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  const rows = ['- Task 1 — ok — src/a.js:1', '- Task 6 — ok — covered by tests/test_api.py::test_x, passed', '- Task 7 — ok — handler_test.go:40 TestCreate passes', '- Task 8 — ok — pytest green'];
  commit(root, { [VERIFY]: vmd(base, rows.join('\n') + '\n') }, 'docs: verify');
  commit(root, { 'src/b.js': '1' }, 'feat: b');
  const r = spawnSync(process.execPath, [SCRIPT, PLAN], { cwd: root, encoding: 'utf8', env: { ...process.env, KEYSTONE_CHECK_TIMEOUT_MS: '500' } });
  const judge = line(r.stdout, /^judge: /);
  for (const id of ['Task 6', 'Task 7', 'Task 8']) assert.ok(judge.includes(id), `${id} in ${judge}`);
  assert.match(r.stdout, /^carried: Task 1 — ok/m);
});

test('collect: a row that only cites a judged row ("see Row N") is judged with it, along the chain', () => {
  const { root, base } = looped();
  const report = '- Task 2 — ok — src/b.js:1\n- I-1 — ok — see Task 2.\n- I-2 — ok — see I-1.\n- I-3 — ok — src/a.js:1\n- I-12 — ok — fine\n';
  commit(root, { [VERIFY]: vmd(base, report) }, 'docs: verify 2');
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const out = collect(root, PLAN);
  const judge = line(out, /^judge: /);
  for (const id of ['Task 2', 'I-1', 'I-2']) assert.ok(judge.includes(id), `${id} in ${judge}`);
  assert.match(out, /^carried ids: I-3, I-12$/m, 'I-12 is not a citation of I-1');
});

test('collect: a fix that only edits the plan is not "0 files changed"', () => {
  const { root, v1 } = looped();
  commit(root, { [PLAN]: taskPlan() + '\n## Implementation notes\n- 2026-11-03 Task 1 — a drift recorded\n' }, 'docs(plan): note');
  const out = collect(root, PLAN);
  assert.match(out, new RegExp(`^delta: since ${v1.slice(0, 7)} — 1 files changed since the last verify$`, 'm'));
});

test('collect: a changed rule file widens the Rules gate to all task files', () => {
  const { root } = looped();
  commit(root, { '.claude/rules/x.md': '- MUST: y\n' }, 'rules');
  assert.match(collect(root, PLAN), /^rules scope: all task files — rule files changed: \.claude\/rules\/x\.md$/m);
});

test('collect: report rows as written by real verifiers parse into ids', () => {
  const sample = [
    '- Task 7 — ok — LogoMenu.tsx:12 renders the chevron',
    '- Done means / build and typecheck green — ok',
    "- task 1 — ok — The task's check is in place:",
    '  - `src/app.ts` exports it;',
    'Row "logo chevron" — wrong — the chevron does not rotate. Repro: click the logo',
    'Advisory: src/x.ts:3 — wrong name in an old comment',
  ].join('\n');
  const rows = parseRows(sample);
  assert.deepEqual(rows.map((r) => r.id), ['Task 7', 'Done means / build and typecheck green', 'Task 1', 'Row "logo chevron"']);
  assert.match(rows[2].evidence, /src\/app\.ts/);
});

test('collect: history counts open, new and closed findings and the cost of each cycle', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  const cost = (x) => `- cost: verify+fix $${x}\n`;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\n- Task 2 — missing — b\nrule CLAUDE.md:3 — fail — src/a.js:4\nAdvisory: src/old.js:1 — old\nMinor: src/a.js:2 — typo\nUnrequested: none\n', { checks: cost('1.00') }) }, 'verify 1');
  assert.doesNotMatch(history(root, PLAN).join('\n'), /trend menu/, 'one FAIL: no menu');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\n- Task 2 — wrong — reworded b. Repro: y\nUnrequested: src/z.js — new file\n', { checks: cost('1.30') }) }, 'verify 2');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\nMinor: src/a.js:2 — typo\n', { checks: cost('1.70'), verdict: 'PASS-UNPROVEN' }) }, 'verify 3');
  const h = history(root, PLAN);
  assert.equal(h[0], 'history: 3 runs · FAIL 2');
  assert.match(h[1], /^run 1 · \d{4}-\d\d-\d\d · FAIL · open 3 · new 3 · closed 0 · cycle cost n\/a$/);
  assert.match(h[2], /^run 2 · \d{4}-\d\d-\d\d · FAIL · open 3 · new 1 · closed 1 · cycle cost \$0\.30$/);
  assert.match(h[3], /^run 3 · \d{4}-\d\d-\d\d · PASS-UNPROVEN · open 1 · new 0 · closed 2 · cycle cost \$0\.40$/);
  assert.equal(h.at(-1), 'trend menu: on this FAIL');
  const cli = spawnSync(process.execPath, [SCRIPT, PLAN, '--history'], { cwd: root, encoding: 'utf8' });
  assert.match(cli.stdout, /^trend: converging$/m);
  const out = collect(root, PLAN).split('\n');
  assert.ok(out.indexOf(MARK) < out.indexOf('history: 3 runs · FAIL 2'));
  commit(root, { [VERIFY]: vmd(base, '- Task 3 — missing — c\n') }, 'verify 4');
  assert.equal(trend(root, PLAN).at(-1), 'trend: not converging');
});

test('collect: an accept commit that only appends "Accepted unproven by" is not a run', () => {
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  const v = vmd(base, '- Task 1 — not proven — a\n', { verdict: 'PASS-UNPROVEN' });
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\n') }, 'verify 1');
  commit(root, { [VERIFY]: v }, 'verify 2');
  commit(root, { [VERIFY]: `${v}Accepted unproven by me 2026-11-03: Task 1\n` }, 'docs(verify): accept x');
  const h = history(root, PLAN);
  assert.equal(h[0], 'history: 2 runs · FAIL 1');
  assert.equal(h.length, 3);
});

test('collect: a run without a cost line has cycle cost n/a', () => {
  const { root, base } = looped();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a\n', { checks: '- cost: verify+fix $2.00\n' }) }, 'verify 2');
  assert.match(history(root, PLAN)[2], /cycle cost n\/a$/);
});

// --- Review fixes: unrecognised changed files, report parsing, counting, CLI guard ---
function planned(files, extra = {}) { // a repo with tasks over `files`, one committed verify; `ev` rows are written per test
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n', 'CLAUDE.md': 'r\n', ...extra }, 'start');
  commit(root, { [PLAN]: taskPlan().replace(/- \[ \] 1\. a — files: src\/a\.js/, `- [ ] 1. a — files: ${files}`) }, 'docs(plan)');
  return root;
}

test('collect: a renamed file sends its task to judge (git diff lists the old path too)', () => {
  const root = planned('src/old.js');
  commit(root, { 'src/old.js': 'content that is long enough to be detected as a rename\n'.repeat(3) }, 'feat');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — src/old.js:3\n') }, 'docs: verify');
  git(root, 'mv', 'src/old.js', 'src/new.js');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', 'rename');
  assert.ok(line(collect(root, PLAN), /^judge: /).includes('Task 1'));
  assert.ok(taskFiles(root, base).files.includes('src/old.js'), 'taskFiles lists the old path of a rename');
});

test('collect: evidence spelled as an absolute path, backslashes or « » still names the changed file', () => {
  const { root, base } = looped();
  const rows = ['- Task 1 — ok — E:/proj/src/b.js:3 works', '- Row 2 — ok — src\\b.js:3 works', '- Task 3 — ok — «src/b.js» works', '- Task 4 — ok — src/b.js… works', '- Task 5 — ok — src/a.js:1 only'];
  commit(root, { [VERIFY]: vmd(base, rows.join('\n') + '\n') }, 'verify 2');
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const out = collect(root, PLAN);
  const judge = line(out, /^judge: /);
  for (const id of ['Task 1', 'Row 2', 'Task 3', 'Task 4']) assert.ok(judge.includes(id), `${id} in ${judge}`); // Row 2 has no files: net
  assert.match(out, /^carried ids: Task 5$/m);
});

test('collect: a non-ASCII path is recognised even with core.quotepath on', () => {
  const root = planned('src/файл.js');
  git(root, 'config', 'core.quotepath', 'true');
  commit(root, { 'src/файл.js': '1' }, 'feat');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — fine\n') }, 'docs: verify');
  commit(root, { 'src/файл.js': '2' }, 'fix');
  assert.ok(line(collect(root, PLAN), /^judge: /).includes('Task 1'));
});

test('collect: Authority is read from the header line only — a body mention of CLAUDE.md is not the intent', () => {
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n', 'CLAUDE.md': 'r\n' }, 'start');
  const body = taskPlan().replace(/Authority: .*\n/, '') + '\nAuthority: see the rules (`CLAUDE.md`, ADR 1)\n';
  commit(root, { [PLAN]: body }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — src/a.js:1\n') }, 'docs: verify');
  commit(root, { 'CLAUDE.md': 'r2\n' }, 'rules');
  assert.match(collect(root, PLAN), /^edited: none$/m);
  commit(root, { [INTENT]: 'I-1 b\n' }, 'intent edit');
  assert.match(collect(root, PLAN), /^edited: I-1 \(intent line\)$/m);
});

test('collect: only fixed row ids are rows — no line of the verifier template becomes a row or a finding', () => {
  const template = ['Original goal: met — x', 'Unconfirmed — missing sample — looked in the repo', 'Settings: violated — missing tests',
    'Weakened test: t.js:3 — wrong assert', 'Security gate: warn — ok for now', 'Rules gate: pass', 'Leftovers / env: none',
    'Advisory: a.js:1 — wrong name', 'Minor: a.js:2 — missing comma', 'Keystone verify: 3 rows — ok 1, missing 1',
    'Task 2: ok — fine', '- Task 1 — wrong — y', 'I-12 — missing — z', 'Row "logo chevron" — ok — w', 'Done means 2 — not proven — v'];
  assert.deepEqual(parseRows(template.join('\n')).map((r) => r.id), ['Task 1', 'I-12', 'Row "logo chevron"', 'Done means 2']);
  const { root, base } = looped();
  commit(root, { [VERIFY]: vmd(base, '- Task 3 — wrong — a\nUnconfirmed — missing sample — looked\nSettings: violated — missing tests\n') }, 'verify 2');
  assert.match(history(root, PLAN)[2], /open 1 · new 0 · closed 0/);
});

test('collect: parseRows never starts a row on an indented line', () => {
  const rows = parseRows('Decisions:\n  - Decision: intent.md:I-2 — wrong — x\nWeakened tests:\n  - t.js:3 — ok — y\n- Task 1 — ok — z');
  assert.deepEqual(rows.map((r) => r.id), ['Task 1']);
});

test('collect: two rules failing on the same file:line are two findings; Unrequested: None and inline lists', () => {
  const { root, base } = looped();
  commit(root, { [VERIFY]: vmd(base, 'rule CLAUDE.md:3 — fail — src/a.js:4\nrule CLAUDE.md:9 — fail — src/a.js:4\nUnrequested: None\n') }, 'verify 2');
  assert.match(history(root, PLAN)[2], /open 2 · new 2/);
  commit(root, { [VERIFY]: vmd(base, 'Unrequested: src/x.js — new; src/y.js — extra\n') }, 'verify 3');
  assert.match(history(root, PLAN)[3], /open 2 · new 2 · closed 2/);
});

test('collect: an untracked file that existed at the last verify is not counted, but is still carried over as changed', () => {
  const { root } = looped();
  put(root, { 'notes.txt': 'n' });
  utimesSync(join(root, 'notes.txt'), new Date('2020-01-01'), new Date('2020-01-01'));
  assert.match(collect(root, PLAN), /— 0 files changed since the last verify$/m);
  put(root, { 'fresh.txt': 'n' });
  assert.match(collect(root, PLAN), /— 1 files changed since the last verify$/m);
});

test('collect: history prints cycle cost n/a when the ledger was reset (cost went down)', () => {
  const { root, base } = looped();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a\n', { checks: '- cost: verify+fix $5.00\n' }) }, 'verify 2');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a\n', { checks: '- cost: verify+fix $1.00\n' }) }, 'verify 3');
  assert.match(history(root, PLAN)[3], /cycle cost n\/a$/);
});

test('collect: the CLI rejects an unknown flag with usage and exit 2', () => {
  const { root } = looped();
  const r = spawnSync(process.execPath, [SCRIPT, PLAN, '--ful'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 2);
  assert.match(r.stderr, /usage: node collect\.mjs/);
});

// --- proved by R<n>: release refs, pending rows, ## Debt outside the plan comparison ---

const RECON = (rows) => `\n## Requirements Reconciliation\n\n| Decision | Source | Verification evidence |\n|---|---|---|\n${rows.join('\n')}\n`;

test('collect: release refs name each proved-by row as open, no step, no check or done', () => {
  const text = taskPlan(RECON([
    '| a | intent — I-1 | proved by R1 |',
    '| b | intent — I-2 | `x | y` proved by R5 |',
    '| c | intent — I-3 | proved by R2 |',
    '| d | intent — I-4 | Task 1 test; proved by R3 |',
  ]) + '\n## Release\n- [ ] R1. ship — check: test -f shipped.txt\n- [ ] R2. deploy\n- [x] R3. tag — check: git tag\n');
  assert.deepEqual(releaseRefs(text), ['Row 1 (I-1) → R1 open', 'Row 2 (I-2) → R5 no step', 'Row 3 (I-3) → R2 no check', 'Row 4 (I-4) → R3 done']);
  assert.deepEqual(releaseRefs(taskPlan(RECON(['| a | intent — I-1 | Task 1 test |']))), []);
  // an escaped \| in a cell, a release-mode proof whose output has a | in backticks, two marks in one cell
  assert.deepEqual(releaseRefs(taskPlan(RECON([
    '| a \\| b | intent — I-1 | proved by R1 |',
    '| c | intent — I-2 | proved by R3 — proved 2026-11-05: `out a | b` |',
    '| e | intent — I-5 | proved by R1 and proved by R3 |',
  ]) + '\n## Release\n- [ ] R1. ship — check: test -f shipped.txt\n- [x] R3. tag — check: git tag\n')),
  ['Row 1 (I-1) → R1 open', 'Row 2 (I-2) → R3 done', 'Row 3 (I-5) → R1 open', 'Row 3 (I-5) → R3 done']);
  const root = repo();
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: text }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const ls = collect(root, PLAN).split('\n');
  const i = ls.findIndex((l) => l.startsWith('release refs: '));
  assert.equal(ls[i], 'release refs: Row 1 (I-1) → R1 open; Row 2 (I-2) → R5 no step; Row 3 (I-3) → R2 no check; Row 4 (I-4) → R3 done');
  assert.ok(ls.findIndex((l) => l.startsWith('rules scope:')) < i && i < ls.indexOf(MARK), 'after rules scope, above the marker');
});

test('collect: a plan without proved-by marks prints release refs: none; the frozen copy of the real plan reads Row 14 open', () => {
  const { root } = looped();
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  assert.match(collect(root, PLAN), /^release refs: none$/m);
  const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'proved-by-plan.md'), 'utf8');
  assert.ok(releaseRefs(real).includes('Row 14 (I-14) → R2 open'), releaseRefs(real).join('; '));
});

test('collect: a pending R<n> row parses, is never carried and is not a finding', () => {
  assert.deepEqual(parseRows('Row 1 — pending R1 — release refs: Row 1 (I-1) → R1 open'), [{ id: 'Row 1', status: 'pending R1', evidence: 'release refs: Row 1 (I-1) → R1 open' }]);
  assert.equal(parseRows('I-2 — pending R1, R3 — rows 1 and 2')[0].status, 'pending R1, R3');
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: taskPlan() }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
  const base = findBase(root, PLAN).base;
  commit(root, { [VERIFY]: vmd(base, `${REPORT}- Row 1 — pending R1 — release refs: Row 1 (I-1) → R1 open\n`) }, 'docs: verify 1');
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const out = collect(root, PLAN);
  assert.ok(line(out, /^judge: /).includes('Row 1'), line(out, /^judge: /));
  assert.doesNotMatch(line(out, /^carried ids: /), /Row 1/);
  assert.match(line(out, /^run 1 /), /open 1 /, 'only the wrong Task 3 is a finding');
});

test('collect: editing ## Debt is not a plan change, in the middle of the plan or as the last section', () => {
  const debt = (s) => `\n## Debt\n- D1 · Row 1 · ${s} · accepted 2026-11-04 by t (verify abc1234) · prove by: the first real report\n`;
  for (const [before, after] of [
    [taskPlan(), taskPlan(debt('open'))],
    [taskPlan(debt('open') + '\n## Release\n- [ ] R1. ship — check: x\n'), taskPlan(debt('closed 2026-11-05 by qa-check TC-001 — passed') + '\n## Release\n- [ ] R1. ship — check: x\n')],
  ]) {
    const root = repo();
    commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
    commit(root, { [PLAN]: before }, 'docs(plan)');
    commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
    const base = findBase(root, PLAN).base;
    commit(root, { [VERIFY]: vmd(base, REPORT) }, 'docs: verify 1');
    commit(root, { [PLAN]: after }, 'docs(verify): accept x');
    const out = collect(root, PLAN);
    assert.match(out, /^delta: since [0-9a-f]{7} /m);
    assert.doesNotMatch(out, /plan changed/);
  }
});

// --- 0.9.28: plan / intent edits judge only what they touched, left the plan, I-13 files, stop on failed checks, late watch ---

function edited(before, intent, report) { // one committed verify over `before`; each test edits from here
  const root = repo();
  commit(root, { 'README.md': 'x', [INTENT]: intent }, 'start');
  commit(root, { [PLAN]: before }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
  const base = findBase(root, PLAN).base;
  const v = commit(root, { [VERIFY]: vmd(base, report) }, 'docs: verify 1');
  return { root, base, v };
}
const ids = (out, re) => line(out, re).replace(/^[^:]+: /, '').split(', ');
const ROWS3 = taskPlan(RECON(['| x | intent — I-1 | t |', '| y | intent — I-1, I-2 | t |', '| z | intent — I-3 | t |']));
const REP3 = '- Task 1 — ok — src/a.js:1\n- Task 2 — ok — src/b.js:1\n- Row 1 — ok — fine\n- Row 2 — ok — fine\n- Row 3 — ok — fine\n- I-1 — ok — fine\n- I-2 — ok — fine\n- I-3 — ok — fine\n';

test('0.9.28 collect: a rewritten task is judged alone and listed under edited:', () => {
  const { root } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { [PLAN]: taskPlan().replace('1. a —', '1. a rewritten —') }, 'plan edit');
  const out = collect(root, PLAN);
  assert.match(out, /^delta: since /m);
  assert.ok(ids(out, /^judge: /).includes('Task 1'));
  assert.match(out, /^edited: Task 1 \(task text\)$/m);
  assert.ok(ids(out, /^carried ids: /).includes('Task 2'));
});

test('0.9.28 collect: a changed or new I-n judges itself and the rows that cite it; a rewritten row is judged', () => {
  const { root } = edited(ROWS3, 'I-1 a\nI-2 b\nI-3 c\n', REP3);
  commit(root, { [INTENT]: 'I-1 a\nI-2 b changed\nI-3 c\n' }, 'intent edit');
  let j = ids(collect(root, PLAN), /^judge: /);
  for (const id of ['I-2', 'Row 2']) assert.ok(j.includes(id), `${id} in ${j}`);
  for (const id of ['Row 1', 'Row 3', 'I-1', 'I-3']) assert.ok(!j.includes(id), `${id} not in ${j}`);
  commit(root, { [INTENT]: 'I-1 a\nI-2 b changed\nI-3 c\nI-4 new\n' }, 'intent add');
  assert.match(line(collect(root, PLAN), /^edited: /), /I-4 \(intent line\)/);
  commit(root, { [PLAN]: ROWS3.replace('| z |', '| z rewritten |') }, 'row edit');
  j = ids(collect(root, PLAN), /^judge: /);
  assert.ok(j.includes('Row 3'), j.join(', '));
});

test('0.9.28 collect: a struck I-n leaves the plan with the rows that cite only it — never judged or carried', () => {
  const { root } = edited(ROWS3, 'I-1 a\nI-2 b\nI-3 c\n', REP3);
  commit(root, { [INTENT]: '~~I-1 a~~\nI-2 b\nI-3 c\n' }, 'strike I-1');
  const out = collect(root, PLAN);
  assert.match(out, /^left the plan: I-1, Row 1$/m);
  assert.ok(!ids(out, /^judge: /).includes('Row 1') && !ids(out, /^carried ids: /).includes('Row 1'));
  assert.ok(!ids(out, /^judge: /).includes('I-1') && !ids(out, /^carried ids: /).includes('I-1'));
  // the first verify, with a struck I-n already in the intent
  const first = repo();
  commit(first, { 'README.md': 'x', [INTENT]: '~~I-1 a~~\nI-2 b\n' }, 'start');
  commit(first, { [PLAN]: taskPlan(RECON(['| x | intent — I-1 | t |'])) }, 'docs(plan)');
  commit(first, { 'src/a.js': '1' }, 'feat');
  assert.match(collect(first, PLAN), /^left the plan: I-1, Row 1$/m);
});

test('0.9.28 collect: an I-n of another intent in Source is not own; "I-2; I-1" after ; is own', () => {
  const plan = taskPlan(RECON(['| x | `other/intent.md` — I-1 | t |', '| y | intent — I-2; I-1 | t |']));
  const { root } = edited(plan, 'I-1 a\nI-2 b\n', '- Row 1 — ok — fine\n- Row 2 — ok — fine\n');
  commit(root, { [INTENT]: 'I-1 changed\nI-2 b\n' }, 'intent edit');
  const j = ids(collect(root, PLAN), /^judge: /);
  assert.ok(j.includes('Row 2') && !j.includes('Row 1'), j.join(', '));
  commit(root, { [INTENT]: '~~I-1 changed~~\nI-2 b\n' }, 'strike');
  assert.match(collect(root, PLAN), /^left the plan: I-1$/m);
});

test('0.9.28 collect: a changed Done means line judges the past Done means rows; a Design edit judges nothing', () => {
  const dm = (s) => taskPlan('\n## Design\n- d1\n').replace('Settings: tests — yes\n', `Settings: tests — yes\nDone means: ${s}\n`);
  const { root } = edited(dm('x'), 'I-1 a\n', '- Task 1 — ok — src/a.js:1\n- Done means 1 — ok — fine\n');
  commit(root, { [PLAN]: dm('x').replace('- d1', '- d2') }, 'design edit');
  let out = collect(root, PLAN);
  assert.match(out, /^delta: since /m);
  assert.match(out, /^edited: none$/m);
  assert.match(out, /^judge: none$/m);
  commit(root, { [PLAN]: dm('y').replace('- d1', '- d2') }, 'done means edit');
  out = collect(root, PLAN);
  assert.ok(ids(out, /^judge: /).includes('Done means 1'), line(out, /^judge: /));
});

test('0.9.28 collect: an ok row on a file of a past wrong row is judged even if the file did not change (I-13)', () => {
  const rep = '- Task 1 — ok — src/a.js:1 does it\n- Task 2 — wrong — Class: c — src/b.js:1 Repro: x\n- Row 1 — ok — src/b.js:3 covers it\n';
  const { root } = edited(taskPlan(), 'I-1 a\n', rep);
  const out = collect(root, PLAN);
  assert.match(out, /^delta: since [0-9a-f]{7} — 0 files changed/m);
  assert.ok(ids(out, /^judge: /).includes('Row 1'), line(out, /^judge: /));
  assert.deepEqual(ids(out, /^carried ids: /), ['Task 1']);
});

test('0.9.28 collect: a failed test stops before the verifier; the next delta counts from the last judged run', () => {
  const { root, base, v } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(1)"' } }) }, 'break');
  const stop = collect(root, PLAN);
  assert.match(stop, /^verifier: not called — test failed$/m);
  assert.doesNotMatch(stop, /^(delta|judge): /m);
  assert.match(stop, /^history: /m);
  const stopped = `# Verify: x\nDate: 2026-11-02 · Base: ${base.slice(0, 7)} · Verdict: FAIL\n\n## Checks\n- test: npm test → fail\n## Carried\nnone\n## Report\n\n\`\`\`text\nnot judged — test failed (verifier not called)\n\`\`\`\n\n## Verdict\nFAIL — test failed\n`;
  commit(root, { [VERIFY]: stopped }, 'docs: verify stop');
  commit(root, { 'package.json': JSON.stringify({ scripts: { test: 'node -e "process.exit(0)"' } }) }, 'fix');
  assert.match(collect(root, PLAN), new RegExp(`^delta: since ${v.slice(0, 7)} `, 'm'));
});

test('0.9.28 collect: late watch lists past ok rows judged again although their files and text did not change', () => {
  const { root } = edited(taskPlan(), 'I-1 a\n', '- Task 1 — ok — src/a.js:1\n- Task 2 — ok — src/b.js:1\n');
  let out = collect(root, PLAN, undefined, { full: true });
  assert.deepEqual(ids(out, /^late watch: /), ['Task 1', 'Task 2']);
  commit(root, { 'src/b.js': '2' }, 'fix b');
  out = collect(root, PLAN, undefined, { full: true });
  assert.deepEqual(ids(out, /^late watch: /), ['Task 1']);
  commit(root, { [PLAN]: taskPlan().replace('1. a —', '1. a rewritten —') }, 'plan edit');
  out = collect(root, PLAN, undefined, { full: true });
  assert.match(out, /^late watch: none$/m);
  // edited: and late watch: are for the record; left the plan: is for the verifier
  const ls = out.split('\n');
  assert.ok(ls.findIndex((l) => l.startsWith('left the plan:')) < ls.indexOf(MARK));
  for (const k of ['edited:', 'late watch:']) assert.ok(ls.findIndex((l) => l.startsWith(k)) > ls.indexOf(MARK), k);
  assert.match(collect(root, PLAN), /^late watch: none$/m, 'a delta run judges no quiet row here');
});

test('0.9.28 collect: a changed Level or Settings header is a full run — plan header changed', () => {
  for (const edit of [(p) => p.replace('Level: M', 'Level: L'), (p) => p.replace('Settings: tests — yes', 'Settings: tests — no')]) {
    const { root } = edited(taskPlan(), 'I-1 a\n', REPORT);
    commit(root, { [PLAN]: edit(taskPlan()) }, 'header edit');
    assert.match(collect(root, PLAN), /^delta: full — plan header changed$/m);
  }
  const { root } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { [PLAN]: taskPlan().replace('Status: implementing', 'Status: verified') }, 'status');
  assert.match(collect(root, PLAN), /^delta: since /m, 'Status is not the header');
});

// --- 0.9.28 history: late findings, stop runs, accepted violations, rules menu, sites to cover, a real verify.md ---

test('0.9.28 history: a late-watch id given wrong adds · late <l> to its run; a run without late ones has no tail', () => {
  const { root, base } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — x. Repro: y\n- Task 2 — ok — fine\n', { checks: '- late watch: Task 1, Task 2\n' }) }, 'verify 2');
  const h = history(root, PLAN);
  assert.match(h[1], /cycle cost n\/a$/);
  assert.match(h[2], / · late 1$/);
});

test('0.9.28 history: a stop run keeps every open finding and adds check: test failed', () => {
  const { root, base } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a\n- Task 2 — missing — b\nrule CLAUDE.md:3 — fail — src/a.js:4\n') }, 'verify 2');
  const stopped = `# Verify: x\nDate: 2026-11-02 · Base: ${base.slice(0, 7)} · Verdict: FAIL\n\n## Checks\n- test: npm test → fail\n## Carried\nnone\n## Report\nnot judged — test failed (verifier not called)\n\n## Verdict\nFAIL — test failed\n`;
  commit(root, { [VERIFY]: stopped }, 'verify stop');
  assert.match(history(root, PLAN)[3], /open 4 · new 1 · closed 0/);
  assert.ok(findings(stopped).has('check: test failed'));
});

test('0.9.28 history: places after sites to cover: / Class: on a rule line are not findings', () => {
  const k = findings(vmd('a'.repeat(7), 'rule .claude/rules/x.md:3 — fail — src/a.js:1; src/b.js:2 — sites to cover: src/c.js:9 — Class: c\n'));
  assert.deepEqual([...k].sort(), ['rule .claude/rules/x.md:3 src/a.js:1', 'rule .claude/rules/x.md:3 src/b.js:2']);
});

test('0.9.28 history: the real M37 verify.md lines parse — fenced report, glued Checks, `file.ts:45-57` places', () => {
  const real = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'm37-verify-lines.md'), 'utf8');
  const keys = findings(real);
  assert.deepEqual([...keys].sort(), ['rule .claude/rules/keystone.md:10 frontend/lib/hooks/use-site-backups.ts:45',
    'rule .claude/rules/keystone.md:10 frontend/lib/hooks/use-site-backups.ts:90']);
  assert.deepEqual(lateWatch(real), ['Done means 2']);
  const acc = parseAccepted('Accepted violation by t 2026-11-06: rule .claude/rules/keystone.md:10 — `frontend/lib/hooks/use-site-backups.ts:45`; frontend/lib/hooks/use-site-backups.ts:90');
  assert.equal(findings(real, acc).size, 0, 'the accepted places match the backticked, ranged ones');
  // judged: the fenced report after a blank line is a judged run; `not judged` inside the fence is a stop run
  const failed = real.replace(/\r\n/g, '\n').replace('→ pass', '→ fail');
  assert.ok(!findings(failed).has('check: build failed'), 'a judged run has no check: key');
  assert.ok(findings(failed.replace('```text\nKeystone verify:', '```text\nnot judged — build failed\nKeystone verify:')).has('check: build failed'));
});

test('0.9.28 history: an accept-violation commit is not a run; accepted places are not findings, a new place is', () => {
  const { root, base } = edited(taskPlan(), 'I-1 a\n', REPORT);
  const run = vmd(base, 'rule .claude/rules/x.md:3 — fail — src/a.js:1; src/b.js:2\n');
  commit(root, { [VERIFY]: run }, 'verify 2');
  commit(root, { [VERIFY]: `${run}Accepted violation by t 2026-11-06: rule .claude/rules/x.md:3 — src/a.js:1; src/b.js:2\n` }, 'docs(verify): accept violation x');
  assert.match(history(root, PLAN)[0], /^history: 2 runs/);
  assert.match(collect(root, PLAN), /^accepted violations: rule \.claude\/rules\/x\.md:3 — src\/a\.js:1; src\/b\.js:2$/m);
  commit(root, { [VERIFY]: vmd(base, 'rule .claude/rules/x.md:3 — fail — src/a.js:1; src/c.js:5\n') }, 'verify 3');
  const h = history(root, PLAN);
  assert.match(h[2], /open 0 /, 'run 2 rests only on accepted places');
  assert.match(h[3], /open 1 · new 1 /, 'only src/c.js:5 is a finding');
  const ls = collect(root, PLAN).split('\n');
  assert.ok(ls.findIndex((l) => l.startsWith('accepted violations:')) > ls.indexOf(MARK));
});

test('0.9.28 trend: two rules-only FAIL runs print rules menu: on this FAIL; history does not', () => {
  const { root, base } = edited(taskPlan(), 'I-1 a\n', REPORT);
  commit(root, { [VERIFY]: vmd(base, 'rule .claude/rules/x.md:3 — fail — src/a.js:1\n') }, 'verify 2');
  commit(root, { [VERIFY]: vmd(base, 'rule .claude/rules/x.md:3 — fail — src/b.js:2\n') }, 'verify 3');
  assert.ok(trend(root, PLAN).includes('rules menu: on this FAIL'));
  assert.ok(trend(root, PLAN).indexOf('rules menu: on this FAIL') < trend(root, PLAN).findIndex((l) => l.startsWith('trend: ')));
  assert.ok(!history(root, PLAN).includes('rules menu: on this FAIL'));
  for (const extra of ['- Task 1 — wrong — a\n', 'Settings: violated — no tests\n']) {
    const r = edited(taskPlan(), 'I-1 a\n', REPORT);
    commit(r.root, { [VERIFY]: vmd(r.base, 'rule .claude/rules/x.md:3 — fail — src/a.js:1\n') }, 'verify 2');
    commit(r.root, { [VERIFY]: vmd(r.base, `rule .claude/rules/x.md:3 — fail — src/b.js:2\n${extra}`) }, 'verify 3');
    assert.ok(!trend(r.root, PLAN).includes('rules menu: on this FAIL'), extra);
  }
});
