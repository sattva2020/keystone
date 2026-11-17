import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, mkdirSync, copyFileSync, appendFileSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(root, 'skills/feedback/scripts/feedback.mjs');
const FIX = join(root, 'test/fixtures/feedback');
const tmp = () => mkdtempSync(join(tmpdir(), 'ks-fb-'));
const PLAN = 'docs/keystone/2026-01-01-fixture/plan.md';

// the environment of a test: no feedback switches from the outside, storage in a temp folder
const envOf = (store, extra = {}) => {
  const e = { ...process.env, KEYSTONE_FEEDBACK_DIR: store, ...extra };
  for (const k of Object.keys(e)) if (/^(KEYSTONE_FEEDBACK$|CLAUDE_PLUGIN_OPTION_)/.test(k) && !(k in extra)) delete e[k];
  return e;
};
const g = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const repo = () => { const d = tmp(); g(d, 'init', '-q'); writeFileSync(join(d, 'a.txt'), 'a'); g(d, 'add', '.'); g(d, 'commit', '-qm', 'init'); return d; };
const records = (store) => {
  const out = [];
  for (const d of existsSync(store) ? readdirSyncSafe(store) : []) {
    const f = join(store, d, 'feedback.jsonl');
    if (existsSync(f)) out.push(...readFileSync(f, 'utf8').trim().split('\n').map((l) => JSON.parse(l)));
  }
  return out;
};
import { readdirSync } from 'node:fs';
const readdirSyncSafe = (d) => readdirSync(d);
const cli = (args, { input = '', env, cwd } = {}) => spawnSync(process.execPath, [SCRIPT, ...args], { input, env, cwd, encoding: 'utf8' });

// ---- Task 1: add / hook / storage ----------------------------------------------------------------------------------

