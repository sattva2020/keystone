// Class: the CLI forms the skills write — flags before or after the plan path (`release --any <plan>`,
// `take <plan> --stage fix --force`) — all parse to the same call; a stray word or flag is an error (exit 1).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(ROOT, 'skills', 'implement', 'scripts', 'owner.mjs');
const X = 'docs/sattva/2026-11-01-x/plan.md';
const ENV = { ...process.env, CLAUDE_CODE_REMOTE: '', SATTVA_GATES: '' };
let root;
after(() => { try { rmSync(root, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const git = (cwd, ...a) => assert.equal(spawnSync('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@t', ...a]).status, 0);

test('every owner.mjs command line written in the skills parses; flags may come before the plan', () => {
  root = mkdtempSync(join(tmpdir(), 'ks-ownercli-'));
  const repo = join(root, 'r');
  git(root, 'init', '-q', '-b', 'main', repo);
  mkdirSync(join(repo, dirname(X)), { recursive: true });
  writeFileSync(join(repo, X), '# Plan\n');
  git(repo, 'add', '-A');
  git(repo, 'commit', '-qm', 'plan');
  const cli = (...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd: repo, encoding: 'utf8', env: ENV });
  const ok = (r) => { assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout); };

  assert.equal(ok(cli('take', '--stage', 'fix', X)).ok, true, '--stage before the plan');
  assert.equal(ok(cli('beat', X, '--stage', 'fix')).ok, true);
  assert.equal(ok(cli('release', '--any', X)).released, true, 'release --any <plan>');
  assert.equal(ok(cli('take', X, '--force', '--stage', 'implement')).ok, true);
  assert.equal(ok(cli('release', X, '--any')).released, true, 'release <plan> --any');
  assert.equal(cli('release', '--anyy', X).status, 1, 'an unknown flag is an error');
  assert.equal(cli('release', X, 'extra').status, 1, 'a stray word is an error');

  // every command the skill texts give parses with the plan path filled in
  const texts = ['implement/SKILL.md', 'fix/SKILL.md', 'start/SKILL.md', 'verify/references/ACCEPT.md']
    .map((f) => readFileSync(join(ROOT, 'skills', f), 'utf8')).join('\n');
  const calls = [...texts.matchAll(/owner\.mjs" ((?:take|beat|release)[^`\n]*)`/g)].map((m) => m[1]);
  assert.ok(calls.length >= 6, `found ${calls.length} calls`);
  for (const c of calls) {
    if (c.includes('|')) continue; // the synopsis line
    const args = c.replace(/<[^>]+>/, X).split(/\s+/).filter(Boolean);
    const r = cli(...args.map((a) => a.replace(/^<[^>]+>$/, X)));
    assert.equal(r.status === 0 || r.status === 3, true, `${c} → exit ${r.status}: ${r.stderr}`);
  }
});
