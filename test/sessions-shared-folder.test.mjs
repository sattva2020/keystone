// Regression check for verify f57eb5d, Task 1: a session in the shared folder (no own worktree) is not `nested`
// just because other sessions' worktrees live inside that folder (they all do, under .claude/worktrees).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../skills/sessions/scripts/triage.mjs';

const ready = () => ({ own: true, merged: true, ownCommits: false, dirty: false, files: [], plans: [] });

test('I-3: a shared-folder session is archived even with a sibling worktree inside its folder, whatever the order', () => {
  const c = { sessionId: 'c', parentSessionId: 'me', state: 'idle', worktreePath: '/r/c', originCwd: '/r/c' };
  const o = { sessionId: 'o', parentSessionId: 'me', state: 'idle', worktreePath: '/r/c/.claude/worktrees/o', originCwd: '/r/c' };
  for (const order of [[c, o], [o, c]]) {
    const r = classify([{ sessionId: 'me' }, ...order], { self: 'me', factsOf: ready });
    assert.deepEqual(r.archive.map((a) => a.sessionId).sort(), ['c', 'o'], order.map((s) => s.sessionId).join(','));
    assert.deepEqual(r.waiting, []);
  }
});

test('I-9: a descendant of a shared-folder session still keeps it out of the archive', () => {
  const c = { sessionId: 'c', parentSessionId: 'me', state: 'idle', worktreePath: '/r/c', originCwd: '/r/c' };
  const g = { sessionId: 'g', parentSessionId: 'c', state: 'working', worktreePath: '/r/c/.claude/worktrees/g', originCwd: '/r/c' };
  const r = classify([{ sessionId: 'me' }, c, g], { self: 'me', factsOf: ready });
  assert.equal(r.waiting.find((w) => w.sessionId === 'c')?.reason, 'есть живые дочерние сессии');
  assert.equal(r.working, 1);
});
