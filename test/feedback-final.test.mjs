// The two classes of the tenth verify: masking after escapes (JSON \n, URL %XX, \uXXXX), a whole private key block, a window that never
// leaves a stump of a token — and parsing whose time does not depend on a model's blanks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'skills/feedback/scripts/feedback.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'ks-fin-'));
const K = 'sk-ant-api03-' + 'A'.repeat(40);
const J = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpM';
const BS = '\\'; // one backslash

test('A: a secret after a JSON escape, a URL escape or an underscore is masked; readable names and paths stay', () => {
  const cases = [
    JSON.stringify({ p: 'x\n' + K }), JSON.stringify({ detail: 'got\n' + K }), JSON.stringify({ a: 'tab\t' + K }),
    `Authorization%20Bearer%20${J}`, `a%20${K}`, `%3D${J}`, `id_token_${J}`, `x${BS}u0022${K}`, `y${BS}n${K}`, `q${BS}t${J}`, `key=${K}&x`, `"${K}"`,
  ];
  for (const c of cases) {
    const r = fb.redact(c);
    assert.ok(!r.includes('sk-ant-api03') && !r.includes('eyJhbGciOiJ'), `${c.slice(0, 40)} → ${r}`);
    assert.match(r, /\[redacted\]/, c.slice(0, 40));
  }
  for (const ok of ['task-runner-improvements disk-usage-monitor-service risk-assessment-framework-v2', `C:${BS}new${BS}temp${BS}task-runner-improvements-service`, 'src/disk-usage-monitor-service.ts', '2026-11-15-ask-the-user-about-everything']) assert.equal(fb.redact(ok), ok, ok);
});

test('A: a private key is masked as a whole block — body and END line — and to the end of the text when it has no END', () => {
  const body = 'MHcCAQEEIBkg4LVWM9nuQ' + 'x'.repeat(40);
  assert.equal(fb.redact(`-----BEGIN EC PRIVATE KEY-----\n${body}\nabc==\n-----END EC PRIVATE KEY----- after`), '[redacted] after');
  const open = fb.redact(`note -----BEGIN PRIVATE KEY-----\n${body}`);
  assert.equal(open, 'note [redacted]');
  assert.ok(!fb.redact(`-----BEGIN RSA PRIVATE KEY-----\n${body}\n-----END RSA PRIVATE KEY-----`).includes('MHcCAQEE'));
});

test('A: the window never leaves a stump of a token, whatever the padding', () => {
  const tok = 'ghp_' + 'Z'.repeat(36);
  for (const pad of [1980, 3984, 7960, 7990, 8000, 199990]) {
    const r = fb.redact(`${'p'.repeat(2)} ${' '.repeat(pad)}${tok}`);
    assert.ok(!/ghp_/.test(r), `pad ${pad}: ${r}`);
  }
  const big = 'eyJ' + 'a'.repeat(7900) + '.' + 'b'.repeat(12) + '.c ' + ' '.repeat(100) + tok;
  assert.ok(!/ghp_|eyJa/.test(fb.redact(big)), 'a huge token before another one');
  const f = join(tmp(), 't.jsonl');
  const row = (o) => JSON.stringify(o);
  writeFileSync(f, [row({ type: 'user', message: { role: 'user', content: '<command-name>/keystone:implement</command-name>' } }),
    row({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'a', name: 'Bash', input: { command: 'x', body: `retry${BS}n${K}` } }] } }),
    row({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: JSON.stringify({ detail: 'got\n' + K }), is_error: true }] } }),
    row({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 'b', name: 'Bash', input: { command: 'x', body: `retry${BS}n${K}` } }] } })].join('\n') + '\n');
  const t = fb.readTrail(f);
  assert.ok(!JSON.stringify([t.errors, t.repeats]).includes('sk-ant-api03'), JSON.stringify([t.errors, t.repeats]).slice(0, 200));
});

