// Class: an outcome of a Mode skills call that the step text gives no route or misdescribes.
// The script answers every failure with its own prefix, and the text says what the script really does with an open finding.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'skills/feedback/scripts/feedback.mjs');
const mode = readFileSync(join(root, 'skills/evolve/SKILL.md'), 'utf8').replace(/\r\n/g, '\n').split('\n## ').find((s) => s.startsWith('Mode skills'));
const steps = Object.fromEntries(mode.split(/\n(?=\d+\. \*\*)/).slice(1).map((s) => [s.match(/\*\*([^.*]+)/)[1], s.replace(/\s+/g, ' ')]));
const has = (name, ...ss) => { for (const s of ss) assert.ok((steps[name] ?? '').includes(s), `step ${name}: ${s} — ${steps[name]}`); };
const tmp = () => mkdtempSync(join(tmpdir(), 'ks-evo-'));
const run = (args, { store, cwd = root }) => spawnSync(process.execPath, [script, ...args], { cwd, encoding: 'utf8', env: { ...process.env, SATTVA_FEEDBACK: "", SATTVA_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store } }).stdout.trim();

test('a crash of evolve answers with the prefix of evolve', () => {
  const store = tmp();
  mkdirSync(join(store, 'zz-000000', 'feedback.jsonl'), { recursive: true });
  assert.match(run(['evolve', '--skill', 'verify'], { store }), /^Sattva evolve: error — [^\n]+$/);
});

test('an open finding: note "section not found" and "not checked" and an edit in references/ come back; an edited section does not', () => {
  const repo = tmp(), store = tmp();
  const git = (...a) => assert.equal(spawnSync('git', ['-C', repo, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]).status, 0);
  const sk = join(repo, 'skills/verify/SKILL.md'), ref = join(repo, 'skills/verify/references/X.md');
  mkdirSync(join(repo, '.claude-plugin')); mkdirSync(dirname(ref), { recursive: true });
  writeFileSync(join(repo, '.claude-plugin/plugin.json'), '{"name":"sattva","version":"0.9.1"}');
  writeFileSync(sk, '## Step 1 — a\nold\n\n## Step 2 — b\nold\n'); writeFileSync(ref, 'old\n');
  git('init', '-q'); git('add', '-A'); git('commit', '-qm', 'x'); git('tag', 'v0.9.1');
  const item = (section) => ({ skill: 'verify', section, cause: 'skill-text', source: 'added', cls: 'c', text: 't', evidence: 'e' });
  const rec = (id, plugin_version, items) => JSON.stringify({ v: 1, id, date: '2026-11-21T10:00:00Z', plugin_version, project: 'p', task: 't', skill: 'feedback', session: '-', kind: 'judge', items });
  mkdirSync(join(store, 'p-aaaaaa'));
  writeFileSync(join(store, 'p-aaaaaa/feedback.jsonl'), [rec('j1', '0.9.1', [item('Step 1 — a'), item('Step 2 — b'), item('No such part')]), rec('j2', '0.9.9', [item('Step 1 — a')])].join('\n') + '\n');
  writeFileSync(sk, '## Step 1 — a\nnew\n\n## Step 2 — b\nold\n'); writeFileSync(ref, 'new\n');
  const [take, fixed] = run(['evolve', '--skill', 'verify'], { store, cwd: repo }).split('### Possibly fixed');
  for (const k of ['j1#2', 'j1#3', 'j2#1']) assert.ok(take.includes(`| ${k} |`), take);
  assert.ok(fixed.includes('| j1#1 |'), fixed);
  has('Ask', '`not checked`', '`section not found`', '`references/`');
});

test('every call and every check of the mode has a route for each way it can end', () => {
  has('Findings', '## Sattva evolve', 'Anything else');
  has('Read', 'does not exist');
  has('Draft', 'another skill');
  has('Ask', 'in other words');
  has('Branch', 'detached');
  has('Write', 'No diff accepted', 'cannot apply', 'its keys stay open');
  has('Test', 'No result', 'background', 'leave the edits uncommitted');
});