test('add: none → empty record and "no notes"', () => {
  const store = tmp(), cwd = repo();
  const r = fb.add({ skill: 'start', task: '-' }, 'none\n', envOf(store), cwd);
  assert.match(r.line, /^Keystone feedback: no notes \(/);
  assert.deepEqual(records(store)[0].items, []);
});

test('add: 3 good lines + 1 malformed → 3 items and a skipped warning, one line', () => {
  const store = tmp(), cwd = repo();
  const text = ['unclear | plan § Step 2 | what is "Settings"?', 'deviated | plan § Step 3 | skipped the grill, the user said so', 'guessed | plan § Step 4 | which test command', 'this is not a note'].join('\n');
  const r = fb.add({ skill: 'plan', task: 'x' }, text, envOf(store), cwd);
  assert.match(r.line, /^Keystone feedback: 3 notes → .*feedback\.jsonl \(.+\) — skipped 1 malformed line\(s\)$/);
  assert.equal(r.line.split('\n').length, 1);
  assert.equal(records(store)[0].items.length, 3);
  assert.deepEqual(records(store)[0].items[0], { kind: 'unclear', skill: 'plan', section: 'Step 2', text: 'what is "Settings"?' });
});

test('add: 12 lines → first 10 and truncated', () => {
  const store = tmp(), cwd = repo();
  const text = Array.from({ length: 12 }, (_, i) => `extra | plan § S${i} | note ${i}`).join('\n');
  const r = fb.add({ skill: 'plan', task: 'x' }, text, envOf(store), cwd);
  assert.match(r.line, /only the first 10 lines and 30 notes kept/);
  assert.equal(records(store)[0].items.length, 10);
});

test('add: secrets, fences and long fields are cleaned — also in judge evidence', () => {
  const store = tmp(), cwd = repo();
  const secrets = ['sk-ant-' + 'a'.repeat(30), 'ghp_' + 'B'.repeat(24), 'AKIA' + 'C'.repeat(16), '-----BEGIN RSA PRIVATE KEY-----', 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.sig'];
  fb.add({ skill: 'verify', task: 'x' }, `guessed | verify § Step 1 | ${secrets.join(' ')} \`\`\`code\`\`\``, envOf(store), cwd);
  const t = records(store)[0].items[0].text;
  for (const s of secrets) assert.ok(!t.includes(s), s);
  assert.equal(t.match(/\[redacted\]/g).length, 4, 'three tokens and a private key block that runs to the end of the text (the JWT after it is inside the block)');
  assert.ok(!t.includes('```'));
  fb.add({ skill: 'feedback', task: 'x', kind: 'judge' }, `skill-text | added | verify § Step 1 | unclear | something | evidence: ${secrets[0]} ${'z'.repeat(400)}`, envOf(store), cwd);
  const ev = records(store)[1].items[0].evidence;
  assert.ok(!ev.includes('sk-ant-'));
  assert.ok(ev.length <= 300);
  const long = fb.parseSelf(`unclear | plan § S | ${'y'.repeat(400)}`).items[0].text;
  assert.equal(long.length, 300);
});

test('add: task and skill keys are normalised', () => {
  const store = tmp(), cwd = repo();
  for (const t of ['docs/keystone/x/plan.md', 'docs/keystone/x/', 'x', 'docs\\keystone\\x\\plan.md']) fb.add({ skill: 'keystone:start', task: t }, 'none', envOf(store), cwd);
  const rs = records(store);
  assert.deepEqual(rs.map((r) => r.task), ['x', 'x', 'x', 'x']);
  assert.ok(rs.every((r) => r.skill === 'start'));
  assert.equal(fb.taskName(undefined), '-');
});

test('add: two records → two jsonl lines, every field in place', () => {
  const store = tmp(), cwd = repo();
  fb.add({ skill: 'start', task: 'x', session: 's1' }, 'none', envOf(store), cwd);
  fb.add({ skill: 'start', task: 'x' }, 'none', envOf(store), cwd);
  const [a, b] = records(store);
  for (const k of ['v', 'id', 'date', 'plugin_version', 'project', 'project_path', 'task', 'skill', 'session', 'kind', 'items']) assert.ok(k in a, k);
  assert.equal(a.session, 's1');
  assert.equal(b.session, '-');
  assert.equal(a.kind, 'self');
  assert.match(a.id, /^\d{8}-\d{6}-start-[0-9a-f]{4}$/);
  assert.equal(a.plugin_version, JSON.parse(readFileSync(join(root, '.claude-plugin/plugin.json'), 'utf8')).version);
  assert.equal(readFileSync(join(store, a.project, 'feedback.jsonl'), 'utf8').trim().split('\n').length, 2);
});

test('projectDir: a worktree and its main checkout share a folder; path spellings share a folder', () => {
  const store = tmp(), main = repo();
  const wt = join(tmp(), 'wt');
  assert.equal(g(main, 'worktree', 'add', '-q', wt, '-b', 'side').status, 0);
  const e = envOf(store);
  assert.equal(fb.projectDir(main, e).dir, fb.projectDir(wt, e).dir);
  assert.equal(fb.projectDir('E:\\x\\repo', e).dir, fb.projectDir('e:/x/repo/', e).dir);
  assert.match(fb.projectDir('e:/x/repo', e).name, /^repo-[0-9a-f]{6}$/);
});

test('add: KEYSTONE_FEEDBACK=off writes nothing; without a switch add still writes (the option is checked by the hook only)', () => {
  const store = tmp(), cwd = repo();
  const r = cli(['add', '--skill', 'start'], { input: 'none', env: envOf(store, { KEYSTONE_FEEDBACK: 'off' }), cwd });
  assert.equal(r.stdout, '');
  assert.equal(r.status, 0);
  assert.equal(existsSync(store) && records(store).length, 0);
  const w = cli(['add', '--skill', 'start'], { input: 'none', env: envOf(store), cwd });
  assert.match(w.stdout, /^Keystone feedback: no notes/);
  assert.equal(records(store).length, 1);
});

test('add --kind judge: one malformed line → error and no record; none → empty record; hash and tokens kept', () => {
  const store = tmp(), cwd = repo();
  const bad = fb.add({ skill: 'feedback', task: 'x', kind: 'judge', hash: 'aaaaaaaaaaaa' }, 'looks fine to me', envOf(store), cwd);
  assert.equal(bad.line, 'Keystone feedback judge: error — no parseable line');
  assert.equal(records(store).length, 0);
  const none = fb.add({ skill: 'feedback', task: 'x', kind: 'judge', hash: 'aaaaaaaaaaaa', tokens: '1234' }, 'none', envOf(store), cwd);
  assert.match(none.line, /^Keystone feedback judge: no findings/);
  const ok = fb.add({ skill: 'feedback', task: 'x', kind: 'judge', hash: 'bbbbbbbbbbbb' }, 'skill-text | added | implement § Step 4 | missing-rule | no rule for X | evidence: 3 retries\nagent | confirmed | verify § Step 2 | skipped-step | did not run it', envOf(store), cwd);
  assert.match(ok.line, /^Keystone feedback judge: 2 findings/);
  const rs = records(store);
  assert.equal(rs[0].kind, 'judge');
  assert.equal(rs[0].hash, 'aaaaaaaaaaaa');
  assert.equal(rs[0].tokens, 1234);
  assert.deepEqual(rs[1].items[0], { cause: 'skill-text', source: 'added', skill: 'implement', section: 'Step 4', cls: 'missing-rule', text: 'no rule for X', evidence: '3 retries' });
  assert.equal(rs[1].items[1].evidence, '');
  assert.equal(fb.parseJudge('skill-text | added | verify § S | cls | text').items.length, 1);
  assert.equal(fb.parseJudge('skill-text | added | verify § S | text').items.length, 0, 'class is required');
  assert.equal(fb.parseJudge('whatever | added | verify § S | cls | text').items.length, 0, 'cause is required');
});

test('hook: silent without a switch; on → instruction with path in quotes, session, rules; option and off', () => {
  const store = tmp();
  assert.equal(cli(['hook'], { input: '{"session_id":"s1"}', env: envOf(store) }).stdout, '');
  const on = cli(['hook'], { input: '{"session_id":"s1"}', env: envOf(store, { KEYSTONE_FEEDBACK: 'on' }) });
  assert.equal(on.status, 0);
  const out = JSON.parse(on.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  const c = out.hookSpecificOutput.additionalContext;
  assert.ok(c.startsWith('Keystone feedback: on'));
  assert.match(c, /node '[^'\\]+\/skills\/feedback\/scripts\/feedback\.mjs' add --skill <skill> --task "<task folder name or ->" --session s1 /);
  assert.match(c, /^session: s1$/m);
  for (const w of ['unclear', 'deviated', 'guessed', 'extra', '§', 'language of the conversation', '`auto <plan path>`', 'and the Final report is printed, and before the Step 6 menu', 'REQUIRED last step', 'MUST contain that line verbatim',
    'first the self-report of verify', 'not an action outside the repository', 'literal commands that push to git or create a PR', '`none`']) assert.ok(c.includes(w), w);
  assert.ok(!/PowerShell/i.test(c));
  assert.ok(!/git push|gh pr create/.test(c), 'the instruction itself must not trip the push gate');
  assert.match(cli(['hook'], { input: '{}', env: envOf(store, { KEYSTONE_FEEDBACK: 'on' }) }).stdout, /session: -/);
  for (const v of ['true', '1', 'ON']) assert.ok(cli(['hook'], { input: '{}', env: envOf(store, { CLAUDE_PLUGIN_OPTION_FEEDBACK: v }) }).stdout.includes('Keystone feedback: on'), v);
  assert.ok(cli(['hook'], { input: '{}', env: envOf(store, { CLAUDE_PLUGIN_OPTION_feedback: 'true' }) }).stdout.includes('Keystone feedback: on'));
  assert.equal(cli(['hook'], { input: '{}', env: envOf(store, { CLAUDE_PLUGIN_OPTION_FEEDBACK: 'false' }) }).stdout, '');
  assert.equal(cli(['hook'], { input: '{}', env: envOf(store, { CLAUDE_PLUGIN_OPTION_FEEDBACK: 'true', KEYSTONE_FEEDBACK: 'off' }) }).stdout, '');
  assert.equal(cli(['hook'], { input: 'not json', env: envOf(store) }).stdout, '');
  assert.equal(fb.enabled({ KEYSTONE_FEEDBACK: 'off', CLAUDE_PLUGIN_OPTION_FEEDBACK: 'true' }), false);
});

test('context: a plugin root with a space stays one quoted path with forward slashes', () => {
  const c = fb.context('C:\\Users\\John Smith\\.claude\\plugins\\keystone\\', 'abc');
  assert.ok(c.includes("node 'C:/Users/John Smith/.claude/plugins/keystone/skills/feedback/scripts/feedback.mjs' add"));
  assert.ok(c.includes('session abc') || c.includes('--session abc'));
});

test('add: storage path that is a file → one error line, exit 0', () => {
  const blocker = join(tmp(), 'blocker');
  writeFileSync(blocker, 'x');
  const r = cli(['add', '--skill', 'start'], { input: 'none', env: envOf(blocker), cwd: repo() });
  assert.equal(r.status, 0);
  assert.match(r.stdout, /^Keystone feedback: error — .+/);
  assert.equal(r.stdout.trim().split('\n').length, 1);
});

test('feedback.mjs: no network, no deletion, only appends to feedback.jsonl', () => {
  const src = readFileSync(SCRIPT, 'utf8');
  for (const bad of ['fetch(', 'node:http', 'node:https', 'node:net', 'unlinkSync', 'rmSync', 'truncateSync', 'writeFileSync']) assert.ok(!src.includes(bad), bad);
  assert.ok(src.includes('appendFileSync'));
});

// ---- Task 2: signals ------------------------------------------------------------------------------------------------

// a repo with a committed plan, a config dir with the given transcripts
function world({ transcripts = ['noisy.jsonl'], commitPlan = true } = {}) {
  const cwd = repo(), store = tmp(), cfg = tmp();
  mkdirSync(join(cwd, 'docs/keystone/2026-01-01-fixture'), { recursive: true });
  writeFileSync(join(cwd, PLAN), '# Plan\nLevel: M · Mode: feature · Status: implementing\n');
  if (commitPlan) { g(cwd, 'add', '.'); g(cwd, 'commit', '-qm', 'plan'); }
  mkdirSync(join(cfg, 'projects/x'), { recursive: true });
  const now = new Date(); // a fixture keeps its old mtime when copied: the transcripts of a test are "just written"
  transcripts.forEach((f, i) => { const to = join(cfg, 'projects/x', `s${i}.jsonl`); copyFileSync(join(FIX, f), to); utimesSync(to, now, now); });
  return { cwd, store, cfg, env: envOf(store, { CLAUDE_CONFIG_DIR: cfg }) };
}
const verifyCommit = (cwd, verdict) => { writeFileSync(join(cwd, 'docs/keystone/2026-01-01-fixture/verify.md'), `# Verify\nDate: x · Verdict: ${verdict}\n`); g(cwd, 'add', '.'); g(cwd, 'commit', '-qm', `verify ${verdict}`); };

test('readTrail: noisy fixture counts are exact', () => {
  const t = fb.readTrail(join(FIX, 'noisy.jsonl'));
  assert.deepEqual([...t.skills].sort(), ['implement', 'verify']);
  assert.equal(t.errors.length, 4);
  assert.equal(t.errors[0].tool, 'Bash');
  assert.equal(t.interrupts, 1);
  assert.deepEqual(t.userMsgs, ['нет, не так, переделай', 'и добавь обработку пустого ввода']);
  assert.deepEqual(t.repeats.map((r) => [r.tool, r.n]), [['Read', 3]]);
});

test('signals: noisy → judge yes with errors, interrupts, user messages; repeats shown but not a reason', () => {
  const w = world();
  const out = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(out, /tool errors: 4/);
  assert.match(out, /repeated calls: 1\n- Read ×3: src\/a\.js/);
  assert.match(out, /judge: yes — tool errors 4, interrupts 1, user messages 2$/m);
  assert.ok(!/judge: .*repeat/.test(out));
  assert.match(out, /^hash: [0-9a-f]{12}$/m);
});

test('signals: clean → no — clean run', () => {
  const w = world({ transcripts: ['clean.jsonl'] });
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), /judge: no — clean run$/m);
});

test('signals: a self-report of the task is listed; a judge record with the same hash → already judged', () => {
  const w = world();
  fb.add({ skill: 'implement', task: PLAN }, 'unclear | implement § Step 4 | which test to run', w.env, w.cwd);
  const out = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(out, /## Self-reports\n- .+ \(implement\): \n  unclear \| implement § Step 4 \| which test to run/);
  const hash = out.match(/^hash: (\w+)$/m)[1];
  assert.match(out, /judge: yes/);
  const j = fb.add({ skill: 'feedback', task: PLAN, kind: 'judge', hash }, 'none', w.env, w.cwd);
  const again = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(again, new RegExp(`judge: no — already judged ${j.record.id}`));
});

test('signals --auto: one judge per task even when a new verify round changes the hash; on request it runs again', () => {
  const w = world();
  const hash = fb.signals({ plan: PLAN }, w.env, w.cwd).match(/^hash: (\w+)$/m)[1];
  const j = fb.add({ skill: 'feedback', task: PLAN, kind: 'judge', hash }, 'none', w.env, w.cwd);
  verifyCommit(w.cwd, 'FAIL');
  const auto = fb.signals({ plan: PLAN, auto: true }, w.env, w.cwd);
  assert.match(auto, new RegExp(`judge: no — task already judged ${j.record.id}`));
  const manual = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(manual, /judge: yes — FAIL, /);
});

test('signals: git part — two verify.md commits and Verdict FAIL are reasons', () => {
  const w = world({ transcripts: ['clean.jsonl'] });
  verifyCommit(w.cwd, 'PASS-UNPROVEN');
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), /judge: no — clean run/);
  verifyCommit(w.cwd, 'FAIL');
  const out = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(out, /verify\.md commits: 2/);
  assert.match(out, /judge: yes — FAIL, verify rounds 2$/m);
});

