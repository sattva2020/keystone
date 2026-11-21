// verify-stage-order, Design §10–§11: `open findings:` on the `nothing to judge` stop (no sweep-only run: a due sweep
// goes with the next judged run, after a code fix or on --full), parked advisory and accepted rows (Task 11).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collect, findBase, git, ceiling } from '../skills/verify/scripts/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'docs/keystone/2026-11-09-x';
const PLAN = `${DIR}/plan.md`;
const VERIFY = `${DIR}/verify.md`;
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows locks */ } });

function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
  return git(root, 'rev-parse', 'HEAD').slice(0, 7);
}
const TASKS = '- [ ] 1. a — files: src/a.js — check: npm test\n- [ ] 2. b — files: src/b.js — check: npm test\n';
function setup({ level = 'L' } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ks-fixes-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', [`${DIR}/intent.md`]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: `# Plan: x\n\nLevel: ${level} · Mode: feature · Status: implementing\nAuthority: intent.md — \`${DIR}/intent.md\` (accepted)\nSettings: tests — yes\n\n## Tasks\n${TASKS}` }, 'docs(plan)');
  commit(root, { 'src/a.js': '1\n2\n3\n4\n5\n', 'src/b.js': '1', 'src/db.js': '1' }, 'feat: a b');
  return { root, base: findBase(root, PLAN).base.slice(0, 7) };
}
// a verify.md; `sweep` adds a ## Sweep section, `extra` goes after ## Verdict
const vmd = (base, rows, { sweep = '', verdict = 'FAIL', extra = '', carried = 'none' } = {}) =>
  `# Verify: x\nDate: 2026-11-15 · Base: ${base} · Verdict: ${verdict}\n\n## Checks\n- base: ${base}\n\n## Carried\n${carried}\n## Report\nKeystone verify: ${PLAN} · base ${base}\n${rows}\n\n${sweep ? `## Sweep\n${sweep}\n\n` : ''}## Verdict\n${verdict}\n${extra}`;
const out = (root, o) => collect(root, PLAN, undefined, o);
const lineOf = (o, re) => o.split('\n').find((l) => re.test(l));
const OK = '- Task 1 — ok — src/a.js:1\n- Task 2 — ok — src/b.js:1';
const DONE = 'Sweep: done — review pass, security pass\nScope: abc1234..HEAD\nSecurity gate: pass';
const text = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');

// --- `open findings:` on the stop (I-5, I-11) ---

test('I-11 nothing changed and sweep due: nothing to judge, Next --full', () => {
  const { root, base } = setup();
  const v = commit(root, { [VERIFY]: vmd(base, OK, { sweep: 'Sweep: not run — review: timeout twice', verdict: 'PASS' }) }, 'verify 1');
  const o = out(root);
  assert.equal(lineOf(o, /^verifier: not called/), `verifier: not called — nothing to judge since ${v}; waiting for you: none`);
  assert.match(o, /^sweep: due — not done yet \(Sweep: not run — review: timeout twice\)$/m);
  assert.match(o, /^open findings: none$/m);
});

test('open findings win over --full', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, `${OK}\nUnrequested: src/x.js`, { sweep: 'Sweep: not run — review: timeout twice' }) }, 'verify 1');
  const o = out(root);
  assert.match(o, /^open findings: Unrequested: src\/x\.js$/m);
  assert.match(o, /^sweep: due — not done yet \(Sweep: not run — review: timeout twice\)$/m);
  const loop = text('skills/verify/references/LOOP.md');
  const sec = loop.slice(loop.indexOf('## Nothing to judge'), loop.indexOf('\n## ', loop.indexOf('## Nothing to judge') + 3));
  assert.ok(sec.includes('open findings: none') && sec.includes('--full'), 'LOOP.md Nothing to judge: --full only with open findings: none');
});

test('a review critical of the last run on an unchanged plan: nothing to judge', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, OK, { sweep: `${DONE}\nreview 1 — critical — src/a.js:3 — drops a row Repro: r Fix: f` }) }, 'verify 1');
  const o = out(root);
  assert.match(lineOf(o, /^verifier: not called/), /— nothing to judge since /);
  assert.match(o, /^open findings: review src\/a\.js:3$/m);
});

test('nothing to judge stays when sweep is done', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — BLOCKED — BLOCKED: psql needs the DB\n- Task 2 — ok — src/b.js:1', { sweep: DONE, verdict: 'PASS-UNPROVEN' }) }, 'verify 1');
  const o = out(root);
  assert.match(lineOf(o, /^verifier: not called/), /— nothing to judge since [0-9a-f]{7}; waiting for you: Task 1$/);
  assert.match(o, /^open findings: none$/m);
});

test('I-5 open findings line on the stop', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, `${OK}\nUnrequested: src/x.js`) }, 'verify 1');
  const o = out(root);
  assert.match(lineOf(o, /^verifier: not called/), /nothing to judge/);
  assert.match(o, /^open findings: Unrequested: src\/x\.js$/m);
});

test('open findings lists a gate fail', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, `${OK}\nArchitecture gate: fail — src/a.js:2 imports the db layer`) }, 'verify 1');
  assert.match(out(root), /^open findings: Architecture gate: fail$/m);
});

