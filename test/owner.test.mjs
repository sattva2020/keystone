import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir, hostname } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { take, beat, release, show, STALE_MS } from '../skills/implement/scripts/owner.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills', 'implement', 'scripts', 'owner.mjs');
const X = 'docs/keystone/2026-11-01-x/plan.md';
const Y = 'docs/keystone/2026-11-02-y/plan.md';
const T0 = Date.parse('2026-11-15T10:00:00Z');
const ENV = { ...process.env, CLAUDE_CODE_REMOTE: '', KEYSTONE_GATES: '' };

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const plan = '# Plan: x\n\nLevel: S · Mode: feature · Status: implementing\n\n## Tasks\n- [ ] 1. a\n';

// bare origin + clones `a`, `b` (and more on demand) with plans X and Y on main
function world({ remote = true } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ks-owner-'));
  roots.push(root);
  const seed = join(root, 'seed');
  mkdirSync(seed);
  git(seed, 'init', '-q', '-b', 'main');
  for (const p of [X, Y]) { mkdirSync(join(seed, dirname(p)), { recursive: true }); writeFileSync(join(seed, p), plan); }
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'plans');
  if (!remote) return { root, seed };
  const origin = join(root, 'origin.git');
  git(root, 'init', '-q', '--bare', '-b', 'main', origin);
  git(seed, 'push', '-q', origin, 'main');
  const clone = (name) => { git(root, 'clone', '-q', origin, name); return join(root, name); };
  return { root, origin, clone, a: clone('a'), b: clone('b') };
}
const o = (cwd, extra = {}) => ({ cwd, env: ENV, now: T0, stage: 'implement', ...extra });
const recOn = (cwd, ref, key = '2026-11-01-x') => {
  const r = spawnSync('git', ['-C', cwd, 'show', `${ref}:${key}.json`], { encoding: 'utf8' });
  return r.status === 0 ? JSON.parse(r.stdout) : null;
};
const hook = (dir, name) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, name), '#!/bin/sh\nexit 1\n', { mode: 0o755 }); };

