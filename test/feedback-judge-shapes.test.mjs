// Every shape of a judge line: the fourth field is the class only when it is a label; a classless line keeps its sentence
// as text whether a text field, an evidence field, both or neither follow it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const HEAD = 'skill-text | added | verify § Step 3';
const S = 'The text does not say how to paste the output.';
const one = (line) => {
  const p = fb.parseJudge(line);
  assert.equal(p.items.length, 1, `${line} → ${JSON.stringify(p)}`);
  const i = p.items[0];
  return [i.cls, i.text, i.evidence];
};

test('classless line: sentence alone, then evidence, then text, then text and evidence', () => {
  assert.deepEqual(one(`${HEAD} | ${S}`), ['unclassified', S, '']);
  assert.deepEqual(one(`${HEAD} | ${S} | evidence: e1`), ['unclassified', S, 'e1']);
  assert.deepEqual(one(`${HEAD} | ${S} | more text`), ['unclassified', `${S} | more text`, '']);
  assert.deepEqual(one(`${HEAD} | ${S} | more text | evidence: e1`), ['unclassified', `${S} | more text`, 'e1']);
});

test('labelled line: text alone, text and evidence; a label with nothing after it stays malformed', () => {
  assert.deepEqual(one(`${HEAD} | missing-rule | t`), ['missing-rule', 't', '']);
  assert.deepEqual(one(`${HEAD} | missing-rule | t | evidence: e1`), ['missing-rule', 't', 'e1']);
  const bare = fb.parseJudge(`${HEAD} | missing-rule`);
  assert.deepEqual([bare.items.length, bare.skipped], [0, 1]);
});

test('a classless line is stored once per address, like a labelled one', () => {
  const p = fb.parseJudge(`skill-text | confirmed | verify § Step 3, plan § Step 1 | ${S}`);
  assert.deepEqual(p.items.map((i) => [i.skill, i.section, i.cls, i.text]),
    [['verify', 'Step 3', 'unclassified', S], ['plan', 'Step 1', 'unclassified', S]]);
});
