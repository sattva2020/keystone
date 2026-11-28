import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { decide } from '../hooks/gate.mjs';

const GATE = join(dirname(fileURLToPath(import.meta.url)), '..', 'hooks', 'gate.mjs');
const ENV = { };

const git = (root, ...a) => spawnSync('git', ['-C', root, ...a], { stdio: 'ignore' });
function project(plans = {}, extra = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ks-'));
  git(root, 'init', '-q');
  for (const [dir, header] of Object.entries(plans)) {
    mkdirSync(join(root, 'docs/sattva', dir), { recursive: true });
    if (header !== null) writeFileSync(join(root, 'docs/sattva', dir, 'plan.md'), `# Plan: x\n\n${header}\n\n## Tasks\n${extra.tasks ?? '- [ ] 1. a\n- [x] 2. b'}\n`);
  }
  for (const [f, body] of Object.entries(extra.files ?? {})) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  return root;
}
const pre = (root, tool_name, tool_input, extra = {}) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input, ...extra }, ENV);
const stop = (root, active = false, extra = {}) => decide({ hook_event_name: 'Stop', cwd: root, stop_hook_active: active, ...extra }, ENV);
// A session transcript (JSONL) as Claude Code writes it: slash commands as user rows, edits as assistant tool_use blocks.
let n = 0;
function trail(root, rows) {
  const lines = rows.map((r) => JSON.stringify(r.cmd
    ? { type: 'user', message: { role: 'user', content: `<command-message>sattva:${r.cmd}</command-message>\n<command-name>/sattva:${r.cmd}</command-name>\n<command-args>${r.args ?? ''}</command-args>` } }
    : r.edit
      ? { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x', name: 'Write', input: { file_path: r.edit, content: '' } }] } }
      : { type: 'user', message: { role: 'user', content: r.text } }));
  const file = join(root, `.t${n++}.jsonl`);
  writeFileSync(file, lines.join('\n') + '\n');
  return { transcript_path: file };
}
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';

test('I-14: no docs/sattva → every event passes', () => {
  const root = project();
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
  assert.equal(pre(root, 'Bash', { command: 'git push' }), null);
  assert.equal(stop(root), null);
});

test('I-4: draft plan blocks code edits, allows the plan folder', () => {
  const root = project({ '2026-10-12-x': 'Level: M · Mode: feature · Status: draft' });
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') })));
  assert.ok(denied(pre(root, 'Write', { file_path: 'src\\b.ts' })), 'relative Windows path');
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'docs/sattva/2026-10-12-x/plan.md') }), null);
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'docs\\sattva\\2026-10-12-x\\intent.md') }), null, 'backslash path normalised');
  assert.match(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }).hookSpecificOutput.permissionDecisionReason, /Status: abandoned|SATTVA_GATES=off/);
});

test('I-4/I-14: approved and implementing plans allow edits; verified/abandoned are not active', () => {
  for (const s of ['approved', 'implementing', 'verified', 'abandoned']) {
    const root = project({ '2026-10-12-x': `Level: M · Mode: feature · Status: ${s}` });
    assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null, s);
  }
});

test('I-14: a folder without plan.md or a finished plan does not hide an older active plan (same rule as the mod)', () => {
  const a = project({ '2026-10-01-old': 'Status: draft', '2026-10-12-new': 'Status: verified' });
  assert.ok(denied(pre(a, 'Edit', { file_path: join(a, 'src/a.ts') })));
  const b = project({ '2026-10-01-old': 'Status: draft', '2026-10-12-new': null }); // newest folder has intent only
  assert.ok(denied(pre(b, 'Edit', { file_path: join(b, 'src/a.ts') })));
  assert.equal(pre(b, 'Edit', { file_path: join(b, 'src/a.ts') }, trail(b, [])), null, 'a session that never touched it is not gated');
});

