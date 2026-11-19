// Keystone agent feedback. One script, no dependencies, no model: `hook`, `add`, `signals`, `summary`.
// Off by default: the SessionStart hook prints the self-report instruction only when the plugin option `feedback` is true
// (CLAUDE_PLUGIN_OPTION_FEEDBACK) or KEYSTONE_FEEDBACK=on. KEYSTONE_FEEDBACK=off switches everything off.
// Records live on this machine only: <KEYSTONE_FEEDBACK_DIR | <CLAUDE_CONFIG_DIR | ~/.claude>/keystone-feedback>/<project>/feedback.jsonl,
// append-only, never cleaned. Feedback never blocks work: any failure is one `Keystone feedback: error — …` line and exit 0.
//
// One rule runs through the file: every string that comes from outside (the model's text and command line, a transcript, a record
// on disk) goes through redact() BEFORE it is tested, stored or printed, and a value that is no valid key is never folded into
// the sentinel `-` ("no task", "no session"): it gets its own derived key or the line is malformed.
import { readFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { join, resolve, dirname, basename, posix } from 'node:path';
import { homedir } from 'node:os';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { parseArgs } from 'node:util';

// Thresholds that make an automatic judge run worthwhile (a repeated call is shown in Signals but is not a reason).
const T_ERRORS = 3; // tool errors
const T_VERIFY_ROUNDS = 2; // commits of verify.md
const T_INTERRUPTS = 1; // "[Request interrupted by user"
const T_USER_MSGS = 2; // free user messages in implement / verify / fix sessions
const MAX_ITEMS = 10; // lines of one report
const MAX_ADDR = 5; // addresses of one line
const MAX_TOTAL = 30; // items of one record
const MAX_FIELD = 300;
const CHAIN = ['start', 'intent', 'plan', 'check', 'implement', 'verify', 'fix', 'review']; // the skills that write a self-report
const ON = 'Keystone feedback: on'; // the first line of the instruction: a session that has it started with feedback on
const HEAD = 128 * 1024; // bytes at the top of a transcript where the SessionStart rows sit
// The left boundary matters: «task-runner-improvements», «disk-usage-monitor-service» must stay readable names. A token right after an
// escape — a JSON \n, \t, \uXXXX or a URL %XX — is no part of a longer word, so those count as a boundary too.
const B = '(?:(?<![A-Za-z0-9])|(?<=\\\\[nrt])|(?<=\\\\u[0-9a-fA-F]{4})|(?<=%[0-9a-fA-F]{2}))';
const SECRETS = [
  new RegExp(`${B}sk-ant-[A-Za-z0-9_-]{10,}`, 'g'), new RegExp(`${B}sk-[A-Za-z0-9_-]{16,}`, 'g'), new RegExp(`${B}AKIA[0-9A-Z]{16}`, 'g'),
  new RegExp(`${B}gh[pousr]_[A-Za-z0-9]{20,}`, 'g'), new RegExp(`${B}xox[abposr]-[A-Za-z0-9-]{10,}`, 'g'),
  // a private key: the whole block up to its END line (or the end of the text), not only the BEGIN line
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g, /eyJ[\w-]{10,}\.[\w-]{10,}\.[\w-]*/g,
];
const WINDOW = 8000; // characters a pattern ever scans (after whitespace is collapsed): the cost of the patterns is bounded by it

// the first n characters of x; a token cut by the end is dropped whole, so a stump of a secret never shows
const dropTail = (x, n) => {
  if (x.length <= n) return x;
  let i = n; while (i > 0 && !/\s/.test(x[i - 1])) i--;
  return x.slice(0, i);
};
export function redact(s) {
  // two windows first (200 000 raw, 8 000 collapsed characters) so no pattern ever scans a megabyte; only MAX_FIELD characters are kept at the end
  const flat = dropTail(String(s ?? ''), 200000).replace(/```/g, '').replace(/\s+/g, ' ').trim();
  let t = dropTail(flat, WINDOW);
  for (const re of SECRETS) t = t.replace(re, '[redacted]');
  return t.slice(0, MAX_FIELD);
}
// text from a transcript is cut only AFTER masking, so a secret never survives as an unmaskable stump
const cut = (s, n) => redact(String(s ?? '')).slice(0, n);

const sha = (s) => createHash('sha1').update(s).digest('hex').slice(0, 12);
const slash = (p) => String(p).replace(/\\/g, '/');
// a session id: a string of word characters that masking leaves as it is; `-` is the sentinel «no session»
const sidOf = (v) => (typeof v === 'string' && /^[\w.-]{1,80}$/.test(v) && redact(v) === v ? v : '-');
const off = (env) => String(env.KEYSTONE_FEEDBACK ?? '').toLowerCase() === 'off';
const configDir = (env) => env.CLAUDE_CONFIG_DIR || join(homedir(), '.claude');
const here = dirname(fileURLToPath(import.meta.url));
const pluginRootOf = (env) => slash(env.CLAUDE_PLUGIN_ROOT || resolve(here, '../../..'));

export function enabled(env = process.env) {
  if (off(env)) return false;
  if (String(env.KEYSTONE_FEEDBACK ?? '').toLowerCase() === 'on') return true;
  const v = String(env.CLAUDE_PLUGIN_OPTION_FEEDBACK ?? env.CLAUDE_PLUGIN_OPTION_feedback ?? '').toLowerCase();
  return ['true', '1', 'on'].includes(v);
}

// The instruction that reaches the model through the SessionStart hook (nothing is printed while feedback is off).
export function context(pluginRoot, sessionId = '-') {
  const session = sidOf(sessionId);
  const script = `${slash(pluginRoot).replace(/\/+$/, '')}/skills/feedback/scripts/feedback.mjs`;
  const quoted = `'${script.replace(/'/g, `'\\''`)}'`; // single quotes: a `$` or a backtick in the path is never expanded
  return [
    ON,
    `Agent feedback is on. Every Keystone chain skill (${CHAIN.join(', ')}) has a REQUIRED last step — also for an S change and a one-line edit: a short self-report about the TEXT OF THAT SKILL (what it told you, not the project), saved with the command below BEFORE your final answer. Do not skip it and do not replace it with a note in the chat.`,
    'One note per line, at most 10 lines. Kinds:',
    '- unclear — what in the skill text was unclear',
    '- deviated — where you departed from the skill, and why',
    '- guessed — what you had to guess or look up yourself',
    '- extra — what was superfluous',
    'Line format: `<kind> | <skill> § <section> | <text>` — skill without the `keystone:` prefix, section = the heading or step of that skill. Nothing to report → the single line `none`.',
    'Rules: quote the skill\'s wording, never project code, file contents or secrets (paths and file names are fine). Write in the language of the conversation. In a note never write the literal commands that push to git or create a PR with gh — write "push", "PR": the push gate scans the whole command text, a heredoc body included.',
    'Save it with the Bash tool only (one command; the rule `Bash(node *feedback.mjs*)` covers it):',
    `node ${quoted} add --skill <skill> --task "<task folder name or ->" --session ${session} <<'EOF'`,
    '<the lines>',
    'EOF',
    'The command prints one line: your final answer MUST contain that line verbatim, on its own line — the only feedback output, no report text. If it prints an error, show that one line and carry on with the work.',
    'This write goes to the local feedback store: it is not an action outside the repository in the sense of the stop rule of implement and fix — do not stop and do not ask.',
    'Judge: in /keystone:verify on M or L, run it after verify.md is written and the Final report is printed, and before the Step 6 menu — first the self-report of verify, then the Skill `keystone:feedback` with the args `auto <plan path>`. Its single line goes into the output, so the `Next:` line and the menu of verify stay last.',
    `plugin: ${pluginVersion()}`, // read back by coverage(): `summary --since` counts only the sessions of that version and later
    `session: ${session}`,
  ].join('\n');
}