test('signals: an uncommitted plan bounds transcripts by its mtime minus 1 hour', () => {
  const w = world({ commitPlan: false });
  const old = new Date(Date.now() - 5 * 3600 * 1000);
  utimesSync(join(w.cfg, 'projects/x/s0.jsonl'), old, old);
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), /sessions: 0/);
  const fresh = new Date();
  utimesSync(join(w.cfg, 'projects/x/s0.jsonl'), fresh, fresh);
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), /sessions: 1/);
});

test('signals --session finds <id>.jsonl in any projects folder; no plan needed', () => {
  const w = world();
  copyFileSync(join(FIX, 'noisy.jsonl'), join(w.cfg, 'projects/x/abc-123.jsonl'));
  const out = fb.signals({ session: 'abc-123' }, w.env, w.cwd);
  assert.match(out, /sessions: 1/);
  assert.match(out, /tool errors: 4/);
  fb.add({ skill: 'implement', task: '-', session: 'abc-123' }, 'extra | implement § Step 2 | not needed', w.env, w.cwd);
  assert.match(fb.signals({ session: 'abc-123' }, w.env, w.cwd), /extra \| implement § Step 2 \| not needed/);
});

test('signals: a broken JSONL line does not stop the parse', () => {
  const w = world();
  const f = join(w.cfg, 'projects/x/s0.jsonl');
  appendFileSync(f, '{"type":"user","message": tool_use broken\n');
  const out = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(out, /tool errors: 4/);
  assert.match(out, /1 unreadable line\(s\) skipped/);
});

