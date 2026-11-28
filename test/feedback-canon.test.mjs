// A judge line without a class keeps its text; one skill section written two ways counts once in the summary.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, appendFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'ks-fbc-'));
const envOf = (store) => {
  const e = { ...process.env, SATTVA_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store };
  for (const k of Object.keys(e)) if (/^(SATTVA_FEEDBACK$|CLAUDE_PLUGIN_OPTION_)/.test(k)) delete e[k];
  return e;
};
const put = (store, recs) => {
  mkdirSync(join(store, 'p1-aaaaaa'), { recursive: true });
  appendFileSync(join(store, 'p1-aaaaaa', 'feedback.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
};
const judge = (id, items) => ({ v: 1, id, date: '2026-11-21T10:00:00Z', plugin_version: '0.9.39', project: 'p1-aaaaaa', project_path: '/x', task: 't', skill: 'feedback', session: '-', kind: 'judge', items });
const item = (o) => ({ cause: 'skill-text', source: 'added', skill: 'verify', section: 'Step 3', cls: 'missing-rule', text: 't', evidence: '', ...o });
const candidates = (store) => fb.summary({}, envOf(store)).split('### Candidates')[1].split('###')[0];
const rows = (t) => t.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| address'));

const SENTENCE = 'Текст требует вставить вывод дословно, но не говорит, как это сделать для фонового агента.';

test('1: a judge line without a class is stored with class unclassified, its sentence as text, evidence as evidence', () => {
  const p = fb.parseJudge(`skill-text | confirmed | verify § Step 3 | ${SENTENCE} | evidence: self-report 1, SKILL.md line 10`);
  assert.equal(p.items.length, 1);
  assert.deepEqual([p.items[0].cls, p.items[0].text, p.items[0].evidence], ['unclassified', SENTENCE, 'self-report 1, SKILL.md line 10']);
  const label = fb.parseJudge('skill-text | added | verify § Step 3 | missing-rule');
  assert.deepEqual([label.items.length, label.skipped], [0, 1], 'four fields with a label as the fourth: no text, still malformed');
  const ok = fb.parseJudge('skill-text | added | verify § Step 3 | missing-rule | t | evidence: e');
  assert.deepEqual([ok.items[0].cls, ok.items[0].text, ok.items[0].evidence], ['missing-rule', 't', 'e'], 'a labelled line is unchanged');
});

test('2: a finding stored shifted is shown repaired; the file on disk is not rewritten', () => {
  const store = tmp();
  put(store, [judge('j1', [item({ cls: SENTENCE, text: 'evidence: self-report 1' })])]);
  const file = join(store, 'p1-aaaaaa', 'feedback.jsonl');
  const before = readFileSync(file);
  const i = fb.readRecords(envOf(store))[0].items[0];
  assert.deepEqual([i.cls, i.text, i.evidence], ['unclassified', SENTENCE, 'self-report 1']);
  const r = rows(candidates(store));
  assert.equal(r.length, 1);
  assert.match(r[0], /^\| verify § Step 3 \| unclassified \| 1 \|/);
  assert.ok(readFileSync(file).equals(before), 'feedback.jsonl is byte-for-byte the same');
});

test('3: two spellings of one skill anchor with one class are one summary row', () => {
  const store = tmp();
  put(store, [judge('j1', [item({ section: 'Step 3' })]), judge('j2', [item({ section: 'Step 3 — the verifier' })])]);
  const r = rows(candidates(store));
  assert.equal(r.length, 1, r.join('\n'));
  assert.match(r[0], /^\| verify § Step 3 \| missing-rule \| 2 \|/, 'the address is shown as the first record wrote it');
});

test('4: a section with no anchor or an ambiguous one stays its own row, as written', () => {
  const store = tmp();
  put(store, [judge('j1', [item({ section: 'Step 2' })]), judge('j2', [item({ section: 'Made-up heading nobody wrote' })]), judge('j3', [item({ section: 'Step 3' })])]);
  const r = rows(candidates(store));
  assert.equal(r.length, 3, r.join('\n'));
  assert.ok(r.some((l) => l.startsWith('| verify § Step 2 | missing-rule | 1 |')));
  assert.ok(r.some((l) => l.startsWith('| verify § Made-up heading nobody wrote | missing-rule | 1 |')));
});

test('5: different classes in one section are different rows', () => {
  const store = tmp();
  put(store, [judge('j1', [item({ section: 'Step 3', cls: 'missing-rule' })]), judge('j2', [item({ section: 'Step 3 — the verifier', cls: 'vague-wording' })])]);
  const r = rows(candidates(store));
  assert.equal(r.length, 2, r.join('\n'));
});
