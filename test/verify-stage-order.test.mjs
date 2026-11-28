// verify-stage-order: the ceiling after 3 judged FAILs, accepted findings, the late rule, carried BLOCKED,
// "nothing to judge", the sweep lines — fixtures for collect.mjs and text tests for the skill files that read them.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { collect, findBase, git, trend, findings, ceiling, gateFails } from '../skills/verify/scripts/collect.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = 'docs/sattva/2026-11-09-x';
const PLAN = `${DIR}/plan.md`;
const VERIFY = `${DIR}/verify.md`;
const INTENT = `${DIR}/intent.md`;
const MARK = '--- record only (not for the verifier) ---';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
  return git(root, 'rev-parse', 'HEAD');
}
const TASKS = '- [ ] 1. a — files: src/a.js — check: npm test\n- [ ] 2. b — files: src/b.js — check: npm test\n';
const planText = ({ level = 'L', settings = 'Settings: tests — yes', tasks = TASKS, recon = '' } = {}) =>
  `# Plan: x\n\nLevel: ${level} · Mode: feature · Status: implementing\nAuthority: intent.md — \`${INTENT}\` (accepted)\n${settings}\n\n${recon}## Tasks\n${tasks}`;
const vmd = (base, report, { checks = '', carried = '', verdict = 'FAIL', sweep = '', late = '' } = {}) =>
  `# Verify: x\nDate: 2026-11-09 · Base: ${base.slice(0, 7)} · Verdict: ${verdict}\n\n## Checks\n- base: ${base.slice(0, 7)}\n${checks}\n## Carried\n${carried}\n## Report\nSattva verify: ${PLAN} · base ${base.slice(0, 7)}\n${report}\n\n${sweep ? `## Sweep\n${sweep}\n\n` : ''}## Verdict\n${verdict}\n${late}`;

function setup(opts = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ks-stage-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', [INTENT]: 'I-1 a\n' }, 'start');
  commit(root, { [PLAN]: planText(opts) }, 'docs(plan)');
  commit(root, { 'src/a.js': '1', 'src/b.js': '1' }, 'feat: a b');
  return { root, base: findBase(root, PLAN).base };
}
function fails(n, opts = {}) {
  const s = setup(opts);
  s.shas = [];
  for (let i = 1; i <= n; i++) s.shas.push(commit(s.root, { [VERIFY]: vmd(s.base, `- Task 1 — wrong — a${i}. Repro: x\n- Task 2 — ok — src/b.js:1\n`) }, `verify ${i}`));
  return s;
}
const out = (root, o) => collect(root, PLAN, undefined, o);
const CEIL = /^verifier: not called — ceiling: (\d+) judged FAIL runs, last [0-9a-f]{7}; open: (\d+)$/m;

// --- Task 1: the ceiling (I-7), accepted findings, the late rule (I-3) ---

test('I-7 ceiling after the third judged FAIL', () => {
  assert.doesNotMatch(out(fails(2).root), CEIL, 'two judged FAILs: the verifier runs');
  const { root, shas } = fails(3);
  const o = out(root);
  const m = o.match(CEIL);
  assert.ok(m, o);
  assert.deepEqual([m[1], m[2]], ['3', '1']);
  assert.match(o, new RegExp(`last ${shas[2].slice(0, 7)};`));
  const ls = o.split('\n');
  assert.equal(ls[ls.findIndex((l) => CEIL.test(l)) + 1], MARK, 'the marker follows the stop line');
  assert.ok(!ls.some((l) => l.startsWith('judge:')), 'no judge line on the ceiling');
  assert.ok(trend(root, PLAN).includes('ceiling: reached — 3 judged FAIL runs'));
  assert.ok(!trend(fails(2).root, PLAN).some((l) => l.startsWith('ceiling:')));
});

