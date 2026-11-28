// Class test (fix verify, 2026-11-15): every path collect.mjs composes for verify.md goes in backticks, so Prettier
// via lint-staged does not turn `__tests__` into `**tests**`. Walks every place: the files: list, the Architecture gate,
// rules scope (failing rule lines and changed rule files), the accepted violations line, and the check lines (changed
// files in the build / lint command, the tool's output).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { collect, findBase, git } from '../skills/verify/scripts/collect.mjs';

const PLAN = 'docs/sattva/2026-10-18-x/plan.md';
const VERIFY = 'docs/sattva/2026-10-18-x/verify.md';
const P = 'src/__tests__/a.test.js';
const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
function commit(root, files, msg) {
  for (const [f, body] of Object.entries(files)) { mkdirSync(dirname(join(root, f)), { recursive: true }); writeFileSync(join(root, f), body); }
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '--no-verify', '-m', msg);
}
// a line that still names a path outside a backtick span
const bare = (out, re = /src\/__tests__\/a\.test\.js/) => out.split('\n').filter((l) => re.test(l.replace(/``.*?``|`[^`]*`/g, '')));

test('verify paths: every path collect composes for verify.md is in backticks', () => {
  const root = mkdtempSync(join(tmpdir(), 'ks-ticks-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', 'docs/architecture.md': '- MUST NOT: ui imports db — check: `grep -n "from \'db\'"`\n' }, 'start');
  commit(root, { [PLAN]: '# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\nSettings: tests — no\n\n## Tasks\n- [ ] 1. a — files: src/ — check: x\n' }, 'docs(plan)');
  commit(root, { [P]: "import x from 'db'\n" }, 'feat');
  const base = findBase(root, PLAN).base.slice(0, 7);

  const first = collect(root, PLAN);
  assert.match(first, /^ {2}`src\/__tests__\/a\.test\.js`$/m, 'files: list');
  assert.match(first, /^Architecture gate: fail — .*`src\/__tests__\/a\.test\.js:1` /m, 'Architecture gate');

  const report = `Sattva verify: ${PLAN}\n- Task 1 — ok — fine\nrule CLAUDE.md:3 — fail — ${P}:4\n`;
  const run = `# Verify: x\nDate: 2026-11-15 · Base: ${base} · Verdict: FAIL\n\n## Checks\n- base: ${base}\n\n## Carried\n\n## Report\n${report}\n## Verdict\nFAIL\n`;
  commit(root, { [VERIFY]: run }, 'docs(verify): x');
  commit(root, { [VERIFY]: `${run}Accepted violation by t 2026-11-15: rule CLAUDE.md:3 — ${P}:4\n` }, 'docs(verify): accept violation x');
  commit(root, { 'src/c.js': '1' }, 'fix');
  const second = collect(root, PLAN);
  assert.match(second, /^rules scope: .*failing rule lines: `src\/__tests__\/a\.test\.js`$/m, 'rules scope: failing rule lines');
  assert.match(second, /^accepted violations: rule `CLAUDE\.md:3` — `src\/__tests__\/a\.test\.js:4`$/m, 'accepted violations');

  commit(root, { '.claude/rules/__x__.md': '- MUST: y\n' }, 'rules');
  const third = collect(root, PLAN);
  assert.match(third, /^rules scope: all task files — rule files changed: `\.claude\/rules\/__x__\.md`$/m, 'rules scope: changed rule files');

  for (const out of [first, second, third]) assert.deepEqual(bare(out), [], 'no bare path left');
});

// fix verify 2026-11-15 (second pass): the check lines — changed files in the build / lint command and the tool's output
test('verify paths: check command lines and their output put changed file paths in backticks', () => {
  const root = mkdtempSync(join(tmpdir(), 'ks-ticks-'));
  roots.push(root);
  git(root, 'init', '-q', '-b', 'main');
  commit(root, { 'README.md': 'x', 'pyproject.toml': '[tool.ruff]\nline-length = 100\n' }, 'start');
  commit(root, { [PLAN]: '# Plan: x\n\nLevel: M · Mode: feature · Status: implementing\nSettings: tests — no\n\n## Tasks\n- [ ] 1. a — files: pkg/ — check: x\n' }, 'docs(plan)');
  commit(root, { 'pkg/__init__.py': 'def (:\n' }, 'feat'); // a syntax error: py_compile, if present, fails and prints the path
  const out = collect(root, PLAN);
  assert.match(out, /^build: python -m py_compile `pkg\/__init__\.py` → /m, 'build line');
  assert.match(out, /^lint: ruff check `pkg\/__init__\.py` → /m, 'lint line');
  assert.deepEqual(bare(out, /pkg[\\/]__init__\.py/), [], 'no bare path left, tool output included');
});