test('signals: the feedback machinery is not part of the trail — same hash after a judge run; feedback-only sessions are not taken', () => {
  const w = world();
  const tr = join(w.cfg, 'projects/x/s0.jsonl');
  const before = fb.signals({ task: 'fixture', transcripts: [tr] }, w.env, w.cwd).match(/^hash: (\w+)$/m)[1];
  const use = (id, name, input) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } });
  const res = (id) => JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: id, content: 'boom', is_error: true }] } });
  appendFileSync(tr, [
    JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/keystone:feedback</command-name>' } }),
    use('f1', 'Skill', { skill: 'keystone:feedback', args: `auto ${PLAN}` }), res('f1'),
    use('f2', 'Bash', { command: `node "/p/skills/feedback/scripts/feedback.mjs" signals ${PLAN} --auto` }), use('f3', 'Bash', { command: `node "/p/skills/feedback/scripts/feedback.mjs" signals ${PLAN} --auto` }), res('f2'),
  ].join('\n') + '\n');
  const after = fb.signals({ task: 'fixture', transcripts: [tr] }, w.env, w.cwd);
  assert.equal(after.match(/^hash: (\w+)$/m)[1], before);
  fb.add({ skill: 'feedback', task: 'fixture', kind: 'judge', hash: before }, 'none', w.env, w.cwd);
  assert.match(fb.signals({ task: 'fixture', transcripts: [tr] }, w.env, w.cwd), /judge: no — already judged/);
  const only = join(w.cfg, 'projects/x/only.jsonl');
  writeFileSync(only, JSON.stringify({ type: 'user', message: { role: 'user', content: '<command-name>/keystone:feedback</command-name> 2026-01-01-fixture' } }) + '\n');
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), /sessions: 1/);
});

// ---- Task 3: summary -----------------------------------------------------------------------------------------------