test('I-5: during a fix, existing test files cannot be edited or overwritten; new tests can be written', () => {
  const files = { 'src/a.test.ts': 'x', 'tests/test_b.py': 'x', '__tests__/c.js': 'x', 'pkg/d_test.go': 'x', 'spec/e.rb': 'x', 'web/f.spec.tsx': 'x' };
  const root = project({ '2026-10-12-fix-x': 'Level: S · Mode: fix · Status: implementing' }, { files });
  for (const f of Object.keys(files)) {
    assert.ok(denied(pre(root, 'Edit', { file_path: join(root, f) })), `Edit ${f}`);
    assert.ok(denied(pre(root, 'Write', { file_path: join(root, f) })), `Write over ${f}`);
  }
  assert.equal(pre(root, 'Write', { file_path: join(root, 'src/new-regression.test.ts') }), null);
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null, 'non-test code is editable');
  const feature = project({ '2026-10-12-x': 'Mode: feature · Status: implementing' }, { files });
  assert.equal(pre(feature, 'Edit', { file_path: join(feature, 'src/a.test.ts') }), null, 'only in fix mode');
});

test('I-6/I-13: Stop blocks once while implementing with open tasks', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  assert.equal(stop(root).decision, 'block');
  assert.equal(stop(root, true), null, 'stop_hook_active → no second block (8-in-a-row cap unreachable)');
  const blocked = project({ '2026-10-12-x': 'Status: implementing' }, { tasks: '- [ ] 1. a — BLOCKED: no DB\n- [x] 2. b' });
  assert.equal(stop(blocked), null);
  const done = project({ '2026-10-12-x': 'Status: implementing' }, { tasks: '- [x] 1. a' });
  assert.equal(stop(done), null);
  const approved = project({ '2026-10-12-x': 'Status: approved' });
  assert.equal(stop(approved), null);
});

test('Stop: every task ticked, not verified — the normal end of implement passes, "done" without verify is blocked once', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' }, { tasks: '- [x] 1. a\n- [ ] 2. b — BLOCKED: no DB' });
  const said = (text, active = false) => stop(root, active, { last_assistant_message: text });
  assert.equal(said('Report…\n\nNext: /clear, then /sattva:verify docs/sattva/2026-10-12-x/plan.md'), null, 'normal end of implement');
  const r = said('Готово, всё сделано.');
  assert.equal(r.decision, 'block');
  assert.match(r.reason, /docs\/sattva\/2026-10-12-x\/plan\.md/);
  assert.match(r.reason, /Next: \/clear, then \/sattva:verify/);
  assert.match(r.reason, /do not repeat or replace/);
  assert.equal(said('Готово, всё сделано.', true), null, 'stop_hook_active → one block per turn');

  // no last_assistant_message: the last assistant text in the transcript decides
  const bind = { type: 'user', message: { role: 'user', content: '<command-name>/sattva:implement</command-name>\n<command-args>2026-10-12-x</command-args>' } };
  const answer = (text) => ({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
  const file = (rows) => { const f = join(root, `.done${n++}.jsonl`); writeFileSync(f, rows.map((x) => JSON.stringify(x)).join('\n') + '\n'); return { transcript_path: f }; };
  assert.equal(stop(root, false, file([bind, answer('Next: /sattva:verify x'), answer('All done.')])).decision, 'block', 'last answer wins');
  assert.equal(stop(root, false, file([bind, answer('All done.\nNext: /clear, then /sattva:verify 2026-10-12-x')])), null);
  const ranVerify = { type: 'user', message: { role: 'user', content: '<command-name>/sattva:verify</command-name>\n<command-args>2026-10-12-x</command-args>' } };
  assert.equal(stop(root, false, file([ranVerify, answer('FAIL — Next: /sattva:fix 2026-10-12-x')])), null, 'a session that ran verify passes');
});

test('I-7: push and PR closed while a plan is active; commit allowed; PowerShell caught', () => {
  for (const s of ['draft', 'approved', 'implementing']) {
    const root = project({ '2026-10-12-x': `Status: ${s}` });
    assert.ok(denied(pre(root, 'Bash', { command: 'git push origin main' })), s);
    assert.ok(denied(pre(root, 'Bash', { command: 'gh pr create --fill' })), s);
    assert.ok(denied(pre(root, 'PowerShell', { command: 'git push' })), s);
    assert.equal(pre(root, 'Bash', { command: 'git commit -m x' }), null, s);
  }
  const verified = project({ '2026-10-12-x': 'Status: verified' });
  assert.equal(pre(verified, 'Bash', { command: 'git push' }), null);
});

test('I-13: SATTVA_GATES=off disables every gate', () => {
  const root = project({ '2026-10-12-x': 'Status: draft' });
  assert.equal(decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, 'src/a.ts') } }, { SATTVA_GATES: 'off' }), null);
});