test('I-7 build-failed run and accept commit do not count', () => {
  const { root, base, shas } = fails(2);
  const stop = vmd(base, '', { checks: '- build: npm run build → fail\n' }).replace(/(## Report\n)Sattva verify: .*\n/, '$1not judged — build failed\n');
  commit(root, { [VERIFY]: stop }, 'verify 3: build failed');
  commit(root, { [VERIFY]: `${stop}Accepted unproven by t 2026-11-09: Task 2\n` }, 'docs(verify): accept');
  assert.equal(ceiling(root, PLAN).f, 2);
  const o = out(root);
  assert.doesNotMatch(o, CEIL);
  assert.match(o, new RegExp(`^delta: since ${shas[1].slice(0, 7)}`, 'm'));
});

test('I-7 plan edit lifts the ceiling', () => {
  const { root } = fails(3);
  commit(root, { [PLAN]: planText({ tasks: TASKS.replace('1. a —', '1. a, reworded —') }) }, 'docs(plan): task 1');
  const o = out(root);
  assert.doesNotMatch(o, CEIL);
  assert.match(o, /^delta: since [0-9a-f]{7}/m);
  assert.match(o, /^edited: Task 1 \(task text\)$/m);
});

test('I-7 --full lifts the ceiling', () => {
  const { root } = fails(3);
  const o = out(root, { full: true });
  assert.doesNotMatch(o, CEIL);
  assert.match(o, /^delta: full — --full$/m);
});

test('I-7 header edit plus a merge lifts the ceiling', () => {
  const { root } = fails(3);
  commit(root, { [PLAN]: planText({ settings: 'Settings: tests — yes · logging — minimal' }) }, 'docs(plan): settings');
  git(root, 'checkout', '-q', '-b', 'side');
  commit(root, { 'src/c.js': '1' }, 'side');
  git(root, 'checkout', '-q', 'main');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-ff', '-m', 'merge side', 'side');
  assert.equal(ceiling(root, PLAN).reached, false);
  assert.doesNotMatch(out(root), CEIL);
});

test('I-7 all findings accepted lifts the ceiling', () => {
  const { root, base } = fails(3);
  commit(root, { [VERIFY]: `${vmd(base, '- Task 1 — wrong — a3. Repro: x\n- Task 2 — ok — src/b.js:1\n')}Accepted finding by t 2026-11-09: Task 1\n` }, 'docs(verify): decide x');
  const c = ceiling(root, PLAN);
  assert.equal(c.f, 3, 'the decide commit is not a run');
  assert.equal(c.reached, false);
  const o = out(root);
  assert.doesNotMatch(o, CEIL);
  assert.match(o, /^accepted findings: Task 1$/m);
  assert.match(o, /^accepted violations: none$/m);
  const ls = o.split('\n');
  assert.ok(ls.indexOf('accepted findings: Task 1') === ls.findIndex((l) => l.startsWith('accepted violations:')) + 1);
});

test('I-7 a gate failure keeps the ceiling open even without row findings', () => {
  const { root, base } = setup();
  for (let i = 1; i <= 3; i++) commit(root, { [VERIFY]: vmd(base, `- Task 1 — ok — a${i}\nSecurity gate: fail — S-1\n`) }, `verify ${i}`);
  assert.match(out(root), CEIL);
});

test('class: a gate quoted in a row\'s evidence is not a failed gate', () => {
  assert.deepEqual(gateFails('- Task 2 — ok — the test prints `open findings: Security gate: fail` once\nSecurity gate: n/a\nSettings: ok\n'), []);
  assert.deepEqual(gateFails('- Row 1 — ok — says `Settings: violated` and `Architecture gate: fail`\n'), []);
  assert.deepEqual(gateFails('Settings: violated — no tests\n- Architecture gate: fail — src/a.js:2\nSecurity gate: fail — S-1\n'),
    ['Settings: violated', 'Architecture gate: fail', 'Security gate: fail']);
  const { root, base } = setup();
  const body = (i) => `- Task 1 — wrong — a${i}. Repro: x\n- Task 2 — ok — the test prints \`open findings: Security gate: fail\`\nSecurity gate: n/a\n`;
  for (let i = 1; i <= 3; i++) commit(root, { [VERIFY]: vmd(base, body(i)) }, `verify ${i}`);
  commit(root, { [VERIFY]: `${vmd(base, body(3))}Accepted finding by t 2026-11-09: Task 1\n` }, 'docs(verify): decide x');
  const c = ceiling(root, PLAN);
  assert.equal(c.open, 0);
  assert.equal(c.reached, false);
});

test('I-3 late rule on after first PASS', () => {
  const { root, base } = setup();
  assert.match(out(root), /^late rule: off — no PASS yet$/m, 'first run');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\n') }, 'verify 1');
  assert.match(out(root), /^late rule: off — no PASS yet$/m);
  const pass = commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — a\n', { verdict: 'PASS' }) }, 'verify 2');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — b. Repro: y\n') }, 'verify 3');
  const o = out(root);
  assert.match(o, new RegExp(`^late rule: on — first PASS in ${pass.slice(0, 7)}$`, 'm'));
  assert.match(out(root, { full: true }), /^late rule: off — --full$/m);
  const ls = o.split('\n');
  assert.ok(ls.findIndex((l) => l.startsWith('late rule:')) === ls.findIndex((l) => l.startsWith('accepted findings:')) + 1);
});

