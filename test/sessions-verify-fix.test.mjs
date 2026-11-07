// Regression checks for the FAIL findings of docs/keystone/2026-11-04-child-sessions-lifecycle/verify.md
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { classify, decide, facts } from '../skills/sessions/scripts/triage.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const P = 'docs/keystone/2026-11-04-x/plan.md';
const pl = (o) => ({ name: '2026-11-04-x', path: P, status: 'implementing', open: 0, blocked: null, release: [], verify: false, verdict: null, fixedAfterFail: false, ...o });
const F = (o) => ({ own: true, merged: false, ownCommits: true, dirty: false, files: [], plans: [], ...o });
const S = { sessionId: 'c', title: 'child', branch: 'b', sourceBranch: 'main' };

test('I-12: a sibling of --self (same parent, not a descendant) is not in the family', () => {
  const r = classify([
    { sessionId: 'P' },
    { sessionId: 'me', parentSessionId: 'P' },
    { sessionId: 'kid', parentSessionId: 'me', state: 'idle' },
    { sessionId: 'sib', parentSessionId: 'P', state: 'idle' },
  ], { self: 'me', factsOf: () => F({ ownCommits: false }) });
  assert.deepEqual([...r.archive, ...r.message, ...r.waiting].map((x) => x.sessionId), ['kid']);
});

test('I-2, I-3: a clean session whose plan is not verified is never archived', () => {
  for (const status of ['abandoned', 'approved', undefined]) {
    for (const f of [F({ merged: true, ownCommits: false }), F({ own: false }), F({ ownCommits: false }), F({})]) {
      const got = decide(S, { ...f, plans: [pl({ status })] });
      assert.equal(got.group, 'waiting', `${status} ${JSON.stringify(f)}`);
      assert.equal(got.reason, `не распознано: ${status ?? 'intent'}`);
    }
  }
});

test('I-3: a detached worktree with its own unmerged commits is not archived', () => {
  const root = mkdtempSync(join(tmpdir(), 'ks-sessfix-'));
  after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* Windows locks */ } });
  const git = (cwd, ...a) => { const r = spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a], { encoding: 'utf8' }); assert.equal(r.status, 0, r.stderr); };
  git(root, 'init', '-q', '-b', 'main');
  writeFileSync(join(root, 'a'), '1'); git(root, 'add', '-A'); git(root, 'commit', '-q', '--no-verify', '-m', 'a');
  const wt = join(root, 'wd');
  git(root, 'worktree', 'add', '-q', '--detach', wt);
  writeFileSync(join(wt, 'b'), '2'); git(wt, 'add', '-A'); git(wt, 'commit', '-q', '--no-verify', '-m', 'b');
  const s = { sessionId: 'd', worktreePath: wt, originCwd: root, sourceBranch: 'main' };
  const f = facts(s);
  assert.equal(f.ownCommits, true);
  assert.equal(f.merged, false);
  assert.notEqual(decide(s, f).group, 'archive');
});

test('I-1: an archived child does not hide its live grandchild', () => {
  const r = classify([
    { sessionId: 'me' },
    { sessionId: 'c', parentSessionId: 'me', isArchived: true },
    { sessionId: 'g', parentSessionId: 'c', state: 'idle' },
  ], { self: 'me', factsOf: () => F({ merged: true, ownCommits: false }) });
  assert.deepEqual(r.archive.map((a) => a.sessionId), ['g']);
});

test('I-8: git mode with no extra worktrees prints the empty table and the read-only line', () => {
  const root = mkdtempSync(join(tmpdir(), 'ks-sessfix-'));
  after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* Windows locks */ } });
  spawnSync('git', ['-C', root, 'init', '-q', '-b', 'main']);
  spawnSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--allow-empty', '--no-verify', '-m', 'a']);
  const r = spawnSync('node', [join(ROOT, 'skills', 'sessions', 'scripts', 'triage.mjs'), 'git'], { cwd: root, encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /инструментов сессий нет — разбор только для чтения/);
});

test('I-9: a worktree inside another session keeps the outer one, whatever the input order', () => {
  const o = { sessionId: 'o', parentSessionId: 'me', state: 'idle', worktreePath: '/r/c/.claude/worktrees/o', originCwd: '/r/c' };
  const c = { sessionId: 'c', parentSessionId: 'me', state: 'idle', worktreePath: '/r/c', originCwd: '/r' };
  for (const order of [[o, c], [c, o]]) {
    const r = classify([{ sessionId: 'me' }, ...order], { self: 'me', factsOf: () => F({ merged: true, ownCommits: false }) });
    assert.deepEqual(r.archive.map((a) => a.sessionId), ['o'], order.map((s) => s.sessionId).join(','));
    assert.equal(r.waiting.find((w) => w.sessionId === 'c')?.reason, 'есть живые дочерние сессии');
  }
});

test('I-9: SKILL.md keeps the ancestors of a refused archive out of the archive', () => {
  const md = readFileSync(join(ROOT, 'skills', 'sessions', 'SKILL.md'), 'utf8');
  const step3 = md.slice(md.indexOf('## Step 3'), md.indexOf('## Step 4'));
  assert.match(step3, /ancestor/);
  assert.match(step3, /есть живые дочерние сессии/);
  assert.doesNotMatch(md, /No decisions through verify/); // unrequested, cut-off block
});