test('I-13: hooks.json uses node exec form and matches Bash|PowerShell; the CLI emits JSON', () => {
  const h = JSON.parse(readFileSync(join(dirname(GATE), 'hooks.json'), 'utf8'));
  const pre = h.hooks.PreToolUse[0];
  assert.match(pre.matcher, /Bash/); assert.match(pre.matcher, /PowerShell/); assert.match(pre.matcher, /Edit/);
  for (const e of [pre, h.hooks.Stop[0]]) {
    assert.equal(e.hooks[0].command, 'node');
    assert.deepEqual(e.hooks[0].args, ['${CLAUDE_PLUGIN_ROOT}/hooks/gate.mjs']);
  }
  const root = project({ '2026-10-12-x': 'Status: draft' });
  const r = spawnSync('node', [GATE], { input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, 'a.js') } }), encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: '' } });
  assert.equal(r.status, 0);
  assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'deny');
});

test('review: a regression test written during the fix stays editable; fixtures/snapshots are not gated', () => {
  const root = project({ '2026-10-12-fix-x': 'Level: S · Mode: fix · Status: implementing' }, { files: { 'src/a.test.ts': 'x' } });
  writeFileSync(join(root, 'src/new.test.ts'), 'x'); // written in this fix, untracked
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/new.test.ts') }), null);
  git(root, 'add', 'src/new.test.ts'); // staged, still not in HEAD
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/new.test.ts') }), null);
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.test.ts') })));
  assert.equal(pre(root, 'Write', { file_path: join(root, 'test/fixtures/data.json') }), null);
  assert.equal(pre(root, 'Write', { file_path: join(root, 'src/__snapshots__/a.snap') }), null);
});

test('review: same-day folders — the most recently written plan wins, not the alphabetical slug', () => {
  const root = project({ '2026-10-12-login-page': 'Level: M · Mode: feature · Status: implementing', '2026-10-12-a-fix': 'Level: S · Mode: fix · Status: implementing' }, { files: { 'src/a.test.ts': 'x' } });
  const old = new Date('2026-10-12T08:00:00Z'), now = new Date('2026-10-12T12:00:00Z');
  utimesSync(join(root, 'docs/sattva/2026-10-12-login-page/plan.md'), old, old);
  utimesSync(join(root, 'docs/sattva/2026-10-12-a-fix/plan.md'), now, now);
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.test.ts') })), 'the newer fix plan is active');
});

test('review: Status/Mode come from the header line only; Stop counts only ## Tasks', () => {
  const root = project({ '2026-10-12-x': 'Level: M · Mode: feature · Status: verified' }, { tasks: '- [ ] 1. set Status: draft on the page' });
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
  const r2 = mkdtempSync(join(tmpdir(), 'ks-')); git(r2, 'init', '-q');
  mkdirSync(join(r2, 'docs/sattva/2026-10-12-x'), { recursive: true });
  writeFileSync(join(r2, 'docs/sattva/2026-10-12-x/plan.md'), "# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\n\n## Original Request\n- [ ] not a task\n\n## Tasks\n- [x] 1. a\n\n## Open questions\n- [ ] none\n");
  assert.equal(stop(r2), null);
});

test('review: push regex — global options caught, --dry-run allowed', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  for (const c of ['git -C . push', 'git -c core.x=y push origin', 'git --no-pager push', 'cd a && git push -u origin b'])
    assert.ok(denied(pre(root, 'Bash', { command: c })), c);
  for (const c of ['git push --dry-run', 'git status', 'git log --oneline'])
    assert.equal(pre(root, 'Bash', { command: c }), null, c);
});

