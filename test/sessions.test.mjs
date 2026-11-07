import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, decide, facts, gitSessions, readPlan, recordSent, readSent } from '../skills/sessions/scripts/triage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills', 'sessions', 'scripts', 'triage.mjs');
const HOOK = join(ROOT, 'hooks', 'sessions-event.mjs');
const P = 'docs/keystone/2026-11-04-x/plan.md';
const TEMPLATE = /^Keystone: осталось — .+\. Сделай этот шаг и закончи ход\.$/;

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
let DATE = null; // committer date for the next commits (an old commit on main for the plan-attribution case)
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: DATE ? { ...process.env, GIT_COMMITTER_DATE: DATE, GIT_AUTHOR_DATE: DATE } : process.env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
function repo() {
  const root = mkdtempSync(join(tmpdir(), 'ks-sessions-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x' }, 'start');
  return root;
}
function put(root, files) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
}
function commit(root, files, msg) {
  put(root, files);
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
const plan = (status, tasks = '- [x] 1. a', release = '') => `# Plan: x\n\nLevel: L · Mode: feature · Status: ${status}\n\n## Tasks\n${tasks}\n${release ? `\n## Release\n${release}\n` : ''}`;

// facts stub: a plan entry in the shape facts() returns
const pl = (o) => ({ name: '2026-11-04-x', path: P, status: 'implementing', open: 0, blocked: null, release: [], verify: false, verdict: null, fixedAfterFail: false, ...o });
const F = (o) => ({ own: true, merged: false, ownCommits: true, dirty: false, files: [], plans: [], ...o });
const S = { sessionId: 'c', title: 'child', branch: 'claude/c', sourceBranch: 'main' };

test('rule table rows 7–21 (decide)', () => {
  const cases = [
    [7, F({ plans: [pl({ verdict: 'FAIL', fixedAfterFail: true, verify: true })] }), { group: 'message', step: `/keystone:verify ${P}` }],
    [8, F({ plans: [pl({ verdict: 'FAIL', verify: true })] }), { group: 'message', step: '/keystone:fix verify' }],
    [9, F({ plans: [pl({ verdict: 'PASS-UNPROVEN', verify: true })] }), { group: 'waiting', reason: 'ждёт accept' }],
    [10, F({ plans: [pl({ blocked: 'needs the DB' })] }), { group: 'waiting', reason: 'BLOCKED: needs the DB' }],
    [11, F({ plans: [pl({ status: 'approved', open: 2 })] }), { group: 'message', step: `/keystone:implement ${P}` }],
    [12, F({ plans: [pl({ open: 0 })] }), { group: 'message', step: `/keystone:verify ${P}` }],
    [13, F({ plans: [pl({ status: 'draft' })] }), { group: 'waiting', reason: 'план ждёт Approve' }],
    [14, F({ merged: true, plans: [pl({ status: 'verified', release: ['R1', 'R2'] })] }), { group: 'waiting', reason: 'релиз: R1, R2 — ваш шаг' }],
    [15, F({ dirty: true, files: ['a.js'] }), { group: 'message', step: 'закоммить изменения' }],
    [16, F({ merged: true, dirty: true, files: ['a.js', 'b.js'] }), { group: 'waiting', reason: 'незакоммиченные файлы: a.js, b.js' }],
    [17, F({ plans: [{ name: 'y', path: 'docs/keystone/y/plan.md', intentOnly: true }] }), { group: 'waiting', reason: 'intent без плана — `/keystone:plan`' }],
    [18, F({ ownCommits: false }), { group: 'archive' }],
    [18, F({ own: false }), { group: 'archive' }],
    // merged implies no own commits (base..branch is empty), as facts() reports it
    [19, F({ merged: true, ownCommits: false, plans: [pl({ status: 'verified' })] }), { group: 'archive' }],
    [19, F({ merged: true, ownCommits: false }), { group: 'archive' }],
    [20, F({}), { group: 'waiting', reason: 'влить claude/c в main — ваш шаг' }],
    [21, F({ plans: [pl({ status: 'abandoned' })] }), { group: 'waiting', reason: 'не распознано: abandoned' }], // abandoned, not merged
    [21, F({ merged: true, ownCommits: false, plans: [pl({ status: 'abandoned' })] }), { group: 'waiting', reason: 'не распознано: abandoned' }],
  ];
  for (const [row, f, want] of cases) {
    const got = decide(S, f);
    for (const [k, v] of Object.entries(want)) assert.equal(got[k], v, `row ${row}: ${k}`);
    if (got.group === 'message') assert.doesNotMatch(got.step, /merge|push|accept|approve/, `row ${row}`); // I-10
  }
});

test('I-9: dirty or nested never archived; shared folder: plan step before archive (I-3, I-4)', () => {
  assert.equal(decide(S, F({ merged: true, dirty: true, files: ['x'] })).group, 'waiting');
  assert.equal(decide(S, F({ own: false, dirty: true, files: ['x'], merged: true })).group, 'waiting'); // shared, dirty
  assert.equal(decide(S, F({ own: false, ownCommits: false })).group, 'archive'); // shared, clean
  assert.deepEqual(decide(S, F({ own: false, ownCommits: false, plans: [pl({ open: 1 })] })).step, `/keystone:implement ${P}`);
  // two plans: an old verified one and a new implementing one → the step of the new one
  assert.equal(decide(S, F({ plans: [pl({ name: 'b', open: 1 }), pl({ name: 'a', status: 'verified' })] })).step, `/keystone:implement ${P}`);
  // all open tasks BLOCKED → no implement message
  assert.equal(readPlan(plan('implementing', '- [ ] 1. a BLOCKED: needs prod')).blocked, 'needs prod');
});

const fam = (o = {}) => [
  { sessionId: 'root', parentSessionId: 'top' },
  { sessionId: 'c', title: 'child', parentSessionId: 'root', state: 'idle', ...o },
];
const stub = (map) => (s) => map[s.sessionId] ?? F({ ownCommits: false });

test('classify: states rows 1–6, family only (I-12), --self checked', () => {
  const run = (o, extra = []) => classify([...fam(o), ...extra], { self: 'root', factsOf: stub({}) });
  assert.equal(run({ state: 'working' }).working, 1);
  assert.equal(run({ state: 'failed' }).waiting[0].reason, 'ход упал или остановлен');
  assert.equal(run({ state: 'stopped' }).waiting[0].reason, 'ход упал или остановлен');
  assert.equal(run({ state: undefined }).waiting[0].reason, 'состояние неизвестно — повторите разбор');
  assert.equal(run({ state: 'waiting' }).waiting[0].reason, 'ждёт вашего ответа'); // before dirty
  assert.equal(run({ state: 'odd' }).waiting[0].reason, 'состояние odd не распознано');
  const r = run({}, [{ sessionId: 'stranger', parentSessionId: 'elsewhere', state: 'idle' }, { sessionId: 'old', parentSessionId: 'root', state: 'idle', isArchived: true }]);
  assert.deepEqual(r.archive.map((a) => a.sessionId), ['c']);
  assert.equal([...r.archive, ...r.message, ...r.waiting].some((x) => x.sessionId === 'stranger' || x.sessionId === 'old'), false);
  assert.throws(() => classify(fam(), { self: 'nobody', factsOf: stub({}) }), /no child sessions/);
  assert.throws(() => classify(fam(), { factsOf: stub({}) }), /--self/);
});

test('classify: grandchild first, live grandchild keeps its parent (I-9, D14)', () => {
  const g = { sessionId: 'g', title: 'grand', parentSessionId: 'c', state: 'idle' };
  const ok = classify([...fam(), g], { self: 'root', factsOf: stub({}) });
  assert.deepEqual(ok.archive.map((a) => a.sessionId), ['g', 'c']);
  const dirty = classify([...fam(), g], { self: 'root', factsOf: stub({ g: F({ merged: true, dirty: true, files: ['x'] }) }) });
  assert.deepEqual(dirty.archive, []);
  assert.equal(dirty.waiting.find((w) => w.sessionId === 'c').reason, 'есть живые дочерние сессии');
});

test('classify: message text is the fixed template; bad plan path and repeats go to waiting (I-5, I-10, I-11)', () => {
  const f = stub({ c: F({ plans: [pl({ open: 1 })] }) });
  const m = classify(fam(), { self: 'root', factsOf: f }).message[0];
  assert.equal(m.text, `Keystone: осталось — /keystone:implement ${P}. Сделай этот шаг и закончи ход.`);
  assert.match(m.text, TEMPLATE);
  const again = classify(fam(), { self: 'root', factsOf: f, sent: { c: { step: m.step } } });
  assert.equal(again.waiting[0].reason, `не продвинулась после «${m.step}»`);
  const bad = classify(fam(), { self: 'root', factsOf: stub({ c: F({ plans: [pl({ open: 1, path: 'docs/keystone/x y/plan.md' })] }) }) });
  assert.equal(bad.waiting[0].reason, 'путь плана не прошёл проверку');
});

test('facts from git: merged, own commits, dirty, plans = unmerged commits, FAIL fixed after verify, path normalization', () => {
  const root = repo();
  DATE = '2026-01-01T00:00:00Z';
  commit(root, { 'docs/keystone/2026-01-01-old/plan.md': plan('implementing', '- [ ] 1. old') }, 'old plan on main');
  DATE = null;
  const wt = join(root, '.claude', 'worktrees', 'w1');
  git(root, 'worktree', 'add', '-q', '-b', 'claude/w1', wt);
  commit(wt, { [P]: plan('implementing', '- [x] 1. a'), 'docs/keystone/2026-11-04-x/verify.md': 'Verdict: FAIL\n' }, 'plan + verify');
  const s = { sessionId: 'w1', worktreePath: wt, originCwd: root, branch: 'claude/w1', sourceBranch: 'main' };
  let f = facts(s);
  assert.equal(f.own, true);
  assert.equal(f.ownCommits, true);
  assert.equal(f.merged, false);
  assert.deepEqual(f.plans.map((p) => p.name), ['2026-11-04-x']); // the old plan from main is not the session's
  assert.equal(f.plans[0].verdict, 'FAIL');
  assert.equal(f.plans[0].fixedAfterFail, false);
  assert.equal(decide(s, f).step, '/keystone:fix verify');
  commit(wt, { 'src/fix.js': '1' }, 'fix');
  f = facts(s);
  assert.equal(f.plans[0].fixedAfterFail, true);
  assert.equal(decide(s, f).step, `/keystone:verify ${P}`);
  put(wt, { 'src/wip.js': '2' });
  assert.deepEqual(facts(s).files, ['src/wip.js']);
  rmSync(join(wt, 'src', 'wip.js'));
  git(root, 'merge', '-q', '--no-edit', 'claude/w1');
  assert.equal(facts(s).merged, true);
  // a backslash, upper-case worktreePath equal to originCwd is a shared folder, not own
  const same = process.platform === 'win32' ? root.replace(/\//g, '\\').toUpperCase() : root;
  assert.equal(facts({ ...s, worktreePath: same }).own, false);
});

test('I-8: git mode is read-only and prints the table', () => {
  const root = repo();
  git(root, 'worktree', 'add', '-q', '-b', 'claude/a', join(root, 'wa'));
  git(root, 'worktree', 'add', '-q', '-b', 'claude/b', join(root, 'wb'));
  commit(join(root, 'wb'), { 'x.js': '1' }, 'work');
  const before = git(root, 'worktree', 'list');
  assert.deepEqual(gitSessions(root).map((s) => [s.sessionId, s.sourceBranch]), [['wa', 'main'], ['wb', 'main']]);
  const r = spawnSync('node', [SCRIPT, 'git'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /wa · готово к архиву/);
  assert.match(r.stdout, /wb · ждёт тебя · влить claude\/b в main/);
  assert.match(r.stdout, /инструментов сессий нет — разбор только для чтения\n$/);
  assert.equal(git(root, 'worktree', 'list'), before);
});

test('sent store lives in the git common dir; CLI classify exits 1 on a wrong --self', () => {
  const root = repo();
  recordSent('c', '/keystone:fix verify', root);
  assert.equal(readSent(root).c.step, '/keystone:fix verify');
  assert.match(readFileSync(join(root, '.git', 'keystone-sessions.json'), 'utf8'), /fix verify/);
  const file = join(root, 'in.json');
  writeFileSync(file, JSON.stringify(fam()));
  const r = spawnSync('node', [SCRIPT, 'classify', file, '--self', 'nobody'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /no child sessions/);
});

test('I-1: the UserPromptSubmit hook asks for the skill only on a side-sessions event', () => {
  const { KEYSTONE_SESSIONS: _, ...clean } = process.env; // the switch from the shell running npm test must not leak in
  const run = (input, env = {}) => spawnSync('node', [HOOK], { input, encoding: 'utf8', env: { ...clean, ...env } });
  const ev = run(JSON.stringify({ hook_event_name: 'UserPromptSubmit', prompt: '<side-sessions-event>a child session ended a turn</side-sessions-event>' }));
  assert.equal(ev.status, 0);
  const ctx = JSON.parse(ev.stdout).hookSpecificOutput;
  assert.equal(ctx.hookEventName, 'UserPromptSubmit');
  assert.match(ctx.additionalContext, /keystone:sessions/);
  assert.match(ctx.additionalContext, /Skill tool/);
  assert.doesNotMatch(ctx.additionalContext, /skills\/sessions\/SKILL\.md/);
  for (const input of [JSON.stringify({ prompt: 'привет' }), '{not json', '']) {
    const r = run(input);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
});

test('I-16: KEYSTONE_SESSIONS=off silences the hook; KEYSTONE_GATES=off does not', () => {
  const { KEYSTONE_SESSIONS: _, ...clean } = process.env;
  const ev = JSON.stringify({ prompt: '<side-sessions-event>x</side-sessions-event>' });
  const run = (env) => spawnSync('node', [HOOK], { input: ev, encoding: 'utf8', env: { ...clean, ...env } });
  for (const v of ['off', 'OFF']) {
    const r = run({ KEYSTONE_SESSIONS: v });
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  }
  const g = run({ KEYSTONE_GATES: 'off' });
  assert.equal(g.status, 0);
  assert.match(JSON.parse(g.stdout).hookSpecificOutput.additionalContext, /keystone:sessions/);
});
