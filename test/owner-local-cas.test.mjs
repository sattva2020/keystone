// Class: a write of the local keystone/owners branch must CAS against the tip the decision was made on.
// Another worktree that writes between the decision and the write makes this one decide again (I-6 × I-9).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { take, show } from '../skills/implement/scripts/owner.mjs';

const X = 'docs/keystone/2026-11-01-x/plan.md';
const Y = 'docs/keystone/2026-11-02-y/plan.md';
const ENV = { ...process.env, CLAUDE_CODE_REMOTE: '', KEYSTONE_GATES: '' };
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const git = (cwd, ...a) => {
  const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const o = (cwd, extra = {}) => ({ cwd, env: ENV, stage: 'implement', ...extra });
const once = (fn) => { let done = false; return () => { if (!done) { done = true; fn(); } }; };

// a repo with plans X and Y and a second worktree `w2`; `refused` → a bare origin whose pre-receive rejects every push
function world(refused) {
  const root = mkdtempSync(join(tmpdir(), 'ks-ownercas-'));
  roots.push(root);
  const seed = join(root, 'seed');
  git(root, 'init', '-q', '-b', 'main', seed);
  for (const p of [X, Y]) { mkdirSync(join(seed, dirname(p)), { recursive: true }); writeFileSync(join(seed, p), '# Plan\n'); }
  git(seed, 'add', '-A');
  git(seed, 'commit', '-qm', 'plans');
  let main = seed;
  if (refused) {
    const origin = join(root, 'origin.git');
    git(root, 'init', '-q', '--bare', '-b', 'main', origin);
    git(seed, 'push', '-q', origin, 'main');
    git(root, 'clone', '-q', origin, 'w1');
    main = join(root, 'w1');
    mkdirSync(join(origin, 'hooks'), { recursive: true });
    writeFileSync(join(origin, 'hooks', 'pre-receive'), '#!/bin/sh\nexit 1\n', { mode: 0o755 });
  }
  const w2 = join(root, 'w2');
  git(main, 'worktree', 'add', '-q', w2, '-b', 'w2');
  return { main, w2, place: `local ${refused ? 'w1' : 'seed'}` };
}

for (const refused of [false, true]) {
  const name = refused ? 'refused push' : 'no origin';
  test(`${name}: a take that lost the local CAS decides again and is refused`, () => {
    const w = world(refused);
    const r = take(X, o(w.w2, { beforeWrite: once(() => assert.equal(take(X, o(w.main)).ok, true)) }));
    assert.equal(r.ok, false, JSON.stringify(r));
    assert.equal(r.owner.place, w.place);
    assert.equal(show(X, o(w.w2, { offline: true })).owner.place, w.place, 'the winner record is not overwritten');
  });

  test(`${name}: a write on another plan in between is kept`, () => {
    const w = world(refused);
    const r = take(X, o(w.w2, { beforeWrite: once(() => assert.equal(take(Y, o(w.main)).ok, true)) }));
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.remote, 'local');
    assert.equal(show(X, o(w.main, { offline: true })).owner.place, 'local w2');
    assert.equal(show(Y, o(w.w2, { offline: true })).owner.place, w.place, 'Y survives the retry');
  });
}
