// Keystone gates (Claude Code hooks). One script for PreToolUse and Stop; reads the hook JSON on stdin.
// Blocks only while an *active* plan exists: plan.md of the newest task folder with Status draft|approved|implementing.
// Off switch: KEYSTONE_GATES=off in Claude Code's environment (set before it starts).
// Push gate: only a push that ships commits touching the active plan's task folder is closed.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ACTIVE = new Set(['draft', 'approved', 'implementing']);
const TEST_FILE = /(^|\/)(test|tests|__tests__|spec)\/|\.(test|spec)\.[^/]+$|_test\.[^/]+$|(^|\/)test_[^/]+\.py$/i;
const NOT_TEST = /(^|\/)(fixtures?|__snapshots__)\//i; // fixtures and snapshots may change with a fix
// git push (also with -C/-c/--opt global options; not --dry-run) or gh pr create.
// ponytail: no shell parsing — a quoted "git push" inside e.g. a commit message also matches; fine for a reminder gate.
const PUSH = /\bgit(\s+(-C\s+\S+|-c\s+\S+|--[\w-]+(=\S+)?))*\s+push\b(?![^|;&]*--dry-run)|\bgh\s+pr\s+create\b/;
const HOW = 'To lift it: finish the step above, set `Status: abandoned` in the plan header, or start Claude Code with KEYSTONE_GATES=off (the hook reads its own environment; a prefix on one command does not reach it).';

const slash = (p) => p.replace(/\\/g, '/');

function projectRoot(start) {
  for (let d = resolve(start); ; d = dirname(d)) {
    if (existsSync(join(d, '.git')) || existsSync(join(d, 'docs', 'keystone'))) return d;
    if (dirname(d) === d) return resolve(start);
  }
}