test('review: the project root follows the edited file (worktree with its own plans)', () => {
  const main = project({ '2026-10-12-x': 'Status: draft' });
  const wt = join(main, '.claude/worktrees/w');
  mkdirSync(join(wt, 'docs/sattva/2026-10-12-y'), { recursive: true });
  writeFileSync(join(wt, '.git'), 'gitdir: elsewhere');
  writeFileSync(join(wt, 'docs/sattva/2026-10-12-y/plan.md'), "Level: M · Mode: feature · Status: approved\n## Tasks\n- [ ] 1. a");
  assert.equal(decide({ hook_event_name: 'PreToolUse', cwd: main, tool_name: 'Edit', tool_input: { file_path: join(wt, 'src/a.ts') } }, ENV), null);
  assert.ok(denied(decide({ hook_event_name: 'PreToolUse', cwd: main, tool_name: 'Edit', tool_input: { file_path: join(main, 'src/a.ts') } }, ENV)));
});

test('release gap: a verified plan with open ## Release steps does not block push or Stop', () => {
  const root = project({ '2026-10-13-x': 'Level: M · Mode: feature · Status: verified' },
    { tasks: '- [x] 1. a\n- [x] 2. b\n\n## Release\n- [ ] R1. merge into main and push — check: CI green\n- [ ] R2. deploy — check: /health 200' });
  assert.equal(pre(root, 'Bash', { command: 'git push origin main' }), null);
  assert.equal(stop(root), null);
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
});

