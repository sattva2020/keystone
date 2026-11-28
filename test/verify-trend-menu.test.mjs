// Class: the ceiling (0.9.31, was the trend menu) read from the post-commit `--history` output, where the FAIL just committed is already counted.
// 0.9.31 I-7 (replaces 0.9.26 I-10 / 0.9.29 I-8): `ceiling: reached` from the third judged FAIL, read by Step 6
// `trend()` after the commit (this run included, so `>= 3`); Step 1 `history()` prints no menu line.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findBase, git, history, trend } from '../skills/verify/scripts/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = 'docs/sattva/2026-10-18-x/plan.md';
const VERIFY = 'docs/sattva/2026-10-18-x/verify.md';
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });

function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
const vmd = (base, report, verdict = 'FAIL') =>
  `# Verify: x\nDate: 2026-11-01 · Base: ${base.slice(0, 7)} · Verdict: ${verdict}\n\n## Checks\n- base: ${base.slice(0, 7)}\n\n## Carried\n\n## Report\nSattva verify: ${PLAN} · base ${base.slice(0, 7)}\n${report}\n\n## Verdict\n${verdict}\n`;

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
const hasCeiling = (lines) => lines.some((l) => /^ceiling: reached — \d+ judged FAIL runs$/.test(l));

test('class: ceiling: reached comes on the third judged FAIL', () => {
  // 0.9.31 (I-7, intent D9): the ceiling replaces the trend menu. After the Step 5 commit of FAIL k, trend() sees k
  // judged FAIL runs; history() (Step 1) prints no menu line at all — the stop there is collect's `verifier: not called`.
  assert.ok(!hasCeiling(trend(fails(1), PLAN)), 'FAIL 1: no ceiling');
  assert.ok(!hasCeiling(trend(fails(2), PLAN)), 'FAIL 2: no ceiling');
  assert.ok(trend(fails(3), PLAN).includes('ceiling: reached — 3 judged FAIL runs'), 'FAIL 3: the ceiling');
  for (const n of [1, 2, 3]) assert.ok(!history(fails(n), PLAN).some((l) => /menu|ceiling/.test(l)), `history after ${n}: no menu line`);
});

test('class: every text that reads the ceiling says the third judged FAIL', () => {
  const read = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
  assert.match(read('skills/verify/references/LOOP.md'), /## The ceiling — `ceiling: reached`\n\nFrom the third judged FAIL run/);
  assert.match(read('skills/verify/references/CHECKS.md'), /`ceiling: reached — <f> judged FAIL runs` — [^\n]*(\n[^\n-][^\n]*)*third judged FAIL/);
  const all = read('skills/verify/references/LOOP.md') + read('skills/verify/SKILL.md') + read('skills/verify/references/CHECKS.md');
  assert.doesNotMatch(all, /second FAIL|trend menu: on this FAIL/);
});
