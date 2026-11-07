#!/usr/bin/env node
// Keystone · sessions — classify the child sessions of a main session: archive / message / waiting.
// The decision is mechanical (git + plan files); the model only gathers the input and carries out the result.
// CLI:  triage.mjs classify <sessions.json> --self <sessionId>   → JSON { archive, message, waiting, working }
//       triage.mjs git                                          → read-only table for the worktrees of this repo
//       triage.mjs sent <sessionId> <step>                      → remember that <step> was sent to <sessionId>
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve, isAbsolute, basename } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const PLAN_PATH = /^docs\/keystone\/[A-Za-z0-9._-]+\/plan\.md$/;
const text = (step) => `Keystone: осталось — ${step}. Сделай этот шаг и закончи ход.`;

// Paths are compared only normalized: resolve, forward slashes, lower case on win32.
export const norm = (p) => {
  if (!p) return '';
  const s = resolve(p).replace(/\\/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? s.toLowerCase() : s;
};
const inside = (child, parent) => !!child && !!parent && child !== parent && child.startsWith(parent + '/');

function git(cwd, ...args) {
  const r = spawnSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });
  if (r.error) throw new Error(r.error.message);
  return { code: r.status, out: (r.stdout ?? '').replace(/\r/g, ''), err: (r.stderr ?? '').trim() };
}
function gitOk(cwd, ...args) {
  const r = git(cwd, ...args);
  if (r.code !== 0) throw new Error(r.err.split('\n')[0] || `git ${args[0]} exited ${r.code}`);
  return r.out;
}

