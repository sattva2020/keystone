// Evolve from feedback (docs/keystone/2026-11-21-evolve-from-feedback): the offer line, `evolve` / `evolved`, the evolve log,
// the «possibly fixed» list — only in the Keystone repository.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, appendFileSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'skills/feedback/scripts/feedback.mjs');
const tmp = () => mkdtempSync(join(tmpdir(), 'ks-fbe-'));
const envOf = (store) => {
  const e = { ...process.env, KEYSTONE_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store };
  for (const k of Object.keys(e)) if (/^(KEYSTONE_FEEDBACK$|CLAUDE_PLUGIN_OPTION_)/.test(k)) delete e[k];
  return e;
};
const g = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const cli = (args, { input = '', env, cwd }) => spawnSync(process.execPath, [SCRIPT, ...args], { input, env, cwd, encoding: 'utf8' });

const VERIFY = '# Verify\n\n## Step 1 — collect\nRun collect.\n\n## Step 2 — run\nRun it.\n\n**Feedback.** Write the report.\n';
// a git repository whose plugin.json is named `name`, with two skills committed and tagged v0.9.1
function repo(name = 'keystone') {
  const d = tmp();
  g(d, 'init', '-q');
  mkdirSync(join(d, '.claude-plugin'), { recursive: true });
  writeFileSync(join(d, '.claude-plugin/plugin.json'), JSON.stringify({ name, version: '0.9.1' }));
  for (const s of ['verify', 'plan']) { mkdirSync(join(d, 'skills', s), { recursive: true }); writeFileSync(join(d, 'skills', s, 'SKILL.md'), VERIFY); }
  g(d, 'add', '.'); g(d, 'commit', '-qm', 'init'); g(d, 'tag', 'v0.9.1');
  return d;
}
const plain = () => { const d = tmp(); g(d, 'init', '-q'); writeFileSync(join(d, 'a.txt'), 'a'); g(d, 'add', '.'); g(d, 'commit', '-qm', 'init'); return d; };

