import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, readdirSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, decide, readPlan } from '../skills/sessions/scripts/triage.mjs';
import { panelRows, registryStates, FACTS_MAX, BUDGET_MS } from '../skills/sessions/scripts/panel.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills', 'sessions', 'scripts', 'panel.mjs');
const P = 'docs/keystone/2026-11-04-x/plan.md';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const temp = () => { const d = mkdtempSync(join(tmpdir(), 'ks-panel-')); roots.push(d); return d; };
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
function put(root, files) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
}
function commit(root, files, msg) {
  put(root, files);
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
function repo() {
  const root = join(temp(), 'repo');
  mkdirSync(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x' }, 'start');
  return root;
}
const plan = (status, tasks = '- [x] 1. a', release = '') => `# Plan: x\n\nLevel: L · Mode: feature · Status: ${status}\n\n## Tasks\n${tasks}\n${release ? `\n## Release\n${release}\n` : ''}`;
// the registry of live sessions: one file per record, pid = this process unless given
function registry(records) {
  const dir = temp();
  records.forEach((r, i) => writeFileSync(join(dir, `${i}.json`), typeof r === 'string' ? r : JSON.stringify({ pid: process.pid, updatedAt: 1, ...r })));
  return dir;
}

// facts stub: plan entries in the shape facts() returns
const pl = (o) => ({ name: '2026-11-04-x', path: P, status: 'implementing', open: 0, blocked: null, release: [], done: 1, total: 2, verify: false, verdict: null, fixedAfterFail: false, ...o });
const F = (o) => ({ own: true, merged: false, ownCommits: true, dirty: false, files: [], ignored: [], plans: [], ...o });
const READY = F({ ownCommits: false });
const S = { sessionId: 'c', title: 'child', branch: 'claude/c', sourceBranch: 'main' };
const kid = (id, o = {}) => ({ ...S, sessionId: id, title: `t-${id}`, parentSessionId: 'me', originCwd: '/r', worktreePath: `/r/${id}`, isRunning: false, ...o });
// panelRows on stubs: factsOf from a map (a missing id is ready), no registry unless given
const rows = (sessions, map = {}, deps = {}) => panelRows({ self: 'me', originCwd: '/r', sessions }, {
  states: new Map(), sent: {}, ownerOf: () => null, repoOf: () => '/r/.git',
  factsOf: (s) => { const f = map[s.sessionId] ?? READY; if (f instanceof Error) throw f; return f; },
  now: () => 0, ...deps,
});

test('readPlan counts ticked tasks of ## Tasks only', () => {
  const p = readPlan(plan('implementing', '- [x] 1. a\n- [X] 2. b\n- [ ] 3. c\n- [ ] 4. d BLOCKED: db', '- [x] R1. x\n- [ ] R2. y'));
  assert.deepEqual([p.done, p.total, p.open, p.release.length], [2, 4, 2 - 1, 1]);
});

test('waiting rows carry code and arg', () => {
  const cases = [
    ['accept', undefined, F({ plans: [pl({ verdict: 'PASS-UNPROVEN' })] })],
    ['blocked', 'needs the DB', F({ plans: [pl({ blocked: 'needs the DB' })] })],
    ['approve', undefined, F({ plans: [pl({ status: 'draft' })] })],
    ['release', 'R1, R2', F({ plans: [pl({ status: 'verified', release: ['R1', 'R2'] })] })],
    ['dirty', 'a, b, c', F({ merged: true, dirty: true, files: ['a', 'b', 'c', 'd'] })],
    ['ignored', '.env', F({ ignored: ['.env'] })],
    ['intent', undefined, F({ plans: [{ name: 'y', path: 'docs/keystone/y/plan.md', intentOnly: true }] })],
    ['merge', 'claude/c → main', F({})],
    ['unrecognised', 'abandoned', F({ plans: [pl({ status: 'abandoned' })] })],
  ];
  for (const [code, arg, f] of cases) {
    const got = decide(S, f);
    assert.deepEqual([got.group, got.code, got.arg], ['waiting', code, arg], code);
    const [w] = classify([{ ...S, parentSessionId: 'me', state: 'idle' }], { self: 'me', factsOf: () => f }).waiting;
    assert.deepEqual([w.code, w.arg, 'arg' in w], [code, arg, arg !== undefined], `${code} in classify`);
  }
  const one = (state, o = {}) => classify([{ ...S, parentSessionId: 'me', state }], { self: 'me', factsOf: () => READY, ...o }).waiting[0];
  assert.equal(one('failed').code, 'failed');
  assert.equal(one('stopped').code, 'failed');
  assert.equal(one('unknown').code, 'unknown');
  assert.equal(one('waiting').code, 'answer');
  assert.equal(one('odd').code, 'state');
  assert.equal(one('idle', { factsOf: () => { throw new Error('boom'); } }).code, 'git');
  const open = () => F({ plans: [pl({ open: 1 })] });
  const step = `/keystone:implement ${P}`;
  assert.deepEqual((({ code, arg }) => [code, arg])(one('idle', { factsOf: open, sent: { c: { step } } })), ['stuck', step]);
  assert.equal(one('idle', { factsOf: () => F({ plans: [pl({ open: 1, path: 'x/plan.md' })] }) }).code, 'path');
  const owner = { place: 'pc · /w', branch: 'b', since: 't' };
  assert.deepEqual((({ code, arg }) => [code, arg])(one('idle', { factsOf: open, ownerOf: () => ({ live: true, mine: false, owner }) })), ['owner', 'pc · /w · b']);
  const nested = classify([{ ...S, parentSessionId: 'me', state: 'idle' }, { sessionId: 'g', parentSessionId: 'c', state: 'working' }], { self: 'me', factsOf: () => READY });
  assert.equal(nested.waiting[0].code, 'nested');
});

test('states: registry record × isRunning', () => {
  const st = (status, isRunning) => rows([kid('c', { isRunning })], {}, { states: new Map(status ? [['c', status]] : []) })[0].state;
  for (const r of [true, false, undefined]) {
    assert.equal(st('busy', r), 'working');
    assert.equal(st('waiting', r), 'waiting');
    assert.equal(st('idle', r), 'idle');
    assert.equal(st('strange', r), 'unknown');
  }
  assert.equal(st(null, false), 'idle');
  assert.equal(st(null, true), 'unknown');
  assert.equal(st(null, undefined), 'unknown');
});

test('registry: padding, broken file, two records, dead pid, no folder', () => {
  const rec = (o) => JSON.stringify({ pid: 1, hostSessionId: 'a', status: 'busy', updatedAt: 1, ...o });
  const dir = registry([
    rec({ hostSessionId: 'pad' }) + '\0\0\0  ', '{ not json', '',
    rec({ hostSessionId: 'two', status: 'idle', updatedAt: 5 }), rec({ hostSessionId: 'two', status: 'busy', updatedAt: 2 }),
    rec({ hostSessionId: 'dead', pid: 999 }), rec({ hostSessionId: 'nopid', pid: 'x' }),
  ]);
  writeFileSync(join(dir, 'secret.key'), 'not read');
  assert.deepEqual(Object.fromEntries(registryStates(dir, (pid) => pid !== 999)), { pad: 'busy', two: 'idle' });
  assert.equal(registryStates(join(dir, 'absent')).size, 0);
  assert.equal(registryStates(registry([{ hostSessionId: 'self', status: 'busy' }])).get('self'), 'busy'); // the real pid check
});

test('order and family', () => {
  const map = { draft: F({ plans: [pl({ status: 'draft' })] }), step: F({ plans: [pl({ open: 1 })] }) };
  const list = [
    kid('ready'), kid('step'), kid('unk', { isRunning: true }), kid('work'), kid('draft'),
    kid('gone', { isArchived: true }), kid('grand', { parentSessionId: 'ready2' }), kid('ready2'),
    kid('parent', { parentSessionId: undefined }), kid('sibling', { parentSessionId: 'parent' }),
  ];
  const asked = [];
  const r = rows(list, map, { states: new Map([['work', 'busy']]), factsOf: (s) => { asked.push(s.sessionId); return map[s.sessionId] ?? READY; } });
  assert.deepEqual(r.map((x) => x.id), ['draft', 'work', 'step', 'unk', 'ready', 'ready2']);
  assert.deepEqual(asked, ['ready', 'step', 'unk', 'work', 'draft', 'ready2', 'grand']); // direct first; not the parent or a sibling
  assert.deepEqual(rows([]), []);
  assert.deepEqual(rows([kid('gone', { isArchived: true })]), []);
});

test('other repository dropped', () => {
  const at = (originCwd, repoOf, o = {}) => rows([kid('c', { originCwd })], {}, { repoOf, ...o }).length;
  assert.equal(at('/other', (d) => `${d}/.git`), 0);
  assert.equal(at('/r/sub', () => '/r/.git'), 1);
  assert.equal(at('/other', () => { throw new Error('no git'); }), 1);
  assert.equal(at('/r', () => { throw new Error('must not be asked'); }), 1);
  let t = 0;
  assert.equal(at('/other', (d) => `${d}/.git`, { now: () => (t++ ? BUDGET_MS : 0) }), 1); // no budget: the row stays
  const main = repo();
  const wt = join(dirname(main), 'wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'b');
  mkdirSync(join(main, 'sub'));
  const other = repo();
  const real = (originCwd) => panelRows({ self: 'me', originCwd: main, sessions: [kid('c', { originCwd, worktreePath: originCwd, branch: 'main' })] }, { states: new Map(), sent: {} }).length;
  assert.equal(real(join(main, 'sub')), 1);
  assert.equal(real(wt), 1);
  assert.equal(real(other), 0);
});

test('ready, unknown and the code table', () => {
  const one = (f, o = {}, deps = {}) => rows([kid('c', o)], { c: f }, deps)[0];
  const pick = (r) => [r.code, r.arg, r.next, r.wait, r.ready];
  assert.deepEqual(pick(one(READY)), [null, '', null, false, true]);
  assert.deepEqual(pick(one(F({ plans: [pl({ status: 'draft' })] }))), ['approve', '', `/keystone:plan ${P}`, true, false]);
  assert.deepEqual(pick(one(F({ plans: [pl({ verdict: 'PASS-UNPROVEN' })] }))), ['accept', '', `/keystone:verify accept ${P}`, true, false]);
  assert.deepEqual(pick(one(F({ plans: [pl({ blocked: 'db' })] }))), ['blocked', 'db', null, true, false]);
  assert.deepEqual(pick(one(F({ plans: [pl({ status: 'verified', release: ['R1'] })] }))), ['release', 'R1', `/keystone:implement ${P}`, true, false]);
  assert.deepEqual(pick(one(F({ plans: [{ name: 'y', path: 'docs/keystone/y/plan.md', intentOnly: true }] }))), ['intent', '', '/keystone:plan docs/keystone/y/intent.md', true, false]);
  // an intent-only folder before the draft: the command names the draft's plan
  assert.equal(one(F({ plans: [{ name: 'y', path: 'docs/keystone/y/plan.md', intentOnly: true }, pl({ status: 'draft' })] })).next, `/keystone:plan ${P}`);
  assert.deepEqual(pick(one(F({}))), ['merge', 'claude/c → main', null, true, false]);
  assert.deepEqual(pick(one(F({ merged: true, dirty: true, files: ['a'] }))), ['dirty', 'a', null, true, false]);
  assert.deepEqual(pick(one(F({ plans: [pl({ open: 1 })] }))), ['step', '', `/keystone:implement ${P}`, false, false]);
  const step = `/keystone:implement ${P}`;
  assert.deepEqual(pick(one(F({ plans: [pl({ open: 1 })] }), {}, { sent: { c: { step } } })), ['stuck', step, step, true, false]);
  const waiting = { states: new Map([['c', 'waiting']]) };
  for (const [p, next] of [[pl({ status: 'draft' }), `/keystone:plan ${P}`], [pl({ status: 'approved' }), step], [pl({ open: 1 }), step], [pl({}), `/keystone:verify ${P}`], [pl({ status: 'verified', release: ['R1'] }), step]])
    assert.deepEqual(pick(one(F({ plans: [p] }), {}, waiting)), ['answer', '', next, true, false]);
  assert.deepEqual(pick(one(READY, {}, waiting)), ['answer', '', null, true, false]);
  assert.deepEqual(pick(one(F({ plans: [pl({ open: 1 })] }), {}, { states: new Map([['c', 'busy']]) })), [null, '', null, false, false]);
  const unk = one(F({ plans: [pl({ status: 'draft', done: 3, total: 7 })] }), { isRunning: true });
  assert.deepEqual([unk.state, unk.stage, unk.done, unk.total, unk.wait, unk.ready], ['unknown', 'draft', 3, 7, false, false]);
  const bad = one(new Error('boom'));
  assert.deepEqual([bad.code, bad.stage, bad.done, bad.total, bad.wait], ['git', null, 0, 0, false]);
  assert.equal(one(READY, { originCwd: undefined }).code, 'git'); // a cloud session: no folder here
  // the stage is the first unfinished plan's
  assert.equal(one(F({ plans: [pl({ status: 'verified' }), pl({ name: 'b', status: 'approved', open: 1 })] })).stage, 'approved');
});

test('nested: grandchildren keep a parent from ready', () => {
  const g = (o = {}) => kid('g', { parentSessionId: 'c', ...o });
  const get = (list, map, deps) => rows(list, map, deps).find((r) => r.id === 'c');
  assert.equal(get([kid('c'), g()]).ready, true); // the grandchild is archived first
  const live = get([kid('c'), g()], { g: F({}) });
  assert.deepEqual([live.ready, live.code, live.wait], [false, 'nested', false]);
  const draft = get([kid('c'), g()], { c: F({ plans: [pl({ status: 'draft' })] }), g: F({}) });
  assert.deepEqual([draft.code, draft.wait, draft.ready], ['approve', true, false]);
  const many = Array.from({ length: FACTS_MAX }, (_, i) => kid(i ? `k${i}` : 'c'));
  assert.equal(get([...many, g()]).ready, false); // an idle grandchild past FACTS_MAX
  assert.equal(get(many).ready, true);
});

test('FACTS_MAX and the budget: state only', () => {
  const many = Array.from({ length: FACTS_MAX + 2 }, (_, i) => kid(`k${i}`));
  let calls = 0;
  const draft = F({ plans: [pl({ status: 'draft' })] });
  const r = rows(many, {}, { states: new Map([[`k${FACTS_MAX + 1}`, 'waiting']]), factsOf: () => { calls += 1; return draft; } });
  assert.equal(calls, FACTS_MAX);
  const cut = r.find((x) => x.id === `k${FACTS_MAX}`);
  assert.deepEqual([cut.state, cut.code, cut.wait, cut.ready, cut.stage, cut.total], ['idle', null, false, false, null, 0]);
  const asks = r.find((x) => x.id === `k${FACTS_MAX + 1}`);
  assert.deepEqual([asks.code, asks.wait, asks.next], ['answer', true, null]);

  let t = 0;
  const late = { now: () => (t++ ? BUDGET_MS : 0), factsOf: () => assert.fail('facts'), ownerOf: () => assert.fail('owner') };
  assert.deepEqual(rows([kid('c'), kid('d')], {}, late).map((x) => [x.id, x.code, x.ready]), [['c', null, false], ['d', null, false]]);

  // the budget runs out between facts and the owner check: the step stays, the owner is not asked
  let n = 0;
  const step = rows([kid('c')], {}, { now: () => n, factsOf: () => { n = BUDGET_MS; return F({ plans: [pl({ open: 1 })] }); }, ownerOf: () => assert.fail('owner') });
  assert.equal(step[0].code, 'step');

  // the budget ends after the direct child: its idle grandchild has no facts, so the parent is not ready
  let m = 0;
  const p = rows([kid('c'), kid('g', { parentSessionId: 'c' })], {}, { now: () => m, factsOf: () => { m = BUDGET_MS; return READY; } });
  assert.equal(p[0].ready, false);
});

// ---- the real script on a real repository
function fixture() {
  const main = repo();
  const wt = join(dirname(main), 'wt');
  git(main, 'worktree', 'add', '-q', wt, '-b', 'claude/c');
  commit(wt, { [P]: plan('draft', '- [x] 1. a\n- [ ] 2. b') }, 'plan');
  return { main, wt, session: { sessionId: 'c', title: 'child', parentSessionId: 'me', originCwd: main, worktreePath: wt, branch: 'claude/c', sourceBranch: 'main', isRunning: false } };
}
function run(input, records = [], cwd = ROOT) {
  const cfg = temp();
  const dir = join(cfg, 'sessions');
  mkdirSync(dir);
  records.forEach((r, i) => writeFileSync(join(dir, `${i}.json`), JSON.stringify({ pid: process.pid, updatedAt: 1, ...r }) + '\0\0'));
  return spawnSync(process.execPath, [SCRIPT], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', cwd, env: { ...process.env, CLAUDE_CONFIG_DIR: cfg } });
}

test('the script: a draft plan in a worktree, no texts, no index lock', () => {
  const { main, wt, session } = fixture();
  const index = git(wt, 'rev-parse', '--path-format=absolute', '--git-path', 'index');
  utimesSync(join(wt, 'README.md'), new Date(1e9), new Date(1e9)); // same content, stale stat data: a plain status would rewrite the index
  const before = readFileSync(index);
  const r = run({ self: 'me', originCwd: main, sessions: [session] }, [{ hostSessionId: 'c', status: 'idle', name: 'SECRET-NAME', waitingFor: 'SECRET-WAIT' }]);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(JSON.parse(r.stdout).rows, [{ id: 'c', title: 'child', state: 'idle', ready: false, stage: 'draft', done: 1, total: 2, code: 'approve', arg: '', next: `/keystone:plan ${P}`, wait: true }]);
  assert.doesNotMatch(r.stdout, /SECRET/);
  assert.ok(before.equals(readFileSync(index)), 'no index lock: the index is untouched');
});

test('the script: outside git, a broken sent store, bad input', () => {
  const { main, session } = fixture();
  const outside = temp();
  let r = run({ self: 'me', originCwd: outside, sessions: [session] }, [], outside);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(r.stdout).rows.length, 1);
  writeFileSync(join(main, '.git', 'keystone-sessions.json'), '{ broken');
  r = run({ self: 'me', originCwd: main, sessions: [session] });
  assert.equal(JSON.parse(r.stdout).rows[0].code, 'approve');
  for (const bad of ['nonsense', '{"sessions":[]}']) {
    r = run(bad);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /^panel: /);
  }
  assert.equal(run({ self: 'a', originCwd: '.', sessions: [] }).stdout, '{"rows":[]}\n');
});

test('the panel option is a boolean, on by default', () => {
  const { panel } = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).userConfig;
  assert.deepEqual([panel.type, panel.default], ['boolean', true]);
});

test('panel.tsx bans: no model, no network, no texts, no sending; one hook per event', () => {
  const src = readFileSync(join(ROOT, 'hooks', 'panel.tsx'), 'utf8');
  for (const s of ['$.model.', '$.http', '$.session.messages', '$.session.send', 'prompt.submit', 'send_message', 'archive_session', 'start_session', "on('session.start'", "on('turn.complete'"])
    assert.ok(!src.includes(s), s);
  const seen = {};
  for (const f of readdirSync(join(ROOT, 'hooks')).filter((n) => /\.tsx?$/.test(n) && !/\.test\./.test(n)))
    for (const [, event] of readFileSync(join(ROOT, 'hooks', f), 'utf8').matchAll(/\bon\('([\w.]+)',(?!\s*\{)/g)) (seen[event] ??= []).push(f);
  assert.ok(seen['session.start'] && seen['session.attach'], 'the scan finds the hooks');
  for (const [event, files] of Object.entries(seen)) assert.equal(files.length, 1, `${event}: ${files.join(', ')}`); // a repeat throws
});
