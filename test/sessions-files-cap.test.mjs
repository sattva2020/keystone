// Regression (review 2026-11-07, item 1): `git status -uall` expands an untracked folder file by file;
// the waiting item must carry a short list, not every file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classify } from '../skills/sessions/scripts/triage.mjs';

const many = Array.from({ length: 5000 }, (_, i) => `big/${i}.o`);
const run = (f) => classify([{ sessionId: 'c', parentSessionId: 'root', state: 'idle' }], { self: 'root', factsOf: () => f });

test('files cap: 5000 uncommitted files → a short files list in waiting', () => {
  const out = run({ own: true, merged: true, ownCommits: false, dirty: true, files: many, ignored: [], plans: [] });
  assert.ok(out.waiting[0].files.length <= 50, `files: ${out.waiting[0].files.length}`);
});

test('files cap: 5000 ignored files → a short files list in waiting', () => {
  const out = run({ own: true, merged: true, ownCommits: false, dirty: false, files: [], ignored: many, plans: [] });
  assert.ok(out.waiting[0].files.length <= 50, `files: ${out.waiting[0].files.length}`);
});
