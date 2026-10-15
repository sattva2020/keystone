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
    mkdirSync(join(root, 'docs/keystone', dir), { recursive: true });
    if (header !== null) writeFileSync(join(root, 'docs/keystone', dir, 'plan.md'), `# Plan: x\n\n${header}\n\n## Tasks\n${extra.tasks ?? '- [ ] 1. a\n- [x] 2. b'}\n`);
  }
  for (const [f, body] of Object.entries(extra.files ?? {})) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'init');
  return root;
}
const pre = (root, tool_name, tool_input) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input }, ENV);
const stop = (root, active = false) => decide({ hook_event_name: 'Stop', cwd: root, stop_hook_active: active }, ENV);
const denied = (r) => r?.hookSpecificOutput?.permissionDecision === 'deny';

test('I-14: no docs/keystone → every event passes', () => {
  const root = project();
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
  assert.equal(pre(root, 'Bash', { command: 'git push' }), null);
  assert.equal(stop(root), null);
});

test('I-4: draft plan blocks code edits, allows the plan folder', () => {
  const root = project({ '2026-10-12-x': 'Level: M · Mode: feature · Status: draft' });
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') })));
  assert.ok(denied(pre(root, 'Write', { file_path: 'src\\b.ts' })), 'relative Windows path');
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'docs/keystone/2026-10-12-x/plan.md') }), null);
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'docs\\keystone\\2026-10-12-x\\intent.md') }), null, 'backslash path normalised');
  assert.match(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }).hookSpecificOutput.permissionDecisionReason, /Status: abandoned|KEYSTONE_GATES=off/);
});

test('I-4/I-14: approved and implementing plans allow edits; verified/abandoned are not active', () => {
  for (const s of ['approved', 'implementing', 'verified', 'abandoned']) {
    const root = project({ '2026-10-12-x': `Level: M · Mode: feature · Status: ${s}` });
    assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null, s);
  }
});

test('I-14: only the newest task folder counts — a forgotten old draft blocks nothing', () => {
  const a = project({ '2026-10-01-old': 'Status: draft', '2026-10-12-new': 'Status: verified' });
  assert.equal(pre(a, 'Edit', { file_path: join(a, 'src/a.ts') }), null);
  const b = project({ '2026-10-01-old': 'Status: draft', '2026-10-12-new': null }); // newest folder has intent only
  assert.equal(pre(b, 'Edit', { file_path: join(b, 'src/a.ts') }), null);
  assert.equal(pre(b, 'Bash', { command: 'git push' }), null);
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

test('I-13: KEYSTONE_GATES=off disables every gate', () => {
  const root = project({ '2026-10-12-x': 'Status: draft' });
  assert.equal(decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name: 'Edit', tool_input: { file_path: join(root, 'src/a.ts') } }, { KEYSTONE_GATES: 'off' }), null);
});

test('AI Factory project: task folders under paths.specs count too', () => {
  const root = project({}, { files: { '.ai-factory/config.yaml': 'paths:\n  specs: .ai-factory/specs/\n', '.ai-factory/specs/2026-10-12-x/plan.md': 'Status: draft\n- [ ] 1. a' } });
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') })));
  assert.equal(pre(root, 'Edit', { file_path: join(root, '.ai-factory/specs/2026-10-12-x/plan.md') }), null);
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
  utimesSync(join(root, 'docs/keystone/2026-10-12-login-page/plan.md'), old, old);
  utimesSync(join(root, 'docs/keystone/2026-10-12-a-fix/plan.md'), now, now);
  assert.ok(denied(pre(root, 'Edit', { file_path: join(root, 'src/a.test.ts') })), 'the newer fix plan is active');
});

test('review: Status/Mode come from the header line only; Stop counts only ## Tasks', () => {
  const root = project({ '2026-10-12-x': 'Level: M · Mode: feature · Status: verified' }, { tasks: '- [ ] 1. set Status: draft on the page' });
  assert.equal(pre(root, 'Edit', { file_path: join(root, 'src/a.ts') }), null);
  const r2 = mkdtempSync(join(tmpdir(), 'ks-')); git(r2, 'init', '-q');
  mkdirSync(join(r2, 'docs/keystone/2026-10-12-x'), { recursive: true });
  writeFileSync(join(r2, 'docs/keystone/2026-10-12-x/plan.md'), "# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\n\n## Original Request\n- [ ] not a task\n\n## Tasks\n- [x] 1. a\n\n## Open questions\n- [ ] none\n");
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
  mkdirSync(join(wt, 'docs/keystone/2026-10-12-y'), { recursive: true });
  writeFileSync(join(wt, '.git'), 'gitdir: elsewhere');
  writeFileSync(join(wt, 'docs/keystone/2026-10-12-y/plan.md'), "Level: M · Mode: feature · Status: approved\n## Tasks\n- [ ] 1. a");
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
  commit('docs/keystone/2026-10-14-x/verify.md'); // the plan's task folder
  assert.ok(denied(pre(root, 'Bash', { command: P })), 'a commit touching the plan folder is still closed');
  assert.ok(denied(pre(root, 'PowerShell', { command: `${P} origin main` })));
  assert.ok(denied(pre(root, 'Bash', { command: `${P} --all origin` })), '--all ships every branch');
  assert.ok(denied(pre(root, 'Bash', { command: `${P} origin no-such-branch` })), 'unknown ref → closed');
  assert.match(pre(root, 'Bash', { command: P }).hookSpecificOutput.permissionDecisionReason, /start Claude Code with KEYSTONE_GATES=off/);
});
