// rush.mjs — `pace` (is the plan in rush mode) and `summary` (the closing line of the chain), on a temporary git repo.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const RUSH = join(dirname(fileURLToPath(import.meta.url)), '..', 'skills', 'implement', 'scripts', 'rush.mjs');
const PLAN = 'docs/keystone/2026-11-19-x/plan.md';
const VERIFY = 'docs/keystone/2026-11-19-x/verify.md';
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });

const plan = (status, rush) => `# Plan: x\n\nLevel: M · Mode: feature · Status: ${status}\nSettings: tests — yes\nDone means: x\n${rush ? 'Pace: rush\n' : ''}\n## Original Request\nPace: rush in the body does not count\n\n## Tasks\n- [ ] 1. a — files: a.js\n`;
const vmd = (verdict, n) => `# Verify: x\nDate: 2026-11-19 · Base: 0000000 · Verdict: ${verdict}\n\n## Checks\n- run ${n}\n\n## Report\nKeystone verify: ${PLAN}\n- Task 1 — wrong — a${n}. Repro: x\n\n## Verdict\n${verdict}\n`;

function git(root, args, date) {
  const env = { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' };
  if (date) Object.assign(env, { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date });
  const r = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout;
}
function commit(root, files, msg, date) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '--no-verify', '-m', msg], date);
}
// approved: true | false | 'none' (never approved); now: the Pace line in the current plan
function repo({ approvedRush = true, now = true, approved = true, verify = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'ks-rush-'));
  roots.push(root);
  git(root, ['init', '-q', '-b', 'main']);
  commit(root, { [PLAN]: plan('draft', approvedRush) }, 'docs(plan): draft', '2026-11-19T09:00:00Z');
  if (approved) {
    commit(root, { [PLAN]: plan('approved', approvedRush) }, 'docs(plan): approved', '2026-11-19T10:00:00Z');
    commit(root, { [PLAN]: plan('implementing', now) }, 'docs(plan): implementing', '2026-11-19T10:05:00Z');
  } else if (approvedRush !== now) commit(root, { [PLAN]: plan('draft', now) }, 'docs(plan): draft 2', '2026-11-19T09:30:00Z');
  verify.forEach(([v, date], i) => commit(root, { [VERIFY]: vmd(v, i + 1), 'a.js': String(i) }, `docs(verify): x ${i + 1}`, date));
  return root;
}
const run = (root, cmd, { env = {}, cwd = root, plan: p = PLAN } = {}) => {
  const e = { ...process.env, ...env };
  if (!('CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH' in env)) delete e.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH;
  return spawnSync(process.execPath, [RUSH, cmd, p], { cwd, encoding: 'utf8', env: e });
};
const out = (r) => r.stdout.trim();

test('pace: Pace in the header and in the approval commit → rush', () => {
  assert.equal(out(run(repo(), 'pace')), 'pace: rush');
});
test('pace: Pace added after approval → normal', () => {
  assert.equal(out(run(repo({ approvedRush: false, now: true }), 'pace')), 'pace: normal — added after approval');
});
test('pace: no Pace line now (removed) → normal, even if it was approved with it', () => {
  assert.equal(out(run(repo({ approvedRush: true, now: false }), 'pace')), 'pace: normal — no Pace line');
  assert.equal(out(run(repo({ approvedRush: false, now: false }), 'pace')), 'pace: normal — no Pace line');
});
test('pace: no approval commit → not approved in git', () => {
  assert.equal(out(run(repo({ approved: false }), 'pace')), 'pace: normal — not approved in git');
});
test('pace: spawn depth — unset / 3 / 1', () => {
  const root = repo();
  assert.equal(out(run(root, 'pace')), 'pace: rush');
  assert.equal(out(run(root, 'pace', { env: { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '3' } })), 'pace: rush');
  assert.equal(out(run(root, 'pace', { env: { CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH: '1' } })), 'pace: unavailable — CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=1');
});
test('summary: no verify.md → no verdict, 0 runs, time to HEAD', () => {
  const r = out(run(repo(), 'summary'));
  assert.match(r, /^rush: no verdict · с одобрения 0ч 5мин \([0-9a-f]{7}\) · прогонов verify 0$/);
});
test('summary: two FAIL runs → FAIL · 2, time by commits (10:00 → 11:25)', () => {
  const r = out(run(repo({ verify: [['FAIL', '2026-11-19T10:40:00Z'], ['FAIL', '2026-11-19T11:25:00Z']] }), 'summary'));
  assert.match(r, /^rush: FAIL · с одобрения 1ч 25мин \([0-9a-f]{7}\) · прогонов verify 2$/);
});
test('summary: PASS after a FAIL → PASS · 2', () => {
  const r = out(run(repo({ verify: [['FAIL', '2026-11-19T10:40:00Z'], ['PASS', '2026-11-19T12:00:00Z']] }), 'summary'));
  assert.match(r, /^rush: PASS · с одобрения 2ч 0мин \([0-9a-f]{7}\) · прогонов verify 2$/);
});
test('summary: root-relative, absolute and from-a-subfolder plan paths give one result', () => {
  const root = repo({ verify: [['FAIL', '2026-11-19T10:40:00Z'], ['FAIL', '2026-11-19T11:25:00Z']] });
  const a = out(run(root, 'summary'));
  assert.match(a, /прогонов verify 2$/);
  assert.equal(out(run(root, 'summary', { plan: join(root, PLAN) })), a);
  assert.equal(out(run(root, 'summary', { cwd: join(root, 'docs'), plan: 'keystone/2026-11-19-x/plan.md' })), a);
});
test('errors: no file, not git → rush: <message> on stderr, exit 1', () => {
  const r = run(repo(), 'pace', { plan: 'nope/plan.md' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /^rush: no plan/);
  const bare = mkdtempSync(join(tmpdir(), 'ks-rush-bare-'));
  roots.push(bare);
  writeFileSync(join(bare, 'plan.md'), plan('approved', true));
  const g = spawnSync(process.execPath, [RUSH, 'pace', 'plan.md'], { cwd: bare, encoding: 'utf8', env: { ...process.env, GIT_CEILING_DIRECTORIES: dirname(bare) } });
  assert.equal(g.status, 1);
  assert.match(g.stderr, /^rush: not a git repository/);
});