test('B: the time of `add` does not depend on the blanks a model writes — a line, a megabyte, many lines, pipes, commas', () => {
  const t0 = Date.now();
  const cases = [
    () => fb.parseSelf(`unclear | plan § A${' '.repeat(80000)}z | x`),
    () => fb.parseSelf(`unclear | plan § A${' '.repeat(400000)}z | x`),
    () => fb.parseJudge(`skill-text | added | plan § A${' '.repeat(400000)} | c | t`),
    () => fb.parseSelf('unclear | plan § A | ' + 'x '.repeat(500000)),
    () => fb.parseSelf('unclear | ' + 'plan § A, '.repeat(100000) + '| x'),
    () => fb.parseSelf('unclear | plan § A | t\n'.repeat(100000)),
    () => fb.parseSelf('unclear | ' + '§ '.repeat(100000) + '| x'),
    () => fb.parseJudge('skill-text | added | plan § A | c | ' + '| '.repeat(100000) + 'evidence: x'),
    () => fb.parseSelf(`unclear | plan § A${'\t '.repeat(200000)}z | x`),
  ];
  for (const c of cases) c();
  assert.ok(Date.now() - t0 < 3000, `parsing took ${Date.now() - t0} ms`);
  const p = fb.parseSelf(`unclear | plan § A${' '.repeat(80000)}z | x`);
  assert.deepEqual([p.items.length, p.items[0].section], [1, 'A z'], 'the blanks are flattened, the report is still read');
  const store = tmp();
  const e = { ...process.env, KEYSTONE_FEEDBACK_DIR: store }; delete e.KEYSTONE_FEEDBACK;
  const a = Date.now();
  const r = spawnSync(process.execPath, [SCRIPT, 'add', '--skill', 'plan', '--task', 'x'], { input: `unclear | plan § A${' '.repeat(400000)}z | x`, env: e, encoding: 'utf8' });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^Keystone feedback: 1 notes/);
  assert.ok(Date.now() - a < 5000, `add took ${Date.now() - a} ms`);
  assert.ok(existsSync(store) && readdirSync(store).length === 1);
  assert.ok(readFileSync(join(store, readdirSync(store)[0], 'feedback.jsonl'), 'utf8').length < 2000);
});

// ---- the eleventh verify: the line cut ran BEFORE masking and kept a stump of a token ------------------------------------------

test('A2: padding that redact() later deletes cannot pull the stump of a cut token into a record — every blank, fences, every cut position', () => {
  const SEC = ['ghp_' + 'Z'.repeat(36), 'AKIA' + 'ABCDEFGHIJKLMNOP', 'sk-proj-' + 'ABCDEFGHIJ'.repeat(4), J, K];
  const pads = { nbsp: String.fromCharCode(160), vt: String.fromCharCode(11), ff: String.fromCharCode(12), cr: String.fromCharCode(13), fence: '```', emsp: String.fromCharCode(0x2003), zwsp: String.fromCharCode(0x200b) };
  for (const [name, ch] of Object.entries(pads)) for (const sec of SEC) for (const n of [3900, 3959, 3980, 3990, 3995, 4000, 4010]) {
    const pad = ch.repeat(name === 'fence' ? Math.ceil(n / 3) : n);
    const self = fb.parseSelf(`unclear | plan § A | ${pad}${sec}`);
    const judge = fb.parseJudge(`skill-text | added | plan § A | c | ${pad}${sec} | evidence: ${pad}${sec}`);
    for (const it of [...self.items, ...judge.items]) {
      const all = JSON.stringify(it);
      assert.ok(!/ghp_|AKIA|sk-proj|eyJhbGci|sk-ant/.test(all), `${name} ${n} ${sec.slice(0, 8)}: ${all.slice(0, 120)}`);
    }
  }
  // through the CLI: the record on disk
  const store = tmp();
  const e = { ...process.env, KEYSTONE_FEEDBACK_DIR: store }; delete e.KEYSTONE_FEEDBACK;
  const r = spawnSync(process.execPath, [SCRIPT, 'add', '--skill', 'plan', '--task', 'probe'], { input: 'unclear | plan § A | ' + String.fromCharCode(160).repeat(3959) + 'ghp_' + 'Z'.repeat(36), env: e, encoding: 'utf8' });
  assert.equal(r.status, 0);
  const rec = readFileSync(join(store, readdirSync(store)[0], 'feedback.jsonl'), 'utf8');
  assert.ok(!/ghp_/.test(rec), rec.slice(0, 200));
  // the last token of a huge stdin
  const big = fb.parseSelf('unclear | plan § A | t\n' + ' '.repeat(1999990) + 'ghp_' + 'Z'.repeat(36));
  assert.ok(!/ghp_/.test(JSON.stringify(big)));
});

test('B2: every kind of blank is flattened before the parse patterns — 200 lines of 3 970 blanks of any kind parse in well under a second', () => {
  for (const code of [160, 11, 12, 13, 0x2003, 0x3000, 9, 32]) {
    const ch = String.fromCharCode(code);
    const line = `unclear | plan § A${ch.repeat(3970)}z | x`;
    const t0 = Date.now();
    const p = fb.parseSelf(Array.from({ length: 200 }, () => line).join('\n'));
    const q = fb.parseJudge(Array.from({ length: 200 }, () => `skill-text | added | plan § A${ch.repeat(3970)} | c | t`).join('\n'));
    assert.ok(Date.now() - t0 < 1000, `blank ${code}: ${Date.now() - t0} ms`);
    assert.equal(p.items.length > 0, true, `blank ${code}`);
    assert.ok(q.items.length > 0);
  }
});
