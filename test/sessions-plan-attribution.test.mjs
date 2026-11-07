// Plan attribution on real git (D19, verify 769c0be): a session's plans are its unmerged commits and uncommitted files;
// a sibling branch holding the same commits changes nothing.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { classify } from '../skills/sessions/scripts/triage.mjs';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const tmp = () => { const d = mkdtempSync(join(tmpdir(), 'ks-attr-')); roots.push(d); return d; };
const OLD = { GIT_COMMITTER_DATE: '2025-12-01T00:00:00Z', GIT_AUTHOR_DATE: '2025-12-01T00:00:00Z' };
const git = (cwd, env, ...a) => {
  const r = spawnSync('git', ['-C', cwd, ...a], { encoding: 'utf8', env: { ...process.env, ...env } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim();
};
const put = (root, files) => {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
};
const commit = (root, files, msg, env = {}) => {
  put(root, files);
  git(root, env, 'add', '-A');
  git(root, env, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
};
function repo() {
  const root = tmp();
  git(root, {}, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x' }, 'start', OLD);
  return root;
}
const PLAN = 'docs/keystone/2026-11-05-c/plan.md';
const plan = (status, tasks, release = '') => `# Plan: c\n\nLevel: L · Mode: feature · Status: ${status}\n\n## Tasks\n${tasks}\n${release ? `\n## Release\n${release}\n` : ''}`;
const session = (id, worktreePath, originCwd, branch, state = 'idle') => ({ sessionId: id, parentSessionId: 'root', state, worktreePath, originCwd, branch, sourceBranch: 'main' });

// D19: a session's plans are its unmerged commits (sourceBranch..branch) and its uncommitted files.
test('D19 (а): shared folder on main, a plan committed to main → archive, even after a sibling forks from main', () => {
  const root = repo();
  commit(root, { [PLAN]: plan('implementing', '- [ ] 1. a') }, 'plan on main');
  const ws = join(tmp(), 's');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/s', ws);
  const out = classify([session('c', root, root, 'main'), session('s', ws, root, 'claude/s', 'working')], { self: 'root' });
  assert.deepEqual(out.archive.map((a) => a.sessionId), ['c'], JSON.stringify(out));
});

test('D19 (б): shared folder on main, an uncommitted implementing plan → message implement', () => {
  const root = repo();
  put(root, { [PLAN]: plan('implementing', '- [ ] 1. a') });
  const out = classify([session('c', root, root, 'main')], { self: 'root' });
  assert.deepEqual(out.message.map((m) => m.step), [`/keystone:implement ${PLAN}`], JSON.stringify(out));
});

test('D19 (в): own worktree, unmerged plan verified with open R2 → waiting «релиз»', () => {
  const root = repo();
  const wc = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wc);
  commit(wc, { [PLAN]: plan('verified', '- [x] 1. a', '- [ ] R2. live') }, 'plan c');
  const out = classify([session('c', wc, root, 'claude/c')], { self: 'root' });
  assert.equal(out.archive.length, 0, JSON.stringify(out));
  assert.equal(out.waiting[0].reason, 'релиз: R2 — ваш шаг');
});

test('D19 (г): the same plan fast-forwarded into main, a sibling forks from main after the merge → archive', () => {
  const root = repo();
  const wc = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wc);
  commit(wc, { [PLAN]: plan('verified', '- [x] 1. a', '- [ ] R2. live') }, 'plan c');
  git(root, {}, 'merge', '-q', '--ff-only', 'claude/c');
  const ws = join(tmp(), 's');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/s', ws);
  const out = classify([session('c', wc, root, 'claude/c'), session('s', ws, root, 'claude/s', 'working')], { self: 'root' });
  assert.deepEqual(out.archive.map((a) => a.sessionId), ['c'], JSON.stringify(out));
});

test('I-4 on git: own worktree with open tasks → message, even when a sibling is cut from its branch', () => {
  const root = repo();
  const wc = join(tmp(), 'c');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/c', wc);
  commit(wc, { [PLAN]: plan('implementing', '- [ ] 1. a') }, 'plan c');
  const ws = join(tmp(), 's');
  git(root, {}, 'worktree', 'add', '-q', '-b', 'claude/s', ws, 'claude/c');
  const out = classify([session('c', wc, root, 'claude/c'), session('s', ws, root, 'claude/s', 'working')], { self: 'root' });
  assert.deepEqual(out.message.map((m) => m.step), [`/keystone:implement ${PLAN}`], JSON.stringify(out));
});