// Folders that hold task folders: docs/keystone, plus AI Factory paths.specs when the project has it.
function planRoots(root) {
  const roots = ['docs/keystone'];
  const cfg = join(root, '.ai-factory', 'config.yaml');
  if (existsSync(cfg)) {
    const m = readFileSync(cfg, 'utf8').match(/^\s*specs:\s*["']?([^"'\s#]+)/m);
    roots.push(m ? m[1].replace(/\/+$/, '') : '.ai-factory/specs');
  }
  return roots.map(slash);
}

export function activePlan(root) {
  const dirs = [];
  for (const r of planRoots(root)) {
    const abs = join(root, r);
    if (!existsSync(abs)) continue;
    for (const d of readdirSync(abs)) if (statSync(join(abs, d)).isDirectory()) dirs.push({ name: d, abs: join(abs, d) });
  }
  if (!dirs.length) return null;
  // newest = latest date prefix of the folder name; same day → latest plan.md (or folder) modification time
  const key = (d) => {
    const f = join(d.abs, 'plan.md');
    return [d.name.slice(0, 10), statSync(existsSync(f) ? f : d.abs).mtimeMs];
  };
  dirs.sort((a, b) => {
    const [da, ma] = key(a), [db, mb] = key(b);
    return da === db ? ma - mb : da.localeCompare(db);
  });
  const file = join(dirs[dirs.length - 1].abs, 'plan.md');
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8').replace(/\r/g, '');
  const lines = text.split('\n');
  // the header line "Level: … · Mode: … · Status: …" (or a bare "Status:" line) — never a match inside task text
  const header = lines.find((l) => /^Level:/.test(l)) ?? lines.find((l) => /^Status:/.test(l)) ?? '';
  const status = header.match(/\bStatus:\s*([a-z]+)/i)?.[1]?.toLowerCase();
  if (!ACTIVE.has(status)) return null;
  const mode = header.match(/\bMode:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? 'feature';
  return { file: slash(relative(root, file)), status, mode, text };
}

// Open tasks = "- [ ]" lines inside "## Tasks" (until the next "## ") without BLOCKED: on the same line.
function openTasks(text) {
  const out = [];
  let inTasks = false;
  for (const l of text.split('\n')) {
    if (/^## /.test(l)) inTasks = /^## Tasks\b/.test(l);
    else if (inTasks && /^\s*- \[ \]/.test(l) && !l.includes('BLOCKED:')) out.push(l);
  }
  return out;
}

// What a push ships: the refs it names (`git push <remote> <src>[:<dst>]…`), else HEAD; --all / --mirror → every branch.
// Its repository: the last `-C <dir>` before `push`, resolved against the shell's cwd.
function pushTarget(cmd, base) {
  const m = cmd.match(PUSH);
  if (!m || !/push\b/.test(m[0])) return { dir: base, refs: ['HEAD'] }; // gh pr create ships HEAD
  const dirs = [...m[0].matchAll(/-C\s+("[^"]+"|'[^']+'|\S+)/g)].map((x) => x[1].replace(/^["']|["']$/g, ''));
  const dir = dirs.length ? resolve(base, dirs[dirs.length - 1]) : base;
  const words = cmd.slice(m.index + m[0].length).split(/[|;&]/)[0].trim().split(/\s+/).filter(Boolean);
  if (words.some((w) => w === '--all' || w === '--mirror')) return { dir, refs: ['--branches'] };
  const args = words.filter((w) => !w.startsWith('-')).map((w) => w.replace(/^["']|["']$/g, ''));
  const refs = args.slice(1).map((r) => r.replace(/^\+/, '').split(':')[0]).filter(Boolean);
  return { dir, refs: refs.length ? refs : ['HEAD'] };
}

// The push carries the active plan's work when a commit it ships, not yet on any remote, touches the plan's task folder.
// Implement commits the plan with every task (checkbox ticks, drift, notes), so an unrelated release passes.
// Unknown (git fails) → true: the gate stays closed rather than open by mistake.
function pushCarriesPlan(dir, refs, planFile) {
  const r = spawnSync('git', ['-C', dir, 'log', '--format=%H', ...refs, '--not', '--remotes', '--', dirname(planFile)], { encoding: 'utf8' });
  return r.status !== 0 || r.stdout.trim() !== '';
}

// "existing" test = committed in HEAD; a regression test written during this fix stays editable
const tracked = (root, rel) => spawnSync('git', ['-C', root, 'cat-file', '-e', `HEAD:${rel}`], { stdio: 'ignore' }).status === 0;

const deny = (reason) => ({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: reason } });

export function decide(input, env = process.env) {
  if (String(env.KEYSTONE_GATES).toLowerCase() === 'off') return null;
  const event = input.hook_event_name;
  const ti = input.tool_input || {};
  const target = ti.file_path || ti.notebook_path;
  // the project is the one the edited file (or the shell) lives in — a worktree has its own plans
  const base = input.cwd || env.CLAUDE_PROJECT_DIR || process.cwd();
  const abs = target ? resolve(base, target) : null;
  const push = (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') && PUSH.test(ti.command || '') ? pushTarget(ti.command, base) : null;
  const root = projectRoot(abs ? dirname(abs) : push ? push.dir : base);
  const plan = activePlan(root);
  if (!plan) return null;

  if (event === 'Stop') {
    if (input.stop_hook_active) return null; // one block per turn; Claude Code's 8-in-a-row cap is never reached
    if (plan.status !== 'implementing') return null;
    const open = openTasks(plan.text);
    if (!open.length) return null;
    return { decision: 'block', reason: `Keystone: ${plan.file} is implementing and ${open.length} task(s) are still [ ] without BLOCKED:. If you are implementing: continue them, or append \`BLOCKED: <reason>\` to the task line of one that cannot run, then give the line-by-line report. If you are waiting for the user's answer, the user asked to pause, or this session is not implementing the plan — say so in one line and end the turn. ${HOW}` };
  }

  if (event !== 'PreToolUse') return null;
  const tool = input.tool_name;

  if (tool === 'Bash' || tool === 'PowerShell') {
    if (push && pushCarriesPlan(push.dir, push.refs, plan.file)) return deny(`Keystone: push/PR is closed while ${plan.file} is ${plan.status} — run /keystone:verify first (PASS, or /keystone:verify accept for PASS-UNPROVEN). ${HOW}`);
    return null;
  }

  if (!['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(tool) || !abs) return null;
  const rel = slash(relative(root, abs));
  if (rel.startsWith('..')) return null; // outside the project
  const inPlans = planRoots(root).some((r) => rel === r || rel.startsWith(r + '/'));

  if (plan.status === 'draft' && !inPlans)
    return deny(`Keystone: ${plan.file} is still draft — no code edits until it is approved (/keystone:plan <plan path> → Approve). Edits under the plan folder are allowed. ${HOW}`);
  if (plan.mode === 'fix' && plan.status === 'implementing' && TEST_FILE.test(rel) && !NOT_TEST.test(rel) && tracked(root, rel))
    return deny(`Keystone: during a fix, committed test files are not edited (${rel}) — write the regression test as a new file; if this test itself is wrong, stop and ask the human. ${HOW}`);
  return null;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let raw = '';
  process.stdin.on('data', (c) => (raw += c));
  process.stdin.on('end', () => {
    let out = null;
    try { out = decide(JSON.parse(raw || '{}')); } catch (e) { process.stderr.write(`keystone gate: ${e.message}\n`); }
    if (out) process.stdout.write(JSON.stringify(out));
    process.exit(0);
  });
}
