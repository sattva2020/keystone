#!/usr/bin/env node
// Keystone verify — the mechanical steps in one call: the diff base, this task's commits and files, and the
// build / test / lint checks of references/CHECKS.md, which rows of the last verify carry over, and the run history.
// No model spends tokens on them.
// Usage (from the repo root): node collect.mjs <plan path> [base ref] [--full] | node collect.mjs <plan path> --history
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const TIMEOUT_MS = Number(process.env.KEYSTONE_CHECK_TIMEOUT_MS) || 600_000;

export function git(cwd, ...args) {
  const r = spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8' });
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
  for (const c of commits) if (!c.merge) lines(git(cwd, 'show', '--name-only', '--no-renames', '--format=', c.sha)).forEach((f) => files.add(f));
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
  if (r.error?.code === 'ETIMEDOUT' || r.signal) return `${kind}: ${shown} → not run (timeout after ${TIMEOUT_MS / 1000} s)`;
  const out = lines(`${r.stdout || ''}\n${r.stderr || ''}`);
  // a missing tool is caught by toolExists; only `npx --no-install` with a package that is not installed gets here
  if (r.status !== 0 && argv[0] === 'npx' && out.some((l) => /could not determine executable|npm error canceled/i.test(l)) && out.length < 8)
    return `${kind}: ${shown} → not run (${out[out.length - 1]})`;
  // pass: the end of stdout (where runners print their counts); fail: the end of everything, ~20 lines (CHECKS.md)
  const tail = (r.status === 0 ? lines(r.stdout || '').slice(-8) : out.slice(-20)).map((l) => `    ${l}`).join('\n');
  return `${kind}: ${shown} → ${r.status === 0 ? 'pass' : 'fail'}${tail ? `\n${tail}` : ''}`;
}

// Fingerprint of everything a check can depend on: tracked and untracked files and uncommitted changes, without this
// task's folder and docs/**/*.md — verify.md, ticks and notes change between runs and no build or test reads them.
// ponytail: a test that reads docs/*.md gets a stale pass; the line says `reused`, and any code change drops it.
function codeKey(cwd, plan) {
  const skip = [`:(exclude)${dirname(plan).replace(/\\/g, '/')}`, ':(exclude,glob)docs/**/*.md'];
  return createHash('sha1')
    .update(git(cwd, 'ls-files', '-s', '--', '.', ...skip))
    .update(git(cwd, 'diff', 'HEAD', '--', '.', ...skip))
    .update(git(cwd, 'ls-files', '-o', '--exclude-standard', '--', '.', ...skip))
    .digest('hex');
}

