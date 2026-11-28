// Keystone gates (Claude Code hooks). One script for PreToolUse and Stop; reads the hook JSON on stdin.
// Blocks only while an *active* plan exists (Status draft|approved|implementing) and, except for push, only the session
// that works with it — ran /keystone:<stage> on it or edited its task folder (read from transcript_path).
// Off switch: KEYSTONE_GATES=off in Claude Code's environment (set before it starts).
// Push gate: only a push that ships commits touching the active plan's task folder is closed.
// Cloud session (CLAUDE_CODE_REMOTE=true): its VM is thrown away, so the work branch must reach the remote — the cloud's
// own Stop hook asks for that push. There a push to a non-default branch passes; the default branch and a PR stay closed.
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
const PUSH = /\bgit(\s+(-C\s+("[^"]*"|'[^']*'|\S+)|-c\s+\S+|--[\w-]+(=\S+)?))*\s+push\b(?![^|;&]*--dry-run)|\bgh\s+pr\s+create\b/;
const BACKGROUND_MAX_MS = 2 * 60 * 60 * 1000;
const HOW_LOCAL = 'To lift it: finish the step above, set `Status: abandoned` in the plan header, or start Claude Code with KEYSTONE_GATES=off (the hook reads its own environment; a prefix on one command does not reach it).';
const HOW_CLOUD = 'To lift it: finish the step above, set `Status: abandoned` in the plan header, or add KEYSTONE_GATES=off to the variables of this cloud environment and start a new session (a prefix on one command does not reach the hook).';

const slash = (p) => p.replace(/\\/g, '/');
const isCloud = (env) => String(env.CLAUDE_CODE_REMOTE).toLowerCase() === 'true';

function projectRoot(start) {
  for (let d = resolve(start); ; d = dirname(d)) {
    if (existsSync(join(d, '.git')) || existsSync(join(d, 'docs', 'keystone'))) return d;
    if (dirname(d) === d) return resolve(start);
  }
}

// Folders that hold task folders: only docs/keystone — Keystone never reads another planner's folders.
function planRoots() {
  return ['docs/keystone'];
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
  const trail = { commands: [], files: [], background: new Map(), finished: new Set() };
  let raw = '';
  try { raw = readFileSync(transcript, 'utf8'); } catch { return trail; } // nothing written yet → nothing done yet
  for (const line of raw.split('\n')) {
    // the last answer's text, for the Stop branch when Claude Code sends no last_assistant_message
    if (line.includes('"assistant"') && line.includes('"text"')) {
      try {
        const r = JSON.parse(line);
        const text = Array.isArray(r?.message?.content) ? r.message.content.filter((b) => b?.type === 'text').map((b) => b.text).join('\n') : '';
        if (r.type === 'assistant' && text) trail.lastText = text;
      } catch { /* a torn last line */ }
    }
    if (line.includes('<task-notification>')) for (const m of line.matchAll(/<tool-use-id>(\w+)<\/tool-use-id>/g)) trail.finished.add(m[1]);
    if (!line.includes('keystone') && !line.includes('"tool_use"') && !line.includes('Async agent launched')) continue;
    let row;
    try { row = JSON.parse(line); } catch { continue; }
    const content = row?.message?.content;
    if (row.type === 'user' && typeof content === 'string') {
      const m = content.match(/<command-name>\/keystone:([a-z-]+)<\/command-name>/);
      if (m) trail.commands.push({ stage: m[1], args: content.match(/<command-args>([\s\S]*?)<\/command-args>/)?.[1] ?? '' });
    } else if (row.type === 'user' && Array.isArray(content)) {
      for (const b of content)
        if (b?.type === 'tool_result' && JSON.stringify(b.content ?? '').includes('Async agent launched')) trail.background.set(b.tool_use_id, Date.parse(row.timestamp) || Date.now());
    } else if (row.type === 'assistant' && Array.isArray(content)) {
      for (const b of content)
        if (b?.type === 'tool_use' && EDIT_TOOLS.includes(b.name)) trail.files.push(slash(String(b.input?.file_path ?? b.input?.notebook_path ?? '')));
        else if (b?.type === 'tool_use' && b.input?.run_in_background === true) trail.background.set(b.id, Date.parse(row.timestamp) || Date.now());
    }
  }
  return trail;
}

// A background agent or command started and not yet reported: the turn ends to wait for it, not because work stopped.
// ponytail: a task that never reports (killed with the app) stops counting after BACKGROUND_MAX_MS.
function waitingForBackground(trail, now = Date.now()) {
  return !!trail && [...trail.background].some(([id, at]) => !trail.finished.has(id) && now - at < BACKGROUND_MAX_MS);
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

const unquote = (w) => w.trim().replace(/^["']|["']$/g, '');
// Git Bash writes /e/My for E:/My
const nativePath = (p) => (process.platform === 'win32' ? p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:') : p);

// The shell state a push runs in: earlier `X=…` / `$X = …` assignments and `cd` / Set-Location in the same command.
// ponytail: a line scan, not a shell — a value set elsewhere stays `$X`, git fails on it and the deny reason says so.
function shellBefore(text, base) {
  const vars = {};
  const expand = (w) => w.replace(/\$\{?(\w+)\}?/g, (all, k) => vars[k] ?? all);
  let dir = base;
  for (const raw of text.split(/&&|\|\||[;\n|]/)) {
    const part = raw.trim().replace(/^\(+\s*/, '');
    const set = part.match(/^(?:export\s+)?\$?(\w+)\s*=\s*(.+)$/);
    const cd = part.match(/^(?:cd|pushd|Set-Location|sl)\s+(?:-Path\s+)?(.+)$/i);
    if (set) vars[set[1]] = expand(unquote(set[2]));
    else if (cd && unquote(cd[1]) !== '-') dir = resolve(dir, nativePath(expand(unquote(cd[1]))));
  }
  return { dir, expand };
}

// What a push ships: the refs it names (`git push <remote> <src>[:<dst>]…`), else HEAD; --all / --mirror → every branch.
// Where it lands: `dsts`, the <dst> of each refspec (<src> when there is none), else HEAD; null = every branch or a PR.
// Its repository: the last `-C <dir>` before `push`, resolved against the directory the command is in by then.
function pushTarget(cmd, base) {
  const m = cmd.match(PUSH);
  const { dir: here, expand } = shellBefore(cmd.slice(0, m?.index ?? 0), base);
  if (!m || !/push\b/.test(m[0])) return { dir: here, refs: ['HEAD'], dsts: null, pr: true }; // gh pr create ships HEAD
  const dirs = [...m[0].matchAll(/-C\s+("[^"]+"|'[^']+'|\S+)/g)].map((x) => nativePath(expand(unquote(x[1]))));
  const dir = dirs.length ? resolve(here, dirs[dirs.length - 1]) : here;
  // redirections (2>&1, > log, < in) are not refs; cut them before splitting on | ; &
  const rest = cmd.slice(m.index + m[0].length).replace(/\d*>&\d*|\d*>>?\s*\S+|<\s*\S+/g, ' ');
  const words = rest.split(/[|;&]/)[0].trim().split(/\s+/).filter(Boolean);
  if (words.some((w) => w === '--all' || w === '--mirror')) return { dir, refs: ['--branches'], dsts: null };
  const args = words.filter((w) => !w.startsWith('-')).map((w) => expand(unquote(w)));
  const specs = args.slice(1).map((r) => r.replace(/^\+/, ''));
  const refs = specs.map((s) => s.split(':')[0]).filter(Boolean);
  const dsts = specs.map((s) => (s.includes(':') ? s.split(':')[1] : s)).filter(Boolean);
  return { dir, refs: refs.length ? refs : ['HEAD'], dsts: dsts.length ? dsts : ['HEAD'] };
}

// GitHub MCP tools that ship work without a shell (found live in the cloud, 0.9.33). A PR or a merge ships a branch
// into the base one, like `gh pr create`; push_files / create_or_update_file / delete_file write commits straight onto
// `branch` on GitHub, so nothing local says what they ship. Read tools are not matched.
const MCP_SHIP = /^mcp__.+__(create_pull_request|merge_pull_request|push_files|create_or_update_file|delete_file)$/;
function mcpTarget(tool, ti, dir) {
  const op = MCP_SHIP.exec(tool || '')?.[1];
  if (!op) return null;
  if (op === 'push_files' || op === 'create_or_update_file' || op === 'delete_file') return { dir, direct: String(ti.branch ?? '') };
  // head may be `owner:branch`; a head that is not a local branch (or a merge, which names only the PR) → HEAD
  const head = String(ti.head ?? '').replace(/^[^:]+:/, '');
  const local = head && spawnSync('git', ['-C', dir, 'rev-parse', '--verify', '-q', `refs/heads/${head}`], { stdio: 'ignore' }).status === 0;
  return { dir, refs: [local ? head : 'HEAD'], dsts: null, pr: true, prBase: ti.base ? String(ti.base) : '' };
}

// Cloud session, push to the work branch: every destination is a named branch other than the default one (origin/HEAD,
// main, master). HEAD resolves to the current branch; a detached HEAD, every-branch push or PR → not a work-branch push.
// ponytail: only `origin` is asked for its default branch; another remote falls back to main/master.
const gitOut = (dir, ...a) => spawnSync('git', ['-C', dir, ...a], { encoding: 'utf8' }).stdout?.trim() ?? '';
const onOrigin = (dir, b) => spawnSync('git', ['-C', dir, 'rev-parse', '--verify', '-q', `refs/remotes/origin/${b}`], { stdio: 'ignore' }).status === 0;
const defaultBranch = (dir) => gitOut(dir, 'symbolic-ref', '--short', 'refs/remotes/origin/HEAD').replace(/^[^/]+\//, '') || (onOrigin(dir, 'main') ? 'main' : 'master');
const branchOf = (dir, d) => (d === 'HEAD' ? gitOut(dir, 'rev-parse', '--abbrev-ref', 'HEAD') : d).replace(/^refs\/heads\//, '');
function workBranchPush(push) {
  if (!push.dsts) return false;
  const shipped = new Set(['main', 'master', defaultBranch(push.dir)]);
  return push.dsts.every((d) => {
    const b = branchOf(push.dir, d);
    return b && b !== 'HEAD' && !shipped.has(b);
  });
}

// What the push ships is measured against the branch it lands on: `origin/<dst>` when origin has it, and for a PR the
// default branch. Measuring against every remote let a pushed work branch hide the same commits on their way to main
// or into a PR (found live in the cloud, 0.9.31). A new branch, --all/--mirror or no origin → not on any remote.
// Commits already on the default branch have landed: main merged into a work branch ships nothing new (0.9.32).
function landsOn(push) {
  const def = defaultBranch(push.dir);
  const dsts = push.pr ? [push.prBase || def] : push.dsts;
  if (!dsts) return ['--remotes'];
  const bases = dsts.map((d) => branchOf(push.dir, d)).map((b) => (b && onOrigin(push.dir, b) ? `origin/${b}` : null));
  if (!bases.every(Boolean)) return ['--remotes'];
  return [...new Set(onOrigin(push.dir, def) ? [...bases, `origin/${def}`] : bases)];
}

// The push carries the active plan's work when a commit it ships touches the plan's task folder.
// Implement commits the plan with every task (checkbox ticks, drift, notes), so an unrelated release passes.
// Merges are skipped: a merge that combines folder changes already on remotes differs from every parent and would be
// listed though it ships nothing of the plan; the plan's own commits under a merge are non-merge commits and still count.
// ponytail: a conflict resolved inside the plan folder lives only in the merge and is not seen.
// git fails → `error`: the gate stays closed rather than open by mistake, and says it could not tell.
function pushCheck(push, planFile) {
  const r = spawnSync('git', ['-C', push.dir, 'log', '--no-merges', '--format=%H', ...push.refs, '--not', ...landsOn(push), '--', dirname(planFile)], { encoding: 'utf8' });
  if (r.status !== 0) return { carries: true, error: (r.stderr || '').trim().split('\n')[0] || `git exited ${r.status}` };
  return { carries: r.stdout.trim() !== '' };
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
  const push = (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') && PUSH.test(ti.command || '') ? pushTarget(ti.command, base) : mcpTarget(input.tool_name, ti, base);
  const root = projectRoot(abs ? dirname(abs) : push ? push.dir : base);
  // push stays repo-wide (it checks what the commits touch); Stop and the edit gates only bind the session that works with the plan
  const trail = push ? null : sessionTrail(input.transcript_path);
  const plan = activePlan(root, push ? undefined : boundTo(trail));
  if (!plan) return null;
  const HOW = isCloud(env) ? HOW_CLOUD : HOW_LOCAL;

  if (event === 'Stop') {
    if (input.stop_hook_active) return null; // one block per turn; Claude Code's 8-in-a-row cap is never reached
    if (plan.status !== 'implementing') return null;
    const open = openTasks(plan.text);
    if (waitingForBackground(trail)) return null;
    if (!open.length) {
      // every task ticked, plan not verified: the answer must point at verify, not call the work done.
      // A session that ran verify (FAIL → Next: /keystone:fix, rush) passes; no answer text → cannot tell → pass.
      const last = input.last_assistant_message ?? trail?.lastText;
      if (!last || last.includes('/keystone:verify') || trail?.commands.some((c) => c.stage === 'verify')) return null;
      return { decision: 'block', reason: `Keystone: every task of ${plan.file} is ticked, but the plan is still implementing — not verified, so the work is not done yet. Do not call it done. Your answer stays as written: do not repeat or replace it, add only \`Next: /clear, then /keystone:verify ${plan.file}\` (or \`Next: nothing now — waiting for <what>\` if you are waiting for the user) and end the turn. ${HOW}` };
    }
    return { decision: 'block', reason: `Keystone: ${plan.file} is implementing and ${open.length} task(s) are still [ ] without BLOCKED:. If you are implementing: continue them, or append \`BLOCKED: <reason>\` to the task line of one that cannot run, then give the line-by-line report. If you are waiting for the user's answer, the user asked to pause, or you just answered a question — your answer stays as written: do not repeat or replace it, add only \`Next: nothing now — waiting for <what>\` (or the one next step) and end the turn. ${HOW}` };
  }

  if (event !== 'PreToolUse') return null;
  const tool = input.tool_name;

  if (push?.direct !== undefined) {
    const b = push.direct.replace(/^refs\/heads\//, ''); // no branch = the repository's default branch on GitHub
    if (b && b !== defaultBranch(push.dir) && b !== 'main' && b !== 'master') return null;
    return deny(`Keystone: ${tool} writes straight to the default branch on GitHub, and that is closed while ${plan.file} is ${plan.status} — run /keystone:verify first (PASS, or /keystone:verify accept for PASS-UNPROVEN). ${HOW}`);
  }

  if (tool === 'Bash' || tool === 'PowerShell' || push) {
    if (push) {
      if (isCloud(env) && workBranchPush(push)) return null;
      const check = pushCheck(push, plan.file);
      if (check.error) return deny(`Keystone: could not tell what this push ships, so it stays closed while ${plan.file} is ${plan.status} — \`git log\` in ${slash(push.dir)} failed: ${check.error}. The plan may have nothing to do with it: run the push with a literal \`git -C <repo> push <remote> <branch>\`. ${HOW}`);
      // name what is closed: "push/PR is closed" read as "every push" while the cloud work-branch push passed (0.9.33, 0.9.35)
      const folder = slash(dirname(plan.file));
      const what = push.pr ? `a PR carrying commits of ${folder} is closed` : `this push carries commits of ${folder} and is closed`;
      const open = isCloud(env) ? ' (a push of the work branch itself stays open in a cloud session)' : '';
      if (check.carries) return deny(`Keystone: ${what} while ${plan.file} is ${plan.status}${open} — run /keystone:verify first (PASS, or /keystone:verify accept for PASS-UNPROVEN). ${HOW}`);
    }
    return null;
  }

  if (!EDIT_TOOLS.includes(tool) || !abs) return null;
  const rel = slash(relative(root, abs));
  if (rel.startsWith('..')) return null; // outside the project
  // docs/notes: decision records are committed with the change they explain
  const inPlans = [...planRoots(root), 'docs/notes'].some((r) => rel === r || rel.startsWith(r + '/'));

  if (plan.status === 'draft' && !inPlans)
    return deny(`Keystone: ${plan.file} is still draft — no code edits until it is approved (/keystone:plan <plan path> → Approve). Edits under the plan folder and docs/notes are allowed. ${HOW}`);
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