test('push gate: only a push that ships the active plan\'s commits is closed', () => {
  const root = project({ '2026-10-14-x': 'Status: implementing' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(root, 'fetch', '-q', 'origin');
  const commit = (file) => { writeFileSync(join(root, file), String(Math.random())); git(root, 'add', '-A'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', file); };
  mkdirSync(join(root, 'src'), { recursive: true });
  commit('src/release.ts');
  const P = 'git' + ' push';
  assert.equal(pre(root, 'Bash', { command: `${P} origin main` }), null, 'unrelated release passes');
  assert.equal(pre(root, 'Bash', { command: `git -C ${root} push origin HEAD:main` }), null, '-C repo, src:dst refspec');
  assert.equal(pre(root, 'Bash', { command: `${P} origin main 2>&1 | tail -1` }), null, 'redirections are not refs');
  assert.equal(pre(root, 'Bash', { command: `${P} origin main > out.log 2> err.log` }), null, 'file redirections are not refs');
  commit('docs/sattva/2026-10-14-x/verify.md'); // the plan's task folder
  assert.ok(denied(pre(root, 'Bash', { command: P })), 'a commit touching the plan folder is still closed');
  assert.ok(denied(pre(root, 'PowerShell', { command: `${P} origin main` })));
  assert.ok(denied(pre(root, 'Bash', { command: `${P} --all origin` })), '--all ships every branch');
  assert.ok(denied(pre(root, 'Bash', { command: `${P} origin no-such-branch` })), 'unknown ref → closed');
  assert.match(pre(root, 'Bash', { command: P }).hookSpecificOutput.permissionDecisionReason, /start Claude Code with SATTVA_GATES=off/);
});

test('push gate: a merge from the remote that brings someone else\'s commit to the plan folder does not close push', () => {
  const root = project({ '2026-10-14-x': 'Status: approved' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  const commit = (file) => { mkdirSync(dirname(join(root, file)), { recursive: true }); writeFileSync(join(root, file), String(Math.random())); git(root, 'add', '-A'); git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', file); };
  // the work branch is on origin with a plan-folder commit; another session pushed a plan-folder commit to main.
  // Merging main into the work branch combines both folder changes, so the merge differs from every parent and a
  // path-limited log shows it — though it ships nothing new to the work branch or main.
  git(root, 'checkout', '-q', '-b', 'work', 'main');
  commit('docs/sattva/2026-10-14-x/a.md');
  git(root, 'push', '-q', 'origin', 'work');
  git(root, 'checkout', '-q', '-b', 's1', 'main');
  commit('docs/sattva/2026-10-14-x/b.md');
  git(root, 'push', '-q', 'origin', 's1:main');
  git(root, 'checkout', '-q', 'work');
  git(root, 'fetch', '-q', 'origin');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-ff', '--no-edit', 'origin/main');
  const P = 'git' + ' push';
  assert.equal(pre(root, 'Bash', { command: `${P} origin work` }), null, 'the merge only brought a commit already on main');
  commit('docs/sattva/2026-10-14-x/verify.md');
  assert.ok(denied(pre(root, 'Bash', { command: `${P} origin work` })), 'an own commit in the plan folder closes it');
});

test('session binding: Stop and the draft gate stay silent in a session that never worked with the plan', () => {
  const impl = project({ '2026-10-15-x': 'Level: M · Mode: feature · Status: implementing' });
  assert.equal(stop(impl, false, trail(impl, [{ text: 'what does this function do?' }, { cmd: 'start', args: 'rename a button' }])), null, 'unrelated session');
  assert.equal(stop(impl, false, { transcript_path: join(impl, 'missing.jsonl') }), null, 'nothing written yet');
  assert.equal(stop(impl, false, trail(impl, [{ cmd: 'implement', args: 'docs/sattva/2026-10-15-x/plan.md' }])).decision, 'block', '/sattva:implement <plan>');
  assert.equal(stop(impl, false, trail(impl, [{ cmd: 'implement' }])).decision, 'block', 'no argument = the newest plan');
  assert.equal(stop(impl, false, trail(impl, [{ cmd: 'verify', args: 'E:\\proj\\docs\\sattva\\2026-10-15-x\\plan.md' }])).decision, 'block', 'absolute Windows path');
  assert.equal(stop(impl, false, trail(impl, [{ edit: join(impl, 'docs/sattva/2026-10-15-x/plan.md') }])).decision, 'block', 'edited the plan folder');
  assert.equal(stop(impl, false, trail(impl, [{ cmd: 'review' }, { edit: join(impl, 'src/a.ts') }])), null, 'no plan named, no plan folder edited');

  const draft = project({ '2026-10-15-x': 'Level: M · Mode: feature · Status: draft' });
  const src = { file_path: join(draft, 'src/a.ts') };
  assert.equal(pre(draft, 'Edit', src, trail(draft, [{ text: 'fix the typo in README' }])), null, 'unrelated session edits code');
  assert.ok(denied(pre(draft, 'Edit', src, trail(draft, [{ cmd: 'plan', args: 'add reminders' }, { edit: 'docs/sattva/2026-10-15-x/plan.md' }]))), 'the session that wrote the plan');
  assert.ok(denied(pre(draft, 'Edit', src, trail(draft, [{ cmd: 'plan', args: 'docs/sattva/2026-10-15-x/plan.md' }]))));
});

test('session binding: each session gets its own plan; push stays repo-wide', () => {
  const root = project({ '2026-10-10-old': 'Level: M · Mode: feature · Status: implementing', '2026-10-15-new': 'Level: M · Mode: feature · Status: draft' });
  const old = trail(root, [{ cmd: 'implement', args: 'docs/sattva/2026-10-10-old/plan.md' }]);
  assert.match(stop(root, false, old).reason, /2026-10-10-old/, 'Stop names the session plan, not the newest');
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }, old), null, 'the newer draft does not close its edits');
  const fresh = trail(root, [{ cmd: 'plan', args: 'docs/sattva/2026-10-15-new/plan.md' }]);
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }, fresh)));
  assert.equal(stop(root, false, fresh), null, 'a draft has no Stop reminder');
  assert.ok(denied(pre(root, 'Bash', { command: 'git' + ' push' }, trail(root, []))), 'push: unbound session, unpushed commits of the plan folder');
});

test('0.9.17: AI Factory folders are not Sattva plans — a draft under .ai-factory/specs gates nothing', () => {
  const root = project({}, { files: { '.ai-factory/config.yaml': 'paths:\n  specs: .ai-factory/specs/\n', '.ai-factory/specs/2026-10-12-x/plan.md': 'Status: draft\n- [ ] 1. a' } });
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
});

const closedBy = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? '';

