import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify } from '../skills/sessions/scripts/triage.mjs';
import { take, show } from '../skills/implement/scripts/owner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TRIAGE = join(ROOT, 'skills', 'sessions', 'scripts', 'triage.mjs');
const P = 'docs/keystone/2026-11-01-x/plan.md';
const ENV = { ...process.env, CLAUDE_CODE_REMOTE: '', KEYSTONE_GATES: '' };
const SINCE = '2026-11-15T10:00:00.000Z';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};

const pl = (o) => ({ name: '2026-11-01-x', path: P, status: 'implementing', open: 1, blocked: null, release: [], verify: false, verdict: null, fixedAfterFail: false, ...o });
const facts = (plans) => () => ({ own: true, merged: false, ownCommits: true, dirty: false, files: [], ignored: [], plans });
const child = (o = {}) => [{ sessionId: 'p', title: 'parent' }, { sessionId: 'c', title: 'child', parentSessionId: 'p', state: 'idle', branch: 'claude/c', sourceBranch: 'main', ...o }];
const owner = (place = 'local a', branch = 'x') => ({ plan: '2026-11-01-x', place, branch, stage: 'implement', since: SINCE, beat: SINCE });

test('I-7: a plan held by another live session → waiting with the owner; otherwise the step as before', () => {
  const run = (ownerOf, plans = [pl()]) => classify(child(), { self: 'p', factsOf: facts(plans), ownerOf });
  const held = run(() => ({ owner: owner(), mine: false, live: true }));
  assert.deepEqual(held.message, []);
  assert.equal(held.waiting[0].reason, `план ведёт local a · ветка x с ${SINCE}`);
  assert.equal(run(() => ({ owner: owner(), mine: true, live: true })).message[0].step, `/keystone:implement ${P}`, 'mine');
  assert.equal(run(() => ({ owner: null, mine: false, live: false })).message.length, 1, 'no owner');
  assert.equal(run(() => ({ owner: owner(), mine: false, live: false })).message.length, 1, 'stale owner');
  assert.equal(run(() => ({ ok: true, off: true })).message.length, 1, 'KEYSTONE_GATES=off');
  assert.equal(run(() => { throw new Error('boom'); }).message.length, 1, 'error → the step stays');
  assert.equal(classify(child(), { self: 'p', factsOf: facts([pl()]) }).message.length, 1, 'no ownerOf → as before');
  const fix = run(() => ({ owner: owner(), mine: false, live: true }), [pl({ verdict: 'FAIL', verify: true })]);
  assert.match(fix.waiting[0].reason, /^план ведёт local a/, '/keystone:fix verify is checked too');
  let asked = 0;
  run(() => { asked++; return null; }, [pl({ open: 0 })]); // /keystone:verify — not an owner stage
  assert.equal(asked, 0);
});

function world() {
  const root = mkdtempSync(join(tmpdir(), 'ks-sowner-'));
  roots.push(root);
  const seed = join(root, 'seed');
  mkdirSync(join(seed, dirname(P)), { recursive: true });
  git(root, 'init', '-q', '-b', 'main', seed);
  writeFileSync(join(seed, P), '# Plan: x\n\nLevel: S · Mode: feature · Status: implementing\n\n## Tasks\n- [ ] 1. a\n');
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'plan');
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(seed, 'push', '-q', origin, 'main');
  git(root, 'clone', '-q', origin, 'a');
  git(root, 'clone', '-q', origin, 'b');
  return { root, a: join(root, 'a'), b: join(root, 'b') };
}

test('I-7 on real git: the session that holds the plan itself gets its step; a foreign live owner → waiting', () => {
  const w = world();
  const wt = join(w.root, 'child');
  git(w.a, 'worktree', 'add', '-q', '--detach', wt);
  const sessions = child({ worktreePath: wt, originCwd: w.a, branch: undefined });
  const ownerOf = (dir, plan) => show(plan, { cwd: dir, env: ENV });
  assert.equal(take(P, { cwd: wt, env: ENV, stage: 'implement' }).ok, true);
  assert.equal(classify(sessions, { self: 'p', factsOf: facts([pl()]), ownerOf }).message.length, 1, 'detached worktree holds it');
  assert.equal(take(P, { cwd: w.b, env: ENV, stage: 'implement', force: true }).ok, true);
  const out = classify(sessions, { self: 'p', factsOf: facts([pl()]), ownerOf });
  assert.match(out.waiting[0]?.reason ?? '', /^план ведёт local b · ветка main с /);
});

test('triage git mode stays read-only: no fetch of keystone/owners', () => {
  const w = world();
  assert.equal(take(P, { cwd: w.b, env: ENV, stage: 'implement' }).ok, true); // the branch exists on origin
  const wt = join(w.root, 'wt');
  git(w.a, 'worktree', 'add', '-q', '-b', 'feat', wt);
  writeFileSync(join(wt, P), '# Plan: x\n\nLevel: S · Mode: feature · Status: implementing\n\n## Tasks\n- [ ] 1. a\n- [ ] 2. b\n');
  git(wt, 'commit', '-qam', 'task');
  const r = spawnSync(process.execPath, [TRIAGE, 'git'], { cwd: w.a, encoding: 'utf8', env: ENV });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /wt · осталось · \/keystone:implement/);
  assert.equal(spawnSync('git', ['-C', w.a, 'rev-parse', '-q', '--verify', 'refs/remotes/origin/keystone/owners']).status, 1);
});
