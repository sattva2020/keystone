// RUSH.md: a stage runs its own agents in the foreground; the driver never relays between agents.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const R = readFileSync(join(ROOT, 'skills/implement/references/RUSH.md'), 'utf8').replace(/\r\n/g, '\n');
const section = (name) => {
  const part = R.split(/^## /m).find((s) => s.startsWith(`${name}\n`));
  assert.ok(part, `section ${name}`);
  return part.replace(/\s+/g, ' ');
};

test('rush stage: every Agent call is in the foreground and the stage waits for all its results', () => {
  const s = section('Stage rules');
  assert.match(s, /Every `Agent` you call gets `run_in_background: false`/);
  assert.match(s, /several calls in one message, each with `run_in_background: false`/);
  assert.match(s, /Never end your answer before you have the result of every agent and every background command/);
});

test('rush early check: foreground verifier, one repeat per point', () => {
  const s = section('Early check');
  assert.match(s, /`subagent_type: "keystone:verifier"`, `run_in_background: false`/);
  assert.equal(s.split('one more early check').length - 1, 1);
  assert.match(s, /one more early check of the same ids — one per point, never a second; what it still finds is `left for verify`/);
});

test('rush sweep: security first, then verifier and finder in one message, nothing of security in their prompts', () => {
  const s = section('Stage rules');
  const i = s.indexOf('`sweep: due`');
  assert.ok(i > 0);
  const security = s.indexOf('/keystone:security <plan> sweep', i);
  const judges = s.indexOf('then in one message `keystone:verifier` and the review finder', i);
  assert.ok(security > i && judges > security);
  assert.match(s, /not a line of the security output goes into their prompts/);
});

test('rush driver: no SendMessage, foreign notifications ignored, which stops print the line', () => {
  const s = section('Driver');
  assert.match(s, /Never write to a stage with `SendMessage` and never relay anything between agents/);
  assert.match(s, /"is waiting on its own background work" is not its answer/);
  assert.match(s, /an agent that is not a stage you started → ignore it/);
  const six = s.slice(s.indexOf('6. Every stop prints one line'));
  assert.match(six, /except the stops `Waiting for you: …`, the ceiling menu \(`ceiling:`\) and the rules menu \(`rules menu: on this FAIL`\)/);
  assert.match(six, /After every stop — the summary/);
});

test('rush driver: the /fast reminder is part of the first stage line, not a line of its own', () => {
  const s = section('Driver');
  assert.match(s, /Rush: идёт <stage> · `\/fast` ускоряет вывод/);
  assert.match(s, /a run that stops without a stage prints that reminder text with its stop/);
  assert.match(s, /the first one of the run with the `\/fast` reminder of step 2/);
});