// ponytail: copy of gate.mjs plans()/openRelease/openTasks — not exported there; share if a third copy appears
const section = (body, name) => {
  const out = [];
  let on = false;
  for (const l of body.split('\n')) {
    if (/^## /.test(l)) on = new RegExp(`^## ${name}\\b`).test(l);
    else if (on) out.push(l);
  }
  return out;
};
export function readPlan(body) {
  const lines = body.split('\n');
  const header = lines.find((l) => /^Level:/.test(l)) ?? lines.find((l) => /^Status:/.test(l)) ?? '';
  const status = header.match(/\bStatus:\s*([a-z]+)/i)?.[1]?.toLowerCase() ?? 'unknown';
  const unchecked = section(body, 'Tasks').filter((l) => /^\s*- \[ \]/.test(l));
  const open = unchecked.filter((l) => !l.includes('BLOCKED:'));
  const blocked = unchecked.length > 0 && open.length === 0 ? unchecked[0].split('BLOCKED:')[1].trim() : null;
  const release = section(body, 'Release').filter((l) => /^\s*- \[ \]/.test(l)).map((l) => l.match(/R\d+/)?.[0] ?? 'R?');
  return { status, open: open.length, blocked, release };
}

// `git status --porcelain -z`: plain paths (no quoting), a rename/copy entry is followed by its old path.
function status(dir, ignored) {
  const parts = gitOk(dir, 'status', '--porcelain', '-z', '-uall', ...(ignored ? ['--ignored=matching'] : [])).split('\0');
  const files = [];
  const kept = [];
  for (let i = 0; i < parts.length; i++) {
    const e = parts[i];
    if (!e) continue;
    if (/[RC]/.test(e.slice(0, 2))) i++; // skip the old path of a rename/copy
    // ponytail: an ignored folder (node_modules/, dist/) counts as regenerable, an ignored file (.env) as data
    if (e.startsWith('!! ')) { if (!e.endsWith('/')) kept.push(e.slice(3)); } else files.push(e.slice(3));
  }
  return { files, ignored: kept };
}

// Facts about one session from git and its plan files.
export function facts(s) {
  const origin = s.originCwd || s.worktreePath;
  const own = !!s.worktreePath && existsSync(s.worktreePath) && norm(s.worktreePath) !== norm(origin);
  const dir = own ? s.worktreePath : origin;
  const base = s.sourceBranch || 'main';
  const branch = s.branch;
  const ref = branch || 'HEAD'; // a detached worktree is judged by its HEAD
  const merged = git(dir, 'merge-base', '--is-ancestor', ref, base).code === 0;
  const ownCommits = Number(gitOk(dir, 'rev-list', '--count', `${base}..${ref}`).trim()) > 0;
  const { files, ignored } = status(dir, own); // the archive removes only an own worktree
  const folders = new Set();
  // план сессии — её невлитые коммиты (D19); влитое уже в базовой ветке
  const logArgs = ['log', '--no-merges', '--name-only', '--format=', `${base}..${ref}`, '--', 'docs/keystone'];
  for (const f of [...gitOk(dir, ...logArgs).split('\n'), ...files]) {
    const m = f.replace(/\\/g, '/').match(/^docs\/keystone\/([^/]+)\//);
    if (m) folders.add(m[1]);
  }
  const plans = [...folders].sort().reverse().flatMap((name) => {
    const rel = `docs/keystone/${name}`;
    const abs = join(dir, rel);
    const planFile = join(abs, 'plan.md');
    if (!existsSync(planFile)) return existsSync(join(abs, 'intent.md')) ? [{ name, path: `${rel}/plan.md`, intentOnly: true }] : [];
    const p = readPlan(readFileSync(planFile, 'utf8').replace(/\r/g, ''));
    const vFile = join(abs, 'verify.md');
    let verdict = null;
    let fixedAfterFail = false;
    if (existsSync(vFile)) {
      const all = [...readFileSync(vFile, 'utf8').matchAll(/Verdict:\s*(PASS-UNPROVEN|PASS|FAIL)/g)];
      verdict = all.at(-1)?.[1] ?? null;
      if (verdict === 'FAIL') {
        const last = gitOk(dir, 'log', '-1', '--format=%H', '--', `${rel}/verify.md`).trim();
        fixedAfterFail = !!last && Number(gitOk(dir, 'rev-list', '--count', `${last}..${branch || 'HEAD'}`).trim()) > 0;
      }
    }
    return [{ name, path: `${rel}/plan.md`, ...p, verify: existsSync(vFile), verdict, fixedAfterFail }];
  });
  return { own, merged, ownCommits, dirty: files.length > 0, files, ignored, plans };
}

const done = (p) => !p.intentOnly && p.status === 'verified' && p.release.length === 0;

// Rows 7–14 of the plan's rule table for one plan; null = this plan gives no result.
function planRow(p) {
  if (p.intentOnly) return null;
  if (p.fixedAfterFail) return { group: 'message', step: `/keystone:verify ${p.path}`, plan: p.path };
  if (p.verdict === 'FAIL') return { group: 'message', step: '/keystone:fix verify' };
  if (p.verdict === 'PASS-UNPROVEN' && p.status !== 'verified') return { group: 'waiting', reason: 'ждёт accept' };
  if (p.status === 'implementing' && p.blocked) return { group: 'waiting', reason: `BLOCKED: ${p.blocked}` };
  if ((p.status === 'approved' || p.status === 'implementing') && p.open > 0) return { group: 'message', step: `/keystone:implement ${p.path}`, plan: p.path };
  if (p.status === 'implementing' && p.open === 0 && !p.verify) return { group: 'message', step: `/keystone:verify ${p.path}`, plan: p.path };
  if (p.status === 'draft') return { group: 'waiting', reason: 'план ждёт Approve' };
  if (p.status === 'verified' && p.release.length) return { group: 'waiting', reason: `релиз: ${p.release.join(', ')} — ваш шаг` };
  return null;
}

// The rule table of the plan (Design → «Правило»), rows 6–21, for an idle session.
export function decide(s, f) {
  for (const p of f.plans.filter((x) => !done(x))) {
    const r = planRow(p);
    if (r) return r;
  }
  if (f.dirty && !f.merged && f.plans.every(done)) return { group: 'message', step: 'закоммить изменения' };
  if (f.dirty) return { group: 'waiting', reason: `незакоммиченные файлы: ${f.files.slice(0, 10).join(', ')}`, files: f.files.slice(0, 50) };
  if (f.ignored?.length) return { group: 'waiting', reason: `игнорируемые файлы удалятся с worktree: ${f.ignored.slice(0, 10).join(', ')}`, files: f.ignored.slice(0, 50) };
  const intent = f.plans.find((p) => p.intentOnly);
  if (intent) return { group: 'waiting', reason: 'intent без плана — `/keystone:plan`' };
  // a plan that is not verified-without-R<n> and gave no step above is never archived (I-2, I-3)
  if (f.plans.every(done)) {
    if (!f.own || !f.ownCommits || f.merged) return { group: 'archive' };
    return { group: 'waiting', reason: `влить ${s.branch || 'HEAD'} в ${s.sourceBranch || 'main'} — ваш шаг` };
  }
  return { group: 'waiting', reason: `не распознано: ${f.plans.map((p) => p.status ?? 'intent').join(', ')}` };
}

export function classify(sessions, { self, sent = {}, factsOf = facts } = {}) {
  if (!self) throw new Error('--self is required');
  const byId = new Map(sessions.map((s) => [s.sessionId, s]));
  const depth = (s) => {
    let d = 0;
    for (let p = s.parentSessionId; p !== self; p = byId.get(p)?.parentSessionId) {
      if (!p || !byId.has(p) || ++d > sessions.length) return -1; // chain ended without reaching --self
    }
    return d;
  };
  const family = sessions.filter((s) => s.sessionId !== self && !s.isArchived && depth(s) >= 0);
  if (!sessions.some((s) => s.parentSessionId === self)) throw new Error(`--self ${self}: no child sessions in input`);
  const isDesc = (d, a) => {
    for (let p = d.parentSessionId; p && p !== self; p = byId.get(p)?.parentSessionId) if (p === a.sessionId) return true;
    return false;
  };
  const out = { archive: [], message: [], waiting: [], working: 0 };
  const result = new Map();
  const put = (s, r) => {
    result.set(s.sessionId, r.group);
    const base = { sessionId: s.sessionId, title: s.title ?? s.sessionId };
    if (r.group === 'archive') out.archive.push({ ...base, depth: depth(s) });
    else if (r.group === 'message') out.message.push({ ...base, step: r.step, text: text(r.step) });
    else if (r.group === 'waiting') out.waiting.push({ ...base, reason: r.reason, ...(r.files ? { files: r.files } : {}) });
    else out.working += 1;
  };
  // deepest first, so a parent sees what happened to its children
  for (const s of [...family].sort((a, b) => depth(b) - depth(a))) {
    const state = s.state ?? 'unknown';
    if (state === 'working') { put(s, { group: 'working' }); continue; }
    if (state === 'failed' || state === 'stopped') { put(s, { group: 'waiting', reason: 'ход упал или остановлен' }); continue; }
    if (state === 'unknown') { put(s, { group: 'waiting', reason: 'состояние неизвестно — повторите разбор' }); continue; }
    if (state === 'waiting') { put(s, { group: 'waiting', reason: 'ждёт вашего ответа' }); continue; }
    const mine = norm(s.worktreePath);
    // a descendant already in this run's archive no longer counts; a worktree inside my own worktree always does —
    // not in the shared folder (worktreePath = originCwd), which holds every session's worktree (Design `nested`)
    const nested = family.some((o) => o !== s &&
      ((isDesc(o, s) && result.get(o.sessionId) !== 'archive') ||
        (mine && mine !== norm(s.originCwd) && (inside(norm(o.worktreePath), mine) || inside(norm(o.originCwd), mine)))));
    if (nested) { put(s, { group: 'waiting', reason: 'есть живые дочерние сессии' }); continue; }
    if (state !== 'idle') { put(s, { group: 'waiting', reason: `состояние ${state} не распознано` }); continue; }
    let r;
    try {
      r = decide(s, factsOf(s));
    } catch (e) {
      r = { group: 'waiting', reason: `git: ${String(e.message).split('\n')[0]}` };
    }
    if (r.group === 'message') {
      if (r.plan && !PLAN_PATH.test(r.plan)) r = { group: 'waiting', reason: 'путь плана не прошёл проверку' };
      else if (sent[s.sessionId]?.step === r.step) r = { group: 'waiting', reason: `не продвинулась после «${r.step}»` };
    }
    put(s, r);
  }
  out.archive.sort((a, b) => b.depth - a.depth);
  for (const a of out.archive) delete a.depth;
  return out;
}

// Worktrees of the repository at `root` as sessions for read-only mode (no session tools).
export function gitSessions(root) {
  const blocks = gitOk(root, 'worktree', 'list', '--porcelain').split('\n\n').filter((b) => b.trim());
  const entries = blocks.map((b) => ({
    path: b.match(/^worktree (.+)$/m)?.[1],
    branch: b.match(/^branch refs\/heads\/(.+)$/m)?.[1],
  }));
  const [main, ...rest] = entries;
  return rest.filter((w) => w.path).map((w) => {
    const name = basename(w.path);
    return { sessionId: name, title: name, state: 'idle', parentSessionId: '__main__', worktreePath: w.path, originCwd: main.path, branch: w.branch, sourceBranch: main.branch };
  });
}

function storeFile(cwd = process.cwd()) {
  const dir = gitOk(cwd, 'rev-parse', '--git-common-dir').trim();
  return join(isAbsolute(dir) ? dir : resolve(cwd, dir), 'keystone-sessions.json');
}
export const readSent = (cwd) => {
  const f = storeFile(cwd);
  return existsSync(f) ? JSON.parse(readFileSync(f, 'utf8')) : {};
};
export function recordSent(id, step, cwd) {
  const all = readSent(cwd);
  all[id] = { step, at: new Date().toISOString() };
  writeFileSync(storeFile(cwd), JSON.stringify(all, null, 2) + '\n');
}

function main(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === 'classify') {
    const i = rest.indexOf('--self');
    const self = i >= 0 ? rest[i + 1] : null;
    const file = rest.find((a, k) => !a.startsWith('--') && rest[k - 1] !== '--self');
    const sessions = JSON.parse(readFileSync(file, 'utf8'));
    process.stdout.write(JSON.stringify(classify(sessions, { self, sent: readSent() }), null, 2) + '\n');
  } else if (cmd === 'git') {
    const list = gitSessions(process.cwd());
    const out = list.length ? classify(list, { self: '__main__', sent: readSent() }) : { archive: [], message: [], waiting: [] };
    const rows = [
      ...out.archive.map((a) => `${a.title} · готово к архиву · —`),
      ...out.message.map((m) => `${m.title} · осталось · ${m.step}`),
      ...out.waiting.map((w) => `${w.title} · ждёт тебя · ${w.reason}`),
    ];
    process.stdout.write(['worktree · группа · шаг или причина', ...rows, 'инструментов сессий нет — разбор только для чтения'].join('\n') + '\n');
  } else if (cmd === 'sent' && rest.length >= 2) {
    recordSent(rest[0], rest.slice(1).join(' '));
  } else {
    throw new Error('usage: triage.mjs classify <sessions.json> --self <id> | git | sent <sessionId> <step>');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`triage: ${e.message}\n`);
    process.exit(1);
  }
}