test('push gate: follows cd and shell variables to the repository the push goes to', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  const other = project();
  assert.equal(pre(root, 'Bash', { command: `cd "${other}" && git push origin HEAD` }), null, 'cd');
  assert.equal(pre(root, 'Bash', { command: `M="${other}"; git -C "$M" push origin HEAD` }), null, 'bash variable');
  assert.equal(pre(root, 'PowerShell', { command: `$M = "${other}"; git -C $M push origin HEAD` }), null, 'PowerShell variable');
  assert.ok(denied(pre(other, 'Bash', { command: `cd "${root}" && git push origin HEAD` })), 'cd into the repository with the plan');
});

test('push gate: a quoted -C path with a space is still a push', () => {
  const parent = mkdtempSync(join(tmpdir(), 'ks space '));
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  assert.ok(parent.includes(' '));
  assert.ok(denied(pre(parent, 'Bash', { command: `git -C "${root}" push origin HEAD` })));
});

test('push gate: when git cannot say what ships, it stays closed and says so instead of blaming the plan', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  const r = pre(root, 'Bash', { command: 'git -C "$NOPE" push origin HEAD' });
  assert.ok(denied(r));
  assert.match(closedBy(r), /could not tell what this push ships/);
  assert.doesNotMatch(closedBy(r), /run \/sattva:verify first/);
});

test('Stop: no block while a background task is unreported; the reminder keeps the answer and asks for Next', () => {
  const root = project({ '2026-10-12-x': 'Status: implementing' });
  const at = new Date().toISOString();
  const bind = { type: 'user', message: { role: 'user', content: '<command-name>/sattva:implement</command-name>\n<command-args>2026-10-12-x</command-args>' } };
  const started = { type: 'assistant', timestamp: at, message: { role: 'assistant', content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'npm test', run_in_background: true } }] } };
  const agent = { type: 'user', timestamp: at, message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_2', content: [{ type: 'text', text: 'Async agent launched successfully.' }] }] } };
  const done = (id) => ({ type: 'attachment', attachment: { type: 'queued_command', prompt: `<task-notification>\n<tool-use-id>${id}</tool-use-id>\n</task-notification>` } });
  const file = (rows) => { const f = join(root, `.bg${n++}.jsonl`); writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); return { transcript_path: f }; };

  assert.equal(stop(root, false, file([bind, started])), null, 'Bash in the background');
  assert.equal(stop(root, false, file([bind, agent])), null, 'agent in the background');
  assert.equal(stop(root, false, file([bind, started, agent, done('toolu_1')])), null, 'one of two still runs');
  const stale = { ...started, timestamp: new Date(Date.now() - 3 * 3600 * 1000).toISOString() };
  assert.equal(stop(root, false, file([bind, stale])).decision, 'block', 'a task that never reported stops counting');
  const r = stop(root, false, file([bind, started, agent, done('toolu_1'), done('toolu_2')]));
  assert.equal(r.decision, 'block', 'everything reported');
  assert.match(r.reason, /Next: nothing now — waiting for/);
  assert.match(r.reason, /do not repeat or replace/);
});

test('draft gate: decision notes may be written, other code may not', () => {
  const root = project({ '2026-10-12-x': 'Status: draft' });
  assert.equal(pre(root, 'Write', { file_path: join(root, 'docs/notes/a.md') }), null);
  assert.ok(denied(pre(root, 'Write', { file_path: join(root, 'docs/other/a.md') })));
});

