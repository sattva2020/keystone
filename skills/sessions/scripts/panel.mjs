#!/usr/bin/env node
// Sattva · side panel — one row per child session of a main session: state, stage, progress, what it waits for.
// Read-only: the engine's registry of live sessions, git and plan files. The mod (hooks/panel.tsx) draws the rows.
// CLI: panel.mjs < { "self": id, "originCwd": dir, "sessions": [...] }   → JSON { "rows": [...] }
import { readFileSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { classify, decide, facts, norm, readSent } from './triage.mjs';
import { show } from '../../implement/scripts/owner.mjs';

// ponytail: facts cost several git runs per session; past this many (and past the budget) a row has its state only
export const FACTS_MAX = 20;
export const BUDGET_MS = 15000;

const WAIT = new Set(['answer', 'failed', 'accept', 'blocked', 'approve', 'release', 'intent', 'dirty', 'ignored', 'merge', 'unrecognised', 'stuck', 'path']);

const pidAlive = (pid) => {
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
};

// The engine's registry of live sessions (undocumented): app session id → status. Anything unexpected is skipped,
// so a changed format reads as "unknown" and never as an error. Only these four fields are read.
// ponytail: a reused pid revives an old record until the engine writes its next one
export function registryStates(dir, alive = pidAlive) {
  let names = [];
  try { names = readdirSync(dir).filter((n) => n.endsWith('.json')); } catch { return new Map(); }
  const best = new Map();
  for (const n of names) {
    try {
      const raw = readFileSync(join(dir, n), 'utf8'); // may end in padding: spaces or NULs
      const { pid, hostSessionId, status, updatedAt } = JSON.parse(raw.slice(0, raw.lastIndexOf('}') + 1));
      if (typeof hostSessionId !== 'string' || !Number.isInteger(pid) || pid <= 0 || !alive(pid)) continue;
      const at = Number(updatedAt) || 0;
      if (!best.has(hostSessionId) || best.get(hostSessionId).at < at) best.set(hostSessionId, { status, at });
    } catch { /* gone between listing and reading, or not JSON */ }
  }
  return new Map([...best].map(([id, r]) => [id, r.status]));
}

function stateOf(s, states) {
  if (states.has(s.sessionId)) return { busy: 'working', waiting: 'waiting', idle: 'idle' }[states.get(s.sessionId)] ?? 'unknown';
  return s.isRunning === false ? 'idle' : 'unknown';
}

const repoOfGit = (dir) => {
  const r = spawnSync('git', ['-C', dir, 'rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' });
  if (r.error || r.status !== 0) throw new Error('not a repository');
  return r.stdout.trim();
};

const finished = (p) => !p.intentOnly && p.status === 'verified' && p.release.length === 0;

function statusCommand(p) {
  if (!p || p.intentOnly) return null;
  if (p.status === 'draft') return `/sattva:plan ${p.path}`;
  if (p.status === 'approved' || (p.status === 'implementing' && p.open > 0)) return `/sattva:implement ${p.path}`;
  if (p.status === 'implementing') return `/sattva:verify ${p.path}`;
  if (p.status === 'verified' && p.release.length) return `/sattva:implement ${p.path}`;
  return null;
}

// The session's own next command for a waiting code. The plan is the one the code came from, which need not be the
// first unfinished one (an intent-only folder may stand before it).
function nextFor(code, arg, plans, current) {
  const on = (cmd, p) => (p ? `${cmd} ${p.path}` : null);
  if (code === 'answer') return statusCommand(current);
  if (code === 'accept') return on('/sattva:verify accept', plans.find((p) => p.verdict === 'PASS-UNPROVEN' && p.status !== 'verified'));
  if (code === 'approve') return on('/sattva:plan', plans.find((p) => p.status === 'draft'));
  if (code === 'release') return on('/sattva:implement', plans.find((p) => p.status === 'verified' && p.release.length));
  if (code === 'intent') return on('/sattva:plan', plans.find((p) => p.intentOnly))?.replace(/plan\.md$/, 'intent.md') ?? null;
  return code === 'stuck' ? arg : null;
}

export function panelRows({ self, originCwd, sessions }, deps = {}) {
  process.env.GIT_OPTIONAL_LOCKS = '0'; // `git status` must not take index.lock from a working child
  const now = deps.now ?? Date.now;
  const start = now();
  const spent = () => now() - start >= BUDGET_MS;
  const states = deps.states ?? registryStates(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'sessions'));
  const factsOf = deps.factsOf ?? facts;
  const ownerOf = deps.ownerOf ?? ((dir, plan) => show(plan, { cwd: dir, offline: true }));
  let sent = deps.sent;
  if (!sent) try { sent = readSent(originCwd); } catch { sent = {}; }

  const repos = new Map();
  const repo = (dir) => {
    if (!repos.has(dir)) {
      let r = null;
      if (!spent()) try { r = norm((deps.repoOf ?? repoOfGit)(dir)); } catch { /* no answer: the row stays */ }
      repos.set(dir, r);
    }
    return repos.get(dir);
  };
  const foreign = (s) => {
    if (!s.originCwd || !originCwd || norm(s.originCwd) === norm(originCwd)) return false;
    const mine = repo(originCwd);
    const theirs = mine && repo(s.originCwd);
    return !!theirs && theirs !== mine;
  };
  const direct = sessions.filter((s) => s.parentSessionId === self && !s.isArchived && !foreign(s));
  if (!direct.length) return [];

  const family = sessions.map((s) => ({ ...s, state: stateOf(s, states) }));
  const ids = new Set(direct.map((s) => s.sessionId));
  const cache = new Map();
  const failed = new Set();
  const rest = []; // descendants of the rows; the list also holds the parent and siblings of this session
  const seen = new Set(ids);
  for (let grew = true; grew;) {
    grew = false;
    for (const s of family) if (!seen.has(s.sessionId) && s.sessionId !== self && !s.isArchived && seen.has(s.parentSessionId)) { seen.add(s.sessionId); rest.push(s); grew = true; }
  }
  let count = 0;
  for (const s of [...family.filter((x) => ids.has(x.sessionId)), ...rest]) {
    if (!s.originCwd) { failed.add(s.sessionId); continue; }
    if (count >= FACTS_MAX || spent()) continue;
    count += 1;
    try { cache.set(s.sessionId, factsOf(s)); } catch { failed.add(s.sessionId); }
  }
  const out = classify(family, {
    self, sent,
    factsOf: (s) => { if (!cache.has(s.sessionId)) throw new Error('no facts'); return cache.get(s.sessionId); },
    ownerOf: (dir, plan) => (spent() ? null : ownerOf(dir, plan)),
  });

  const rows = family.filter((s) => ids.has(s.sessionId)).map((s) => {
    const f = cache.get(s.sessionId);
    const plans = f?.plans ?? [];
    const current = plans.find((p) => !finished(p)) ?? plans[0] ?? null;
    const by = (list) => list.find((x) => x.sessionId === s.sessionId);
    const row = {
      id: s.sessionId, title: s.title ?? s.sessionId, state: s.state, ready: !!by(out.archive),
      stage: current ? (current.intentOnly ? 'intent' : current.status) : null,
      done: current?.done ?? 0, total: current?.total ?? 0,
      code: null, arg: '', next: null, wait: false,
    };
    const fill = (r) => {
      if (r.step) return Object.assign(row, { code: 'step', next: r.step });
      const code = r.code ?? null;
      const arg = r.arg ?? '';
      return Object.assign(row, { code, arg, next: nextFor(code, arg, plans, current), wait: WAIT.has(code) });
    };
    const message = by(out.message);
    if (message) return fill(message);
    const w = by(out.waiting);
    if (!w) return row; // archive or working
    if (w.code === 'nested' && f) {
      const d = decide(s, f);
      return d.group === 'archive' ? fill(w) : fill(d); // its own step shows; live children only keep it from ready
    }
    if (w.code === 'git' && !f && !failed.has(s.sessionId)) return row; // past FACTS_MAX or the budget: the state only
    return fill(w);
  });
  const rank = (r) => (r.wait ? 0 : r.state === 'working' ? 1 : r.ready ? 4 : r.state === 'unknown' ? 3 : 2);
  return rows.sort((a, b) => rank(a) - rank(b)); // stable: the list's order inside a group
}

function main() {
  const input = JSON.parse(readFileSync(0, 'utf8'));
  if (!input?.self) throw new Error('self is required');
  if (!Array.isArray(input.sessions)) throw new Error('sessions must be a list');
  process.stdout.write(JSON.stringify({ rows: panelRows(input) }) + '\n');
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main();
  } catch (e) {
    process.stderr.write(`panel: ${String(e.message).split('\n')[0]}\n`);
    process.exit(1);
  }
}
