// Class: user-visible changes of verify and implement without a CHANGELOG line — every rule the evolve findings added to these skills is listed.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(root, f), 'utf8').replace(/\s+/g, ' ');

test('each new verify rule is in the skill text and in CHANGELOG.md', () => {
  const log = read('CHANGELOG.md');
  for (const [file, rule, line] of [
    ['skills/verify/references/LOOP.md', '`cause: environment', '`cause: environment`'],
    ['skills/verify/references/LOOP.md', '`cause: red in base', '`cause: red in base`'],
    ['skills/verify/references/LOOP.md', 'A verifier that broke off', 'a verifier that broke off'],
    ['skills/verify/references/CHECKS.md', '## Limits', 'a suite longer than the limit'],
    ['skills/verify/SKILL.md', '**Commit scope.** Every commit here', 'every verify commit'],
  ]) {
    assert.ok(read(file).includes(rule), `${file}: ${rule}`);
    assert.ok(log.includes(line), `CHANGELOG.md: ${line}`);
  }
});

test('each new implement rule is in the skill text and in CHANGELOG.md', () => {
  const log = read('CHANGELOG.md');
  const file = 'skills/implement/SKILL.md';
  for (const [rule, line] of [
    ['goes into the first', 'goes into the first task\'s commit'],
    ['HEAD..main', '`git log --oneline HEAD..main -- <plan files>`'],
    ['does not supersede by name', 'does not supersede is a cited requirement'],
    ['proves the task, not the tree', 'proves the task, not the tree'],
    ['runs in the background is done', 'runs in the background is ticked only after'],
    ['leaves no commit', 'leaves no commit: re-stage'],
    ['needs the human —', '`BLOCKED: needs the human — <what>`'],
    ['does not `release`', 'does not `release`; owner exit 1'],
    ['already wrote', 'already wrote the docs'],
    ['A yes in the chat does not open it either', 'A yes in the chat does not open the push gate'],
  ]) {
    assert.ok(read(file).includes(rule), `${file}: ${rule}`);
    assert.ok(log.includes(line), `CHANGELOG.md: ${line}`);
  }
});