// A pass on the same code is not run again. Only passes are kept: a failure or a timeout is always measured afresh.
function checks(cwd, plan) {
  const file = join(cwd, git(cwd, 'rev-parse', '--git-path', 'keystone-checks.json'));
  const key = codeKey(cwd, plan);
  let seen = {};
  try { seen = JSON.parse(readFileSync(file, 'utf8')); } catch { /* first run */ }
  const known = seen.key === key ? seen.passes : {};
  const passes = {};
  const once = (kind, argv) => {
    const id = `${kind}:${JSON.stringify(argv)}`;
    if (known[id]) { passes[id] = known[id]; return known[id].replace(/ → pass/, ' → pass (reused: code unchanged since that run)'); }
    const line = run(cwd, kind, argv);
    if (/ → pass/.test(line.split('\n')[0])) passes[id] = line;
    return line;
  };
  return { once, save: () => { try { writeFileSync(file, JSON.stringify({ key, passes })); } catch { /* the cache is optional */ } } };
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

// --- Between runs: what the last committed verify.md proved, and what has to be judged again ---

const MARKER = '--- record only (not for the verifier) ---';
const RULE_FILES = /^(CLAUDE\.md|\.claude\/CLAUDE\.md|docs\/architecture\.md|AGENTS\.md|\.claude\/rules\/.*)$/;
// over-matching only sends a row to judge, so `test` is a plain substring (tests, pytest, test_x.py, x_test.go)
const TESTY = /test|\bbuild\b|\.spec\.|\bpass(?:es|ed|ing)?\b|\bgreen\b/i;
// a git call whose non-zero exit is an answer, not an error (a file missing in a commit, "not an ancestor")
const gitTry = (cwd, ...args) => spawnSync('git', ['-c', 'core.quotePath=false', ...args], { cwd, encoding: 'utf8' });
const showAt = (cwd, rev, path) => { const r = gitTry(cwd, 'show', `${rev}:${path}`); return r.status === 0 ? r.stdout : null; };
const folderOf = (plan) => dirname(plan).replace(/\\/g, '/');

const section = (text, name) => {
  const m = (text || '').replace(/\r\n/g, '\n').match(new RegExp(`^## ${name}[^\\n]*\\n([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  return m ? m[1] : '';
};
// a row starts with a fixed id (verifier.md); any other line of the template (Unconfirmed, Settings, gates…) is not a row
const ROW_ID = /^(Task \d+|Done means\b.*|Row\b.*|I-\d+)$/;
const cleanId = (id) => id.replace(/\*\*/g, '').trim().replace(/^task (\d+)\b/i, 'Task $1');

// Rows of a report: `<id> — <status> — <evidence>` plus indented continuation lines up to the next row.
export function parseRows(text) {
  const rows = [];
  let cur = null;
  for (const raw of (text || '').replace(/\r\n/g, '\n').split('\n')) {
    if (cur && (/^\s/.test(raw) || !raw.trim())) { if (raw.trim()) cur.evidence.push(raw.trim()); continue; }
    cur = null;
    if (/^\s/.test(raw)) continue;
    const l = raw.replace(/^(?:[-*] )?(?:\*\*)?/, '');
    const m = l.match(/^(.+?) — (ok|missing|wrong|not proven|BLOCKED|pending R\d+(?:, R\d+)*)\b(.*)$/);
    if (!m || !ROW_ID.test(cleanId(m[1]))) continue;
    cur = { id: cleanId(m[1]), status: m[2], evidence: [m[3].replace(/^\s*—\s*/, '')] };
    rows.push(cur);
  }
  return rows.map((r) => ({ ...r, evidence: r.evidence.filter(Boolean).join(' ') }));
}

// Carried rows keep the sha of the run that really judged them, and that run's evidence.
function parseCarried(text) {
  return lines(section(text, 'Carried')).map((l) => l.replace(/^(?:[-*] )?(?:carried: )?/, ''))
    .map((l) => l.match(/^(.+?) — ok — carried from verify ([0-9a-f]{7,40}) — (.*)$/))
    .filter(Boolean).map((m) => ({ id: cleanId(m[1]), status: 'ok', sha: m[2].slice(0, 7), evidence: m[3] }));
}

// A path-like token names a file when it equals its path or is its suffix at a `/` or `.` boundary.
const tokens = (s) => s.replace(/\\/g, '/').split(/[\s`'"(),;<>[\]{}]+/).map((t) => t.replace(/:\d.*$/, '').replace(/^[^\w./-]+|[^\w./-]+$/g, '').replace(/[.:]+$/, '')).filter((t) => /[./]/.test(t) && /\w/.test(t));
const mentions = (evidence, files) => tokens(evidence).some((t) => files.some((f) => f === t || f.endsWith(`/${t}`) || f.endsWith(`.${t}`) || t.endsWith(`/${f}`)));
// A task's `files:` entry owns a changed file: the same path, a folder above it, its short name, or a glob (`*`, `**`, `?`).
const globRe = (g) => new RegExp(`^${g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\//g, '\0').replace(/\*\*/g, '\x01')
  .replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\0/g, '(?:.*/)?').replace(/\x01/g, '.*')}$`);
const owns = (entry, f) => {
  const e = entry.replace(/\/+$/, '');
  if (/[*?]/.test(e)) return globRe(e).test(f);
  return f === e || f.startsWith(`${e}/`) || f.endsWith(`/${e}`);
};
// `rule <source> — fail — <file:line>; …` lines of a report.
// Places are the `file:line` before ` — sites to cover:` / ` — Class:` (the sites after it are for fix, not findings);
// a hand-written `` `file.ts:45-57` `` reads as `file.ts:45`.
const places = (s) => s.replace(/ — (?:sites to cover|Class):[\s\S]*$/, '').replace(/`/g, '').replace(/:(\d+)-\d+/g, ':$1')
  .split(';').map((p) => (p.trim().match(/^\S+:\d+/) || [])[0]).filter(Boolean);
const failingRules = (report) => lines(report).map((l) => l.replace(/^(?:[-*] )?/, '').match(/^rule (\S+) — fail — (.*)$/)).filter(Boolean)
  .flatMap((m) => places(m[2]).map((fl) => ({ source: m[1], fl })));

function taskFilesOfPlan(text) {
  const out = {};
  for (const l of lines(text)) {
    const m = l.match(/^- \[[ xX]\] (\d+)\..*? — files: (.*?)(?: — check:|$)/);
    if (m) out[m[1]] = m[2].split(',').map((f) => f.replace(/\(.*?\)|`/g, '').trim()).filter(Boolean);
  }
  return out;
}

function intentPath(cwd, plan) {
  const auth = (read(cwd, plan).match(/^Authority: intent\.md — `[^`]+`/m) || [''])[0];
  const m = auth.match(/`([^`]+\.md)`/);
  return m ? m[1] : `${folderOf(plan)}/intent.md`;
}

function fullReason(cwd, plan, base, prev, prevText, full) {
  if (full) return '--full';
  const commitsSec = section(prevText, 'Checks').split('\n');
  const shas = [];
  commitsSec.forEach((l, i) => {
    if (!/^(?:- )?commits:/.test(l)) return;
    (l.split(' — ')[1] || '').match(/\b[0-9a-f]{7,40}\b/g)?.forEach((s) => shas.push(s));
    for (const n of commitsSec.slice(i + 1)) {
      const m = n.match(/^\s+(?:merge \(files not counted\): )?([0-9a-f]{7,40})\b/);
      if (!m) break;
      shas.push(m[1]);
    }
  });
  if (shas.some((s) => gitTry(cwd, 'merge-base', '--is-ancestor', s, 'HEAD').status !== 0)) return 'history rewritten';
  const b = (prevText.match(/Base:\s*([0-9a-f]{7,40})/) || [])[1];
  if (!b || !base.startsWith(b)) return 'base moved';
  if (lines(git(cwd, 'rev-list', '--first-parent', '--merges', `${prev}..HEAD`)).length) return 'merge since the last verify';
  // the strictness (Level) and Settings change how every row is judged; a plan or intent text edit judges only what it touched
  const header = (s) => ['Level', 'Settings', 'Authority'].map((k) => (lines((s || '').replace(/\r\n/g, '\n')).find((l) => l.startsWith(`${k}:`)) || '')
    .replace(/(Status:\s*)[^·\n]*/, '$1').trimEnd()).join('\n');
  if (header(showAt(cwd, prev, plan)) !== header(read(cwd, plan))) return 'plan header changed';
  return null;
}

// --- Plan and intent edits between runs: which rows a text edit sends to judge, which rows left the plan ---

// `- [ ] N.` with its indented sub-items; the tick and a BLOCKED tail are not the text.
function taskBlocks(text) {
  const out = new Map();
  let cur = null;
  for (const l of section(text, 'Tasks').split('\n')) {
    const m = l.match(/^- \[[ xX]\] (\d+)\./);
    if (m) { cur = m[1]; out.set(cur, [l.replace(/^- \[[ xX]\] /, '- ').replace(/ BLOCKED: .*$/, '').trimEnd()]); continue; }
    if (cur && /^\s+\S/.test(l)) out.get(cur).push(l.trimEnd());
    else if (l.trim()) cur = null;
  }
  return out;
}
// Data rows of ## Requirements Reconciliation, numbered from 1 as the verifier and releaseRefs count them.
const reconRows = (text) => lines(section(text, 'Requirements Reconciliation'))
  .filter((l) => /^\|/.test(l) && !/^\|\s*:?-{3}/.test(l) && !/^\|\s*Decision\s*\|/.test(l)).map((l) => l.trim());
// `I-n` lines of an intent (`- I-n …` or `I-n …`, struck `~~I-n …~~`) with indented continuation lines.
function intentLines(text) {
  const out = new Map();
  let cur = null;
  for (const l of (text || '').replace(/\r\n/g, '\n').split('\n')) {
    const m = l.match(/^(?:- )?(~~)?I-(\d+)\b/);
    if (m) { cur = `I-${m[2]}`; out.set(cur, { struck: !!m[1], text: [l.trimEnd()] }); continue; }
    if (cur && /^\s+\S/.test(l)) out.get(cur).text.push(l.trimEnd());
    else cur = null;
  }
  return out;
}
// Own `I-n` of a Source: segments split on `;`; a segment `<path> — I-3` cites another file's intent and does not count.
const ownIds = (source) => (source || '').split(';').filter((s) => !/^\s*`?[^\s`]*[/.][^\s`]*`?\s+—\s/.test(s))
  .flatMap((s) => s.match(/I-\d+/g) || []);
function sources(text) { // id → its own I-n: `Task N` from `- Source:`, `Row n` from the second cell
  const out = new Map();
  for (const [n, block] of taskBlocks(text)) out.set(`Task ${n}`, ownIds((block.find((l) => /^\s+- Source:/.test(l)) || '').replace(/^\s+- Source:/, '')));
  reconRows(text).forEach((l, i) => out.set(`Row ${i + 1}`, ownIds(cells(l)[1])));
  return out;
}

// Rows whose intent line is struck: the struck I-n and every row whose own I-n are all struck. Current texts only.
export function leftThePlan(plan, intent) {
  const struck = [...intentLines(intent)].filter(([, v]) => v.struck).map(([k]) => k);
  if (!struck.length) return [];
  const rows = [...sources(plan)].filter(([id, ids]) => id.startsWith('Row ') && ids.length && ids.every((i) => struck.includes(i))).map(([id]) => id);
  return [...struck, ...rows];
}

export function planEdits(prevPlan, plan, prevIntent, intent) {
  const judge = new Map();
  const [pt, ct] = [taskBlocks(prevPlan), taskBlocks(plan)];
  for (const [n, b] of ct) if (pt.get(n)?.join('\n') !== b.join('\n')) judge.set(`Task ${n}`, 'task text');
  const [pr, cr] = [reconRows(prevPlan), reconRows(plan)];
  cr.forEach((l, i) => { if (pr[i] !== l) judge.set(`Row ${i + 1}`, 'row text'); });
  const dm = (s) => lines((s || '').replace(/\r\n/g, '\n')).find((l) => l.startsWith('Done means:')) || '';
  if (dm(prevPlan) !== dm(plan)) judge.set('Done means', 'Done means line');
  const [pi, ci] = [intentLines(prevIntent), intentLines(intent)];
  const changedI = [...ci].filter(([k, v]) => !v.struck && pi.get(k)?.text.join('\n') !== v.text.join('\n')).map(([k]) => k);
  changedI.forEach((k) => judge.set(k, 'intent line'));
  for (const [id, ids] of sources(plan)) {
    const hit = ids.find((i) => changedI.includes(i));
    if (hit && !judge.has(id)) judge.set(id, `cites ${hit}`);
  }
  const left = leftThePlan(plan, intent);
  left.forEach((id) => judge.delete(id));
  return { judge, left };
}

// `proved by R<k>` in a Reconciliation evidence cell: is step R<k> of ## Release open, done, missing or without a check?
// Cells split on | outside backticks and not escaped as \|; Row <n> counts data rows from 1, as the verifier does.
const cells = (l) => {
  const out = [];
  let cur = '', tick = false;
  for (const ch of l.trim().replace(/^\||\|$/g, '')) {
    if (ch === '`') tick = !tick;
    if (ch === '|' && !tick && !cur.endsWith('\\')) { out.push(cur.trim()); cur = ''; } else cur += ch;
  }
  out.push(cur.trim());
  return out;
};
export function releaseRefs(text) {
  const steps = new Map();
  for (const l of lines(section(text, 'Release'))) {
    const m = l.match(/^- \[([ xX])\] R(\d+)\.(.*)$/);
    if (m) steps.set(m[2], { done: m[1] !== ' ', check: / — check: \S/.test(m[3]) });
  }
  const out = [];
  let n = 0;
  for (const l of lines(section(text, 'Requirements Reconciliation'))) {
    if (!/^\|/.test(l) || /^\|\s*:?-{3}/.test(l) || /^\|\s*Decision\s*\|/.test(l)) continue;
    n++;
    const c = cells(l);
    const ids = [...new Set((c[1] || '').match(/I-\d+/g) || [])];
    for (const [, k] of (c.at(-1) || '').matchAll(/proved by R(\d+)/g)) {
      const st = steps.get(k);
      out.push(`Row ${n}${ids.length ? ` (${ids.join(', ')})` : ''} → R${k} ${!st ? 'no step' : !st.check ? 'no check' : st.done ? 'done' : 'open'}`);
    }
  }
  return out;
}

export function delta(cwd, plan, base, { full = false, checks = [], files = [] } = {}) {
  plan = plan.replace(/^(\.\/)+/, '');
  const vpath = `${folderOf(plan)}/verify.md`;
  // the last judged run, not the last commit: an accept commit is not a run (runs()), a run that stopped on a failed
  // build or test judged nothing
  const last = runs(cwd, plan).filter((r) => r.judged).at(-1);
  const prev = last?.sha;
  const prevText = last ? last.text : '';
  const untracked = prev ? lines(git(cwd, 'ls-files', '-o', '--exclude-standard')) : [];
  const touched = prev ? [...new Set([...lines(git(cwd, 'diff', '--name-only', '--no-renames', prev)), ...untracked])] : [];
  const changed = touched.filter((f) => !f.startsWith(`${folderOf(plan)}/`));
  // the count also has plan / intent edits (a fix may only record a note), so `0 files changed` means nothing changed
  // an untracked file older than the last verify commit was already there when it ran: kept in `changed`, not counted
  const since = prev ? Number(git(cwd, 'log', '-1', '--format=%ct', prev)) * 1000 : 0;
  const old = new Set(untracked.filter((f) => { try { return statSync(join(cwd, f)).mtimeMs < since; } catch { return false; } }));
  const counted = touched.filter((f) => f !== vpath && !old.has(f)).length;
  const rulesChanged = changed.filter((f) => RULE_FILES.test(f));
  const reason = prev ? fullReason(cwd, plan, base, prev, prevText, full) : 'first verify';
  const scope = rulesChanged.length ? `rules scope: all task files — rule files changed: ${rulesChanged.join(', ')}`
    : reason ? 'rules scope: all task files'
    : `rules scope: files changed since ${prev.slice(0, 7)} + files on the last run's failing rule lines: ${
      [...new Set(failingRules(section(prevText, 'Report')).map((r) => r.fl.replace(/:\d+$/, '')))].join(', ') || 'none'}`;
  const planText = read(cwd, plan);
  const refs = `release refs: ${releaseRefs(planText).join('; ') || 'none'}`;
  const ip = intentPath(cwd, plan);
  const intentText = read(cwd, ip);
  const left = prev ? [] : leftThePlan(planText, intentText);
  if (!prev) return [`delta: full — ${reason}`, 'judge: all rows (full run)', scope, refs, `left the plan: ${left.join(', ') || 'none'}`,
    'carried ids: none', MARKER, 'edited: none', 'late watch: none', acceptedLine(cwd, plan)];

  const sha = prev.slice(0, 7);
  const [prevPlan, prevIntent] = [showAt(cwd, prev, plan), showAt(cwd, prev, ip)];
  const edits = planEdits(prevPlan, planText, prevIntent, intentText);
  left.push(...edits.left);
  const rows = new Map();
  parseCarried(prevText).forEach((r) => rows.set(r.id, r));
  parseRows(section(prevText, 'Report')).forEach((r) => rows.set(r.id, { ...r, sha }));
  // a changed Done means line sends every past `Done means …` row to judge
  if (edits.judge.has('Done means')) {
    const why = edits.judge.get('Done means');
    edits.judge.delete('Done means');
    [...rows.keys()].filter((id) => /^Done means\b/.test(id)).forEach((id) => edits.judge.set(id, why));
  }
  const taskFilesMap = taskFilesOfPlan(planText);
  const ownsAny = (id, fs) => { const t = id.match(/^Task (\d+)$/); return !!t && (taskFilesMap[t[1]] || []).some((e) => fs.some((f) => owns(e, f))); };
  // I-13: the files of a past `wrong` row — task files its evidence names or its Task owns — send `ok` rows on them to judge
  const ownFiles = files.filter((f) => !f.startsWith(`${folderOf(plan)}/`));
  const wrongFiles = [...new Set([...rows.values()].filter((r) => r.status === 'wrong')
    .flatMap((r) => ownFiles.filter((f) => mentions(r.evidence, [f]) || ownsAny(r.id, [f]))))];
  const notRun = checks.some((l) => /^(build|test): .* → not run/.test(l));
  // a task, row or I-n that was in the plan / intent of that run and is deleted since is gone: neither carried nor judged
  const ids = (p, i) => new Set([...[...taskBlocks(p).keys()].map((n) => `Task ${n}`),
    ...reconRows(p).map((_, k) => `Row ${k + 1}`), ...intentLines(i).keys()]);
  const [was, now] = [ids(prevPlan, prevIntent), ids(planText, intentText)];
  const gone = (id) => was.has(id) && !now.has(id);
  const carried = [], judge = [], quiet = new Set(); // quiet: past `ok`, files unchanged, not edited
  for (const r of rows.values()) {
    if (left.includes(r.id) || gone(r.id)) continue;
    const touched = mentions(r.evidence, changed) || ownsAny(r.id, changed);
    if (r.status === 'ok' && !touched && !edits.judge.has(r.id)) quiet.add(r.id);
    if (reason || r.status !== 'ok' || touched || edits.judge.has(r.id) || (notRun && TESTY.test(r.evidence))
      || mentions(r.evidence, wrongFiles) || ownsAny(r.id, wrongFiles)) judge.push(r.id);
    else carried.push(r);
  }
  for (const id of edits.judge.keys()) if (!judge.includes(id)) judge.push(id);
  const edited = `edited: ${[...edits.judge].map(([id, why]) => `${id} (${why})`).join(', ') || 'none'}`;
  const late = () => `late watch: ${judge.filter((id) => quiet.has(id)).join(', ') || 'none'}`;
  if (reason) return [`delta: full — ${reason}`, 'judge: all rows (full run)', scope, refs, `left the plan: ${left.join(', ') || 'none'}`,
    'carried ids: none', MARKER, edited, late(), acceptedLine(cwd, plan)];
  // a row whose evidence cites a judged row ("see Row 13") is judged with it, along the chain
  const cites = (ev, id) => new RegExp(`(?<!\\w)${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?!\\w)`).test(ev);
  for (let moved = true; moved;) {
    moved = false;
    for (let i = carried.length - 1; i >= 0; i--) {
      if (judge.some((id) => cites(carried[i].evidence, id))) { judge.push(carried[i].id); carried.splice(i, 1); moved = true; }
    }
  }
  return [
    `delta: since ${sha} — ${counted} files changed since the last verify`,
    `judge: ${judge.join(', ') || 'none'}`,
    scope,
    refs,
    `left the plan: ${left.join(', ') || 'none'}`,
    `carried ids: ${carried.map((r) => r.id).join(', ') || 'none'}`,
    MARKER,
    edited,
    late(),
    acceptedLine(cwd, plan),
    ...carried.map((r) => `carried: ${r.id} — ok — carried from verify ${r.sha} — ${r.evidence}`),
  ];
}

// --- Run history: findings per committed verify.md, what is new and closed, the cost of each cycle ---

// A run that stopped on a failed build or test writes `## Report` = `not judged — …` (blank lines and a ``` fence of a
// hand-written report are skipped first).
const judged = (text) => !/^not judged\b/.test(lines(section(text, 'Report')).filter((l) => l.trim() && !/^\s*```/.test(l))[0] || '');

// `Accepted violation by <name> <date>: rule <source> — <file:line>; …` (verify, rules menu) → keys `rule <source> <file:line>`.
export function parseAccepted(text) {
  const keys = new Set();
  for (const l of lines((text || '').replace(/\r\n/g, '\n'))) {
    const m = l.match(/^Accepted violation by .*?: rule (\S+) — (.*)$/);
    if (m) places(m[2]).forEach((fl) => keys.add(`rule ${m[1]} ${fl}`));
  }
  return keys;
}

// `late watch:` of a run's ## Checks, also inside a line glued with ` · `.
export const lateWatch = (text) => {
  const m = section(text, 'Checks').match(/late watch: (.*?)(?: · |$)/m);
  return m && !/^none\b/.test(m[1].trim()) ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
};

export function findings(text, accepted = new Set()) {
  const keys = new Set();
  const report = section(text, 'Report');
  if (!judged(text)) {
    for (const l of lines(section(text, 'Checks'))) {
      const m = l.match(/^(?:[-*] )?(build|test): .* → fail/);
      if (m) keys.add(`check: ${m[1]} failed`);
    }
  }
  parseRows(report).filter((r) => r.status === 'wrong' || r.status === 'missing').forEach((r) => keys.add(r.id));
  failingRules(report).map((r) => `rule ${r.source} ${r.fl}`).filter((k) => !accepted.has(k)).forEach((k) => keys.add(k));
  let block = null; // an empty `Decisions:` / `Unrequested:` header: its indented items are the findings
  for (const raw of lines(report)) {
    const l = raw.replace(/^(?:[-*] )?/, '');
    if (/^\s/.test(raw) && block) {
      const item = raw.trim().replace(/^[-*] /, '');
      if (block === 'un') keys.add(`Unrequested: ${item}`);
      else if (/^Decision: /.test(item)) keys.add(item);
      continue;
    }
    block = /^Decisions?:\s*$/.test(l) ? 'dec' : /^Unrequested:\s*$/.test(l) ? 'un' : null;
    const dec = l.match(/^Decisions?: (Decision: .*)$/) || l.match(/^(Decision: .*)$/);
    if (dec) keys.add(dec[1].trim());
    const un = l.match(/^Unrequested: (.*)$/);
    if (un && !/^none\b/i.test(un[1].trim())) un[1].split(';').map((s) => s.trim()).filter(Boolean).forEach((s) => keys.add(`Unrequested: ${s}`));
  }
  return keys;
}

// A commit that only adds `Accepted unproven by …` / `Accepted violation by …` (verify accept) records a decision, not a run.
const unaccepted = (t) => t.replace(/^Accepted (?:unproven|violation) by .*\r?\n?/gm, '').trimEnd();

// Runs of the task's verify.md, oldest first; `.accepted` = accepted violations from every commit (accept commits too).
function runs(cwd, plan) {
  const vpath = `${folderOf(plan.replace(/^(\.\/)+/, ''))}/verify.md`;
  const all = lines(git(cwd, 'log', '--reverse', '--format=%H %cs', '--', vpath)).map((l) => {
    const [sha, date] = l.split(' ');
    return { sha, date, text: showAt(cwd, sha, vpath) || '' };
  });
  const accepted = new Set(all.flatMap((c) => [...parseAccepted(c.text)]));
  const out = [];
  for (const { sha, date, text } of all) {
    if (out.length && unaccepted(out.at(-1).text) === unaccepted(text)) continue;
    const cost = section(text, 'Checks').match(/cost: verify\+fix \$(\d+(?:\.\d+)?)/);
    out.push({ sha, date, text, verdict: (text.match(/Verdict:\s*(PASS-UNPROVEN|PASS|FAIL)/) || [])[1] || 'n/a',
      keys: findings(text, accepted), cost: cost ? Number(cost[1]) : null, judged: judged(text) });
  }
  out.accepted = accepted;
  return out;
}

export function acceptedLine(cwd, plan) {
  const by = new Map();
  for (const k of runs(cwd, plan).accepted) {
    const [, source, fl] = k.match(/^rule (\S+) (\S+)$/);
    by.set(source, [...(by.get(source) || []), fl]);
  }
  return `accepted violations: ${[...by].map(([s, fls]) => `rule ${s} — ${fls.join('; ')}`).join('; ') || 'none'}`;
}

// A FAIL that rests only on unaccepted Rules gate lines: no wrong / missing / Decision / Unrequested / check finding,
// no Settings, Architecture or Security gate failure.
const rulesOnly = (r) => r.verdict === 'FAIL' && r.keys.size > 0 && [...r.keys].every((k) => k.startsWith('rule '))
  && !/Settings: violated|Architecture gate: fail|Security gate: fail/.test(r.text);

function story(cwd, plan) {
  const rs = runs(cwd, plan);
  if (!rs.length) return { rs, out: [] };
  const out = [`history: ${rs.length} runs · FAIL ${rs.filter((r) => r.verdict === 'FAIL').length}`];
  rs.forEach((r, i) => {
    const p = rs[i - 1];
    if (!r.judged && p) p.keys.forEach((k) => r.keys.add(k)); // nothing was judged: what was open stays open
    r.open = r.keys.size;
    r.new = [...r.keys].filter((k) => !p?.keys.has(k)).length;
    r.closed = p ? [...p.keys].filter((k) => !r.keys.has(k)).length : 0;
    const cost = p && p.cost !== null && r.cost !== null && r.cost >= p.cost ? `$${(r.cost - p.cost).toFixed(2)}` : 'n/a';
    const watch = lateWatch(r.text);
    const late = parseRows(section(r.text, 'Report')).filter((x) => (x.status === 'wrong' || x.status === 'missing') && watch.includes(x.id)).length;
    out.push(`run ${i + 1} · ${r.date} · ${r.verdict} · open ${r.open} · new ${r.new} · closed ${r.closed} · cycle cost ${cost}${late ? ` · late ${late}` : ''}`);
  });
  if (rs.filter((r) => r.verdict === 'FAIL').length >= 2) out.push('trend menu: on this FAIL');
  return { rs, out };
}

export const history = (cwd, plan) => story(cwd, plan).out;

// --history: after the current run is committed — its trend line, worked out here and not by the model.
export function trend(cwd, plan) {
  const { rs, out } = story(cwd, plan);
  const [p, c] = rs.slice(-2);
  // story() counts past FAILs for Step 1 (before the commit); here this run is committed too, so the third FAIL is >= 3.
  const fails = rs.filter((r) => r.verdict === 'FAIL').length;
  const menu = p && c && rulesOnly(p) && rulesOnly(c) ? ['rules menu: on this FAIL'] : fails >= 3 ? ['trend menu: on this FAIL'] : [];
  return [...out.filter((l) => l !== 'trend menu: on this FAIL'), ...menu, `trend: ${p && c && c.open < p.open && c.new === 0 ? 'converging' : 'not converging'}`];
}

export function collect(cwd, plan, given, { full = false } = {}) {
  const { base, rule } = findBase(cwd, plan, given);
  const { commits, files, dirty } = taskFiles(cwd, base);
  const out = [`base: ${base.slice(0, 7)} — ${rule}`, `commits: ${commits.filter((c) => !c.merge).length}`];
  for (const c of commits) out.push(`  ${c.merge ? 'merge (files not counted): ' : ''}${c.sha.slice(0, 7)} ${c.subject}`);
  out.push(`files: ${files.length}${dirty.length ? ` (${dirty.length} uncommitted)` : ''}`, ...files.map((f) => `  ${f}`));
  const settings = lines(read(cwd, plan)).find((l) => l.startsWith('Settings:')) || '';
  const d = detect(cwd, files);
  const c = checks(cwd, plan);
  const checkLines = [c.once('build', d.build),
    /tests\s*—\s*no/.test(settings) ? 'test: not run (Settings tests — no)' : c.once('test', d.test),
    c.once('lint', d.lint)];
  c.save();
  out.push(...checkLines, 'imports: not run (the verifier reads the diff)');
  out.push(...architecture(cwd, files));
  // a failed build or test stops the run: nothing is judged on code that does not build or pass its tests
  const failed = checkLines.filter((l) => /^(build|test): .* → fail/.test(l.split('\n')[0])).map((l) => l.split(':')[0]);
  if (failed.length) out.push(`verifier: not called — ${failed.join(', ')} failed`, MARKER);
  else out.push(...delta(cwd, plan, base, { full, checks: checkLines, files }));
  out.push(...history(cwd, plan));
  return out.join('\n');
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop())) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith('--')));
  const [plan, given] = args.filter((a) => !a.startsWith('--'));
  if (!plan || [...flags].some((f) => !['--full', '--history', '--strict'].includes(f))) { console.error('usage: node collect.mjs <plan path> [base ref] [--full] | <plan path> --history'); process.exit(2); }
  try { console.log(flags.has('--history') ? trend(process.cwd(), plan.replace(/\\/g, '/')).join('\n') : collect(process.cwd(), plan.replace(/\\/g, '/'), given, { full: flags.has('--full') })); }
  catch (e) { console.log(`error: ${e.message}`); process.exit(1); }
}
