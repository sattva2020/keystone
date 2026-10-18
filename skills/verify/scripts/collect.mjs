#!/usr/bin/env node
// Keystone verify — the mechanical steps in one call: the diff base, this task's commits and files, and the
// build / test / lint checks of references/CHECKS.md. No model spends tokens on them.
// Usage (from the repo root): node collect.mjs <plan path> [base ref]
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TIMEOUT_MS = 600_000;

export function git(cwd, ...args) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || '').trim()}`);
  return r.stdout.trimEnd(); // not trimStart: a porcelain line may begin with a space (` M a.js`)
}
const lines = (s) => (s ? s.split(/\r?\n/).filter(Boolean) : []);

// Step 1 of verify: P = first commit that added the plan, C = first commit after P, base = C^.
export function findBase(cwd, plan, given) {
  plan = plan.replace(/^(\.\/)+/, '');
  if (given) return { base: git(cwd, 'rev-parse', '--verify', given), rule: 'given ref' };
  const p = lines(git(cwd, 'log', '--diff-filter=A', '--format=%H', '--', plan)).pop();
  if (!p) throw new Error(`${plan} is not in the git history`);
  const folder = dirname(plan).replace(/\\/g, '/') + '/';
  const outside = lines(git(cwd, 'show', '--name-only', '--format=', p)).some((f) => !f.startsWith(folder));
  const root = !lines(git(cwd, 'rev-list', '--parents', '-n', '1', p)).join(' ').trim().includes(' ');
  if (outside && !root) return { base: git(cwd, 'rev-parse', `${p}^`), rule: 'P^ — the plan commit has files outside the task folder' };
  const c = lines(git(cwd, 'rev-list', '--reverse', `${p}..HEAD`))[0];
  if (!c) return { base: p, rule: 'P — no commit after the plan' };
  return { base: git(cwd, 'rev-parse', `${c}^`), rule: 'parent of the first commit after the plan' };
}

// Only this task's commits (first parent); files of merge commits are not counted.
export function taskFiles(cwd, base) {
  const commits = lines(git(cwd, 'log', '--first-parent', '--format=%H %P|%s', `${base}..HEAD`)).map((l) => {
    const [head, subject] = [l.slice(0, l.indexOf('|')), l.slice(l.indexOf('|') + 1)];
    const [sha, ...parents] = head.split(' ');
    return { sha, merge: parents.length > 1, subject };
  });
  const files = new Set();
  for (const c of commits) if (!c.merge) lines(git(cwd, 'show', '--name-only', '--format=', c.sha)).forEach((f) => files.add(f));
  const dirty = lines(git(cwd, 'status', '--porcelain', '-uall')).map((l) => l.slice(3).replace(/^.* -> /, ''));
  dirty.forEach((f) => files.add(f));
  return { commits, files: [...files].sort(), dirty };
}

const has = (cwd, f) => existsSync(join(cwd, f));
const read = (cwd, f) => (has(cwd, f) ? readFileSync(join(cwd, f), 'utf8') : '');
const scripts = (cwd) => { try { return JSON.parse(read(cwd, 'package.json')).scripts || {}; } catch { return {}; } };
const anyFile = (cwd, re) => readdirSync(cwd).some((f) => re.test(f));

// The detection tables of references/CHECKS.md. Each entry: [label, argv] or null.
export function detect(cwd, changed) {
  const py = changed.filter((f) => f.endsWith('.py') && has(cwd, f));
  const js = changed.filter((f) => /\.(m?[jt]sx?|cjs)$/.test(f) && has(cwd, f));
  const pyproject = read(cwd, 'pyproject.toml');
  const s = scripts(cwd);
  const build = has(cwd, 'go.mod') ? ['go', 'build', './...']
    : has(cwd, 'tsconfig.json') ? ['npx', '--no-install', 'tsc', '--noEmit']
    : s.build ? ['npm', 'run', 'build']
    : pyproject && py.length ? ['python', '-m', 'py_compile', ...py]
    : has(cwd, 'Cargo.toml') ? ['cargo', 'check']
    : has(cwd, 'composer.json') ? ['composer', 'validate'] : null;
  const test = s.test ? ['npm', 'test']
    : has(cwd, 'pytest.ini') || pyproject.includes('[tool.pytest') ? ['pytest']
    : has(cwd, 'go.mod') ? ['go', 'test', './...']
    : anyFile(cwd, /^phpunit\.xml/) ? ['./vendor/bin/phpunit']
    : has(cwd, 'Cargo.toml') ? ['cargo', 'test'] : null;
  const lint = anyFile(cwd, /^(eslint\.config\.|\.eslintrc)/) ? (js.length ? ['npx', '--no-install', 'eslint', ...js] : 'no changed JS/TS files')
    : has(cwd, '.golangci.yml') ? ['golangci-lint', 'run', './...']
    : /\bruff\b/.test(pyproject) ? (py.length ? ['ruff', 'check', ...py] : 'no changed Python files')
    : anyFile(cwd, /^\.php-cs-fixer/) ? ['./vendor/bin/php-cs-fixer', 'fix', '--dry-run', '--diff'] : null;
  return { build, test, lint };
}

// Locale-independent "is the tool there": a path inside the repo, or a lookup on PATH (where / command -v).
const toolExists = (cwd, cmd) => /[\\/]/.test(cmd) ? ['', '.cmd', '.bat', '.exe'].some((e) => has(cwd, cmd + e)) // on Windows vendor/bin/x is x.bat or x.cmd
  : spawnSync(process.platform === 'win32' ? 'where' : 'sh', process.platform === 'win32' ? [cmd] : ['-c', `command -v ${cmd}`], { stdio: 'ignore' }).status === 0;

function run(cwd, kind, argv) {
  if (!argv) return `${kind}: not run (no ${kind} config)`;
  if (typeof argv === 'string') return `${kind}: not run (${argv})`;
  const shown = argv.join(' ');
  if (!toolExists(cwd, argv[0])) return `${kind}: ${shown} → not run (${argv[0]} not found)`;
  // Windows needs the shell for npm/npx (.cmd); pass one quoted string so arguments are not concatenated raw
  const q = (a) => (/[\s"&|<>^]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a);
  const r = process.platform === 'win32'
    // cmd.exe cannot launch ./vendor/bin/x: use backslashes in the command path
    ? spawnSync([argv[0].replace(/\//g, '\\'), ...argv.slice(1)].map(q).join(' '), { cwd, encoding: 'utf8', timeout: TIMEOUT_MS, shell: true })
    : spawnSync(argv[0], argv.slice(1), { cwd, encoding: 'utf8', timeout: TIMEOUT_MS });
  if (r.error?.code === 'ENOENT') return `${kind}: ${shown} → not run (${argv[0]} not found)`;
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return `${kind}: ${shown} → fail (timeout after ${TIMEOUT_MS / 1000} s)`;
  const out = lines(`${r.stdout || ''}\n${r.stderr || ''}`);
  // a missing tool is caught by toolExists; only `npx --no-install` with a package that is not installed gets here
  if (r.status !== 0 && argv[0] === 'npx' && out.some((l) => /could not determine executable|npm error canceled/i.test(l)) && out.length < 8)
    return `${kind}: ${shown} → not run (${out[out.length - 1]})`;
  // pass: the end of stdout (where runners print their counts); fail: the end of everything, ~20 lines (CHECKS.md)
  const tail = (r.status === 0 ? lines(r.stdout || '').slice(-8) : out.slice(-20)).map((l) => `    ${l}`).join('\n');
  return `${kind}: ${shown} → ${r.status === 0 ? 'pass' : 'fail'}${tail ? `\n${tail}` : ''}`;
}

// Architecture gate: each `MUST NOT:` line written by /keystone:architecture carries `check: <grep>`.
export function architecture(cwd, changed) {
  const doc = read(cwd, 'docs/architecture.md');
  if (!doc) return ['Architecture gate: n/a — no docs/architecture.md'];
  const rules = lines(doc).filter((l) => /MUST NOT:/.test(l) && /check:\s*`?([^`]+)`?/.test(l));
  if (!rules.length) return ['Architecture gate: n/a — no MUST NOT rules with a check'];
  const out = [], fails = [];
  for (const rule of rules) {
    const check = rule.match(/check:\s*`?([^`]+)`?/)[1].trim();
    if (check === 'review') { out.push(`review: ${rule.trim()}`); continue; }
    // one file per run, so every hit can carry its file name (grep omits it for a single file)
    for (const f of changed.filter((f) => has(cwd, f))) {
      const r = spawnSync(`${check} ${JSON.stringify(f)}`, { cwd, encoding: 'utf8', shell: true });
      lines(r.stdout).forEach((hit) => fails.push(`${rule.replace(/\s*check:.*$/, '').trim()}, ${f}:${hit}`));
    }
  }
  return [fails.length ? `Architecture gate: fail — ${fails.join('; ')}` : 'Architecture gate: pass', ...out];
}

export function collect(cwd, plan, given) {
  const { base, rule } = findBase(cwd, plan, given);
  const { commits, files, dirty } = taskFiles(cwd, base);
  const out = [`base: ${base.slice(0, 7)} — ${rule}`, `commits: ${commits.filter((c) => !c.merge).length}`];
  for (const c of commits) out.push(`  ${c.merge ? 'merge (files not counted): ' : ''}${c.sha.slice(0, 7)} ${c.subject}`);
  out.push(`files: ${files.length}${dirty.length ? ` (${dirty.length} uncommitted)` : ''}`, ...files.map((f) => `  ${f}`));
  const settings = lines(read(cwd, plan)).find((l) => l.startsWith('Settings:')) || '';
  const d = detect(cwd, files);
  out.push(run(cwd, 'build', d.build));
  out.push(/tests\s*—\s*no/.test(settings) ? 'test: not run (Settings tests — no)' : run(cwd, 'test', d.test));
  out.push(run(cwd, 'lint', d.lint));
  out.push('imports: not run (the verifier reads the diff)');
  out.push(...architecture(cwd, files));
  return out.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const [plan, given] = process.argv.slice(2);
  if (!plan) { console.error('usage: node collect.mjs <plan path> [base ref]'); process.exit(2); }
  try { console.log(collect(process.cwd(), plan.replace(/\\/g, '/'), given)); }
  catch (e) { console.log(`error: ${e.message}`); process.exit(1); }
}