test('I-1: a second session on a live plan is refused with place, branch, stage and since; cloud place', () => {
  const w = world();
  const r1 = take(X, o(w.a));
  assert.equal(r1.ok, true);
  assert.equal(r1.remote, 'pushed');
  const r2 = take(X, o(w.b, { now: T0 + 60000 }));
  assert.equal(r2.ok, false);
  assert.equal(r2.stale, false);
  assert.equal(r2.owner.place, 'local a');
  assert.equal(r2.owner.branch, 'main');
  assert.equal(r2.owner.stage, 'implement');
  assert.equal(r2.owner.since, new Date(T0).toISOString());
  assert.equal(take(Y, o(w.b)).ok, true, 'another plan is free');

  const c = take(Y, o(w.a, { env: { ...ENV, CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_x' } }));
  assert.equal(c.ok, false, 'Y is held by local b');
  const w2 = world();
  assert.equal(take(X, o(w2.a, { env: { ...ENV, CLAUDE_CODE_REMOTE: 'true', CLAUDE_CODE_REMOTE_SESSION_ID: 'cse_x' } })).ok, true);
  assert.equal(take(X, o(w2.b)).owner.place, 'cloud cse_x');
});

test('I-2: --force takes over; the old owner gets `taken` on beat', () => {
  const w = world();
  take(X, o(w.a));
  const f = take(X, o(w.b, { force: true, stage: 'fix', now: T0 + 1000 }));
  assert.equal(f.ok, true);
  assert.equal(f.took_over.place, 'local a');
  const b = beat(X, o(w.a, { now: T0 + 2000 }));
  assert.equal(b.ok, false);
  assert.equal(b.taken, true);
  assert.equal(b.owner.place, 'local b');
  assert.equal(b.owner.stage, 'fix');
  assert.equal(b.owner.since, new Date(T0 + 1000).toISOString(), 'since = the moment of the takeover');
});

test('I-3: no beat for more than 2 h → stale; beat moves beat, keeps since', () => {
  const w = world();
  take(X, o(w.a));
  assert.equal(take(X, o(w.b, { now: T0 + STALE_MS + 60000 })).stale, true);
  assert.equal(take(X, o(w.b, { now: T0 + STALE_MS - 60000 })).stale, false);
  assert.equal(beat(X, o(w.a, { now: T0 + 3600000 })).ok, true);
  const rec = recOn(w.a, 'origin/keystone/owners');
  assert.equal(rec.beat, new Date(T0 + 3600000).toISOString());
  assert.equal(rec.since, new Date(T0).toISOString());
  assert.equal(take(X, o(w.b, { now: T0 + STALE_MS + 60000 })).stale, false, 'the beat keeps it alive');
  assert.equal(show(X, o(w.b, { now: T0 + 3600000 + STALE_MS + 1 })).live, false);
});

test('I-4: release removes the file; a foreign record stays without --any', () => {
  const w = world();
  take(X, o(w.a));
  assert.deepEqual(release(X, o(w.b)), { ok: true, released: false, owner: recOn(w.a, 'origin/keystone/owners') });
  assert.ok(recOn(w.b, 'origin/keystone/owners'), 'foreign record kept');
  assert.equal(release(X, o(w.a)).released, true);
  assert.doesNotMatch(git(w.a, 'ls-tree', '--name-only', 'origin/keystone/owners'), /2026-11-01-x/);
  assert.equal(take(X, o(w.b)).ok, true);
  assert.equal(release(X, o(w.a, { any: true })).released, true, '--any removes a foreign record');
  assert.deepEqual(release(X, o(w.a)), { ok: true, released: false });
});

test('I-5: same place and branch = the same owner; another branch in the same folder is not', () => {
  const w = world();
  take(X, o(w.a));
  const again = take(X, o(w.a, { now: T0 + 5000, stage: 'fix' }));
  assert.equal(again.ok, true);
  const rec = recOn(w.a, 'origin/keystone/owners');
  assert.equal(rec.since, new Date(T0).toISOString(), 'since kept');
  assert.equal(rec.stage, 'fix');
  git(w.a, 'checkout', '-q', '-b', 'other');
  assert.equal(take(X, o(w.a)).ok, false);
});

test('I-6: of two takes on the same tip exactly one wins', () => {
  const w = world();
  assert.equal(take(X, o(w.a)).ok, true);
  const r = take(X, o(w.b, { fetch: false })); // b decides on its old (empty) tip, the push is refused, the retry sees a
  assert.equal(r.ok, false);
  assert.equal(r.owner.place, 'local a');
});

test('I-9: no origin → local mark + warning, seen by another worktree; refused push → local branch', () => {
  const w = world({ remote: false });
  const r = take(X, o(w.seed));
  assert.equal(r.ok, true);
  assert.equal(r.remote, 'local');
  assert.match(r.warning, /нет origin/);
  const wt = join(w.root, 'wt2');
  git(w.seed, 'worktree', 'add', '-q', wt, '-b', 'w2');
  const s = take(X, o(wt));
  assert.equal(s.ok, false);
  assert.equal(s.owner.place, 'local seed');

  const v = world();
  hook(join(v.origin, 'hooks'), 'pre-receive');
  const p = take(X, o(v.a));
  assert.equal(p.ok, true);
  assert.equal(p.remote, 'local');
  assert.match(p.warning, /push в origin не прошёл/);
  assert.equal(recOn(v.a, 'keystone/owners').place, 'local a');
});

test('I-9: a refused push on an existing origin branch keeps the earlier local records', () => {
  const w = world();
  take(Y, o(w.b)); // the branch exists on origin
  git(w.a, 'fetch', '-q', 'origin');
  hook(join(w.origin, 'hooks'), 'pre-receive');
  assert.equal(take(X, o(w.a)).remote, 'local');
  const a2 = join(w.root, 'a2');
  const a3 = join(w.root, 'a3');
  git(w.a, 'worktree', 'add', '-q', a2, '-b', 'w2');
  git(w.a, 'worktree', 'add', '-q', a3, '-b', 'w3');
  assert.equal(release(Y, o(a2, { any: true })).remote, 'local'); // another local write on top
  const r = take(X, o(a3));
  assert.equal(r.ok, false, 'X written offline by a is still seen');
  assert.equal(r.owner.place, 'local a');
});

test('no ghost: a record released on origin does not come back from the local branch', () => {
  const w = world();
  take(X, o(w.a));
  take(X, o(w.b, { force: true }));
  release(X, o(w.b));
  const a2 = join(w.root, 'a2');
  git(w.a, 'worktree', 'add', '-q', a2, '-b', 'w2');
  assert.equal(take(X, o(a2)).ok, true);

  // an inherited record in a local-only commit is not a local write either
  const v = world();
  take(Y, o(v.b));
  git(v.a, 'fetch', '-q', 'origin');
  const pre = join(v.origin, 'hooks');
  hook(pre, 'pre-receive');
  assert.equal(take(X, o(v.a)).remote, 'local'); // a's local commit carries b's Y record
  rmSync(join(pre, 'pre-receive'));
  assert.equal(release(Y, o(v.b)).released, true); // Y released on origin
  assert.equal(show(Y, o(v.a)).owner, null, 'Y stays released for a');
  assert.equal(show(X, o(v.a)).owner.place, 'local a', 'the local write of a is still seen');
});

test('push skips the user pre-push hook (--no-verify)', () => {
  const w = world();
  hook(join(w.a, '.git', 'hooks'), 'pre-push');
  assert.equal(take(X, o(w.a)).remote, 'pushed');
});

test('I-10: only keystone/owners changes; main, the work branch and the work tree stay as they were', () => {
  const w = world();
  const main = git(w.a, 'rev-parse', 'origin/main');
  const head = git(w.a, 'rev-parse', 'HEAD');
  take(X, o(w.a));
  beat(X, o(w.a));
  release(X, o(w.a));
  git(w.a, 'fetch', '-q', 'origin');
  assert.equal(git(w.a, 'rev-parse', 'origin/main'), main);
  assert.equal(git(w.a, 'rev-parse', 'HEAD'), head);
  assert.equal(git(w.a, 'status', '--porcelain'), '');
  assert.equal(git(w.a, 'log', '-1', '--format=%an <%ae>', 'origin/keystone/owners'), 'keystone <keystone@invalid>');
});

test('I-11: the record holds no machine name or path; keys exactly', () => {
  const w = world();
  take(X, o(w.a));
  const raw = git(w.a, 'show', 'origin/keystone/owners:2026-11-01-x.json');
  assert.deepEqual(Object.keys(JSON.parse(raw)), ['plan', 'place', 'branch', 'stage', 'since', 'beat']);
  assert.ok(!raw.includes(hostname()), 'no hostname');
  assert.ok(!raw.includes(w.root.replace(/\\/g, '/')) && !raw.includes(w.root), 'no path');
});

test('I-12: KEYSTONE_GATES=off turns the guard off and writes nothing', () => {
  const w = world();
  const env = { ...ENV, KEYSTONE_GATES: 'off' };
  for (const f of [take, beat, release, show]) assert.deepEqual(f(X, o(w.a, { env })), { ok: true, off: true });
  assert.equal(git(w.a, 'ls-remote', 'origin', 'keystone/owners'), '');
  assert.equal(spawnSync('git', ['-C', w.a, 'rev-parse', '-q', '--verify', 'refs/heads/keystone/owners']).status, 1);
});

test('detached HEAD: branch is `HEAD`, a commit does not lose ownership; beat without a record writes the stage', () => {
  const w = world();
  const d = w.clone('d');
  git(d, 'checkout', '-q', '--detach');
  assert.equal(take(X, o(d)).ok, true);
  assert.equal(recOn(d, 'origin/keystone/owners').branch, 'HEAD');
  writeFileSync(join(d, 'f.txt'), '1');
  git(d, 'add', '-A');
  git(d, 'commit', '-qm', 'task');
  assert.deepEqual(beat(X, o(d)), { ok: true, remote: 'pushed' });
  assert.equal(beat(Y, o(d, { stage: 'fix' })).ok, true);
  assert.equal(recOn(d, 'origin/keystone/owners', '2026-11-02-y').stage, 'fix');
});

test('a relative plan path resolves from cwd; show reports mine and live', () => {
  const w = world();
  take(X, o(w.a));
  assert.deepEqual(show(X, o(w.a)), { owner: recOn(w.a, 'origin/keystone/owners'), mine: true, live: true });
  const s = show(X, o(w.b, { offline: true }));
  assert.equal(s.owner, null, 'offline reads only local refs (b never fetched)');
  assert.equal(spawnSync('git', ['-C', w.b, 'rev-parse', '-q', '--verify', 'refs/remotes/origin/keystone/owners']).status, 1, 'offline writes no ref');
  assert.equal(show(X, o(w.b)).mine, false);
});

test('CLI: exit 0 / 3 / 1 and one JSON line', () => {
  const w = world();
  const cli = (cwd, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd, encoding: 'utf8', env: ENV });
  const a = cli(w.a, 'take', X, '--stage', 'implement');
  assert.equal(a.status, 0, a.stderr);
  assert.equal(JSON.parse(a.stdout).ok, true);
  const b = cli(w.b, 'take', X, '--stage', 'fix');
  assert.equal(b.status, 3);
  assert.equal(JSON.parse(b.stdout).owner.place, 'local a');
  assert.equal(cli(w.b, 'take', X, '--stage', 'fix', '--force').status, 0);
  assert.equal(cli(w.a, 'beat', X, '--stage', 'implement').status, 3);
  assert.equal(cli(w.a, 'show', X).status, 0);
  const bad = cli(w.a, 'grab', X);
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /^owner: /);
  assert.equal(cli(w.a, 'take', X).status, 1, '--stage is required');
  assert.match(cli(w.a, 'take', 'docs/keystone/nope/plan.md', '--stage', 'fix').stderr, /owner: no plan\.md/);
  assert.equal(cli(w.b, 'release', X).status, 0);
});
