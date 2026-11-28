// original Sattva file (MIT)
// Sattva · rush — does this plan run in rush mode, and the closing line of a rush chain.
// CLI:  rush.mjs pace <plan.md>     → `pace: rush` | `pace: normal — <why>` | `pace: unavailable — <why>`
//       rush.mjs summary <plan.md>  → `rush: <verdict> · с одобрения <H>ч <M>мин (<sha7>) · прогонов verify <n>`
// Errors: `rush: <message>` on stderr, exit 1. Git runs from the repository root, the plan path is made root-relative.
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const COLLECT = join(HERE, '..', '..', 'verify', 'scripts', 'collect.mjs');

function ctx(plan, cwd = process.cwd()) {
  const abs = resolve(cwd, plan);
  if (!existsSync(abs)) throw new Error(`no plan: ${abs}`);
  const r = spawnSync('git', ['-C', dirname(abs), 'rev-parse', '--show-toplevel'], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`not a git repository: ${dirname(abs)}`);
  const root = r.stdout.trim();
  const rel = relative(root, abs).replace(/\\/g, '/');
  const git = (...args) => {
    const g = spawnSync('git', ['-C', root, ...args], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
    if (g.status !== 0) throw new Error(`git ${args[0]}: ${(g.stderr || '').trim()}`);
    return g.stdout;
  };
  return { abs, root, rel, git };
}

// the header = the lines before `## Original Request`
const header = (text) => text.replace(/\r\n/g, '\n').split('\n## Original Request')[0].split('\n');
const hasPace = (text) => header(text).some((l) => l.trim() === 'Pace: rush');
const status = (text) => (header(text).join('\n').match(/Status:\s*([\w-]+)/) || [])[1];

// the approval commit: the oldest commit of plan.md whose header Status is not draft
function approval(c) {
  for (const sha of c.git('log', '--reverse', '--format=%H', '--', c.rel).split('\n').filter(Boolean)) {
    const text = c.git('show', `${sha}:${c.rel}`);
    const s = status(text);
    if (s && s !== 'draft') return { sha, text };
  }
  return null;
}

export function pace(plan, { cwd, env = process.env } = {}) {
  const c = ctx(plan, cwd);
  if (!hasPace(readFileSync(c.abs, 'utf8'))) return 'pace: normal — no Pace line';
  const a = approval(c);
  if (!a) return 'pace: normal — not approved in git';
  if (!hasPace(a.text)) return 'pace: normal — added after approval';
  const depth = env.CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH;
  if (depth !== undefined && /^-?\d+$/.test(depth.trim()) && Number(depth) < 2) return `pace: unavailable — CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH=${depth.trim()}`;
  return 'pace: rush';
}

export function summary(plan, { cwd } = {}) {
  const c = ctx(plan, cwd);
  const a = approval(c);
  if (!a) throw new Error('not approved in git');
  const vrel = `${dirname(c.rel)}/verify.md`.replace(/^\.\//, '');
  const vabs = join(c.root, vrel);
  const vlast = c.git('log', '-1', '--format=%ct', '--', vrel).trim();
  const verdict = existsSync(vabs) ? (readFileSync(vabs, 'utf8').match(/Verdict:\s*(PASS-UNPROVEN|PASS|FAIL)/) || [])[1] || 'no verdict' : 'no verdict';
  const end = Number(vlast || c.git('log', '-1', '--format=%ct', 'HEAD').trim());
  const mins = Math.max(0, Math.floor((end - Number(c.git('log', '-1', '--format=%ct', a.sha).trim())) / 60));
  let n = 0;
  if (vlast) {
    const h = spawnSync(process.execPath, [COLLECT, c.rel, '--history'], { cwd: c.root, encoding: 'utf8' });
    n = Number(((h.stdout || '').match(/^history: (\d+) runs/m) || [])[1] || 0);
  }
  return `rush: ${verdict} · с одобрения ${Math.floor(mins / 60)}ч ${mins % 60}мин (${a.sha.slice(0, 7)}) · прогонов verify ${n}`;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [cmd, plan] = process.argv.slice(2);
  try {
    if (!plan || !['pace', 'summary'].includes(cmd)) throw new Error('usage: node rush.mjs pace|summary <plan.md>');
    console.log(cmd === 'pace' ? pace(plan) : summary(plan));
  } catch (e) { console.error(`rush: ${e.message}`); process.exit(1); }
}