const put = (store, project, recs) => { mkdirSync(join(store, project), { recursive: true }); appendFileSync(join(store, project, 'feedback.jsonl'), recs.map((r) => JSON.stringify(r)).join('\n') + '\n'); };
const rec = (o) => ({ v: 1, id: o.id, date: '2026-11-12T10:00:00Z', plugin_version: '0.9.30', project: o.project, project_path: '/x', task: 't', skill: 'feedback', session: '-', kind: 'self', items: [], ...o });
const jitem = (o = {}) => ({ cause: 'skill-text', source: 'added', skill: 'implement', section: 'Step 4', cls: 'missing-rule', text: 't', evidence: '', ...o });

test('summary: one problem in two projects → one row with count 2; agent cause is not a candidate', () => {
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 'j1', project: 'p1-aaaaaa', kind: 'judge', items: [jitem(), jitem({ cause: 'agent', section: 'Step 9' })] })]);
  put(store, 'p2-bbbbbb', [rec({ id: 'j2', project: 'p2-bbbbbb', kind: 'judge', items: [jitem({ section: ' step 4 ', cls: 'Missing-Rule' }), jitem({ cause: 'environment', section: 'Step 1' })] })]);
  const out = fb.summary({}, envOf(store));
  const cand = out.split('### Candidates')[1].split('###')[0];
  assert.match(cand, /\| implement § Step 4 \| missing-rule \| 2 \| p1-aaaaaa, p2-bbbbbb \|/);
  assert.ok(!cand.includes('Step 9'));
  assert.match(out, /agent: 1 · environment: 1/);
});

test('summary: self-reports of judged tasks are hidden, of unjudged tasks shown; runs count none-records too', () => {
  const store = tmp();
  const item = (section) => [{ kind: 'unclear', skill: 'plan', section, text: 't' }];
  put(store, 'p1-aaaaaa', [
    rec({ id: 's1', project: 'p1-aaaaaa', task: 'judged', skill: 'plan', items: item('Judged step') }),
    rec({ id: 's2', project: 'p1-aaaaaa', task: 'open', skill: 'plan', items: item('Open step') }),
    rec({ id: 's3', project: 'p1-aaaaaa', task: 'open', skill: 'start', items: [] }),
    rec({ id: 'j1', project: 'p1-aaaaaa', task: 'judged', kind: 'judge', items: [] }),
  ]);
  const out = fb.summary({}, envOf(store));
  const un = out.split('### Self-reports of unjudged tasks')[1].split('###')[0];
  assert.ok(un.includes('plan § Open step'));
  assert.ok(!un.includes('Judged step'));
  assert.match(out, /- plan: 2 runs, 2 with notes/);
  assert.match(out, /- start: 1 runs, 0 with notes/);
});

test('summary --since hides records of older plugin versions', () => {
  const store = tmp();
  put(store, 'p1-aaaaaa', [
    rec({ id: 'old', project: 'p1-aaaaaa', plugin_version: '0.9.29', kind: 'judge', items: [jitem({ section: 'Old' })] }),
    rec({ id: 'new', project: 'p1-aaaaaa', plugin_version: '0.9.30', kind: 'judge', items: [jitem({ section: 'New' })] }),
    rec({ id: 'ten', project: 'p1-aaaaaa', plugin_version: '0.9.100', kind: 'judge', items: [jitem({ section: 'Ten' })] }),
  ]);
  const out = fb.summary({ since: '0.9.30' }, envOf(store));
  assert.ok(!out.includes('Old'));
  assert.ok(out.includes('New') && out.includes('Ten'));
  assert.ok(fb.summary({}, envOf(store)).includes('Old'));
  assert.match(cli(['summary', '--since', '0.9.30'], { env: envOf(store) }).stdout, /plugin ≥ 0\.9\.30/);
});

// ---- boundary input and "never judged twice" (found by the first verify) --------------------------------------------

test('hook: input that is not a hook object stays silent; an odd session id never reaches the instruction', () => {
  const store = tmp(), env = envOf(store, { KEYSTONE_FEEDBACK: 'on' });
  for (const input of ['null', '123', '"x"', '[]', 'true', '']) {
    const r = cli(['hook'], { input, env });
    assert.equal(r.status, 0, input);
    if (input === '') assert.match(r.stdout, /Keystone feedback: on/, 'empty stdin is a hook without data: still on');
    else assert.equal(r.stdout, '', `stdin ${input}`);
  }
  const odd = JSON.parse(cli(['hook'], { input: JSON.stringify({ session_id: 'a\nb "c"' }), env }).stdout).hookSpecificOutput.additionalContext;
  assert.match(odd, /^session: -$/m);
  assert.equal(odd.split('\n').filter((l) => l.startsWith('session: ')).length, 1);
});

test('projectDir: a drive root and odd characters give a folder name every system can create', () => {
  const e = envOf(tmp());
  for (const p of ['E:\\', 'e:/', 'C:\\Users\\x\\wei:rd*name?', '/']) assert.match(fb.projectDir(p, e).name, /^[^<>:"/\\|?*]+-[0-9a-f]{6}$/, p);
  const store = tmp();
  const r = fb.add({ skill: 'start', task: '-' }, 'none', envOf(store), 'E:\\');
  assert.match(r.line, /^Keystone feedback: no notes/);
});

test('storage and transcripts: records or rows that are not what they should be are skipped, never crash', () => {
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 'x1', project: 'p1-aaaaaa', skill: 'plan' })]);
  appendFileSync(join(store, 'p1-aaaaaa', 'feedback.jsonl'), 'null\n"str"\n[1]\n{"id":"noitems","kind":"self","skill":"start","task":"t","project":"p1-aaaaaa","plugin_version":"0.9.30"}\n{"id":"badi","kind":"judge","items":[null,5,{"cause":"skill-text","skill":"plan","section":"S","cls":"c"}]}\n');
  assert.doesNotThrow(() => fb.summary({}, envOf(store)));
  assert.match(fb.summary({}, envOf(store)), /plan § S/);
  const f = join(tmp(), 't.jsonl');
  writeFileSync(f, '"keystone"\nnull keystone\n{"type":"user","message":{"role":"user","content":"<command-name>/keystone:plan</command-name>"}}\n');
  assert.deepEqual([...fb.readTrail(f).skills], ['plan']);
});

