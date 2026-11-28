#!/usr/bin/env node
// Sattva · owner — one session per plan. The owner record of a plan lives on the service branch
// `sattva/owners` (one `<plan folder>.json` per plan); the work tree and HEAD are never touched (plumbing only).
// CLI:  owner.mjs take|beat|release|show <plan.md> [--stage implement|fix] [--force] [--any]
//       → one JSON line; exit 0 = may work, 3 = may not, 1 = error.
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

export const STALE_MS = 2 * 60 * 60 * 1000;
const REF = 'refs/heads/sattva/owners';
const RREF = 'refs/remotes/origin/sattva/owners';
const STAGES = ['implement', 'fix'];

function ctx(plan, opts = {}) {
  const env = opts.env ?? process.env;
  const abs = resolve(opts.cwd ?? process.cwd(), plan);
  if (basename(abs) !== 'plan.md' || !existsSync(abs)) throw new Error(`no plan.md: ${abs}`);
  const dir = dirname(abs);
  let cwd = dir; // the repo root once known: index paths (update-index) are relative to the cwd
  const genv = {
    ...env, LC_ALL: 'C', GIT_TERMINAL_PROMPT: '0',
    GIT_AUTHOR_NAME: 'sattva', GIT_AUTHOR_EMAIL: 'sattva@invalid', GIT_COMMITTER_NAME: 'sattva', GIT_COMMITTER_EMAIL: 'sattva@invalid',
  };
  const git = (args, extra = {}) => {
    const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8', env: { ...genv, ...(extra.env ?? {}) }, input: extra.input, timeout: 60000 });
    if (r.error) throw new Error(`git ${args[0]}: ${r.error.message}`);
    return { code: r.status, out: (r.stdout ?? '').replace(/\r/g, '').trim(), err: (r.stderr ?? '').trim() };
  };
  const ok = (args, extra) => {
    const r = git(args, extra);
    if (r.code !== 0) throw new Error(r.err.split('\n')[0] || `git ${args[0]} exited ${r.code}`);
    return r.out;
  };
  const top = ok(['rev-parse', '--show-toplevel']);
  cwd = top;
  const place = env.CLAUDE_CODE_REMOTE === 'true' ? `cloud ${env.CLAUDE_CODE_REMOTE_SESSION_ID ?? ''}`.trim() : `local ${basename(top)}`;
  const branch = ok(['rev-parse', '--abbrev-ref', 'HEAD']); // detached → `HEAD`, stable across the task commits
  const now = opts.now === undefined ? Date.now() : +opts.now;
  return { env, key: basename(dir), git, ok, place, branch, now, origin: git(['remote', 'get-url', 'origin']).code === 0 };
}

