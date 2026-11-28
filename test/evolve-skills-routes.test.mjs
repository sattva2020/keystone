// Class: an outcome that Mode skills gives no route or misdescribes, so a taken finding ends without a diff or a decision.
// Every outcome of a finding, and every line of the script, has its route in the text of the mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const mode = readFileSync(join(root, 'skills/evolve/SKILL.md'), 'utf8').replace(/\r\n/g, '\n').split('\n## ').find((s) => s.startsWith('Mode skills'));
// the numbered steps of the mode, one line each: name → text
const steps = Object.fromEntries(mode.split(/\n(?=\d+\. \*\*)/).slice(1).map((s) => [s.match(/\*\*([^.*]+)/)[1], s.replace(/\s+/g, ' ')]));
const has = (name, ...ss) => { for (const s of ss) assert.ok((steps[name] ?? '').includes(s), `step ${name}: ${s} — ${steps[name]}`); };

test('every finding to take ends in a diff or in a question, and in one of three outcomes', () => {
  has('Draft', '`propose reject`', '`needs a script`', '`section not found`', 'never with neither');
  has('Show', 'the address', 'its class', 'its key', 'unified diff', 'or, without a diff,');
  has('Ask', '`Accept` / `Reject`', '`Reject` / `Keep open`', 'exactly one outcome', 'AskUserQuestion is unavailable');
  has('End', 'accepted, rejected and open keys');
});

test('an open finding: the text says what the script does with it', () => {
  assert.doesNotMatch(steps.Ask, /are not logged and come back next run/);
  has('Ask', 'not logged', 'Possibly fixed', '`not checked`');
});

test('every line the script can answer with has a route where it is called', () => {
  const store = mkdtempSync(join(tmpdir(), 'ks-evr-')), env = { ...process.env, SATTVA_FEEDBACK: '', SATTVA_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store };
  try {
    mkdirSync(join(store, 'p-aaaaaa'));
    writeFileSync(join(store, 'p-aaaaaa', 'feedback.jsonl'), JSON.stringify({ v: 1, id: 'j1', date: '2026-11-21T10:00:00Z', plugin_version: '0.9.1', project: 'p-aaaaaa', task: 't', skill: 'feedback', session: '-', kind: 'judge', items: [] }) + '\n');
    const err = 'Sattva evolve: error';
    assert.ok(fb.evolveReport({ skill: 'nope' }, env, root).startsWith(err));
    assert.ok(fb.evolved({ skill: 'verify' }, env, root).startsWith(err));
    has('Findings', 'Sattva evolve: nothing to do', err);
    has('Write', err, 'No key to log');
  } finally {
    rmSync(store, { recursive: true, force: true });
  }
});

test('answers are never asked for and lost: the branch is checked before any question, a red run names its log entry', () => {
  has('Branch', 'before any question');
  has('Test', 'log entry');
});

test('the steps run in this order: Findings answers its one-line ends before Branch, Branch before any question', () => {
  assert.deepEqual(Object.keys(steps), ['Off', 'Findings', 'Branch', 'Read', 'Draft', 'Show', 'Ask', 'Privacy', 'Write', 'Test', 'End']);
  has('Findings', 'Sattva evolve: nothing to do', 'Sattva evolve: error');
});

test('every place that lists what Mode skills writes names CHANGELOG.md', () => {
  const text = readFileSync(join(root, 'skills/evolve/SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
  has('Show', 'CHANGELOG.md');
  has('Write', 'whose Edit applied', '`### Changed` heading', '`verifier` → `/sattva:verify`');
  has('Test', '`CHANGELOG.md` lines');
  const intro = text.split('\n\n').find((p) => p.includes('except Mode skills'));
  assert.ok(intro?.includes('CHANGELOG.md'), `intro: ${intro}`);
  const ownership = text.split('\n').findIndex((l) => l.includes('**Ownership**'));
  assert.ok(ownership >= 0 && text.split('\n').slice(ownership, ownership + 2).join(' ').includes('CHANGELOG.md'), 'rule 10 Ownership');
});

test('CHANGELOG: the Mode skills line is part of the unreleased Added item, not a Changed item', () => {
  const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8').replace(/\s+/g, ' ');
  const sections = log.split(/ (?=## \[)/);
  // CHANGELOG is history: entries before 0.10.0 keep the old plugin prefix, so match the command without it.
  const section = sections.find((s) => s.includes(':evolve skills'));
  assert.ok(section, 'a version section with the /sattva:evolve skills item');
  const added = section.indexOf('### Added'), changed = section.indexOf('### Changed'), line = section.indexOf('also writes a `CHANGELOG.md` line');
  assert.ok(added >= 0 && line > added && (changed < 0 || line < changed), 'the line sits between ### Added and ### Changed');
  assert.ok(!log.includes('Mode skills writes a `CHANGELOG.md` line'), 'no separate Changed item');
});

test('an accepted section gets its CHANGELOG line, written by Mode skills itself', () => {
  has('Write', '`CHANGELOG.md`', '`## [Unreleased]`', 'one line per accepted section');
  has('End', 'CHANGELOG');
});

test('SATTVA_FEEDBACK=off: evolve and evolved answer the Off line and write nothing', () => {
  const store = mkdtempSync(join(tmpdir(), 'ks-evoff-')), env = { ...process.env, SATTVA_FEEDBACK: 'off', SATTVA_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store };
  const line = 'Sattva evolve: nothing to do — feedback is off';
  assert.equal(fb.evolveReport({}, env, root), line);
  assert.equal(fb.evolved({ skill: 'verify', accepted: '20261121-121824-feedback-8020#6' }, env, root), line);
  rmSync(store, { recursive: true, force: true });
});