test('signals: a clean run judged on request is judged once; the same data never twice', () => {
  const w = world({ transcripts: ['clean.jsonl'] });
  const first = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(first, /judge: no — clean run$/m);
  const hash = first.match(/^hash: (\w+)$/m)[1];
  const j = fb.add({ skill: 'feedback', task: PLAN, kind: 'judge', hash }, 'none', w.env, w.cwd);
  assert.match(fb.signals({ plan: PLAN }, w.env, w.cwd), new RegExp(`judge: no — already judged ${j.record.id}`));
  // the same rule holds in session mode
  const sess = fb.signals({ session: 's0' }, w.env, w.cwd);
  const sh = sess.match(/^hash: (\w+)$/m)[1];
  assert.match(sess, /judge: no — clean run$/m);
  const k = fb.add({ skill: 'feedback', task: '-', session: 's0', kind: 'judge', hash: sh }, 'none', w.env, w.cwd);
  assert.match(fb.signals({ session: 's0' }, w.env, w.cwd), new RegExp(`judge: no — already judged ${k.record.id}`));
});

test('signals: repeated calls (also those of the judge itself) are shown but do not change the hash', () => {
  const w = world();
  const tr = join(w.cfg, 'projects/x/s0.jsonl');
  const before = fb.signals({ plan: PLAN }, w.env, w.cwd);
  const read = (id) => JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id, name: 'Read', input: { file_path: 'docs/keystone/2026-01-01-fixture/plan.md' } }] } });
  appendFileSync(tr, [read('p1'), read('p2'), read('p3')].join('\n') + '\n');
  const after = fb.signals({ plan: PLAN }, w.env, w.cwd);
  assert.match(after, /plan\.md/);
  assert.equal(after.match(/^hash: (\w+)$/m)[1], before.match(/^hash: (\w+)$/m)[1]);
});

test('summary: stored records whose fields have the wrong type (or none) never break the summary of all projects', () => {
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 'a', project: 'p1-aaaaaa', skill: 'plan', items: [{ kind: 'unclear', skill: 'plan', section: 'S1', text: 't' }] })]);
  appendFileSync(join(store, 'p1-aaaaaa', 'feedback.jsonl'), [
    '{"id":"b","kind":"self","items":[]}',
    '{"id":"c","kind":"self","skill":5,"task":7,"project":null,"plugin_version":9,"items":[{"kind":3,"skill":null,"section":{"x":1},"text":[1]}]}',
    '{"id":"d","kind":"judge","skill":{"a":1},"items":[{"cause":"skill-text","source":5,"skill":"verify","section":"S2","cls":null,"text":false}]}',
    '{"kind":42,"items":"nope"}',
  ].join('\n') + '\n');
  let out = '';
  assert.doesNotThrow(() => { out = fb.summary({}, envOf(store)); });
  assert.match(out, /- plan: 1 runs, 1 with notes/);
  assert.match(out, /verify § S2/);
  assert.equal(cli(['summary'], { env: envOf(store) }).stdout.includes('error'), false);
  assert.doesNotThrow(() => fb.signals({ task: 'x', transcripts: [] }, envOf(store)));
});

test('signals: two different tasks without traces or reports never look "already judged" by each other', () => {
  const w = world({ transcripts: [] });
  const a = fb.signals({ task: 'task-a', transcripts: [] }, w.env, w.cwd);
  const ha = a.match(/^hash: (\w+)$/m)[1];
  fb.add({ skill: 'feedback', task: 'task-a', kind: 'judge', hash: ha }, 'none', w.env, w.cwd);
  const b = fb.signals({ task: 'task-b', transcripts: [] }, w.env, w.cwd);
  assert.notEqual(b.match(/^hash: (\w+)$/m)[1], ha);
  assert.match(b, /judge: no — clean run$/m);
  assert.match(fb.signals({ task: 'task-a', transcripts: [] }, w.env, w.cwd), /already judged/);
});

// ---- third verify: session values, project scope of a task, several addresses in one judge line ---------------------

test('session values: only a checked string is an id; a valueless flag or a falsy id is "-" everywhere', () => {
  const store = tmp(), cwd = repo(), env = envOf(store, { KEYSTONE_FEEDBACK: 'on' });
  for (const sid of [0, false, 5, null, '', 'a b', 'x'.repeat(200)]) {
    const c = JSON.parse(cli(['hook'], { input: JSON.stringify({ session_id: sid }), env }).stdout).hookSpecificOutput.additionalContext;
    assert.match(c, /--session - <</, String(sid));
    assert.match(c, /^session: -$/m, String(sid));
  }
  const ok = JSON.parse(cli(['hook'], { input: JSON.stringify({ session_id: 's-1.a' }), env }).stdout).hookSpecificOutput.additionalContext;
  assert.match(ok, /--session s-1\.a <</);
  const r = cli(['add', '--skill', 'start', '--session'], { input: 'none', env, cwd });
  assert.match(r.stdout, /^Keystone feedback: no notes/);
  assert.equal(records(store)[0].session, '-');
  assert.equal(typeof records(store)[0].session, 'string');
  assert.equal(cli(['signals', '--session'], { env, cwd }).status, 0);
  assert.doesNotMatch(cli(['signals', '--session'], { env, cwd }).stdout, /Keystone feedback: error/);
});