test('cloud session: the work branch may be pushed before verify; the default branch and a PR stay closed', () => {
  const root = project({ '2026-11-12-x': 'Status: implementing' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(root, 'fetch', '-q', 'origin');
  git(root, 'remote', 'set-head', 'origin', 'main');
  git(root, 'checkout', '-q', '-b', 'claude/work');
  writeFileSync(join(root, 'docs/sattva/2026-11-12-x/verify.md'), 'x'); // a commit of the plan's own work
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'plan work');
  const cloud = (command) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Bash', tool_input: { command } }, { CLAUDE_CODE_REMOTE: 'true' });
  const P = 'git' + ' push';
  for (const c of [`${P} -u origin HEAD`, `${P} origin claude/work`, `${P} origin HEAD:refs/heads/claude/work`])
    assert.equal(cloud(c), null, c);
  for (const c of [`${P} origin HEAD:main`, `${P} origin claude/work:main`, `${P} --all origin`, 'gh pr create --fill'])
    assert.ok(denied(cloud(c)), c);
  assert.match(closedBy(cloud(`${P} origin HEAD:main`)), /cloud environment/, 'the way out names what a cloud session can change');
  assert.ok(denied(pre(root, 'Bash', { command: `${P} -u origin HEAD` })), 'outside the cloud the work branch stays closed');
  git(root, 'checkout', '-q', 'main');
  git(root, 'merge', '-q', '--ff-only', 'claude/work');
  assert.ok(denied(cloud(`${P} -u origin HEAD`)), 'HEAD on the default branch');
});

test('cloud session: after the work branch is pushed, a push to the default branch and a PR still carry the plan', () => {
  // Found live (0.9.31): the gate measured "what ships" against every remote branch, so once the work branch was
  // pushed, `git push origin HEAD:main` and `gh pr create` looked empty and passed while the plan was still a draft.
  const root = project({ '2026-11-15-x': 'Status: draft' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(root, 'fetch', '-q', 'origin');
  git(root, 'remote', 'set-head', 'origin', 'main');
  git(root, 'checkout', '-q', '-b', 'claude/work');
  writeFileSync(join(root, 'docs/sattva/2026-11-15-x/plan.md'), '# Plan: x\n\nStatus: draft\n\n## Tasks\n- [ ] 1. a\n');
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'plan work');
  git(root, 'push', '-q', '-u', 'origin', 'HEAD'); // the work branch is on the remote now
  const cloud = (command) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Bash', tool_input: { command } }, { CLAUDE_CODE_REMOTE: 'true' });
  const P = 'git' + ' push';
  for (const c of [`${P} origin HEAD:main`, `${P} origin claude/work:main`, 'gh pr create --fill'])
    assert.ok(denied(cloud(c)), c);
  assert.equal(cloud(`${P} origin HEAD`), null, 'the work branch itself still passes');
  const local = (command) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Bash', tool_input: { command } }, {});
  assert.ok(denied(local(`${P} origin HEAD:main`)), 'outside the cloud too, once the work branch reached the remote some other way');
});

test('0.9.36: the deny text names what is closed — this push or a PR — and in the cloud that the work branch stays open', () => {
  // Found live (0.9.33, 0.9.35): "push/PR is closed" read as "every push is closed" while the cloud work-branch push passed.
  const root = project({ '2026-11-15-t': 'Status: draft' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(root, 'fetch', '-q', 'origin');
  git(root, 'remote', 'set-head', 'origin', 'main');
  git(root, 'checkout', '-q', '-b', 'claude/work');
  writeFileSync(join(root, 'docs/sattva/2026-11-15-t/notes.md'), 'x');
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'plan work');
  const run = (tool_name, tool_input, env = {}) => closedBy(decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input }, env));
  const P = 'git' + ' push';
  const push = run('Bash', { command: `${P} origin HEAD:main` });
  assert.match(push, /^Sattva: this push carries commits of docs\/sattva\/2026-11-15-t and is closed while docs\/sattva\/2026-11-15-t\/plan\.md is draft/);
  assert.doesNotMatch(push, /push\/PR|work branch itself/);
  for (const pr of [run('Bash', { command: 'gh pr create --fill' }), run('mcp__github__create_pull_request', { head: 'claude/work', base: 'main' })])
    assert.match(pr, /^Sattva: a PR carrying commits of docs\/sattva\/2026-11-15-t is closed while/);
  const cloud = { CLAUDE_CODE_REMOTE: 'true' };
  assert.match(run('Bash', { command: `${P} origin HEAD:main` }, cloud), /^Sattva: this push carries[^]*a push of the work branch itself stays open in a cloud session/);
  assert.match(run('mcp__github__create_pull_request', { head: 'claude/work', base: 'main' }, cloud), /a push of the work branch itself stays open in a cloud session/);
});

test('0.9.35: GitHub MCP tools that ship work — a PR, a merge, a write to the default branch — are gated like push', () => {
  // Found live in the cloud (0.9.33): the gate saw only Bash/PowerShell, so a PR made through the GitHub MCP tools
  // skipped it while the plan was a draft.
  const root = project({ '2026-11-15-m': 'Status: draft' });
  const remote = mkdtempSync(join(tmpdir(), 'ks-remote-'));
  spawnSync('git', ['init', '-q', '--bare', remote]);
  git(root, 'remote', 'add', 'origin', remote);
  git(root, 'branch', '-M', 'main');
  git(root, 'push', '-q', 'origin', 'HEAD:refs/heads/main');
  git(root, 'fetch', '-q', 'origin');
  git(root, 'remote', 'set-head', 'origin', 'main');
  git(root, 'checkout', '-q', '-b', 'claude/work');
  writeFileSync(join(root, 'docs/sattva/2026-11-15-m/notes.md'), 'x');
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'plan work');
  git(root, 'push', '-q', '-u', 'origin', 'HEAD');
  const mcp = (tool_name, tool_input, env) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input }, env);
  for (const env of [{}, { CLAUDE_CODE_REMOTE: 'true' }]) {
    const where = env.CLAUDE_CODE_REMOTE ? 'cloud' : 'local';
    for (const [name, input] of [
      ['mcp__github__create_pull_request', { owner: 'o', repo: 'r', head: 'claude/work', base: 'main', title: 't' }],
      ['mcp__ce6e2234-d4f6__create_pull_request', { owner: 'o', repo: 'r', head: 'o:claude/work', base: 'main', title: 't' }],
      ['mcp__github__merge_pull_request', { owner: 'o', repo: 'r', pullNumber: 1 }],
      ['mcp__github__push_files', { owner: 'o', repo: 'r', branch: 'main', files: [], message: 'm' }],
      ['mcp__github__create_or_update_file', { owner: 'o', repo: 'r', branch: 'master', path: 'a', content: 'x', message: 'm' }],
      ['mcp__github__delete_file', { owner: 'o', repo: 'r', branch: 'main', path: 'a', message: 'm' }],
    ]) assert.ok(denied(mcp(name, input, env)), `${where}: ${name}`);
    assert.equal(mcp('mcp__github__push_files', { owner: 'o', repo: 'r', branch: 'claude/work', files: [], message: 'm' }, env), null, `${where}: a write to the work branch`);
    assert.equal(mcp('mcp__github__get_file_contents', { owner: 'o', repo: 'r', path: 'a' }, env), null, `${where}: a read`);
  }
  assert.match(closedBy(mcp('mcp__github__create_pull_request', { head: 'claude/work', base: 'main' }, {})), /run \/sattva:verify first/);
  const none = project();
  assert.equal(decide({ hook_event_name: 'PreToolUse', cwd: none, tool_name: 'mcp__github__create_pull_request', tool_input: { head: 'x', base: 'main' } }, {}), null, 'no active plan');
  // the hook has to be called for these tools at all — matched as Claude Code does: letters, digits, _ - space , |
  // only → a list of exact names; anything else → an unanchored RegExp test (code.claude.com/docs/en/hooks)
  const groups = JSON.parse(readFileSync(join(dirname(GATE), 'hooks.json'), 'utf8')).hooks.PreToolUse.map((g) => g.matcher);
  const fires = (name) => groups.some((m) => (/^[\w\- ,|]*$/.test(m) ? m.split(/[|,]/).map((s) => s.trim()).includes(name) : new RegExp(m).test(name)));
  for (const name of ['mcp__github__create_pull_request', 'mcp__x__merge_pull_request', 'mcp__x__push_files', 'mcp__x__create_or_update_file', 'mcp__x__delete_file', 'Bash', 'Edit', 'Write'])
    assert.ok(fires(name), `hooks.json reaches ${name}`);
  for (const name of ['TodoWrite', 'mcp__github__get_file_contents', 'mcp__github__list_pull_requests', 'Read'])
    assert.ok(!fires(name), `hooks.json leaves ${name} alone`);
});