test('no open findings line without a stop', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, OK, { verdict: 'PASS' }) }, 'verify 1');
  commit(root, { 'src/a.js': 'changed' }, 'fix: a');
  assert.doesNotMatch(out(root), /^open findings:/m);
});

test('LOOP.md and SWEEP.md have no sweep-only run', () => {
  const loop = text('skills/verify/references/LOOP.md');
  assert.ok(loop.includes('open findings:'));
  assert.ok(!/sweep only/i.test(loop), 'LOOP.md has no Sweep only section');
  assert.ok(!/sweep only/i.test(text('skills/verify/references/SWEEP.md')));
  assert.ok(text('skills/verify/references/CHECKS.md').includes('open findings:'));
});

// --- Task 11: parked rows — advisory and accepted rows are carried without the judge (I-3, I-7, I-13) ---

const ADV = '- Task 1 — wrong — src/a.js:1 drops a row Repro: r\n- Task 2 — ok — src/b.js:1';
function advisory(rows = ADV) {
  const s = setup();
  commit(s.root, { [VERIFY]: vmd(s.base, OK, { verdict: 'PASS' }) }, 'verify 1');
  s.v = commit(s.root, { [VERIFY]: vmd(s.base, rows, { verdict: 'PASS-UNPROVEN', extra: 'Late: Task 1 (advisory)\n' }) }, 'verify 2');
  return s;
}

test('I-3 advisory row is parked while untouched', () => {
  const { root, v } = advisory();
  commit(root, { 'README.md': 'y' }, 'docs: readme');
  let o = out(root);
  assert.match(o, new RegExp(`^carried: Task 1 — advisory — carried from verify ${v} — `, 'm'));
  assert.doesNotMatch(lineOf(o, /^judge:/), /Task 1/);
  assert.match(lineOf(o, /^carried ids:/), /Task 1/);
  commit(root, { 'src/a.js': 'changed' }, 'fix: a');
  o = out(root);
  assert.match(lineOf(o, /^judge:/), /Task 1/, 'its file changed: judged again');
});

test('I-3 advisory row re-judged via a chain stays in late watch', () => {
  const { root } = advisory('- Task 1 — wrong — see Task 2 Repro: r\n- Task 2 — ok — src/b.js:1');
  commit(root, { 'src/b.js': 'changed' }, 'fix: b');
  const o = out(root);
  assert.match(lineOf(o, /^judge:/), /Task 1/);
  assert.match(lineOf(o, /^late watch:/), /Task 1/);
});

test('parked advisory row ignores a wrong neighbour', () => {
  const { root } = advisory('- Task 1 — wrong — src/a.js:1 drops a row Repro: r\n- Task 2 — wrong — src/a.js:5 other Repro: r');
  commit(root, { 'README.md': 'y' }, 'docs: readme');
  const o = out(root);
  assert.match(o, /^carried: Task 1 — advisory — /m);
  assert.match(lineOf(o, /^judge:/), /Task 2/);
});

const WRONG = (i) => `- Task 1 — wrong — src/a.js:1 v${i} Repro: r\n- Task 2 — ok — src/b.js:1`;
function acceptedRow() {
  const s = setup();
  for (let i = 1; i <= 3; i++) commit(s.root, { [VERIFY]: vmd(s.base, WRONG(i)) }, `verify ${i}`);
  s.v = git(s.root, 'rev-parse', 'HEAD').slice(0, 7);
  commit(s.root, { [VERIFY]: vmd(s.base, WRONG(3), { extra: 'Accepted finding by t 2026-11-15: Task 1\n' }) }, 'docs(verify): decide x');
  return s;
}

test('I-7 accepted row is parked', () => {
  const { root, v } = acceptedRow();
  commit(root, { 'README.md': 'y' }, 'docs: readme');
  const o = out(root);
  assert.match(o, new RegExp(`^carried: Task 1 — accepted — carried from verify ${v} — `, 'm'));
  assert.match(o, /^accepted findings: Task 1$/m);
  assert.doesNotMatch(o, /^verifier: not called — ceiling/m);
});

test('I-7 an accepted row judged again is a finding', () => {
  const { root, base } = acceptedRow();
  commit(root, { 'src/a.js': 'changed' }, 'fix: a');
  assert.match(lineOf(out(root), /^judge:/), /Task 1/, 'its file changed: the accept no longer parks it');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — src/a.js:2 a new defect Repro: r\n- Task 2 — ok — src/b.js:1') }, 'verify 4');
  assert.ok(ceiling(root, PLAN).open >= 1, 'the new wrong of the accepted row is open');
  commit(root, { 'README.md': 'z' }, 'docs: readme');
  const o = out(root);
  assert.match(o, /^accepted findings: none$/m, 'accepted findings lists a row id only while parked');
  assert.match(o, /^verifier: not called — ceiling: 4 judged FAIL runs, last [0-9a-f]{7}; open: 1$/m, 'the open re-judged row keeps the ceiling');
});

test('Step 4 and fix skip an accepted row only while it is parked', () => {
  for (const f of ['skills/verify/SKILL.md', 'skills/fix/SKILL.md']) assert.ok(text(f).includes('carried as `accepted`'), f);
});
