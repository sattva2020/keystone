// verify-stage-order, Design §11 (D28): the findings of a sweep — a `review <n> — critical` line and a `Security gate:
// fail` — belong to the run whose `## Sweep` has them. `/sattva:fix verify` takes them from that `verify.md`; a later
// judged run without `## Sweep` does not carry them, and collect prints no `sweep open:` line.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collect, findBase, git, ceiling, trend } from '../skills/verify/scripts/collect.mjs';

const DIR = 'docs/sattva/2026-11-09-x';
const PLAN = `${DIR}/plan.md`;
const VERIFY = `${DIR}/verify.md`;
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows locks */ } });
function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
function setup() {
  const root = mkdtempSync(join(tmpdir(), 'ks-carry-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', [`${DIR}/intent.md`]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: `# Plan: x\n\nLevel: L · Mode: feature · Status: implementing\nAuthority: intent.md — \`${DIR}/intent.md\` (accepted)\nSettings: tests — yes\n\n## Tasks\n- [ ] 1. a — files: src/a.js — check: npm test\n` }, 'docs(plan)');
  commit(root, { 'src/a.js': '1' }, 'feat: a');
  return { root, base: findBase(root, PLAN).base.slice(0, 7) };
}
// a verify.md; `sweep` null → no `## Sweep` section
const vmd = (base, report, sweep, { verdict = 'FAIL', extra = '' } = {}) => `# Verify: x\nDate: 2026-11-09 · Base: ${base} · Verdict: ${verdict}\n\n## Checks\n- base: ${base}\n\n## Carried\nnone\n## Report\n${report}\n${sweep == null ? '' : `\n## Sweep\n${sweep}\n`}\n## Verdict\n${verdict}\n${extra}`;
const RUN1 = 'Sweep: done — review fail, security pass\nScope: abc1234..HEAD\nreview 1 — critical — src/a.js:3 — drops a row Repro: r Fix: f\nSecurity gate: pass';
const SEC_FAIL = 'Sweep: done — review pass, security fail\nScope: abc1234..HEAD\nSecurity gate: fail — unignored critical/high: S-1\n- S-1 [critical] injection — src/a.js:2';
const noSweepOpen = (o) => assert.doesNotMatch(o, /^sweep open:/m);

test('I-17 a review critical is not carried to the next judged run', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, 'Sattva verify: x\n- Task 1 — ok — a', RUN1) }, 'verify 1');
  commit(root, { 'src/a.js': '2' }, 'fix: a');
  commit(root, { [VERIFY]: vmd(base, 'Sattva verify: x\n- Task 1 — ok — b', null, { verdict: 'PASS' }) }, 'verify 2');
  assert.match(trend(root, PLAN).join('\n'), /^run 2 · .* · PASS · open 0/m);
  assert.equal(ceiling(root, PLAN).open, 0);
});

test('I-17 no sweep open line', () => {
  const { root, base } = setup();
  noSweepOpen(collect(root, PLAN)); // first verify
  commit(root, { [VERIFY]: vmd(base, 'Sattva verify: x\n- Task 1 — ok — a', RUN1) }, 'verify 1');
  noSweepOpen(collect(root, PLAN)); // nothing to judge
  commit(root, { 'src/a.js': '2' }, 'fix: a');
  noSweepOpen(collect(root, PLAN)); // delta
  commit(root, { 'package.json': JSON.stringify({ scripts: { build: 'node -e "process.exit(1)"' } }) }, 'break the build');
  noSweepOpen(collect(root, PLAN)); // failed build
});

test('I-13 a sweep security fail fails its own run and counts once', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, 'Sattva verify: x\n- Task 1 — ok — a', SEC_FAIL) }, 'verify 1');
  const o = collect(root, PLAN);
  const line = o.split('\n').find((l) => l.startsWith('open findings:'));
  assert.equal(line, 'open findings: Security gate: fail');
  const s = setup();
  for (const n of [1, 2, 3]) commit(s.root, { [VERIFY]: vmd(s.base, `Sattva verify: x\n- Task 1 — ok — ${n}`, SEC_FAIL) }, `verify ${n}`);
  assert.match(collect(s.root, PLAN), /^verifier: not called — ceiling: 3 judged FAIL runs, last [0-9a-f]{7}; open: 1$/m);
});

// fix verify (Task 3): the failed-build stop branch prints the same `sweep:` line the normal branch would — `--full` included.
test('stop on a failed build: --full still gives sweep: due — --full', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, 'Sattva verify: x\n- Task 1 — ok — a', RUN1) }, 'verify 1');
  commit(root, { 'package.json': JSON.stringify({ scripts: { build: 'node -e "process.exit(1)"' } }) }, 'break the build');
  const o = collect(root, PLAN, undefined, { full: true });
  assert.match(o, /^verifier: not called — build failed$/m);
  assert.match(o, /^sweep: due — --full$/m);
});

test("I-17 fix takes sweep findings from that run's verify.md", () => {
  const fix = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'skills/fix/SKILL.md'), 'utf8');
  assert.ok(!fix.includes('sweep open'));
  assert.ok(fix.includes('## Sweep'));
});