const normPath = (p) => {
  let s = slash(p).replace(/\/+$/, '');
  if (/^[A-Za-z]:/.test(s)) s = s[0].toLowerCase() + s.slice(1);
  return s;
};

// Storage folder of a project: <basename>-<sha1(main checkout path)[0:6]>. All worktrees of a repo share it.
// A submodule is named by its checkout (`core.worktree` of its git dir); a bare repo and a repo with a separate git dir are named by the git dir
// (no pointer from a linked worktree to a checkout exists) — one folder for all their worktrees.
export function projectDir(cwd = process.cwd(), env = process.env) {
  const root = env.KEYSTONE_FEEDBACK_DIR || join(configDir(env), 'keystone-feedback');
  let path = normPath(cwd);
  const g = (args) => spawnSync('git', ['-C', String(cwd), ...args], { encoding: 'utf8' });
  const r = g(['rev-parse', '--path-format=absolute', '--git-common-dir']);
  if (r.status === 0 && r.stdout.trim()) {
    const common = normPath(r.stdout.trim());
    if (posix.basename(common) === '.git') path = posix.dirname(common);
    else { // submodule: the checkout its git dir points at (`core.worktree`). Bare repo and separate git dir: no pointer from a linked worktree to a
      // checkout exists, so all worktrees are named by the first entry of the worktree list (the git dir) — one folder for all of them
      const cfg = spawnSync('git', ['config', '--file', join(common, 'config'), '--get', 'core.worktree'], { encoding: 'utf8' });
      const cw = cfg.status === 0 ? cfg.stdout.trim() : '';
      const w = cw ? null : g(['worktree', 'list', '--porcelain']);
      const first = w && w.status === 0 ? w.stdout.split(/\r?\n/).find((l) => l.startsWith('worktree ')) : null;
      const t = cw || first ? null : g(['rev-parse', '--show-toplevel']);
      if (cw) path = normPath(resolve(common, cw));
      else if (first) path = normPath(first.slice('worktree '.length).trim());
      else if (t && t.status === 0 && t.stdout.trim()) path = normPath(t.stdout.trim());
    }
  }
  // a folder name must be creatable everywhere: a drive root gives the basename `e:`, a project may hold odd characters
  const base = posix.basename(path).replace(/[<>:"/\\|?*\u0000-\u001f]+/g, '_').replace(/[. ]+$/, '') || 'root';
  const name = `${base}-${createHash('sha1').update(path).digest('hex').slice(0, 6)}`;
  return { root, name, path, dir: join(root, name) };
}

// A skill (or agent) name: lower-case kebab, no prefix, no markup around it. Anything else is no skill — prose, a secret, a fence.
const unmark = (t) => t.replace(/^[*_`"'«(\s]+|[*_`"'»)\s]+$/g, '');
const skillName = (s) => {
  let t = redact(s);
  for (let i = 0; i < 4; i++) { const u = unmark(t).replace(/^\/+/, '').replace(/^keystone\s*:\s*/i, ''); if (u === t) break; t = u; }
  return unmark(t).toLowerCase();
};
// ...and a name this plugin has: the folders of skills/ and the files of agents/ (the pattern alone only if the plugin cannot be listed)
let KNOWN;
const known = () => (KNOWN ??= (() => {
  try { return new Set([...readdirSync(resolve(here, '..', '..')), ...readdirSync(resolve(here, '../../../agents')).map((f) => f.replace(/\.md$/, ''))]); } catch { return new Set(); }
})());
const isSkill = (s) => (known().size ? known().has(s) : /^[a-z][a-z0-9-]{0,39}$/.test(s));

// The name of a task folder from a path: docs/keystone/x/plan.md, docs/keystone/x/ and x all give x.
export function taskName(t) {
  const parts = slash(t ?? '').split('/').filter(Boolean);
  if (parts.length && /\.md$/i.test(parts[parts.length - 1])) parts.pop();
  return parts.pop() || '-';
}
// The key a task is stored and looked up under. `-` means «no task» and nothing else: a name that is empty, `.`, `..` is no task, a name
// with characters outside a plain file name (a space, `+`, `(`, a long one, a masked one) gets a stable key of its own, never `-`.
const taskKey = (name) => {
  const n = redact(String(name ?? '').normalize('NFC'));
  if (['', '-', '.', '..'].includes(n)) return '-';
  return /^[\p{L}\p{N}._-]{1,100}$/u.test(n) && !n.includes('[redacted]') ? n : `~${sha(String(name))}`.slice(0, 9);
};
const cleanTask = (t) => taskKey(taskName(t));
// a hash is the 12 hex characters `signals` prints; the model may write «hash: 78c2…» around it
const cleanHash = (h) => (typeof h === 'string' ? redact(h).match(/[0-9a-f]{12}/i)?.[0].toLowerCase() ?? '' : '');
const cleanTokens = (n) => { const x = Number(n); return Number.isSafeInteger(x) && x >= 0 ? x : 0; };

// A line is flattened (all blanks) and bounded before the parse patterns see it, and so is the number of lines: a pattern of the parsers
// is quadratic on a long run of blanks, so a model can never make `add` slow with one.
const MAX_LINE = 4000, MAX_LINES = 200;
// A line longer than MAX_LINE is cut where no token is split, and the cut is shown as «…»: a split token never reaches a pattern as a stump,
// and a note is never lost without a trace — a note whose last token is cut keeps its place with «…» as the rest, a line without a blank
// is cut after its last «|» (or stays a malformed line, which is counted).
const cutLine = (x) => {
  if (x.length <= MAX_LINE) return x;
  const d = dropTail(x, MAX_LINE).trimEnd();
  if (d) return `${d} …`;
  const i = x.lastIndexOf('|', MAX_LINE);
  return i > 0 ? `${x.slice(0, i + 1)}…` : x.slice(0, MAX_LINE);
};
// The flattening is the SAME as redact()'s (fences out, every blank — also U+00A0, VT, FF, a lone CR — becomes one space), so that what the
// cut keeps is what redact() later sees; the cut drops a token it splits whole. Neither a long run of any blank nor a cut token reaches a pattern.
const lines = (text) => dropTail(String(text ?? ''), 2000000).split(/\r?\n/, MAX_LINES * 4)
  .map((l) => cutLine(l.replace(/```/g, '').replace(/\s+/g, ' ').trim().replace(/^[-*]\s+/, ''))).filter(Boolean).slice(0, MAX_LINES);

// «plan § Step 1, keystone:verify § Step 2, verify § , § Step 4»: one line may name several places — one address per place.
// The single place where an address part is read: the self-report and the judge parsers both use it, and every place goes through
// the same two rules — the same alphabet for a skill (anything but a comma, `§` and `|`) that must then be a skill of this plugin, and the
// same check of the section (cleaned FIRST, then separators at its ends are cut, and a place without a section is no address). A place
// without a skill takes the previous one; prose, a secret or markup before `§` is part of the previous section. No usable address → [].
function addresses(address) {
  const out = [];
  for (const part of String(address).split(/\s*,\s*(?=[^,§|]*§)/)) {
    const m = part.match(/^([^§]*)§(.*)$/);
    if (!m) continue;
    const section = redact(m[2]).replace(/^[\s,;]+|[\s,;]+$/g, '');
    const named = skillName(m[1]);
    if (named && !isSkill(named)) { // prose («see also § B»), a secret or markup before §: no skill — part of the previous section, else nothing
      if (out.length) out[out.length - 1].section = redact(`${out[out.length - 1].section}, ${part}`);
      continue;
    }
    const skill = named || out[out.length - 1]?.skill || '';
    if (section && skill) out.push({ skill, section });
  }
  return out.slice(0, MAX_ADDR);
}

// lines → items; ≤ MAX_ITEMS lines and ≤ MAX_TOTAL items (a line may name several addresses)
function finish(out, found) {
  if (found.length > MAX_ITEMS) out.truncated = true;
  const items = found.slice(0, MAX_ITEMS).flat();
  if (items.length > MAX_TOTAL) out.truncated = true;
  out.items = items.slice(0, MAX_TOTAL);
  return out;
}

export function parseSelf(text) {
  const out = { items: [], skipped: 0, none: false, truncated: false };
  const found = [];
  for (const l of lines(text)) {
    const m = l.match(/^(unclear|deviated|guessed|extra)\s*\|\s*([^|]*§[^|]*?)\s*\|\s*(.+)$/i);
    const as = m ? addresses(m[2]) : [];
    const body = m ? redact(m[3]) : '';
    if (as.length && body) found.push(as.map((a) => ({ kind: m[1].toLowerCase(), skill: a.skill, section: a.section, text: body })));
    else if (/^none$/i.test(l)) out.none = true;
    else out.skipped++;
  }
  return finish(out, found);
}

export function parseJudge(text) {
  const out = { items: [], skipped: 0, none: false, truncated: false };
  const found = [];
  for (const l of lines(text)) {
    const m = l.match(/^(skill-text|agent|environment)\s*\|\s*(confirmed|added|unconfirmed)\s*\|\s*([^|]*§[^|]*?)\s*\|\s*([^|]+?)\s*\|\s*(.+?)(?:\s*\|\s*evidence:\s*(.*))?$/i);
    const as = m ? addresses(m[3]) : [];
    const cls = m ? redact(m[4]) : '', body = m ? redact(m[5]) : '';
    if (as.length && cls && body) {
      // one finding of a class at several places = one line, one item per address
      found.push(as.map((a) => ({ cause: m[1].toLowerCase(), source: m[2].toLowerCase(), skill: a.skill, section: a.section, cls, text: body, evidence: redact(m[6] ?? '') })));
    } else if (/^none$/i.test(l)) out.none = true;
    else out.skipped++;
  }
  return finish(out, found);
}

const pluginVersion = () => { try { return JSON.parse(readFileSync(resolve(here, '../../../.claude-plugin/plugin.json'), 'utf8')).version; } catch { return '-'; } };
const stamp = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\..*/, '').replace('T', '-');

// Appends one record. Returns { line, record? }; `line` is the single line the CLI prints (empty when feedback is off).
export function add(opts, stdin, env = process.env, cwd = process.cwd()) {
  if (off(env)) return { line: '' };
  const kind = String(opts.kind ?? 'self').toLowerCase();
  const judge = kind === 'judge';
  const P = judge ? 'Keystone feedback judge' : 'Keystone feedback';
  try {
    if (kind !== 'self' && !judge) return { line: `${P}: error — unknown kind (self or judge)` };
    const parsed = (judge ? parseJudge : parseSelf)(stdin);
    if (judge && !parsed.items.length && !parsed.none) return { line: `${P}: error — no parseable line` };
    const skill = isSkill(skillName(opts.skill)) ? skillName(opts.skill) : '-';
    const now = new Date();
    const proj = projectDir(cwd, env);
    const hash = judge ? cleanHash(opts.hash) : '';
    const record = {
      v: 1, id: `${stamp(now)}-${skill}-${randomBytes(2).toString('hex')}`, date: now.toISOString(), plugin_version: pluginVersion(),
      project: proj.name, project_path: proj.path, task: cleanTask(opts.task), skill, session: sidOf(opts.session), kind,
      ...(hash ? { hash } : {}), ...(judge && opts.tokens ? { tokens: cleanTokens(opts.tokens) } : {}),
      // `none` is a deliberate «nothing to report»; an empty list with malformed lines or no input is something else
      none: parsed.none && !parsed.items.length, ...(parsed.skipped ? { skipped: parsed.skipped } : {}),
      items: parsed.items,
    };
    mkdirSync(proj.dir, { recursive: true });
    const file = join(proj.dir, 'feedback.jsonl');
    appendFileSync(file, JSON.stringify(record) + '\n');
    const n = record.items.length;
    const head = n ? `${n} ${judge ? 'findings' : 'notes'} → ${slash(file)} (${record.id})` : `no ${judge ? 'findings' : 'notes'} (${record.id})`;
    const warn = [parsed.skipped ? `skipped ${parsed.skipped} malformed line(s)` : '', parsed.truncated ? `only the first ${MAX_ITEMS} lines and ${MAX_TOTAL} notes kept` : ''].filter(Boolean).join(', ');
    return { line: `${P}: ${head}${warn ? ` — ${warn}` : ''}`, record };
  } catch (e) {
    return { line: `${P}: error — ${String(e?.message ?? e).split('\n')[0]}` };
  }
}

// A stored line is data from disk, as untrusted as a transcript: every string is masked and flattened (no newline can forge a header
// or a row), whatever type it has; readers get strings, numbers and a list of items.
const cs = (v, d = '-') => redact(typeof v === 'string' || typeof v === 'number' ? String(v) : '') || d;
const ITEM_FIELDS = ['kind', 'skill', 'section', 'text', 'cause', 'source', 'cls', 'evidence'];
function cleanRecord(r) {
  const items = (Array.isArray(r.items) ? r.items : []).filter((i) => i && typeof i === 'object' && !Array.isArray(i))
    .map((i) => Object.fromEntries(ITEM_FIELDS.map((k) => [k, cs(i[k], '')])));
  const hash = typeof r.hash === 'string' ? cs(r.hash, '') : '';
  return { ...r, id: cs(r.id), kind: cs(r.kind), project: cs(r.project), task: cs(r.task), skill: cs(r.skill), session: cs(r.session),
    plugin_version: cs(r.plugin_version, '0'), hash: hash || undefined, none: r.none !== false, skipped: Number.isSafeInteger(r.skipped) && r.skipped > 0 ? r.skipped : 0,
    tokens: cleanTokens(r.tokens), items };
}

export function readRecords(env = process.env) {
  const root = env.KEYSTONE_FEEDBACK_DIR || join(configDir(env), 'keystone-feedback');
  const out = [];
  if (!existsSync(root)) return out;
  for (const d of readdirSync(root)) {
    const f = join(root, d, 'feedback.jsonl');
    if (!existsSync(f)) continue;
    for (const l of readFileSync(f, 'utf8').split('\n')) {
      if (!l.trim()) continue;
      try {
        const r = JSON.parse(l);
        if (r && typeof r === 'object' && !Array.isArray(r)) out.push(cleanRecord(r));
      } catch { /* a torn line is skipped */ }
    }
  }
  return out;
}

// ---- signals -------------------------------------------------------------------------------------------------------

const FREE_SKIP = ['<command-name>', '<local-command', '<task-notification>', '<side-sessions-event>', '<system-reminder>', '[Request interrupted by user'];
const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.map((b) => (typeof b === 'string' ? b : b?.text ?? '')).join(' ') : '');
const hint = (input) => cut(input?.command ?? input?.file_path ?? input?.pattern ?? JSON.stringify(input ?? {}), 80);
// The feedback machinery itself is not part of the trail: otherwise every judge run would change the `hash`.
const isFeedbackCall = (b) => (b.name === 'Skill' && /^(keystone:)?feedback$/.test(String(b.input?.skill ?? ''))) || JSON.stringify(b.input ?? {}).includes('feedback.mjs');

// What one session did, from its transcript: Keystone skills, tool errors, repeated calls, interrupts, free user messages.
export function readTrail(file) {
  const t = { skills: new Set(), errors: [], repeats: [], interrupts: 0, userMsgs: [], bad: 0, on: false, version: '0' };
  let raw = '';
  try { raw = readFileSync(file, 'utf8'); } catch { return t; }
  const names = new Map(); // tool_use id → name
  const skip = new Set(); // tool_use ids of feedback calls
  const calls = new Map(); // name + input → count
  const free = (text) => !FREE_SKIP.some((s) => text.includes(s));
  for (const line of raw.split('\n')) {
    if (!(line.includes('tool_use') || line.includes('tool_result') || line.includes('"type":"user"') || line.includes('keystone') || line.includes('queued_command') || line.includes(ON))) continue;
    let row;
    try { row = JSON.parse(line); } catch { t.bad++; continue; }
    if (!row || typeof row !== 'object') continue; // a line that is JSON but not a row (null, a string)
    if (row.isCompactSummary || row.isVisibleInTranscriptOnly) continue; // a summary the app wrote, not something the user typed
    // a message typed while the agent was working is recorded as a queued command
    if (row.type === 'attachment') {
      // the SessionStart hook of this script: its output (stdout, still JSON) and the context made of it (content)
      const a = row.attachment;
      const hook = a?.hookEvent === 'SessionStart' ? `${textOf(a.content)} ${typeof a.stdout === 'string' ? a.stdout : ''}` : '';
      if (hook.includes(ON)) { t.on = true; t.version = hook.match(/(?:\n|\\n)plugin: (\d+(?:\.\d+){0,2})/)?.[1] ?? t.version; }
      if (row.attachment?.type === 'queued_command') {
        const q = textOf(row.attachment.prompt).trim();
        if (q && free(q)) t.userMsgs.push(cut(q, 150));
      }
      continue;
    }
    const c = row.message?.content;
    if (row.type === 'user') {
      const text = textOf(c);
      for (const m of text.matchAll(/<command-name>\/keystone:([a-z-]+)<\/command-name>/g)) if (m[1] !== 'feedback') t.skills.add(m[1]);
      if (text.includes('[Request interrupted by user')) t.interrupts++;
      if (Array.isArray(c)) {
        for (const b of c) if (b?.type === 'tool_result' && b.is_error === true && !skip.has(b.tool_use_id))
          t.errors.push({ tool: cut(names.get(b.tool_use_id) ?? '?', 40), text: cut(textOf(b.content), 120) });
      }
      const isToolResult = Array.isArray(c) && c.some((b) => b?.type === 'tool_result');
      if (!row.isMeta && !isToolResult && text.trim() && free(text)) t.userMsgs.push(cut(text, 150));
    } else if (row.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b?.type !== 'tool_use') continue;
        names.set(b.id, b.name);
        if (isFeedbackCall(b)) { skip.add(b.id); continue; }
        const sk = b.name === 'Skill' ? String(b.input?.skill ?? '').match(/^keystone:([a-z-]+)$/) : null;
        if (sk) t.skills.add(sk[1]);
        const key = b.name + JSON.stringify(b.input ?? {});
        calls.set(key, { n: (calls.get(key)?.n ?? 0) + 1, tool: cut(b.name, 40), hint: hint(b.input) });
      }
    }
  }
  t.repeats = [...calls.values()].filter((x) => x.n >= 2).map((x) => ({ tool: x.tool, hint: x.hint, n: x.n }));
  return t;
}

const git = (cwd, args) => spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

// The task folder of a plan path: a folder is itself, `…/plan.md` (or any file) is its parent. Relative paths — also `./plan.md`
// from inside the folder — are resolved against the working directory first.
function planFolder(planPath, cwd) {
  const abs = resolve(cwd, String(planPath));
  try { return statSync(abs).isDirectory() ? abs : dirname(abs); } catch { return /\.md$/i.test(abs) ? dirname(abs) : abs; }
}

// Transcripts of a task: every session in <config>/projects/* written since the plan was added (minus 1 hour) that names the task.
// ponytail: matched by the dated task folder name and the time window, not by project — a collision needs the same dated slug in two
// projects in one window; filtering by the session's cwd would drop the sessions of a worktree that was deleted since.
export function taskTranscripts(planPath, env = process.env, cwd = process.cwd()) {
  const folder = planFolder(planPath, cwd);
  const task = basename(folder);
  if (['', '.', '..', '-'].includes(task)) return []; // no name, nothing to match: never «every transcript»
  const plan = join(folder, 'plan.md');
  let bound = null;
  const r = git(folder, ['log', '--diff-filter=A', '--format=%ct', '--', plan]);
  const times = r.status === 0 ? r.stdout.trim().split('\n').filter(Boolean).map(Number) : [];
  if (times.length) bound = Math.min(...times) * 1000;
  else if (existsSync(plan)) bound = statSync(plan).mtimeMs;
  if (bound === null) return [];
  bound -= 3600 * 1000;
  const out = [];
  const projects = join(configDir(env), 'projects');
  if (!existsSync(projects)) return out;
  for (const d of readdirSync(projects)) {
    const dir = join(projects, d);
    let files = [];
    try { files = readdirSync(dir).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = join(dir, f);
      try {
        if (statSync(p).mtimeMs < bound) continue;
        if (readFileSync(p, 'utf8').includes(task)) out.push(p);
      } catch { /* unreadable → not taken */ }
    }
  }
  return out;
}

function sessionTranscripts(id, env) {
  const out = [];
  const projects = join(configDir(env), 'projects');
  if (!existsSync(projects)) return out;
  for (const d of readdirSync(projects)) {
    const p = join(projects, d, `${id}.jsonl`);
    if (existsSync(p)) out.push(p);
  }
  return out;
}

// opts: { plan, auto, session, transcripts[], task } → the text of `## Signals`, `## Self-reports`, hash and the judge line.
export function signals(opts, env = process.env, cwd = process.cwd()) {
  // the task: from the plan path (its folder), else from --task; `-` is «no task» and never a key records are matched by
  let folder = null, task = '-';
  if (opts.plan) {
    folder = planFolder(opts.plan, cwd);
    if (!existsSync(folder)) throw new Error(`no plan at ${redact(slash(opts.plan))}`);
    task = taskKey(basename(folder));
  } else task = cleanTask(opts.task);
  // a session given but unusable is an error, not «no session» (which would fall back to every task-less record)
  const sessionGiven = typeof opts.session === 'string' && !opts.plan;
  const sessionId = sessionGiven ? sidOf(opts.session) : '';
  if (sessionGiven && sessionId === '-') throw new Error('no session id');
  const files = opts.transcripts?.length ? opts.transcripts : sessionId ? sessionTranscripts(sessionId, env) : opts.plan ? taskTranscripts(opts.plan, env, cwd) : [];
  const trails = files.map(readTrail).filter((t) => t.skills.size);
  const skills = new Set(trails.flatMap((t) => [...t.skills]));
  const errors = trails.flatMap((t) => t.errors);
  const interrupts = trails.reduce((n, t) => n + t.interrupts, 0);
  const bad = trails.reduce((n, t) => n + t.bad, 0);
  const merged = new Map();
  for (const r of trails.flatMap((t) => t.repeats)) { const k = r.tool + r.hint; merged.set(k, { ...r, n: (merged.get(k)?.n ?? 0) + r.n }); }
  const repeats = [...merged.values()].sort((a, b) => b.n - a.n);
  const userMsgs = trails.filter((t) => ['implement', 'verify', 'fix'].some((s) => t.skills.has(s))).flatMap((t) => t.userMsgs).slice(0, 10);

  let rounds = 0, verdict = '';
  if (folder) {
    const v = join(folder, 'verify.md');
    const lg = git(folder, ['log', '--format=%H', '--', v]);
    rounds = lg.status === 0 ? lg.stdout.trim().split('\n').filter(Boolean).length : 0;
    try { verdict = readFileSync(v, 'utf8').match(/Verdict:\s*([A-Z-]+)/)?.[1] ?? ''; } catch { /* no verify.md yet */ }
  }

  const sigLines = [
    '## Signals',
    `sessions: ${trails.length}${bad ? ` (${bad} unreadable line(s) skipped)` : ''}`,
    `skills: ${[...skills].sort().join(', ') || 'none'}`,
    `tool errors: ${errors.length}${errors.slice(0, 8).map((e) => `\n- ${e.tool}: ${e.text}`).join('')}`,
    `repeated calls: ${repeats.length}${repeats.slice(0, 8).map((r) => `\n- ${r.tool} ×${r.n}: ${r.hint}`).join('')}`,
    `interrupts: ${interrupts}`,
    `user messages (implement/verify/fix): ${userMsgs.length}${userMsgs.map((m) => `\n- ${m}`).join('')}`,
    ...(folder ? [`verify.md commits: ${rounds}`, `verdict: ${verdict || 'none'}`] : []),
  ];
  const sig = sigLines.join('\n');

  // a task name is unique only inside its project: records of a same-named task elsewhere on the machine are not this task's
  // (a session id is unique on its own); `-` («no task») never matches anything
  const proj = projectDir(cwd, env).name;
  const recs = sessionId ? readRecords(env) : readRecords(env).filter((r) => r.project === proj);
  const selfs = recs.filter((r) => r.kind === 'self' && (sessionId ? r.session === sessionId : task !== '-' && r.task === task));
  const selfLine = (r) => {
    const what = r.items.length ? '' : r.none ? 'none' : `no valid notes${r.skipped ? ` (${r.skipped} malformed line(s))` : ''}`;
    return `- ${r.id} (${r.skill}): ${what}${r.items.map((i) => `\n  ${i.kind} | ${i.skill} § ${i.section} | ${i.text}`).join('')}`;
  };
  const selfBlock = ['## Self-reports', ...(selfs.length ? selfs.map(selfLine) : ['none'])].join('\n');
  // repeated calls are shown but are no reason to judge, and the judge's own reads may repeat: they stay out of the hash.
  // The task and the session are part of the hash, and without both the traces themselves (their files): two different runs without a
  // key never look «already judged» by each other.
  const seed = `${task}|${sessionId}|${task === '-' && !sessionId ? files.map((f) => basename(f)).sort().join(',') : ''}\n`;
  const hash = sha(seed + sigLines.filter((l) => !l.startsWith('repeated calls:')).join('\n') + '\n' + selfBlock);

  const reasons = [];
  if (verdict === 'FAIL') reasons.push('FAIL');
  if (rounds >= T_VERIFY_ROUNDS) reasons.push(`verify rounds ${rounds}`);
  if (errors.length >= T_ERRORS) reasons.push(`tool errors ${errors.length}`);
  if (interrupts >= T_INTERRUPTS) reasons.push(`interrupts ${interrupts}`);
  if (userMsgs.length >= T_USER_MSGS) reasons.push(`user messages ${userMsgs.length}`);
  const judged = recs.filter((r) => r.kind === 'judge');
  const taskJudged = opts.plan && task !== '-' ? judged.find((r) => r.task === task) : null;
  const same = judged.find((r) => r.hash === hash);
  let verdictLine;
  // the same data is never judged twice — also a clean run judged on request
  if (same) verdictLine = `judge: no — already judged ${same.id}`;
  else if (!reasons.length) verdictLine = 'judge: no — clean run';
  else if (opts.auto && taskJudged) verdictLine = `judge: no — task already judged ${taskJudged.id}`;
  else verdictLine = `judge: yes — ${reasons.join(', ')}`;
  return [sig, selfBlock, `hash: ${hash}`, verdictLine].join('\n');
}

// ---- summary -------------------------------------------------------------------------------------------------------

const ver = (s) => String(s ?? '0').split('.').map((n) => parseInt(n, 10) || 0);
const cmpVer = (a, b) => { const x = ver(a), y = ver(b); for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0); return 0; };
const cell = (s) => String(s).replace(/\|/g, '\\|');
const norm = (s) => String(s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
const addr = (i) => `${i.skill} § ${String(i.section ?? '').replace(/\s+/g, ' ').trim()}`;

const headOf = (p) => {
  let fd;
  try { fd = openSync(p, 'r'); const b = Buffer.alloc(HEAD); return b.toString('utf8', 0, readSync(fd, b, 0, HEAD, 0)); } catch { return ''; } finally { if (fd !== undefined) closeSync(fd); }
};

// Was the self-report written at all? Per chain skill: in how many sessions that started with feedback on it ran (its command or a
// Skill call in <config>/projects/*/*.jsonl, or a record of it), and in how many of those a self-report names that session.
// ponytail: only the top HEAD bytes of a transcript decide whether it is read — a session resumed after feedback was switched on is
// not counted; a skill followed by reading its SKILL.md (a menu pick) leaves no trace and counts only when its report was written.
export function coverage(selfs, since, env = process.env) {
  const by = new Map(CHAIN.map((s) => [s, { ran: 0, written: 0 }]));
  const wrote = new Map(); // session → skills with a self-report
  for (const r of selfs) if (r.session !== '-') wrote.set(r.session, (wrote.get(r.session) ?? new Set()).add(r.skill));
  let sessions = 0;
  const projects = join(configDir(env), 'projects');
  for (const d of existsSync(projects) ? readdirSync(projects) : []) {
    let files = [];
    try { files = readdirSync(join(projects, d)).filter((f) => f.endsWith('.jsonl')); } catch { continue; }
    for (const f of files) {
      const p = join(projects, d, f);
      if (!headOf(p).includes(ON)) continue;
      const t = readTrail(p);
      if (!t.on || (since && cmpVer(t.version, since) < 0)) continue;
      sessions++;
      const w = wrote.get(f.slice(0, -'.jsonl'.length)) ?? new Set();
      for (const [s, c] of by) if (t.skills.has(s) || w.has(s)) { c.ran++; if (w.has(s)) c.written++; }
    }
  }
  return { sessions, by };
}

export function summary(opts, env = process.env) {
  let recs = readRecords(env);
  if (opts.since) recs = recs.filter((r) => cmpVer(r.plugin_version, opts.since) >= 0);
  const selfs = recs.filter((r) => r.kind === 'self');
  const judges = recs.filter((r) => r.kind === 'judge');
  const key = (r) => `${r.project}/${r.task}`;
  const judgedTasks = new Set(judges.filter((r) => r.task !== '-').map(key));

  const table = (groups) => {
    if (!groups.size) return ['none'];
    const rows = [...groups.values()].sort((a, b) => b.ids.size - a.ids.size || a.address.localeCompare(b.address));
    return ['| address | class | count | projects | versions | records |', '|---|---|---|---|---|---|',
      ...rows.map((g) => `| ${cell(g.address)} | ${cell(g.cls)} | ${g.ids.size} | ${cell([...g.projects].join(', '))} | ${cell([...g.versions].join(', '))} | ${cell([...g.ids].join(', '))} |`)];
  };
  const group = (map, address, cls, r) => {
    const k = `${norm(address)}\u0000${norm(cls)}`;
    const g = map.get(k) ?? { address, cls, ids: new Set(), projects: new Set(), versions: new Set() };
    g.ids.add(r.id); g.projects.add(r.project); g.versions.add(r.plugin_version);
    map.set(k, g);
  };

  const runs = new Map();
  for (const r of selfs) {
    const s = runs.get(r.skill) ?? { runs: 0, notes: 0 };
    s.runs++; if (r.items.length) s.notes++;
    runs.set(r.skill, s);
  }
  const cand = new Map(), unjudged = new Map(), other = { agent: 0, environment: 0 };
  for (const r of judges) for (const i of r.items) {
    if (i.cause === 'skill-text') group(cand, addr(i), i.cls, r);
    else if (i.cause in other) other[i.cause]++;
  }
  for (const r of selfs) if (r.task === '-' || !judgedTasks.has(key(r))) for (const i of r.items) group(unjudged, addr(i), i.kind, r);
  const cov = coverage(selfs, opts.since, env);
  const covRows = [...cov.by].filter(([, c]) => c.ran);

  return [
    `## Keystone feedback${opts.since ? ` (plugin ≥ ${opts.since})` : ''}`,
    `${recs.length} record(s) in ${new Set(recs.map((r) => r.project)).size} project(s)`,
    '',
    '### Runs by skill',
    ...(runs.size ? [...runs].sort((a, b) => a[0].localeCompare(b[0])).map(([s, v]) => `- ${s}: ${v.runs} runs, ${v.notes} with notes`) : ['none']),
    '',
    `### Coverage — ${cov.sessions} session(s) with feedback on`,
    ...(covRows.length ? covRows.map(([s, c]) => `- ${s}: report written in ${c.written} of ${c.ran} session(s)${c.written < c.ran ? ` — ${c.ran - c.written} missing` : ''}`) : ['none']),
    '',
    '### Candidates — skill text (judge)',
    ...table(cand),
    '',
    '### Self-reports of unjudged tasks',
    ...table(unjudged),
    '',
    '### Other causes (agent / environment)',
    `agent: ${other.agent} · environment: ${other.environment}`,
  ].join('\n');
}

// ---- CLI -----------------------------------------------------------------------------------------------------------

function readStdin() { try { return readFileSync(0, 'utf8'); } catch { return ''; } }

export function main(argv, env = process.env) {
  const [cmd, ...rest] = argv;
  const { values: o, positionals } = parseArgs({
    args: rest, allowPositionals: true, strict: false,
    options: { skill: { type: 'string' }, task: { type: 'string' }, session: { type: 'string' }, kind: { type: 'string' }, hash: { type: 'string' }, tokens: { type: 'string' },
      since: { type: 'string' }, auto: { type: 'boolean' }, transcript: { type: 'string', multiple: true } },
  });
  if (cmd === 'hook') {
    let input = null;
    try { input = JSON.parse(readStdin() || '{}'); } catch { /* not our input → silent */ }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return ''; // null, a number, a string, a list, broken JSON: not a hook input
    const sid = sidOf(input.session_id);
    if (enabled(env)) return JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: context(pluginRootOf(env), sid) } });
    return '';
  }
  // an option is a string or nothing: a flag without a value arrives as `true`, or swallows the next flag as its value — both are dropped
  const val = (x) => (typeof x === 'string' && !x.startsWith('--') ? x : undefined);
  const v = (k) => val(o[k]);
  if (cmd === 'add') return add({ skill: v('skill'), task: v('task'), session: v('session'), kind: v('kind'), hash: v('hash'), tokens: v('tokens') }, readStdin(), env).line;
  try {
    if (cmd === 'signals') return signals({ plan: positionals[0], auto: o.auto === true, session: v('session'), transcripts: (o.transcript ?? []).map(val).filter(Boolean), task: v('task') }, env);
    if (cmd === 'summary') {
      const since = v('since');
      if (since !== undefined && !/^\d+(\.\d+){0,2}$/.test(since)) return 'Keystone feedback: error — --since takes a version like 0.9.30';
      return summary({ since }, env);
    }
  } catch (e) {
    return `Keystone feedback: error — ${String(e?.message ?? e).split('\n')[0]}`;
  }
  return 'Keystone feedback: error — usage: feedback.mjs hook | add | signals | summary';
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  let out = '';
  // the hook output becomes context: an error there stays silent ("error or wrong input → nothing"); other commands show one line
  try { out = main(process.argv.slice(2)); } catch (e) { out = process.argv[2] === 'hook' ? '' : `Keystone feedback: error — ${String(e?.message ?? e).split('\n')[0]}`; }
  // exit only after the output is flushed: a pipe may take a large output in pieces
  if (out) process.stdout.write(out + '\n', () => process.exit(0)); else process.exit(0);
}
