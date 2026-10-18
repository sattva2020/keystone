import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, chmodSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { collect, findBase, taskFiles, git } from '../skills/verify/scripts/collect.mjs';

const SCRIPT = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'verify', 'scripts', 'collect.mjs');
const PLAN = 'docs/keystone/2026-10-18-x/plan.md';

function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ks-collect-'));
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