const sha = (c, ref) => { const r = c.git(['rev-parse', '-q', '--verify', `${ref}^{commit}`]); return r.code === 0 ? r.out : null; };
const recAt = (c, commit) => {
  if (!commit) return null;
  const r = c.git(['show', `${commit}:${c.key}.json`]);
  if (r.code !== 0) return null;
  try { return JSON.parse(r.out); } catch { return null; }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const fetchTip = (c) => c.origin && c.git(['fetch', '-q', '--no-tags', 'origin', `+${REF}:${RREF}`]).code === 0;

// The record of this plan. Fetched → origin wins; the local branch counts only for what was written locally and
// has not reached origin (3-way against the merge base, so a record released on origin never comes back as a ghost).
function readRec(c, fetched, l, r) {
  if (!fetched) return recAt(c, l ?? r);
  const R = recAt(c, r);
  if (!l || l === r || c.git(['merge-base', '--is-ancestor', l, r]).code === 0) return R;
  const L = recAt(c, l);
  const mb = c.git(['merge-base', l, r]);
  const B = mb.code === 0 ? recAt(c, mb.out) : null;
  if (same(L, B)) return R;
  if (same(R, B) || !R) return L;
  if (!L) return R;
  return Date.parse(L.beat) > Date.parse(R.beat) ? L : R;
}

// A commit on top of `base` with this plan's file set to `rec` (null = removed); the index is a temp file.
function commitOn(c, base, rec, msg) {
  const tmp = mkdtempSync(join(tmpdir(), 'ks-owner-'));
  const env = { GIT_INDEX_FILE: join(tmp, 'index') };
  try {
    c.ok(base ? ['read-tree', base] : ['read-tree', '--empty'], { env });
    if (rec) {
      const blob = c.ok(['hash-object', '-w', '--stdin'], { input: JSON.stringify(rec, null, 2) + '\n' });
      c.ok(['update-index', '--add', '--cacheinfo', `100644,${blob},${c.key}.json`], { env });
    } else c.ok(['update-index', '--force-remove', `${c.key}.json`], { env });
    const tree = c.ok(['write-tree'], { env });
    return c.ok(['commit-tree', tree, ...(base ? ['-p', base] : []), '-m', msg]);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// One CAS round: fetch, decide, write; a push rejected as non-fast-forward is retried once from a fresh fetch,
// a lost local CAS (another worktree wrote the local branch after the decision) is decided again.
function run(c, opts, decide) {
  for (let attempt = 0, lost = 0; ; attempt++) {
    const fetched = opts.offline || (attempt === 0 && opts.fetch === false) ? false : fetchTip(c);
    const seen = sha(c, REF); // one snapshot for the decision, the commit base and the local CAS
    const seenR = sha(c, RREF);
    const cur = readRec(c, fetched, seen, seenR);
    const d = decide(cur);
    if (!('write' in d) || opts.offline) return d.result;
    opts.beforeWrite?.(); // test hook: another session writes between the decision and the CAS
    const msg = `sattva: ${d.write ? 'own' : 'release'} ${c.key}`;
    let warning;
    if (c.origin) {
      const base = fetched ? seenR : seen ?? seenR;
      const next = commitOn(c, base, d.write, msg);
      const p = c.git(['push', '--porcelain', '--no-verify', 'origin', `${next}:${REF}`]);
      if (p.code === 0) {
        c.ok(['update-ref', REF, next]);
        c.ok(['update-ref', RREF, next]); // the push may not update it for a sha source
        return { ...d.result, remote: 'pushed' };
      }
      const bang = p.out.split('\n').find((l) => l.startsWith('!'));
      if (bang && /\[rejected\]/.test(bang) && attempt === 0) continue; // someone moved the tip: decide again
      warning = `push в origin не прошёл (${(bang?.split('\t').pop() || p.err.split('\n')[0] || `exit ${p.code}`).trim()}) — метка только локальная`;
    } else warning = 'нет origin — метка только локальная, её видят только worktree этой машины';
    // ponytail: fallback keeps the other plans of the local branch; a pushed commit later drops records that never reached origin
    const next = commitOn(c, seen ?? seenR, d.write, msg);
    const u = c.git(['update-ref', REF, next, seen ?? '']);
    if (u.code === 0) return { ...d.result, remote: 'local', warning };
    if (++lost >= 3) throw new Error(`sattva/owners: the local branch keeps moving (${u.err.split('\n')[0]})`);
    // lost: decide again on the new tip
  }
}

const off = (opts) => (opts.env ?? process.env).SATTVA_GATES === 'off';
const live = (c, rec) => !!rec && c.now - Date.parse(rec.beat) <= STALE_MS;
const mine = (c, rec) => !!rec && rec.place === c.place && rec.branch === c.branch;
const record = (c, stage, prev) => {
  const t = new Date(c.now).toISOString();
  return { plan: c.key, place: c.place, branch: c.branch, stage, since: mine(c, prev) ? prev.since : t, beat: t };
};
const needStage = (s) => { if (!STAGES.includes(s)) throw new Error(`--stage must be ${STAGES.join('|')}`); return s; };

export function take(plan, opts = {}) {
  if (off(opts)) return { ok: true, off: true };
  const stage = needStage(opts.stage);
  const c = ctx(plan, opts);
  return run(c, opts, (cur) => {
    if (!cur || mine(c, cur)) return { write: record(c, stage, cur), result: { ok: true } };
    if (!opts.force) return { result: { ok: false, owner: cur, stale: !live(c, cur) } };
    return { write: record(c, stage, null), result: { ok: true, took_over: cur } };
  });
}

export function beat(plan, opts = {}) {
  if (off(opts)) return { ok: true, off: true };
  const stage = needStage(opts.stage);
  const c = ctx(plan, opts);
  return run(c, opts, (cur) => {
    if (cur && !mine(c, cur)) return { result: { ok: false, taken: true, owner: cur } };
    return { write: record(c, stage, cur), result: { ok: true } };
  });
}

export function release(plan, opts = {}) {
  if (off(opts)) return { ok: true, off: true };
  const c = ctx(plan, opts);
  return run(c, opts, (cur) => {
    if (!cur) return { result: { ok: true, released: false } };
    if (!mine(c, cur) && !opts.any) return { result: { ok: true, released: false, owner: cur } };
    return { write: null, result: { ok: true, released: true } };
  });
}

export function show(plan, opts = {}) {
  if (off(opts)) return { ok: true, off: true };
  const c = ctx(plan, opts);
  return run(c, opts, (cur) => ({ result: { owner: cur, mine: mine(c, cur), live: live(c, cur) } }));
}

function main(argv) {
  // flags anywhere: the skills write `release --any <plan>` as well as `take <plan> --stage fix`
  const { values, positionals } = parseArgs({
    args: argv, allowPositionals: true,
    options: { stage: { type: 'string' }, force: { type: 'boolean' }, any: { type: 'boolean' } },
  });
  const [cmd, plan, extra] = positionals;
  const fns = { take, beat, release, show };
  if (!fns[cmd] || !plan || extra) throw new Error('usage: owner.mjs take|beat|release|show <plan.md> [--stage implement|fix] [--force] [--any]');
  const r = fns[cmd](plan, { stage: values.stage, force: !!values.force, any: !!values.any });
  process.stdout.write(JSON.stringify(r) + '\n');
  return r.ok === false ? 3 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    process.exitCode = main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`owner: ${e.message}\n`);
    process.exitCode = 1;
  }
}
