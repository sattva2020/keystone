// Class: the trend menu read from the post-commit `--history` output, where the FAIL just committed is already counted.
// I-8 (and 0.9.26 I-10): the trend menu comes from the third FAIL. Step 1 `history()` runs before the commit (past runs
// only, `>= 2` past FAILs); Step 6 `trend()` runs after it (this run included, so `>= 3` FAILs).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findBase, git, history, trend } from '../skills/verify/scripts/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = 'docs/keystone/2026-10-18-x/plan.md';
const VERIFY = 'docs/keystone/2026-10-18-x/verify.md';
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });

function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
const vmd = (base, report, verdict = 'FAIL') =>
  `# Verify: x\nDate: 2026-11-01 · Base: ${base.slice(0, 7)} · Verdict: ${verdict}\n\n## Checks\n- base: ${base.slice(0, 7)}\n\n## Carried\n\n## Report\nKeystone verify: ${PLAN} · base ${base.slice(0, 7)}\n${report}\n\n## Verdict\n${verdict}\n`;

function fails(n) {
  const root = mkdtempSync(join(tmpdir(), 'ks-trend-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x' }, 'start');
  commit(root, { [PLAN]: '# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\nSettings: tests — yes\n\n## Tasks\n- [ ] 1. a — files: src/a.js\n' }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  const base = findBase(root, PLAN).base;
  for (let i = 1; i <= n; i++) commit(root, { [VERIFY]: vmd(base, `- Task 1 — wrong — a${i}. Repro: x\n`) }, `verify ${i}`);
  return root;
}
const hasMenu = (lines) => lines.includes('trend menu: on this FAIL');

test('class: the trend menu comes on the third FAIL, read before the commit (Step 1) or after it (Step 6)', () => {
  // After the Step 5 commit of FAIL k, trend() sees k FAIL runs; Step 1 of FAIL k (before its commit) saw k - 1.
  assert.ok(!hasMenu(trend(fails(1), PLAN)), 'FAIL 1, Step 6: no menu');
  assert.ok(!hasMenu(trend(fails(2), PLAN)), 'FAIL 2, Step 6: no menu');
  assert.ok(hasMenu(trend(fails(3), PLAN)), 'FAIL 3, Step 6: the menu');
  assert.ok(!hasMenu(history(fails(1), PLAN)), 'FAIL 2, Step 1: no menu');
  assert.ok(hasMenu(history(fails(2), PLAN)), 'FAIL 3, Step 1: the menu');
});

test('class: every text that reads trend menu: on this FAIL says the third FAIL', () => {
  const read = (f) => readFileSync(join(ROOT, f), 'utf8');
  assert.match(read('skills/verify/references/LOOP.md'), /menu from the third FAIL/);
  assert.match(read('skills/verify/references/CHECKS.md'), /`trend menu: on this FAIL` — [^\n]*(\n[^\n-][^\n]*)*third FAIL/);
  assert.doesNotMatch(read('skills/verify/references/LOOP.md') + read('skills/verify/SKILL.md'), /second FAIL/);
});
