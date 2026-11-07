// Review of verify-fix-class-sweep (2026-11-07): three findings, one test each.
// 1. A task, Reconciliation row or I-n deleted from the plan / intent between runs is not carried as `ok`.
// 3. "Code unchanged since the last FAIL" reads the verdict of the run `delta: since <sha7>` names, not a later stop run.
// 10. The real-verify.md fixture carries no client domain or local machine path.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { findBase, git, delta } from '../skills/verify/scripts/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PLAN = 'docs/keystone/2026-10-18-x/plan.md';
const VERIFY = 'docs/keystone/2026-10-18-x/verify.md';
const INTENT = 'docs/keystone/2026-10-18-x/intent.md';
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });

function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
const plan = (tasks, rows) => `# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\nAuthority: intent.md — \`${INTENT}\` (accepted)\nSettings: tests — yes\n\n` +
  `## Requirements Reconciliation\n| Decision | Source | Verification evidence |\n|---|---|---|\n${rows}\n## Tasks\n${tasks}`;
const T1 = '- [x] 1. a — files: src/a.js — check: npm test\n  - Source: intent — I-1\n';
const T2 = '- [x] 2. b — files: src/b.js — check: npm test\n  - Source: intent — I-2\n';
const R1 = '| x | intent — I-1 | t |\n';
const R2 = '| y | intent — I-2 | t |\n';
const vmd = (base, report) =>
  `# Verify: x\nDate: 2026-11-01 · Base: ${base.slice(0, 7)} · Verdict: PASS\n\n## Checks\n- base: ${base.slice(0, 7)}\n\n## Carried\n\n## Report\nKeystone verify: ${PLAN} · base ${base.slice(0, 7)}\n${report}\n\n## Verdict\nPASS\n`;
const ids = (out, label) => (out.find((l) => l.startsWith(`${label}: `)) || '').slice(label.length + 2).split(', ');

test('review 1: a task, row or I-n deleted between runs is neither carried nor judged', () => {
  const root = mkdtempSync(join(tmpdir(), 'ks-review-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', [INTENT]: '- I-1 a\n- I-2 b\n' }, 'start');
  commit(root, { [PLAN]: plan(T1 + T2, R1 + R2) }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
  const base = findBase(root, PLAN).base;
  const all = ['Task 1', 'Task 2', 'Row 1', 'Row 2', 'I-1', 'I-2'];
  commit(root, { [VERIFY]: vmd(base, all.map((id) => `- ${id} — ok — src/a.js:1 does it`).join('\n')) }, 'docs(verify)');
  commit(root, { [PLAN]: plan(T1, R1), [INTENT]: '- I-1 a\n' }, 'docs(plan): drop task 2, row 2, I-2');
  const out = delta(root, PLAN, base, { files: ['src/a.js', 'src/b.js'] });
  const seen = [...ids(out, 'carried ids'), ...ids(out, 'judge')];
  for (const gone of ['Task 2', 'Row 2', 'I-2']) assert.ok(!seen.includes(gone), `${gone} left the plan text: ${out.join(' | ')}`);
  for (const kept of ['Task 1', 'Row 1', 'I-1']) assert.ok(seen.includes(kept), `${kept} still in the plan`);
});

test('review 3: the unchanged-code rule reads the verdict of the run delta names, a stop run does not count', () => {
  const skill = readFileSync(join(ROOT, 'skills/verify/SKILL.md'), 'utf8');
  const loop = readFileSync(join(ROOT, 'skills/verify/references/LOOP.md'), 'utf8');
  assert.doesNotMatch(skill, /last verdict FAIL and `delta: since/);
  assert.match(skill, /0 files changed`, run <sha7> FAIL/);
  const sec = loop.slice(loop.indexOf('## Code unchanged since the last FAIL'), loop.indexOf('## Trend'));
  assert.match(sec, /run `<sha7>`/);
  assert.match(sec, /`not judged` stop\s+run/);
});

test('review 10: the real-verify.md fixture has no client domain or local path', () => {
  const fx = readFileSync(join(ROOT, 'test/fixtures/m37-verify-lines.md'), 'utf8');
  // a generic rule, so this public test names no client domain itself: only *.example hosts, no user home path
  const hosts = fx.match(/\b[\w-]+(?:\.[\w-]+)*\.(?:com|co|ua|net|org|io|app|dev|xyz)\b/gi) || [];
  assert.deepEqual(hosts, [], `real-looking domains in the fixture: ${hosts.join(', ')}`);
  assert.doesNotMatch(fx, /[A-Z]:[\\/]Users[\\/]/i);
});
