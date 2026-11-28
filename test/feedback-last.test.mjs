// The twelfth verify: a line of one long token must not vanish, and the hostile line (padding that redact() flattens + a token) must leave no
// stump of a token through EVERY entry point — add (self and judge), signals (a tool error, a user message, a tool input).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, mkdirSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'skills/feedback/scripts/feedback.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'ks-last-'));
const CH = (n) => String.fromCharCode(n);
const row = (o) => JSON.stringify(o);

test('a note is never lost without a trace: a line of one long token, a last token that crosses the cut, a line with nothing to cut at', () => {
  const j = (p) => [p.items.map((i) => `${i.skill}|${i.section}|${i.text}`), p.skipped];
  assert.deepEqual(j(fb.parseSelf('unclear|plan§A|' + 'x'.repeat(5000))), [['plan|A|…'], 0], 'compact form: cut after the last pipe');
  assert.deepEqual(j(fb.parseSelf('unclear | plan § A | ' + 'y'.repeat(5000))), [['plan|A|…'], 0], 'the last token is dropped and shown as …');
  assert.deepEqual(j(fb.parseSelf('x'.repeat(5000))), [[], 1], 'no format, no blank, no pipe: malformed and COUNTED');
  assert.deepEqual(j(fb.parseSelf('unclear | plan § A | ' + 'word '.repeat(2000)))[1], 0);
  assert.equal(fb.parseSelf('unclear | plan § A | ' + 'word '.repeat(2000)).items[0].text.length, 300, 'a long text is still cut to 300');
  const judge = fb.parseJudge('agent | added | plan § A | c | ' + 'z'.repeat(5000) + ' | evidence: ghp_' + 'Z'.repeat(36));
  assert.deepEqual([judge.items.length, judge.items[0].text, judge.items[0].evidence, judge.skipped], [1, '…', '', 0]);
  const store = tmp();
  const e = { ...process.env, SATTVA_FEEDBACK_DIR: store }; delete e.SATTVA_FEEDBACK;
  const run = (input) => spawnSync(process.execPath, [SCRIPT, 'add', '--skill', 'plan', '--task', 'x'], { input, env: e, encoding: 'utf8' }).stdout;
  assert.match(run('unclear|plan§A|' + 'x'.repeat(5000)), /^Sattva feedback: 1 notes/);
  assert.match(run('x'.repeat(5000)), /^Sattva feedback: no notes .* — skipped 1 malformed line\(s\)\s*$/);
});

test('the hostile line through every entry point: no stump of a token whatever the padding, the cut position or the field', () => {
  const tok = 'ghp_' + 'Z'.repeat(36);
  const pads = [CH(160), CH(11), CH(12), CH(13), CH(0x2003), CH(0x200b), CH(0x85), '```'];
  const seen = (v) => JSON.stringify(v);
  const store = tmp();
  const e = { ...process.env, SATTVA_FEEDBACK_DIR: store }; delete e.SATTVA_FEEDBACK;
  for (const pad of pads) for (const n of [3959, 3990, 4000, 4010, 8000]) {
    const p = pad.repeat(pad.length > 1 ? Math.ceil(n / 3) : n);
    // add — self and judge, through the library
    for (const parsed of [fb.parseSelf(`unclear | plan § A | ${p}${tok}`), fb.parseJudge(`agent | added | plan § A | c | ${p}${tok} | evidence: ${p}${tok}`),
      fb.parseSelf(`unclear|plan§A|${p}${tok}`)]) assert.ok(!/ghp_/.test(seen(parsed)), `parse ${pad.length > 1 ? 'fence' : pad.charCodeAt(0)} ${n}: ${seen(parsed).slice(0, 100)}`);
  }
  // add — through the CLI, the record on disk
  const r = spawnSync(process.execPath, [SCRIPT, 'add', '--skill', 'plan', '--task', 'probe'], { input: `unclear | plan § A | ${CH(160).repeat(3959)}${tok}`, env: e, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.ok(!/ghp_/.test(readFileSync(join(store, readdirSync(store)[0], 'feedback.jsonl'), 'utf8')));
  // signals — a tool error, a user message, a tool input (the hint), with every kind of padding
  const cfg = tmp(), cwd = tmp();
  mkdirSync(join(cfg, 'projects/x'), { recursive: true });
  const rows = [row({ type: 'user', message: { role: 'user', content: '<command-name>/sattva:implement</command-name> t' } })];
  pads.forEach((pad, i) => {
    const p = pad.length > 1 ? pad.repeat(1300) : pad.repeat(3959 + i);
    rows.push(row({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `a${i}`, name: 'Bash', input: { command: `${p}${tok}` } }] } }));
    rows.push(row({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: `a${i}`, content: `err:${p}${tok}`, is_error: true }] } }));
    rows.push(row({ type: 'user', message: { role: 'user', content: `${p}${tok}` } }));
    rows.push(row({ type: 'assistant', message: { content: [{ type: 'tool_use', id: `b${i}`, name: 'Bash', input: { command: `${p}${tok}` } }] } }));
  });
  const f = join(cfg, 'projects/x/s.jsonl');
  writeFileSync(f, rows.join('\n') + '\n');
  const now = new Date(); utimesSync(f, now, now);
  const out = fb.signals({ task: 'probe', transcripts: [f] }, { ...e, CLAUDE_CONFIG_DIR: cfg }, cwd);
  assert.ok(!/ghp_/.test(out), out.slice(0, 400));
  const t = fb.readTrail(f);
  assert.ok(!/ghp_/.test(seen(t)));
  assert.equal(t.errors.length, pads.length);
});