test('signals: the records of a same-named task in another project are not this task\'s', () => {
  const w = world();
  const other = repo(); // a second project with its own store folder
  fb.add({ skill: 'implement', task: PLAN }, 'unclear | implement § Step 4 | belongs to the other project', w.env, other);
  fb.add({ skill: 'feedback', task: PLAN, kind: 'judge', hash: 'whatever' }, 'none', w.env, other);
  verifyCommit(w.cwd, 'FAIL');
  const out = fb.signals({ plan: PLAN, auto: true }, w.env, w.cwd);
  assert.doesNotMatch(out, /belongs to the other project/);
  assert.match(out, /judge: yes — FAIL/);
  assert.doesNotMatch(out, /already judged/);
  // and the own project's records still count
  fb.add({ skill: 'feedback', task: PLAN, kind: 'judge', hash: 'mine' }, 'none', w.env, w.cwd);
  assert.match(fb.signals({ plan: PLAN, auto: true }, w.env, w.cwd), /judge: no — task already judged/);
});

test('judge line with several addresses: one item per address, so the summary counts each skill § section', () => {
  const p = fb.parseJudge('skill-text | confirmed | plan § Step 1, verify § LOOP.md «Build or tests failed», § Step 4 | missing-rule | one finding of a class | evidence: 3 runs');
  assert.deepEqual(p.items.map((i) => `${i.skill} § ${i.section}`), ['plan § Step 1', 'verify § LOOP.md «Build or tests failed»', 'verify § Step 4']);
  assert.ok(p.items.every((i) => i.cls === 'missing-rule' && i.text === 'one finding of a class' && i.evidence === '3 runs'));
  assert.equal(fb.parseJudge('agent | added | implement § Step 2: Execute (2.2 gate, 2.3 Implement) | c | t').items.length, 1, 'a comma inside a section is no second address');
  const twelve = Array.from({ length: 12 }, (_, i) => `agent | added | plan § A${i}, verify § B${i} | c | t${i}`).join('\n');
  const t = fb.parseJudge(twelve);
  assert.equal(t.truncated, true);
  assert.equal(t.items.length, 20, 'ten lines, two addresses each');
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 'j1', project: 'p1-aaaaaa', kind: 'judge', items: fb.parseJudge('skill-text | added | plan § Step 1 | missing-rule | a').items })]);
  put(store, 'p2-bbbbbb', [rec({ id: 'j2', project: 'p2-bbbbbb', kind: 'judge', items: fb.parseJudge('skill-text | added | plan § Step 1, verify § Step 2 | missing-rule | b').items })]);
  const cand = fb.summary({}, envOf(store)).split('### Candidates')[1].split('###')[0];
  assert.match(cand, /\| plan § Step 1 \| missing-rule \| 2 \|/);
  assert.match(cand, /\| verify § Step 2 \| missing-rule \| 1 \|/);
});

test('addresses: the one split helper serves self-reports and judge lines, whatever the spelling of the later addresses', () => {
  const addr = (p) => p.items.map((i) => `${i.skill} § ${i.section}`);
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | plan § Step 1, keystone:verify § Step 2 | c | t')), ['plan § Step 1', 'verify § Step 2']);
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | plan § Step 1, verify §, fix § Step 3 | c | t')), ['plan § Step 1', 'fix § Step 3'], 'a place without a section is dropped');
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | keystone:plan § A, § B, /keystone:fix § C | c | t')), ['plan § A', 'plan § B', 'fix § C']);
  assert.deepEqual(addr(fb.parseSelf('unclear | plan § Step 1, verify § Step 2 | t\nextra | keystone:fix § Step 3, § Step 4 | u')), ['plan § Step 1', 'verify § Step 2', 'fix § Step 3', 'fix § Step 4']);
  assert.ok(fb.parseSelf('unclear | plan § Step 1, verify § Step 2 | t').items.every((i) => i.kind === 'unclear' && i.text === 't'));
  assert.equal(fb.parseSelf('guessed | plan § Settings: ask, never ask (2.1) | t').items.length, 1, 'a comma inside a section is no second address');
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 's1', project: 'p1-aaaaaa', task: 'open', skill: 'plan', items: fb.parseSelf('unclear | plan § Step 1, verify § Step 2 | t').items })]);
  put(store, 'p2-bbbbbb', [rec({ id: 's2', project: 'p2-bbbbbb', task: 'open2', skill: 'plan', items: fb.parseSelf('unclear | verify § Step 2 | u').items })]);
  const un = fb.summary({}, envOf(store)).split('### Self-reports of unjudged tasks')[1].split('###')[0];
  assert.match(un, /\| verify § Step 2 \| unclear \| 2 \|/);
  assert.match(un, /\| plan § Step 1 \| unclear \| 1 \|/);
});