test('I-3 advisory late ids are not findings', () => {
  const t = (late) => `## Report\n- Task 1 — wrong — a. Repro: x\n- Row 2 — missing — b\n\n## Verdict\nFAIL\n${late}\n`;
  const adv = findings(t('Late: Task 1 (advisory), Row 2 (critical)'));
  assert.ok(!adv.has('Task 1'));
  assert.ok(adv.has('Row 2'));
  assert.ok(findings(t('Late: Task 1 (critical)')).has('Task 1'));
  assert.ok(findings(t('Late: Task 1')).has('Task 1'), 'no mark: still a finding');
});

test('I-12 legacy plan: ceiling counts old runs', () => {
  const { root } = fails(3, { level: 'L' });
  assert.match(out(root), CEIL);
});

test('I-8 M plan: ceiling applies', () => {
  const { root } = fails(3, { level: 'M' });
  assert.match(out(root), CEIL);
});

// --- Task 2: carried BLOCKED (I-5), nothing to judge, --full (I-14) ---

const RECON = (cell = 'psql check on the DB') =>
  `## Requirements Reconciliation\n| Decision | Source | Verification evidence |\n|---|---|---|\n| x | intent — I-1 | ${cell} |\n\n`;
const BLK = '- Task 1 — ok — src/a.js:1\n- Task 2 — ok — src/b.js:1\n- Row 1 — BLOCKED — BLOCKED: psql is not installed\n- I-1 — ok — fine\n';
function blocked(report = BLK, opts = {}) {
  const s = setup({ recon: RECON(), ...opts });
  s.v = commit(s.root, { [VERIFY]: vmd(s.base, report, { verdict: 'PASS-UNPROVEN' }) }, 'verify 1');
  return s;
}
const lineOf = (o, re) => o.split('\n').find((l) => re.test(l)) || '';

test('I-5 BLOCKED carried while untouched', () => {
  const { root, v } = blocked();
  commit(root, { 'src/b.js': '2' }, 'fix: b');
  const o = out(root);
  assert.match(o, new RegExp(`^carried: Row 1 — BLOCKED — waiting for you since verify ${v.slice(0, 7)} — BLOCKED: psql is not installed$`, 'm'));
  assert.match(o, /^waiting: Row 1$/m);
  assert.match(o, /^judge: Task 2$/m);
  assert.match(lineOf(o, /^carried ids:/), /Row 1/);
  assert.doesNotMatch(o, /nothing to judge/, 'a file changed: the verifier runs');
  const ls = o.split('\n');
  assert.ok(ls.indexOf('waiting: Row 1') === ls.findIndex((l) => l.startsWith('late rule:')) + 1);
  // the next run keeps it from ## Carried, with the sha of the run that judged it
  commit(root, { [VERIFY]: vmd(findBase(root, PLAN).base, '- Task 2 — ok — src/b.js:2\n', {
    verdict: 'PASS-UNPROVEN', carried: lineOf(o, /^carried: Row 1/) + '\n' }) }, 'verify 2');
  assert.match(out(root), new RegExp(`^carried: Row 1 — BLOCKED — waiting for you since verify ${v.slice(0, 7)} — `, 'm'));
});