let seq = 0;
const item = (o) => ({ cause: 'skill-text', source: 'confirmed', skill: 'verify', section: 'Step 2 — run', cls: 'missing-rule', text: 't', evidence: 'e', ...o });
const judge = (items, o = {}) => ({ v: 1, id: `j${++seq}`, date: '2026-11-21T10:00:00Z', plugin_version: '0.9.1', project: 'p1-aaaaaa', project_path: '/x', task: 't', skill: 'feedback', session: '-', kind: 'judge', items, ...o });
const put = (store, recs) => {
  mkdirSync(join(store, 'p1-aaaaaa'), { recursive: true });
  appendFileSync(join(store, 'p1-aaaaaa', 'feedback.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return recs;
};
const OFFER = /^Keystone feedback: (\S+) has (\d+) skill-text findings of the judge to take — run \/keystone:evolve skills \1$/;
const lastLine = (s) => s.split('\n').pop();
const keysOf = (out) => [...out.matchAll(/^\| (j\d+#\d+) \|/gm)].map((m) => m[1]);

test('1: three findings to take on one skill → the summary ends with the offer line; two, or other causes and sources → no line', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  put(store, [judge([item(), item({ source: 'added' })]), judge([item({ source: 'unconfirmed' }), item({ cause: 'agent' }), item({ cause: 'environment' })])]);
  put(store, [{ ...judge([]), kind: 'self', items: [{ kind: 'unclear', skill: 'verify', section: 'Step 2 — run', text: 'x' }] }]);
  assert.doesNotMatch(fb.summary({}, env, r), /Keystone feedback: verify has/, 'two findings to take: under the threshold');
  put(store, [judge([item()])]);
  const out = fb.summary({}, env, r);
  assert.match(lastLine(out), OFFER);
  assert.deepEqual(lastLine(out).match(OFFER).slice(1), ['verify', '3']);
  assert.equal(lastLine(fb.summary({ since: '9.9.9' }, env, r)), lastLine(out), '--since does not change the offer');
});

test('2: add --kind judge prints the offer as its second line once the threshold is reached; the next summary repeats it', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  put(store, [judge([item(), item()])]);
  const res = cli(['add', '--kind', 'judge', '--skill', 'feedback', '--task', 't'], { input: 'skill-text | added | verify § Step 2 — run | missing-rule | t | evidence: e\n', env, cwd: r });
  const lines = res.stdout.trim().split('\n');
  assert.equal(lines.length, 2, res.stdout);
  assert.match(lines[0], /^Keystone feedback judge: 1 findings → /);
  assert.match(lines[1], OFFER);
  assert.match(lastLine(fb.summary({}, env, r)), OFFER);
  const self = cli(['add', '--skill', 'verify', '--task', 't'], { input: 'unclear | verify § Step 2 | x\n', env, cwd: r });
  assert.equal(self.stdout.trim().split('\n').length, 1, 'a self-report never carries the offer');
});

test('3: outside the Keystone repository neither the summary nor the judge prints the line; evolve says so', () => {
  for (const cwd of [plain(), repo('other')]) {
    const store = tmp(), env = envOf(store);
    put(store, [judge([item(), item(), item()])]);
    assert.doesNotMatch(fb.summary({}, env, cwd), /Keystone feedback: verify has/);
    const res = cli(['add', '--kind', 'judge', '--skill', 'feedback', '--task', 't'], { input: 'skill-text | added | verify § Step 2 — run | missing-rule | t | evidence: e\n', env, cwd });
    assert.equal(res.stdout.trim().split('\n').length, 1, res.stdout);
    assert.equal(fb.evolveReport({}, env, cwd), 'Keystone evolve: nothing to do — not the Keystone repository');
    assert.equal(fb.offerLine(env, cwd), '');
  }
});

test('4: evolve takes one skill — the named one, else the one with the most findings to take; keys are <record id>#<n>', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  put(store, [judge([item(), item(), item()]), judge([item({ skill: 'plan' }), item({ skill: 'plan' }), item({ skill: 'plan' }), item({ skill: 'plan' })])]);
  const top = fb.evolveReport({}, env, r);
  assert.match(top, /^## Keystone evolve — plan\n4 to take · 0 possibly fixed · 0 already in the evolve log/);
  assert.equal(keysOf(top).length, 4);
  const named = fb.evolveReport({ skill: 'verify' }, env, r);
  assert.match(named, /^## Keystone evolve — verify\n3 to take/);
  for (const k of keysOf(named)) assert.match(k, /^j\d+#[1-3]$/);
  assert.match(lastLine(fb.summary({}, env, r)), /plan has 4/);
});

test('5: a section changed after the record\'s version is «possibly fixed», not offered and not counted; no tag → taken, not checked', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  writeFileSync(join(r, 'skills/verify/SKILL.md'), VERIFY.replace('Run collect.', 'Run collect once.') + '\n## Step 3 — new\nNew.\n');
  const [a, b] = put(store, [judge([item({ section: 'Step 1 — collect' }), item({ section: 'Step 1' }), item({ section: 'Step 1 — collect' })]),
    judge([item(), item({ section: 'Step 3 — new' }), item({ section: 'Feedback' })])]);
  const [c] = put(store, [judge([item()], { plugin_version: '0.9.9' })]);
  const out = fb.evolveReport({ skill: 'verify' }, env, r);
  const [take, fixed] = out.split('### Possibly fixed');
  assert.deepEqual(keysOf(take).sort(), [`${b.id}#1`, `${b.id}#3`, `${c.id}#1`].sort(), out);
  assert.deepEqual(keysOf(fixed).sort(), [`${a.id}#1`, `${a.id}#2`, `${a.id}#3`, `${b.id}#2`].sort(), out);
  assert.match(fixed, /\| v0\.9\.1 \|$/m);
  assert.match(take, new RegExp(`^\\| ${c.id}#1 \\|.*\\| not checked: no tag v0\\.9\\.9 \\|$`, 'm'));
  assert.match(out, /^3 to take · 4 possibly fixed/m);
  assert.match(lastLine(fb.summary({}, env, r)), /verify has 3/, 'three findings only in changed sections would not reach the threshold');
  const store2 = tmp();
  put(store2, [judge([item({ section: 'Step 1 — collect' }), item({ section: 'Step 1 — collect' }), item({ section: 'Step 1 — collect' })])]);
  assert.equal(fb.offerLine(envOf(store2), r), '');
});

test('6: evolved writes the log; logged keys are never offered again and leave the threshold; a CRLF log reads the same', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  const [j] = put(store, [judge([item(), item(), item()])]);
  assert.match(fb.offerLine(env, r), OFFER);
  const res = cli(['evolved', '--skill', 'verify', '--accepted', `${j.id}#1`, '--rejected', `${j.id}#2`], { env, cwd: r });
  assert.equal(res.stdout.trim(), 'Keystone evolve: 1 accepted, 1 rejected → docs/keystone/evolve-log.md');
  const log = readFileSync(join(r, 'docs/keystone/evolve-log.md'), 'utf8');
  assert.match(log, /^# Evolve log\n\n## \d{4}-\d\d-\d\d — evolve skills \[verify\]\n/);
  assert.match(log, new RegExp(`^- ${j.id}#1 · accepted$`, 'm'));
  assert.match(log, new RegExp(`^- ${j.id}#2 · rejected$`, 'm'));
  const out = fb.evolveReport({ skill: 'verify' }, env, r);
  assert.deepEqual(keysOf(out), [`${j.id}#3`]);
  assert.match(out, /1 to take · 0 possibly fixed · 2 already in the evolve log/);
  assert.equal(fb.offerLine(env, r), '');
  cli(['evolved', '--skill', 'verify', '--rejected', `${j.id}#3`], { env, cwd: r });
  const again = readFileSync(join(r, 'docs/keystone/evolve-log.md'), 'utf8');
  assert.ok(again.startsWith(log), 'the first entry is kept as it was');
  assert.equal((again.match(/^# Evolve log$/gm) ?? []).length, 1);
  assert.match(fb.evolveReport({ skill: 'verify' }, env, r), /^Keystone evolve: nothing to do — no judge findings on the skill text to take for verify$/);
  writeFileSync(join(r, 'docs/keystone/evolve-log.md'), `# Evolve log\r\n\r\n## 2026-11-25 — evolve skills [verify]\r\n- ${j.id}#1 · accepted\r\n`);
  assert.deepEqual([...fb.evolveLog(r)], [[`${j.id}#1`, 'accepted']]);
});

test('7: evolved refuses a bad key, no keys, a foreign skill or a foreign repository — one error line, no log written', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  for (const args of [['--skill', 'verify', '--accepted', 'x y'], ['--skill', 'verify'], ['--skill', 'nope-skill', '--accepted', 'j1#1']]) {
    assert.match(cli(['evolved', ...args], { env, cwd: r }).stdout.trim(), /^Keystone evolve: error — /);
  }
  const p = plain();
  assert.match(cli(['evolved', '--skill', 'verify', '--accepted', 'j1#1'], { env, cwd: p }).stdout.trim(), /^Keystone evolve: error — not the Keystone repository$/);
  assert.ok(!existsSync(join(r, 'docs')) && !existsSync(join(p, 'docs')));
});

test('8: an empty store → evolve prints one line and creates no file', () => {
  const r = repo(), store = join(tmp(), 'none');
  const res = cli(['evolve'], { env: envOf(store), cwd: r });
  assert.equal(res.stdout, 'Keystone evolve: nothing to do — no feedback records\n');
  assert.ok(!existsSync(store), 'no store folder');
  assert.ok(!existsSync(join(r, 'docs')), 'no evolve log');
  assert.equal(g(r, 'status', '--porcelain').stdout, '');
});

test('9: no project or task name reaches the evolve output or the log', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  const [j] = put(store, [judge([item(), item(), item()], { project: 'secret-proj', project_path: '/home/secret-proj', task: 'secret-task' })]);
  const out = fb.evolveReport({}, env, r);
  fb.evolved({ skill: 'verify', accepted: `${j.id}#1` }, env, r);
  for (const s of [out, readFileSync(join(r, 'docs/keystone/evolve-log.md'), 'utf8')]) assert.ok(!/secret-(proj|task)/.test(s), s);
});

test('10: the summary counts, it never proposes a text', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  put(store, [judge([item(), item(), item()])]);
  const out = fb.summary({}, env, r);
  assert.ok(!out.includes('@@') && !out.includes('+++'));
});

test('11: the skill texts — the summary only counts, Mode skills of evolve proposes, asks, tests and never commits; the old modes stay', () => {
  const read = (f) => readFileSync(join(root, f), 'utf8');
  const has = (f, ...ss) => { const t = read(f); for (const s of ss) assert.ok(t.includes(s), `${f}: ${s}`); };
  has('skills/feedback/SKILL.md', 'no suggested fixes', '/keystone:evolve skills');
  const ev = read('skills/evolve/SKILL.md'), front = ev.split('\n---')[0];
  assert.match(front, /^argument-hint:.*skills \[<skill>\]/m);
  assert.doesNotMatch(front.match(/^description:\s*(.*)$/m)[1], /<[^<>]+>/);
  assert.match(front, /^disable-model-invocation: true$/m);
  has('skills/evolve/SKILL.md', '## Mode skills', 'feedback is off', 'Nothing is written before', 'npm test', 'leave the edits uncommitted',
    'do not revert', 'never commits', 'only record keys', 'Mode skills excepted', 'evolved --skill',
    '## Mode add — one rule you dictate', '| Verdict — evidence |', 'docs/keystone/evolve-log.md');
});

test('12: a failure while counting the offer never turns a saved judge record into an error', () => {
  const r = repo(), store = tmp(), env = envOf(store);
  mkdirSync(join(store, 'zz-000000', 'feedback.jsonl'), { recursive: true }); // readRecords fails on this entry
  const res = cli(['add', '--kind', 'judge', '--skill', 'feedback', '--task', 't'], { input: 'skill-text | added | verify § Step 2 — run | missing-rule | t | evidence: e\n', env, cwd: r });
  assert.match(res.stdout.trim(), /^Keystone feedback judge: 1 findings → /);
  assert.doesNotMatch(res.stdout, /error/);
  assert.equal(fb.offerLine(env, r), '');
});