test('addresses: first and later places follow the same rules — alphabet, separators, empty sections, prefixes', () => {
  const addr = (p) => p.items.map((i) => `${i.skill}|${i.section}`);
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | plan § , verify § S2 | c | t')), ['verify|S2'], 'an empty first section is no address');
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | plan § Step 1, verify § Step 2, | c | a')), ['plan|Step 1', 'verify|Step 2'], 'a trailing separator is cut');
  for (const bad of ['skill-text | added | plan § | c | t', 'skill-text | added | § Step 1 | c | t', 'skill-text | added | plan § ,; | c | t']) {
    const p = fb.parseJudge(bad);
    assert.equal(p.items.length, 0, bad);
    assert.equal(p.skipped, 1, bad);
  }
  for (const bad of ['unclear | plan § | t', 'unclear | § Step 1 | t']) assert.deepEqual([fb.parseSelf(bad).items.length, fb.parseSelf(bad).skipped], [0, 1], bad);
  assert.deepEqual(addr(fb.parseSelf('unclear | план § Шаг 1 | t')), [], 'a name that is no skill of this plugin is no address');
  assert.deepEqual(addr(fb.parseSelf('unclear | keystone: plan § A, keystone: verify § B | t')), ['plan|A', 'verify|B']);
  assert.deepEqual(addr(fb.parseSelf('unclear | Keystone:plan § A, /KEYSTONE:fix § B | t')), ['plan|A', 'fix|B']);
  assert.deepEqual(addr(fb.parseSelf('unclear | plan§Step 1,verify§Step 2 | t')), ['plan|Step 1', 'verify|Step 2']);
  assert.deepEqual(addr(fb.parseSelf('guessed | plan § Settings: ask, never ask (2.1) | t')), ['plan|Settings: ask, never ask (2.1)']);
  const j = fb.parseJudge('agent | added | plan § A, verify § B | cls | the text | evidence: ev');
  assert.ok(j.items.every((i) => i.cls === 'cls' && i.text === 'the text' && i.evidence === 'ev' && i.cause === 'agent' && i.source === 'added'));
  const store = tmp();
  put(store, 'p1-aaaaaa', [rec({ id: 'j1', project: 'p1-aaaaaa', kind: 'judge', items: fb.parseJudge('skill-text | added | plan § Step 1, verify § Step 2, | missing-rule | a').items })]);
  put(store, 'p2-bbbbbb', [rec({ id: 'j2', project: 'p2-bbbbbb', kind: 'judge', items: fb.parseJudge('skill-text | added | keystone: verify § Step 2 | missing-rule | b').items })]);
  const cand = fb.summary({}, envOf(store)).split('### Candidates')[1].split('###')[0];
  assert.match(cand, /\| verify § Step 2 \| missing-rule \| 2 \|/);
  assert.doesNotMatch(cand, /Step 2, /);
});

test('skill part of an address: only a skill or agent of this plugin; secrets, fences, markup and prose never end up in a record', () => {
  const addr = (p) => p.items.map((i) => `${i.skill}|${i.section}`);
  for (const bad of ['sk-ant-abcdefghijklmnopqrstuvwxyz', 'AKIAABCDEFGHIJKLMNOP', 'ghp_abcdefghijklmnopqrstuvwxyz12', '```js', 'x'.repeat(500), 'the plan skill', 'js']) {
    const s = fb.parseSelf(`unclear | ${bad} § A | t`), j = fb.parseJudge(`agent | added | ${bad} § A | c | t`);
    assert.deepEqual([s.items.length, s.skipped, j.items.length, j.skipped], [0, 1, 0, 1], bad.slice(0, 20));
  }
  assert.deepEqual(addr(fb.parseJudge('skill-text | added | plan § A, see also § B | c | t')), ['plan|A, see also § B'], 'prose before § belongs to the previous section');
  assert.deepEqual(addr(fb.parseSelf('unclear | plan § Шаг 2, как в § Шаг 1 | t')), ['plan|Шаг 2, как в § Шаг 1']);
  assert.deepEqual(addr(fb.parseSelf('unclear | plan § A, sk-ant-abcdefghijklmnopqrstuvwxyz § B | t')), ['plan|A, [redacted] § B']);
  assert.deepEqual(addr(fb.parseSelf('unclear | **plan** § Step 1 | t')), ['plan|Step 1']);
  assert.deepEqual(addr(fb.parseSelf('unclear | PLAN § A, `verify` § B, feedback-judge § C | t')), ['plan|A', 'verify|B', 'feedback-judge|C']);
});

test('add: task, hash and skill from the command line are cleaned like the text; the truncation line does not contradict itself', () => {
  const store = tmp(), cwd = repo(), env = envOf(store);
  const k = 'sk-ant-' + 'a'.repeat(30);
  fb.add({ skill: k, task: `docs/keystone/${k}/plan.md` }, 'none', env, cwd);
  fb.add({ skill: 'feedback', task: 'x', kind: 'judge', hash: 'hash: 0123456789AB.' }, 'none', env, cwd);
  const [a, b] = records(store);
  assert.equal(a.skill, '-');
  assert.match(a.task, /^~[0-9a-f]{8}$/, 'a task name that is masked gets a key of its own, not the «no task» sentinel');
  assert.ok(!a.id.includes('sk-ant'));
  assert.equal(b.hash, '0123456789ab');
  const many = Array.from({ length: 12 }, (_, i) => `extra | plan § A${i}, verify § B${i} | n${i}`).join('\n');
  const r = fb.add({ skill: 'plan', task: 'x' }, many, env, cwd);
  assert.match(r.line, /20 notes .* — only the first 10 lines and 30 notes kept$/);
});
