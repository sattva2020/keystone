// RUSH.md driver guards: no endless implement loop, no advice ahead of its proof.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = readFileSync(join(ROOT, 'skills/implement/references/RUSH.md'), 'utf8');

test('rush driver: implement is picked only for a ready task, and a stage that changed nothing stops the chain', () => {
  // a ready task: open, not BLOCKED, every Depends on ticked
  assert.match(R, /whose `Depends on:` tasks are all `\[x\]`/);
  // open tasks remain but none is ready (they wait on a BLOCKED one) → the human, not another implement stage
  assert.match(R, /none is ready \(each waits on\s+a task that is not `\[x\]`\) → stop: `Waiting for you: <the BLOCKED ids>`/);
  // HEAD and the ready task ids are recorded before every stage and compared after implement
  assert.match(R, /Before every stage note `git rev-parse HEAD` and the ids of the ready tasks/);
  assert.match(R, /implement `RUSH: done` with `HEAD` and the ready task ids both as noted before the stage → stop:\s+`Rush остановлен на implement: nothing changed`/);
  assert.match(R, /\| implement or fix made no commit, or verify `0 files changed` \|/);
});

test('rush driver: no CLAUDE_CODE_FORK_SUBAGENT advice before the normal-permissions run proves it (plan task 10)', () => {
  if (existsSync(join(ROOT, 'docs/sattva/2026-11-19-rush-mode/live-run/permissions.md'))) return;
  const files = ['README.md', 'README.ru.md'];
  const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).forEach((e) =>
    e.isDirectory() ? walk(join(d, e.name)) : e.name.endsWith('.md') && files.push(join(d, e.name)));
  ['skills', 'agents', 'docs'].forEach((d) => existsSync(join(ROOT, d)) && walk(d));
  const hits = files.filter((f) => !f.replaceAll('\\', '/').startsWith('docs/sattva/') || f.endsWith('public-readme-section.md'))
    .filter((f) => readFileSync(join(ROOT, f), 'utf8').includes('CLAUDE_CODE_FORK_SUBAGENT'));
  assert.deepEqual(hits, []);
});