test('I-5 evidence cell edit sends BLOCKED to judge', () => {
  const { root } = blocked();
  commit(root, { [PLAN]: planText({ recon: RECON('psql check — now in CI') }) }, 'docs(plan): row 1 cell');
  const o = out(root);
  assert.match(lineOf(o, /^judge:/), /Row 1/);
  assert.match(o, /^waiting: none$/m);
});

test('I-5 task BLOCKED tail edit sends it to judge', () => {
  const tasks = (tail) => TASKS.replace('check: npm test\n', `check: npm test BLOCKED: ${tail}\n`);
  const s = setup({ tasks: tasks('needs the DB') });
  commit(s.root, { [VERIFY]: vmd(s.base, '- Task 1 — BLOCKED — BLOCKED: needs the DB\n- Task 2 — ok — src/b.js:1\n', { verdict: 'PASS-UNPROVEN' }) }, 'verify 1');
  assert.match(out(s.root), /^waiting: Task 1$/m, 'tail unchanged: carried');
  commit(s.root, { [PLAN]: planText({ tasks: tasks('the DB is up — run psql') }) }, 'docs(plan): task 1 tail');
  const o = out(s.root);
  assert.match(lineOf(o, /^judge:/), /Task 1/);
  assert.doesNotMatch(lineOf(o, /^edited:/), /Task 1/, 'the tail is not a task text edit');
});

test('I-5 nothing to judge stops the verifier', () => {
  const { root, v } = blocked();
  const o = out(root);
  const ls = o.split('\n');
  const i = ls.findIndex((l) => l.startsWith('verifier: not called — nothing to judge'));
  assert.equal(ls[i], `verifier: not called — nothing to judge since ${v.slice(0, 7)}; waiting for you: Row 1`);
  assert.match(ls[i + 1], /^delta: since [0-9a-f]{7} — 0 files changed/);
  assert.match(o, /^judge: none$/m);
  assert.match(o, /^carried: Row 1 — BLOCKED — waiting for you/m);
});

test('I-14 --full: full judge, no BLOCKED carry', () => {
  const { root } = blocked();
  const o = out(root, { full: true });
  assert.match(o, /^judge: all rows \(full run\)$/m);
  assert.match(o, /^carried ids: none$/m);
  assert.match(o, /^waiting: none$/m);
  assert.doesNotMatch(o, /nothing to judge/);
});

test('I-5 not proven is not carried', () => {
  const { root } = blocked(BLK.replace('- Task 2 — ok — src/b.js:1', '- Task 2 — not proven — no test'));
  const o = out(root);
  assert.match(lineOf(o, /^judge:/), /Task 2/);
  assert.match(o, /^waiting: Row 1$/m);
  assert.doesNotMatch(o, /nothing to judge/);
});

// --- Task 3: sweep: and review keys (no sweep open:, Design §11) (I-1, I-2, I-6, I-8, I-10, I-11, I-12, I-14) ---

const sweepOf = (o) => lineOf(o, /^sweep: /);
const DONE = 'Sweep: done — review pass, security pass\nScope: abc1234..HEAD\nSecurity gate: pass';

test('I-1 sweep due on the first L run', () => {
  const o = out(setup().root);
  assert.equal(sweepOf(o), 'sweep: due — first verify');
  assert.doesNotMatch(o, /^sweep open:/m);
  const ls = o.split('\n');
  assert.ok(ls.findIndex((l) => l.startsWith('sweep: ')) === ls.indexOf('waiting: none') + 1);
  assert.ok(ls.findIndex((l) => l.startsWith('sweep: ')) > ls.indexOf(MARK), 'under the marker: the verifier does not see it');
});

test('I-8 M plan: sweep n/a, ceiling and BLOCKED carry apply', () => {
  assert.equal(sweepOf(out(setup({ level: 'M' }).root)), 'sweep: n/a — level M');
  const { root } = blocked(BLK, { level: 'M' });
  assert.match(out(root), /^waiting: Row 1$/m);
});

