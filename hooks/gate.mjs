// Keystone gates (Claude Code hooks). One script for PreToolUse and Stop; reads the hook JSON on stdin.
// Blocks only while an *active* plan exists (Status draft|approved|implementing) and, except for push, only the session
// that works with it — ran /keystone:<stage> on it or edited its task folder (read from transcript_path).
// Off switch: KEYSTONE_GATES=off in Claude Code's environment (set before it starts).
// Push gate: only a push that ships commits touching the active plan's task folder is closed.
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, resolve, relative, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';

const ACTIVE = new Set(['draft', 'approved', 'implementing']);
const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const NO_ARG = new Set(['implement', 'verify']);
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

// Task folders with a plan.md that is in view, newest first: newest = latest date prefix of the folder name, same day →
// latest plan.md modification time. In view = an active status, or verified with open `- [ ] R<n>.` steps in ## Release
// (the mod shows that release mode). A folder without plan.md (intent written, plan not yet) never hides another plan.
// Same rule as activePlan/sessionPlan in keystone.ts.
function plans(root) {
  const out = [];
  for (const r of planRoots(root)) {
    const abs = join(root, r);
    if (!existsSync(abs)) continue;
    for (const name of readdirSync(abs)) {
      const file = join(abs, name, 'plan.md');
      if (!existsSync(file)) continue;
      const text = readFileSync(file, 'utf8').replace(/\r/g, '');
      const lines = text.split('\n');
      // the header line "Level: … · Mode: … · Status: …" (or a bare "Status:" line) — never a match inside task text
      const header = lines.find((l) => /^Level:/.test(l)) ?? lines.find((l) => /^Status:/.test(l)) ?? '';
      const status = header.match(/\bStatus:\s*([a-z]+)/i)?.[1]?.toLowerCase();
      if (!ACTIVE.has(status) && !(status === 'verified' && openRelease(text))) continue;
      const mode = header.match(/\bMode:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? 'feature';
      out.push({ name, file: slash(relative(root, file)), status, mode, text, mtime: statSync(file).mtimeMs });
    }
  }
  return out.sort((a, b) => (a.name.slice(0, 10) === b.name.slice(0, 10) ? b.mtime - a.mtime : b.name.slice(0, 10).localeCompare(a.name.slice(0, 10))));
}

const openRelease = (text) => {
  let inRelease = false;
  for (const l of text.split('\n')) {
    if (/^## /.test(l)) inRelease = /^## Release\b/.test(l);
    else if (inRelease && /^\s*- \[ \]/.test(l)) return true;
  }
  return false;
};

// The plan the gates apply to: the newest plan in view (that `isBound` accepts, when given); verified → no gates.
export function activePlan(root, isBound) {
  const p = plans(root).find((x) => !isBound || isBound(x, root));
  return p && ACTIVE.has(p.status) ? p : null;
}

// What the session did with plans, from its transcript: the `/keystone:<stage> <args>` commands it ran and the files its
// Edit/Write/MultiEdit/NotebookEdit calls touched. No transcript_path (an old client) → null: every plan counts as bound.
function sessionTrail(transcript) {
  if (!transcript) return null;
  const trail = { commands: [], files: [] };
  let raw = '';
  try { raw = readFileSync(transcript, 'utf8'); } catch { return trail; } // nothing written yet → nothing done yet
  for (const line of raw.split('\n')) {
    if (!line.includes('keystone') && !line.includes('"tool_use"')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const content = row?.message?.content;
    if (row.type === 'user' && typeof content === 'string') {
      const m = content.match(/<command-name>\/keystone:([a-z-]+)<\/command-name>/);
      if (m) trail.commands.push({ stage: m[1], args: content.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '' });
    } else if (row.type === 'assistant' && Array.isArray(content)) {
      for (const b of content)
        if (b?.type === 'tool_use' && EDIT_TOOLS.includes(b.name)) trail.files.push(slash(String(b.input?.file_path ?? b.input?.notebook_path ?? '')));
    }
  }
  return trail;
}

// A session works with a plan once it ran `/keystone:<stage>` naming the plan's folder (implement/verify with no
// argument take the newest plan in view, as their skills do) or edited a file in that folder.
// ponytail: an argument-less implement/verify binds to the newest plan *now*, not the one that was newest when it ran.
export function boundTo(trail) {
  if (!trail) return undefined;
  return (p, root) =>
    trail.commands.some((c) => slash(c.args).includes(p.name) || (!c.args.trim() && NO_ARG.has(c.stage) && plans(root)[0]?.name === p.name)) ||
    trail.files.some((f) => ('/' + f).includes(`/${p.name}/`));
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
  // redirections (2>&1, > log, < in) are not refs; cut them before splitting on | ; &
  const rest = cmd.slice(m.index + m[0].length).replace(/\d*>&\d*|\d*>>?\s*\S+|<\s*\S+/g, ' ');
  const words = rest.split(/[|;&]/)[0].trim().split(/\s+/).filter(Boolean);
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
  // push stays repo-wide (it checks what the commits touch); Stop and the edit gates only bind the session that works with the plan
  const plan = activePlan(root, push ? undefined : boundTo(sessionTrail(input.transcript_path)));
  if (!plan) return null;

  if (event === 'Stop') {
    if (input.stop_hook_active) return null; // one block per turn; Claude Code's 8-in-a-row cap is never reached
    if (plan.status !== 'implementing') return null;
    const open = openTasks(plan.text);
    if (!open.length) return null;
    return { decision: 'block', reason: `Keystone: ${plan.file} is implementing and ${open.length} task(s) are still [ ] without BLOCKED:. If you are implementing: continue them, or append \`BLOCKED: <reason>\` to the task line of one that cannot run, then give the line-by-line report. If you are waiting for the user's answer or the user asked to pause — say so in one line and end the turn. ${HOW}` };
  }

  if (event !== 'PreToolUse') return null;
  const tool = input.tool_name;

  if (tool === 'Bash' || tool === 'PowerShell') {
    if (push && pushCarriesPlan(push.dir, push.refs, plan.file)) return deny(`Keystone: push/PR is closed while ${plan.file} is ${plan.status} — run /keystone:verify first (PASS, or /keystone:verify accept for PASS-UNPROVEN). ${HOW}`);
    return null;
  }

  if (!EDIT_TOOLS.includes(tool) || !abs) return null;
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
