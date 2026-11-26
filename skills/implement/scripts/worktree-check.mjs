#!/usr/bin/env node
// Keystone · worktree-check — static, read-only check for runtime resources that clash between git worktrees
// (host ports, container_name, Compose project, named volumes and networks). Reads files, runs only `git`.
// CLI:  worktree-check.mjs [--json] [--linked-only] [--cwd <dir>]  → report on stdout; exit 0, or 1 on an internal error.
import { existsSync, readdirSync, readFileSync, realpathSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

const MAX_DEPTH = 3;
const MAX_FILES = 200;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'vendor']);
const PORT_KEY = /(^|_)PORT(_|$)/i;

function git(cwd, args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0' }, timeout: 60000 });
  if (r.error) throw new Error(`git ${args[0]}: ${r.error.message}`);
  return { code: r.status, out: (r.stdout ?? '').replace(/\r/g, '').trim() };
}

const norm = (p) => {
  let a = resolve(p);
  try { a = realpathSync.native(a); } catch { /* missing path: compare as resolved */ }
  return process.platform === 'win32' ? a.toLowerCase() : a;
};

// `git worktree list --porcelain` → [{ path, branch, bare, prunable }]
export function listWorktrees(cwd) {
  const r = git(cwd, ['worktree', 'list', '--porcelain']);
  if (r.code !== 0) throw new Error('git worktree list failed');
  const out = [];
  for (const block of r.out.split(/\n\s*\n/)) {
    const e = { path: '', branch: 'detached', bare: false, prunable: null };
    for (const line of block.split('\n')) {
      const [k, ...rest] = line.split(' ');
      const v = rest.join(' ');
      if (k === 'worktree') e.path = v;
      else if (k === 'branch') e.branch = v.replace(/^refs\/heads\//, '');
      else if (k === 'bare') e.bare = true;
      else if (k === 'prunable') e.prunable = v || 'prunable';
    }
    if (e.path) out.push(e);
  }
  return out;
}

// ---- file discovery ----
const isCompose = (n) => /^(docker-)?compose.*\.ya?ml$/i.test(n);
const isEnv = (n) => (n === '.env' || n.startsWith('.env.')) && !/\.(example|sample|template|dist)$/i.test(n);
const isCandidate = (n) => isCompose(n) || isEnv(n) || n === 'package.json';

function candidates(root) {
  const found = [];
  if (existsSync(join(root, '.claude', 'launch.json'))) found.push('.claude/launch.json');
  const visit = (rel, depth) => {
    let entries;
    try { entries = readdirSync(join(root, rel), { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
    for (const e of entries) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (depth >= MAX_DEPTH || SKIP_DIRS.has(e.name)) continue;
        if (e.name.startsWith('.') && e.name !== '.devcontainer') continue; // also skips root .claude (launch.json read above)
        visit(p, depth + 1);
      } else if (isCandidate(e.name)) found.push(p);
    }
  };
  visit('', 0);
  return found;
}

// ---- .env ----
function parseEnv(text) {
  const vars = new Map();
  text.split(/\r?\n/).forEach((raw, i) => {
    const m = raw.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) return;
    let v = m[2].trim();
    const q = v.match(/^(["'])(.*)\1/);
    v = q ? q[2] : v.replace(/\s+#.*$/, '').trim();
    vars.set(m[1], { value: v, line: i + 1 });
  });
  return vars;
}

function envResources(vars, file, add, unknown) {
  for (const [k, { value, line }] of vars) {
    if (k === 'COMPOSE_PROJECT_NAME') { if (value) add('compose-project', value, file, line); }
    else if (PORT_KEY.test(k)) {
      const n = /^\d+$/.test(value) ? Number(value) : NaN;
      if (n >= 1 && n <= 65535) add('host-port', String(n), file, line);
      else unknown({ file, line, kind: 'host-port', reason: 'non-numeric port' });
    }
  }
}

// ${VAR} ${VAR:-def} ${VAR-def} ${VAR:?e} $VAR $$ → { value } | { unresolved: VAR }
function subst(s, vars) {
  let missing = null;
  const value = s.replace(/\$\$|\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:?)([-?])([^}]*))?\}|\$([A-Za-z_][A-Za-z0-9_]*)/g, (m, name, colon, op, def, bare) => {
    if (m === '$$') return '$';
    const key = name ?? bare;
    const v = vars.get(key)?.value;
    const unset = v === undefined || (colon === ':' && v === '');
    if (!unset) return v;
    if (op === '-') return def;
    missing ??= key;
    return '';
  });
  return missing ? { unresolved: missing } : { value };
}

const unquote = (s) => s.trim().replace(/^(["'])(.*)\1$/, '$2');
const stripComment = (s) => {
  let q = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === q) q = null; } else if (c === '"' || c === "'") q = c;
    else if (c === '#' && (i === 0 || /\s/.test(s[i - 1]))) return s.slice(0, i);
  }
  return s;
};

// ---- compose (narrow subset, line by line) ----
function parseCompose(text, file, vars, unknown) {
  const res = { project: null, ports: [], containers: [], named: [] };
  const lines = text.split(/\r?\n/);
  let top = null, svcIndent = -1, propIndent = -1, inPorts = false, portsIndent = -1, longItem = false;
  let entIndent = -1, ent = null, skipDeeper = -1;
  const bad = (line, reason = 'unsupported-yaml', kind = 'compose') => unknown({ file, line, kind, reason });
  const val = (raw, line, kind) => {
    const r = subst(unquote(raw), vars);
    if (r.unresolved) { bad(line, `unresolved \${${r.unresolved}}`, kind); return null; }
    return r.value;
  };
  const port = (raw, line) => {
    const v = val(raw, line, 'host-port');
    if (v == null) return;
    const parts = v.replace(/\/\w+$/, '').split(':');
    if (parts.length < 2) return; // container port only → random host port
    const host = parts[parts.length - 2];
    if (host === '') return;
    if (/^\d+-\d+$/.test(host)) return bad(line, 'port-range', 'host-port');
    if (/^\d+$/.test(host) && +host >= 1 && +host <= 65535) res.ports.push({ value: String(+host), line });
    else bad(line, 'unsupported-yaml', 'host-port');
  };
  const published = (raw, line) => port(`${unquote(raw)}:0`, line); // long form: `published: "8080"` is a host port
  const closeEnt = () => { if (ent) res.named.push(ent); ent = null; };

  lines.forEach((raw0, i) => {
    const line = i + 1;
    const raw = stripComment(raw0).replace(/\s+$/, '');
    if (!raw.trim()) return;
    const indent = raw.match(/^ */)[0].length;
    const t = raw.trim().replace(/(:|^-)\s+&[\w-]+(?=\s|$)/, '$1'); // an anchor `&x` leaves the value as is; aliases and merges do not
    if (skipDeeper >= 0) { if (indent > skipDeeper) return; skipDeeper = -1; }
    if (top === 'services' && indent > 0 && svcIndent < 0) svcIndent = indent; // before any early return
    if (/(^|\s)<<\s*:|:\s*[&*][\w-]+|^-\s*[&*][\w-]+/.test(t)) { bad(line); return; }
    if (/:\s*[|>][-+0-9]*$/.test(t)) { bad(line); skipDeeper = indent; return; }
    const kv = t.match(/^([A-Za-z0-9_.-]+|"[^"]+"|'[^']+'):(?:\s+(.*))?$/);
    // a key whose block is written inline (`services: {…}`, `db: { ports: […] }`) is not parsed → not checked
    const inline = kv && kv[2] && kv[2] !== '{}';
    if (indent === 0) {
      closeEnt();
      top = kv ? unquote(kv[1]) : null; svcIndent = propIndent = entIndent = -1; inPorts = false;
      if (top === 'name' && kv[2]) { const v = val(kv[2], line, 'compose-project'); if (v) res.project = { value: v, line }; }
      else if (['services', 'volumes', 'networks'].includes(top) && inline) bad(line);
      return;
    }
    if (top === 'services') {
      if (indent <= svcIndent) { if (inline) bad(line); propIndent = -1; inPorts = false; return; }
      if (propIndent < 0) propIndent = indent;
      // `ports:` items may sit at the key's own indent (compact sequence)
      if (indent < propIndent || (indent === propIndent && !(inPorts && /^-(\s|$)/.test(t)))) {
        inPorts = false;
        if (!kv) return;
        const k = unquote(kv[1]);
        if (k === 'container_name' && kv[2]) { const v = val(kv[2], line, 'container-name'); if (v) res.containers.push({ value: v, line }); }
        else if (k === 'ports') {
          if (!kv[2]) { inPorts = true; portsIndent = -1; longItem = false; }
          else if (/^\[.*\]$/.test(kv[2])) kv[2].slice(1, -1).split(',').filter((s) => s.trim()).forEach((s) => port(s, line));
          else bad(line, 'unsupported-yaml', 'host-port');
        }
        return;
      }
      if (!inPorts) return;
      const item = t.match(/^-\s*(.*)$/);
      if (item) {
        portsIndent = indent; longItem = false;
        const ikv = item[1].match(/^([A-Za-z_]\w*):\s*(.*)$/); // `- 8082:80` is a short port, not a key
        if (ikv) { longItem = true; if (ikv[1] === 'published') published(ikv[2], line); }
        else port(item[1], line);
      } else if (longItem && indent > portsIndent && kv) {
        if (unquote(kv[1]) === 'published' && kv[2]) published(kv[2], line);
      } else bad(line, 'unsupported-yaml', 'host-port');
      return;
    }
    if (top === 'volumes' || top === 'networks') {
      if (entIndent < 0) entIndent = indent;
      if (indent <= entIndent) {
        closeEnt();
        if (!kv) return;
        ent = { kind: top === 'volumes' ? 'volume' : 'network', key: unquote(kv[1]), name: null, external: false, line, file };
        if (kv[2] && kv[2] !== '{}') {
          const flow = kv[2].match(/^\{(.*)\}$/);
          if (!flow) return bad(line);
          for (const part of flow[1].split(',')) {
            const [a, b = ''] = part.split(':');
            if (a.trim() === 'name') { const v = val(b, line, ent.kind); if (v) ent.name = v; }
            if (a.trim() === 'external' && b.trim() === 'true') ent.external = true;
          }
        }
        return;
      }
      if (ent && kv) {
        const k = unquote(kv[1]);
        if (k === 'name' && kv[2]) { const v = val(kv[2], line, ent.kind); if (v) { ent.name = v; ent.line = line; } }
        if (k === 'external' && kv[2] === 'true') ent.external = true;
      }
    }
  });
  closeEnt();
  return res;
}

function readSafe(root, file, unknown) {
  try { return readFileSync(join(root, file), 'utf8'); } catch { unknown({ file, line: 0, kind: 'file', reason: 'unreadable' }); return null; }
}
const lineOf = (text, needle) => { const i = text.split(/\r?\n/).findIndex((l) => l.includes(needle)); return i < 0 ? 1 : i + 1; };

// one worktree → { resources: [{ kind, value, file, line }], unknown: [...], partial }
export function scanCheckout(root) {
  const all = candidates(root);
  const files = all.slice(0, MAX_FILES);
  const resources = [], unknownList = [];
  const add = (kind, value, file, line) => resources.push({ kind, value, file, line });
  const unknown = (u) => unknownList.push(u);
  const byDir = new Map();
  for (const f of files) { const d = f.includes('/') ? f.slice(0, f.lastIndexOf('/')) : ''; if (!byDir.has(d)) byDir.set(d, []); byDir.get(d).push(f); }
  for (const [, group] of byDir) {
    let vars = new Map();
    for (const f of group.filter((x) => isEnv(basename(x)))) {
      const text = readSafe(root, f, unknown);
      if (text == null) continue;
      const v = parseEnv(text);
      if (basename(f) === '.env') vars = v; // Compose substitutes from `.env` next to the compose file
      envResources(v, f, add, unknown);
    }
    const parsed = [];
    for (const f of group.filter((x) => isCompose(basename(x)))) {
      const text = readSafe(root, f, unknown);
      if (text != null) parsed.push({ f, r: parseCompose(text, f, vars, unknown) });
    }
    const envProject = vars.get('COMPOSE_PROJECT_NAME')?.value || null;
    const composeProject = parsed.map((p) => p.r.project?.value).find(Boolean) ?? null;
    const project = envProject ?? composeProject;
    for (const { f, r } of parsed) {
      // COMPOSE_PROJECT_NAME from .env overrides `name:`
      if (r.project && !envProject) add('compose-project', r.project.value, f, r.project.line);
      for (const p of r.ports) add('host-port', p.value, f, p.line);
      for (const c of r.containers) add('container-name', c.value, f, c.line);
      for (const n of r.named) {
        if (n.name) add(n.kind, n.name, f, n.line);
        else if (n.external) add(n.kind, n.key, f, n.line);
        else if (project) add(n.kind, `${project}_${n.key}`, f, n.line);
      }
    }
    for (const f of group.filter((x) => basename(x) === 'package.json')) {
      const text = readSafe(root, f, unknown);
      if (text == null) continue;
      let json;
      try { json = JSON.parse(text); } catch { unknown({ file: f, line: 1, kind: 'host-port', reason: 'invalid json' }); continue; }
      for (const s of Object.values(json?.scripts ?? {})) {
        if (typeof s !== 'string') continue;
        const line = lineOf(text, JSON.stringify(s).slice(1, -1));
        for (const m of s.matchAll(/--port[= ](\d+)/g)) add('host-port', String(+m[1]), f, line);
        for (const m of s.matchAll(/(?:^|\s)PORT=(\d+)/g)) add('host-port', String(+m[1]), f, line);
      }
    }
  }
  if (files.includes('.claude/launch.json')) {
    const f = '.claude/launch.json';
    const text = readSafe(root, f, unknown);
    if (text != null) {
      let json = null;
      for (const t of [text, text.split(/\r?\n/).filter((l) => !l.trim().startsWith('//')).join('\n')]) { try { json = JSON.parse(t); break; } catch { /* next */ } }
      if (!json) unknown({ file: f, line: 1, kind: 'host-port', reason: 'invalid json' });
      else for (const c of json.configurations ?? []) {
        if (Number.isInteger(c?.port)) add('host-port', String(c.port), f, (() => { const i = text.split(/\r?\n/).findIndex((l) => new RegExp(`"port"\\s*:\\s*${c.port}\\b`).test(l)); return i < 0 ? 1 : i + 1; })());
      }
    }
  }
  return { resources, unknown: unknownList, partial: all.length > MAX_FILES };
}

export function diagnose(cwd, { env = process.env, linkedOnly = false } = {}) {
  const base = { checked: [], skipped: [], conflicts: [], unknown: [], isolation: 'not_verified' };
  const none = (reason, current = '') => ({ status: 'nothing-to-check', reason, current, ...base });
  if (env.CLAUDE_CODE_REMOTE === 'true') return none('cloud');
  const top = git(cwd, ['rev-parse', '--show-toplevel']);
  if (top.code !== 0) return none('not-git');
  const current = top.out;
  const dirs = git(cwd, ['rev-parse', '--path-format=absolute', '--git-dir', '--git-common-dir']).out.split('\n');
  const linked = dirs.length === 2 && norm(dirs[0]) !== norm(dirs[1]);
  if (linkedOnly && !linked) return none('not-linked', current);

  const live = [];
  for (const w of listWorktrees(cwd)) {
    let reason = null;
    if (w.bare) reason = 'bare';
    else if (w.prunable) reason = `prunable: ${w.prunable}`;
    else if (!existsSync(w.path)) reason = 'missing';
    else { try { readdirSync(w.path); } catch (e) { reason = `unreadable: ${e.code ?? 'error'}`; } }
    if (reason) base.skipped.push({ path: w.path, reason });
    else live.push(w);
  }
  if (live.length < 2) return { ...none('single-worktree', current), skipped: base.skipped };

  const names = live.map((w) => basename(w.path));
  const groups = new Map();
  for (const [i, w] of live.entries()) {
    const name = names.filter((n) => n === names[i]).length > 1 ? w.path : names[i];
    const s = scanCheckout(w.path);
    base.checked.push({ path: w.path, name, branch: w.branch, partial: s.partial });
    for (const u of s.unknown) base.unknown.push({ worktree: name, ...u });
    const seen = new Set();
    for (const r of s.resources) {
      const key = `${r.kind}\u0000${r.value}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (!groups.has(key)) groups.set(key, { kind: r.kind, value: r.value, where: [] });
      groups.get(key).where.push({ worktree: name, file: r.file, line: r.line });
    }
  }
  base.conflicts = [...groups.values()].filter((g) => g.where.length >= 2)
    .sort((a, b) => a.kind.localeCompare(b.kind) || a.value.localeCompare(b.value, undefined, { numeric: true }));
  return { status: base.conflicts.length ? 'conflicts' : 'ok', current, ...base };
}

const NONE_TEXT = {
  'single-worktree': 'worktree-check: соседних worktree нет — проверять нечего',
  'not-git': 'worktree-check: не git-репозиторий — проверять нечего',
  cloud: 'worktree-check: облачная сессия — проверять нечего',
  'not-linked': 'worktree-check: основной checkout, проверка — из linked worktree',
};

export function formatText(r) {
  if (r.status === 'nothing-to-check') return NONE_TEXT[r.reason];
  const out = ['worktree-check · статически, только чтение · изоляция не доказана', ''];
  const partial = r.checked.filter((c) => c.partial).map((c) => c.name);
  out.push(`Проверено: ${r.checked.length} worktree${partial.length ? ` (частично: ${partial.join(', ')})` : ''}`);
  for (const s of r.skipped) out.push(`Пропущен: ${s.path} — ${s.reason}`);
  if (r.conflicts.length) {
    out.push('', '| Ресурс | Значение | Где (worktree · файл:строка) |', '|---|---|---|');
    for (const c of r.conflicts) out.push(`| ${c.kind} | ${c.value} | ${c.where.map((w) => `${w.worktree} · ${w.file}:${w.line}`).join('; ')} |`);
  }
  if (r.unknown.length) {
    out.push('');
    for (const u of r.unknown) out.push(`Не проверено: ${u.worktree} · ${u.file}:${u.line} — ${u.kind}: ${u.reason}`);
  }
  out.push('');
  out.push(r.conflicts.length
    ? 'Не поднимайте эти окружения одновременно — или вынесите значение в переменную (например, `${DB_PORT:-5432}:5432`) и задайте разное значение в .env каждого worktree.'
    : 'Конфликтов не найдено.');
  return out.join('\n');
}

function main(argv) {
  const { values } = parseArgs({ args: argv, options: { json: { type: 'boolean' }, 'linked-only': { type: 'boolean' }, cwd: { type: 'string' } } });
  const r = diagnose(values.cwd ?? process.cwd(), { linkedOnly: !!values['linked-only'] });
  process.stdout.write((values.json ? JSON.stringify(r, null, 2) : formatText(r)) + '\n');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`worktree-check: ${e.message}\n`);
    process.exitCode = 1;
  }
}