test('I-12 legacy plan: sweep n/a, ceiling counts old runs', () => {
  const { root, base } = fails(2);
  assert.equal(sweepOf(out(root)), 'sweep: n/a — runs before the sweep');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a9. Repro: x\n', {
    checks: '- sweep: n/a — runs before the sweep\n', sweep: 'Sweep: none — sweep: n/a — runs before the sweep' }) }, 'verify 3');
  const o = out(root);
  assert.equal(sweepOf(o), 'sweep: n/a — runs before the sweep');
  assert.match(o, CEIL);
});

test('I-10 build failed: sweep stays due', () => {
  const { root, base } = setup();
  const stop = vmd(base, '', { checks: '- build: npm run build → fail\n- sweep: due — first verify\n', sweep: 'Sweep: not run — build failed' })
    .replace(/(## Report\n)Sattva verify: .*\n/, '$1not judged — build failed\n');
  commit(root, { [VERIFY]: stop }, 'verify 1: build failed');
  assert.equal(sweepOf(out(root)), 'sweep: due — not done yet (Sweep: not run — build failed)');
  // the failed-build branch prints the sweep line right after the marker
  commit(root, { 'package.json': JSON.stringify({ scripts: { build: 'node -e "process.exit(1)"' } }) }, 'break the build');
  const ls = out(root).split('\n');
  const i = ls.indexOf('verifier: not called — build failed');
  assert.ok(i >= 0, ls.join('\n'));
  assert.deepEqual(ls.slice(i + 1, i + 3), [MARK, 'sweep: due — not done yet (Sweep: not run — build failed)']);
  assert.ok(!ls.some((l) => l.startsWith('sweep open:')));
});

test('I-11 Sweep: not run keeps sweep due', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — src/a.js:1\n', { sweep: 'Sweep: not run — review: timeout twice' }) }, 'verify 1');
  assert.equal(sweepOf(out(root)), 'sweep: due — not done yet (Sweep: not run — review: timeout twice)');
});

test('I-6 sweep done stays done', () => {
  const { root, base } = setup();
  const v = commit(root, { [VERIFY]: vmd(base, '- Task 1 — wrong — a. Repro: x\n', { sweep: DONE }) }, 'verify 1');
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — a\n', { verdict: 'PASS', sweep: 'Sweep: none — sweep: done in x' }) }, 'verify 2');
  assert.equal(sweepOf(out(root)), `sweep: done in ${v.slice(0, 7)}`);
});

test('I-6 new task makes sweep due with its files', () => {
  const { root, base } = setup();
  const v = commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — a\n', { verdict: 'PASS', sweep: DONE }) }, 'verify 1');
  commit(root, { [PLAN]: planText({ tasks: `${TASKS}- [ ] 3. c — files: src/c.js — check: npm test\n` }) }, 'docs(plan): task 3');
  assert.equal(sweepOf(out(root)), `sweep: due — tasks added since ${v.slice(0, 7)}: Task 3 — files: src/c.js`);
});

test('I-6 --full makes sweep due', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — a\n', { verdict: 'PASS', sweep: DONE }) }, 'verify 1');
  assert.equal(sweepOf(out(root, { full: true })), 'sweep: due — --full');
  assert.equal(sweepOf(out(setup({ level: 'M' }).root, { full: true })), 'sweep: n/a — level M');
});

test('findings() keys open review critical, not suggestions', () => {
  const t = '## Report\n- Task 1 — ok — a\n\n## Sweep\nSweep: done — review fail, security pass\n'
    + 'review 1 — critical — src/a.js:3 — the save drops the last row Repro: x Fix: y\n'
    + 'Advisory: review 2 — suggestion — src/b.js:4 — a name\n\n## Verdict\nFAIL\n';
  assert.deepEqual([...findings(t)], ['review src/a.js:3']);
  assert.equal(findings(t, new Set(['review src/a.js:3'])).size, 0, 'an accepted finding is not open');
});

