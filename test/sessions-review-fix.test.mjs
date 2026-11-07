// Regression checks for the /keystone:review findings (2026-11-05) on skills/sessions/scripts/triage.mjs
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { classify, facts } from '../skills/sessions/scripts/triage.mjs';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ks-review-')); roots.push(d); return d; };
const git = (cwd, env, ...a) => {
  const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const put = (root, files) => {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
};
const OLD = { GIT_COMMITTER_DATE: '2025-12-01T00:00:00Z', GIT_AUTHOR_DATE: '2025-12-01T00:00:00Z' };
const commit = (root, files, msg, env = {}) => {
  put(root, files);
  git(root, env, 'add', '-A');
  git(root, env, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
};
function repo() {
  const root = tmp();
  git(root, {}, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', '.gitignore': '.env\nnode_modules/\n' }, 'start', OLD);
  return root;
}
const plan = (status, release = '') => `# Plan: x\n\nLevel: L · Mode: feature · Status: ${status}\n\n## Tasks\n- [x] 1. a\n${release ? `\n## Release\n${release}\n` : ''}`;

test('review 1: a sibling plan merged into main is not the shared-folder session\'s plan', () => {
  const root = repo();
  const wt = join(tmp(), 's');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/s', wt);
  commit(wt, { 'docs/keystone/2026-11-05-s/plan.md': plan('verified', '- [ ] R2. live run') }, 'sibling plan');
  git(root, {}, 'merge', '-q', '--ff-only', 'claude/s');
  const sessions = [
    { sessionId: 'c', parentSessionId: 'root', state: 'idle', worktreePath: root, originCwd: root, branch: 'main', sourceBranch: 'main' },
    { sessionId: 's', parentSessionId: 'root', state: 'working', worktreePath: wt, originCwd: root, branch: 'claude/s', sourceBranch: 'main' },
  ];
  const out = classify(sessions, { self: 'root' });
  assert.deepEqual(out.archive.map((a) => a.sessionId), ['c'], JSON.stringify(out));
});

test('review 1: main merged into the own branch brings no plans of others', () => {
  const root = repo();
  const wt = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wt);
  commit(wt, { 'src/a.js': '1' }, 'own work');
  commit(root, { 'docs/keystone/2026-11-05-other/plan.md': plan('implementing') }, 'other plan on main');
  git(wt, {}, '-c', 'user.name=t', '-c', 'user.email=t@t', 'merge', '-q', '--no-edit', 'main');
  const f = facts({ sessionId: 'c', worktreePath: wt, originCwd: root, branch: 'claude/c', sourceBranch: 'main' });
  assert.deepEqual(f.plans.map((p) => p.name), []);
});

test('review 2: an ignored file in an own worktree keeps the session out of the archive; ignored folders do not', () => {
  const root = repo();
  const wt = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wt);
  put(wt, { '.env': 'SECRET=1', 'node_modules/x/index.js': '1' });
  const s = { sessionId: 'c', parentSessionId: 'root', state: 'idle', worktreePath: wt, originCwd: root, branch: 'claude/c', sourceBranch: 'main' };
  const out = classify([s], { self: 'root' });
  assert.equal(out.archive.length, 0, JSON.stringify(out));
  assert.equal(out.message.length, 0, 'an ignored file is never sent as «закоммить изменения»');
  assert.match(out.waiting[0].reason, /\.env/);
  assert.doesNotMatch(out.waiting[0].reason, /node_modules/);
});

test('review 3: renamed and non-ASCII paths come out plain; the new plan folder is found', () => {
  const root = repo();
  const wt = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wt);
  commit(wt, { 'docs/keystone/2026-11-05-a/plan.md': plan('implementing') }, 'plan a', OLD);
  git(wt, {}, 'mv', 'docs/keystone/2026-11-05-a', 'docs/keystone/2026-11-05-b');
  put(wt, { 'файл с пробелом.js': '1' });
  const f = facts({ sessionId: 'c', worktreePath: wt, originCwd: root, branch: 'claude/c', sourceBranch: 'main' });
  assert.deepEqual(f.files.sort(), ['docs/keystone/2026-11-05-b/plan.md', 'файл с пробелом.js']);
  assert.deepEqual(f.plans.map((p) => p.name), ['2026-11-05-b']);
});

test('review 4: a waiting session with uncommitted files is «ждёт вашего ответа»', () => {
  const dirty = () => ({ own: true, merged: true, ownCommits: false, dirty: true, files: ['a.js'], ignored: [], plans: [] });
  const out = classify([{ sessionId: 'c', parentSessionId: 'root', state: 'waiting' }], { self: 'root', factsOf: dirty });
  assert.equal(out.waiting[0].reason, 'ждёт вашего ответа');
});