test('no sweep open line: criticals stay in their own run', () => {
  const { root, base } = setup();
  commit(root, { [VERIFY]: vmd(base, '- Task 1 — ok — a\n', { sweep: `${DONE}\nreview 1 — critical — src/a.js:3 — x Repro: r Fix: f\nreview 2 — critical — src/b.js:4 — y Repro: r Fix: f` }) }, 'verify 1');
  const o = out(root);
  assert.doesNotMatch(o, /^sweep open:/m);
  assert.match(o, /^open findings: review src\/a\.js:3; review src\/b\.js:4$/m);
});

// --- Text tests: the skill files that read the new lines ---

const text = (f) => readFileSync(join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const hasAll = (f, ...needles) => { const t = text(f); for (const n of needles) assert.ok(t.includes(n), `${f} lacks: ${n}`); };

test('I-3 verifier prints Impact; carried BLOCKED and the sweep gate pass through; strict mode stays', () => {
  hasAll('agents/verifier.md', 'Impact: critical | non-critical', 'in the sweep (not for the verifier)', 'Strict mode wins', '`BLOCKED`\nrows that wait for the human');
  assert.doesNotMatch(text('agents/verifier.md'), /late watch/, 'the verifier does not know which rows are late');
  const out = text('agents/verifier.md').split('## Output')[1];
  assert.match(out, /— missing — .*Impact: critical \| non-critical/);
  assert.match(out, /— wrong — .*Impact: critical \| non-critical/);
});

test('review and security know the sweep call', () => {
  hasAll('skills/review/SKILL.md', '## Called from /sattva:verify (sweep)', 'section: critical|suggestion', 'Do not run the validator');
  const sec = text('skills/security/SKILL.md');
  assert.match(sec.split('## Modes')[1].split('\n## ')[0], /`<plan path> sweep \[files: <a, b>\]`/, 'Modes table');
  assert.match(sec.match(/^argument-hint: .*$/m)[0], /<plan path> sweep \[files: <a, b>\]/);
  hasAll('skills/security/SKILL.md', 'Called from /sattva:verify', 'no menu, no `Next:`');
});

// --- Task 5: SWEEP.md, SKILL.md, CHECKS.md ---

const SW = 'skills/verify/references/SWEEP.md';
const SK = 'skills/verify/SKILL.md';

test('I-1 SWEEP.md launches verifier and review finder in one message', () => {
  assert.match(text(SW), /^<!-- original Sattva file \(MIT\) -->/);
  hasAll(SW, 'one message', 'sattva:verifier', 'general-purpose', 'model: "opus"', '/sattva:security <plan path> sweep',
    'sattva:review-validator', '../review/references/VALIDATOR.md', '../review/references/SEVERITY.md', '../review/references/CHECK-MODE.md',
    '## Sweep', 'tasks added');
  hasAll(SK, 'Accepted finding by', 'references/SWEEP.md', 'sweep: due');
});

test('I-2 only critical review items block', () => {
  const sw = text(SW).replace(/\s+/g, ' ');
  assert.match(sw, /review <n> — critical` line[^.]*→ FAIL/);
  assert.match(sw, /a `suggestion` → `Advisory:`/);
  const v = text(SK).replace(/\s+/g, ' ');
  assert.match(v, /open `review <n> — critical` line of `## Sweep` is a FAIL; a `suggestion` is `Advisory`/);
});

test('I-4 no review/security after the sweep', () => {
  const v = text(SK).replace(/\s+/g, ' ');
  assert.match(v, /\*\*Correctness review — only when the plan had no sweep\*\* \(M, a plan before the sweep, `Sweep: not run`\): run the built-in `\/code-review`/);
  assert.match(v, /After a sweep neither runs/);
  assert.match(v, /on L without a sweep `\/sattva:review` first/);
});

test('I-9 Late advisory counter only', () => {
  const report = text(SK).split('## Final report')[1];
  assert.match(report, /^Late advisory: <k>$/m);
  assert.match(report, /^Waiting for you: /m);
  assert.match(report, /^Sweep: /m);
});

test('I-10 build failed: the sweep is not run', () => hasAll(SW, 'not run — <build | test> failed', 'first run whose checks are green'));

test('I-11 one retry, then not run', () => hasAll(SW, 'one retry', 'Sweep: not run', 'sweep: due — not done yet'));

test('I-13 verifier prompt carries nothing from the sweep', () => {
  hasAll(SW, 'in the sweep (not for the verifier)', 'The verifier gets no line of the sweep', "never get the\nverifier's output");
  assert.ok(text(SK).indexOf('references/SWEEP.md') < text(SK).indexOf('subagent_type: "sattva:verifier"'), 'Step 3 routes to SWEEP.md first');
});

test('CHECKS.md describes every new line; no trend menu', () => {
  hasAll('skills/verify/references/CHECKS.md', 'sweep:', 'late rule:', 'waiting:', 'accepted findings:', 'ceiling: reached',
    'verifier: not called — ceiling:', 'verifier: not called — nothing to judge', '— BLOCKED — waiting for you since verify');
  assert.doesNotMatch(text('skills/verify/references/CHECKS.md'), /trend menu: on this FAIL/);
  assert.doesNotMatch(text(SK), /trend menu/);
  assert.ok(Buffer.byteLength(readFileSync(join(ROOT, SK), 'utf8').replace(/\r\n/g, '\n')) <= 22000, 'SKILL.md ≤ 22000 bytes');
});

// --- Task 6: LOOP.md, ACCEPT.md, AFTER-CHOICE.md ---

test('I-3 LOOP.md routes late non-critical to Advisory', () => {
  const loop = text('skills/verify/references/LOOP.md').replace(/\s+/g, ' ');
  for (const s of ['late rule: on', '(advisory)', 'Impact: non-critical', '`<id> (critical)` and the verdict is FAIL', 'Late advisory: <k>'])
    assert.ok(loop.includes(s), s);
});

test('I-5 LOOP.md nothing to judge', () => {
  const loop = text('skills/verify/references/LOOP.md');
  const sec = loop.split('## Nothing to judge')[1].split('\n## ')[0];
  assert.match(sec, /Do not call the verifier; do not rewrite or commit `verify\.md`/);
  assert.match(sec, /Waiting for you:/);
  assert.match(sec, /\/sattva:verify accept <plan>/);
});

test('I-7 ceiling menu and Decide at the ceiling', () => {
  hasAll('skills/verify/references/LOOP.md', 'ceiling: reached', 'Decide each open finding', 'Back to the plan — /sattva:plan <plan>',
    'What lifts it:', '`--full`', 'checked before the rules menu');
  const acc = text('skills/verify/references/ACCEPT.md');
  const dec = acc.split('## Decide at the ceiling')[1].split('\n## ')[0];
  for (const s of ['Accepted finding by', 'deferred', '`Accept` / `Debt` / `Back to the plan`', 'at most 4', 'docs(verify): decide <slug>',
    'not a run', 'cannot be accepted']) assert.ok(dec.includes(s), s);
  hasAll('skills/verify/references/AFTER-CHOICE.md', 'Back to the plan', 'Decide at the ceiling');
  assert.doesNotMatch(text('skills/verify/references/AFTER-CHOICE.md'), /Stop and decide|trend menu/);
});

test('I-4 AFTER-CHOICE.md: no review and security after the sweep', () => {
  const ac = text('skills/verify/references/AFTER-CHOICE.md').replace(/\s+/g, ' ');
  assert.match(ac, /After the sweep — no review and security again \(I-4\)/);
  assert.match(ac, /lose `Review the diff` and `Security check`/);
  assert.match(ac, /manual `\/sattva:review` or `\/sattva:security` stays possible/);
});

// --- Task 8: fix verify ---

test('fix verify takes sweep criticals and stops at the ceiling', () => {
  const fix = text('skills/fix/SKILL.md');
  const mode = fix.split('### Verify findings mode')[1].split('\n### ')[0];
  for (const s of ['ceiling: reached', 'collect.mjs <plan> --history', 'review <n> — critical', '(advisory)', 'accepted findings:',
    'Advisory: review … — suggestion', 'Security gate: fail']) assert.ok(mode.includes(s), s);
  assert.ok(mode.indexOf('ceiling: reached') < mode.indexOf('1. **The list.**'), 'the ceiling is checked before the list');
});
