// Renders the images for the Twitter series into docs/social/twitter/img/*.png (1600x900).
// The gate and test cards are built from live output: the real hooks/gate.mjs on a throwaway repo and a real `npm test`.
// Usage: node docs/social/twitter/cards.mjs   (needs Playwright; set NODE_PATH to a global node_modules if it is global)
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { decide } from '../../../hooks/gate.mjs';
import { parsePlan, statusText, costLine } from '../../../hooks/keystone.ts'; // Node strips the types

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const out = join(here, 'img');
mkdirSync(out, { recursive: true });

// ---------- live data ----------
const git = (root, ...a) => spawnSync('git', ['-C', root, ...a], { stdio: 'ignore' });
function gateRuns() {
  const root = mkdtempSync(join(tmpdir(), 'ks-card-'));
  const task = 'docs/keystone/2026-10-12-invoice-reminders';
  const plan = (mode, status) => writeFileSync(join(root, task, 'plan.md'), `# Plan: invoice reminders\n\nLevel: L · Mode: ${mode} · Status: ${status}\n\n## Tasks\n- [ ] 1. reminder table\n`);
  git(root, 'init', '-q');
  mkdirSync(join(root, task), { recursive: true });
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/invoice.test.ts'), 'x');
  plan('feature', 'draft');
  git(root, 'add', '-A');
  git(root, '-c', 'user.name=d', '-c', 'user.email=d@d', 'commit', '-qm', 'init');
  const pre = (tool_name, tool_input) => decide({ hook_event_name: 'PreToolUse', cwd: root, tool_name, tool_input }, {});
  const r = {};
  r.draftEdit = pre('Edit', { file_path: 'src/billing.ts' });
  r.draftPlanEdit = pre('Edit', { file_path: `${task}/plan.md` });
  plan('feature', 'implementing');
  r.push = pre('Bash', { command: 'git push origin main' });
  r.commit = pre('Bash', { command: 'git commit -m "reminders"' });
  r.stop = decide({ hook_event_name: 'Stop', cwd: root }, {});
  plan('fix', 'implementing');
  r.fixOld = pre('Write', { file_path: 'src/invoice.test.ts' });
  r.fixNew = pre('Write', { file_path: 'src/invoice.rounding.test.ts' });
  plan('feature', 'verified');
  r.verifiedPush = pre('Bash', { command: 'git push origin main' });
  rmSync(root, { recursive: true, force: true });
  return r;
}
function testRun() {
  const files = readdirSync(join(repo, 'test')).filter((f) => f.endsWith('.test.mjs')).map((f) => join('test', f));
  const t = spawnSync(process.execPath, ['--test', ...files], { cwd: repo, encoding: 'utf8' });
  const lines = t.stdout.split('\n');
  const oks = lines.filter((l) => /^(not )?ok \d+ - /.test(l));
  const num = (k) => Number(lines.find((l) => l.startsWith(`# ${k} `))?.split(' ')[2] ?? NaN);
  return { oks, tests: num('tests'), pass: num('pass'), fail: num('fail'), ms: Math.round(num('duration_ms')) };
}

const G = gateRuns();
const T = testRun();
if (T.fail !== 0 || !T.tests) throw new Error(`tests are not green (${T.pass}/${T.tests}) — fix them before rendering the cards`);
const reason = (r) => r?.hookSpecificOutput?.permissionDecisionReason ?? r?.reason ?? '';

// ---------- design ----------
const css = `
:root{--bg1:#0b1020;--bg2:#151b2e;--stone:#2a3350;--edge:#3b4668;--key:#f5b83d;--keyEdge:#ffd47a;--title:#f3f5fb;--sub:#a7b0c8;--chip:#1d2540;--chipText:#d6dcef;--muted:#5b678c;
--ok:#4ade80;--warn:#f5b83d;--bad:#f87171;--term:#070b16}
*{box-sizing:border-box;margin:0;padding:0}
html,body{width:1600px;height:900px}
body{background:linear-gradient(135deg,var(--bg1),var(--bg2));color:var(--title);font-family:Inter,'Segoe UI',Arial,sans-serif;padding:72px 88px;display:flex;flex-direction:column;position:relative;overflow:hidden}
.mono,code,pre{font-family:'JetBrains Mono','DejaVu Sans Mono',Consolas,monospace}
.eyebrow{font-size:24px;letter-spacing:.14em;text-transform:uppercase;color:var(--key);font-weight:700;margin-bottom:18px}
h1{font-size:72px;line-height:1.04;font-weight:800;letter-spacing:-.02em;max-width:1300px}
h1 em{font-style:normal;color:var(--key)}
.lede{font-size:30px;color:var(--sub);margin-top:22px;max-width:1260px;line-height:1.35}
.foot{position:absolute;left:88px;right:88px;bottom:44px;display:flex;justify-content:space-between;align-items:center;font-size:22px;color:var(--muted)}
.foot b{color:var(--sub);font-weight:600}
.brand{display:flex;align-items:center;gap:12px}
.ks{width:22px;height:30px;background:var(--key);clip-path:polygon(12% 0,88% 0,100% 100%,0 100%);border-radius:3px}
.grow{flex:1}
.row{display:flex;gap:28px}
.card{background:var(--chip);border:1.5px solid var(--edge);border-radius:22px;padding:34px 36px;flex:1}
.term{background:var(--term);border:1.5px solid var(--edge);border-radius:18px;overflow:hidden}
.term .bar{display:flex;gap:9px;padding:16px 20px;border-bottom:1px solid #1b2340;align-items:center}
.term .bar i{width:13px;height:13px;border-radius:50%;background:#2a3350;display:block}
.term .bar span{margin-left:14px;font-size:18px;color:var(--muted)}
.term pre{padding:24px 28px;font-size:22px;line-height:1.55;color:#c9d1e8;white-space:pre-wrap;word-break:break-word}
.k{color:var(--key)} .g{color:var(--ok)} .r{color:var(--bad)} .m{color:var(--muted)} .w{color:var(--title)}
.pill{display:inline-block;padding:6px 16px;border-radius:99px;font-weight:700;font-size:20px}
`;
const foot = (n) => `<div class="foot"><div class="brand"><div class="ks"></div><b>Keystone</b>&nbsp;· plugin for Claude Code</div><div class="mono">github.com/sattva2020/keystone${n ? ` · ${n}` : ''}</div></div>`;
const page = (body, n) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head><body>${body}${foot(n)}</body></html>`;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const wrapJSON = (o) => esc(JSON.stringify(o, null, 2));

const cards = {};

cards['01-hero'] = page(`
<div class="eyebrow">Open-source · MIT · Claude Code plugin</div>
<h1>Process sized to the change.<br><em>Intent first.</em> The plan is the spec.</h1>
<p class="lede">An independent check before the code and after it. Hard rules held by hooks, not by prompt text.</p>
<div class="row" style="gap:18px;align-items:center;margin-top:120px">
${['grill', 'intent', 'plan', 'check', 'implement', 'verify'].map((s, i) => `<div class="mono" style="padding:16px 28px;border-radius:99px;font-size:30px;font-weight:${s === 'intent' ? 800 : 500};background:${s === 'intent' ? 'var(--key)' : 'var(--chip)'};color:${s === 'intent' ? '#1a1300' : 'var(--chipText)'};border:1.5px solid ${s === 'intent' ? 'var(--keyEdge)' : 'var(--edge)'}">${s}</div>${i < 5 ? '<div style="font-size:30px;color:var(--muted)">→</div>' : ''}`).join('')}
</div>`, 'intro');

const lvl = (l, color, signs, route, gets) => `<div class="card" style="border-top:6px solid ${color};padding:26px 32px">
<div style="display:flex;align-items:baseline;gap:18px"><div style="font-size:72px;font-weight:800;color:${color};line-height:1">${l}</div></div>
<div style="font-size:24px;color:var(--sub);margin:12px 0 8px;text-transform:uppercase;letter-spacing:.1em">signs</div><div style="font-size:27px;line-height:1.35">${signs}</div>
<div style="font-size:24px;color:var(--sub);margin:16px 0 8px;text-transform:uppercase;letter-spacing:.1em">route</div><div class="mono" style="font-size:22px;line-height:1.5;color:var(--chipText)">${route}</div>
<div style="font-size:24px;color:var(--sub);margin:16px 0 8px;text-transform:uppercase;letter-spacing:.1em">you get</div><div style="font-size:25px;line-height:1.35">${gets}</div></div>`;
cards['02-levels'] = page(`
<div class="eyebrow">/keystone:start &lt;task&gt;</div>
<h1 style="font-size:56px">Not every change needs six stages.</h1>
<div class="row" style="margin-top:30px;margin-bottom:70px">
${lvl('S', 'var(--ok)', 'the diff fits in one sentence; nothing for you to decide', 'edit → check → report', 'the change and a one-line report. No files.')}
${lvl('M', '#60a5fa', 'one obvious approach, several files', 'plan → approve →<br>implement → verify', '<code>plan.md</code> with 3 risks, <code>verify.md</code>')}
${lvl('L', 'var(--key)', 'open decisions · data/schema · security · fuzzy "done"', 'intent → plan + check →<br>/clear → implement → verify', '<code>intent.md</code>, <code>plan.md</code> with coverage, <code>verify.md</code>')}
</div>`, 'levels');

cards['03-gate-draft'] = page(`
<div class="eyebrow">Hooks, not prompts · gate 1 of 4</div>
<h1 style="font-size:56px">The plan is still <em>draft</em>. The agent tries to edit code.</h1>
<div class="term" style="margin-top:38px"><div class="bar"><i></i><i></i><i></i><span>PreToolUse · Edit src/billing.ts → node hooks/gate.mjs</span></div>
<pre>${wrapJSON(G.draftEdit).replace(/"deny"/, '<span class="r">"deny"</span>')}</pre></div>
<p class="lede" style="font-size:26px;margin-top:26px">Edits to <code class="k">plan.md</code> inside the task folder: <span class="g">${G.draftPlanEdit === null ? 'allowed' : 'DENIED'}</span>. Everything else waits for Approve.</p>`, 'gates');

cards['04-gate-push'] = page(`
<div class="eyebrow">Hooks, not prompts · gates 2–3 of 4</div>
<h1 style="font-size:56px">No <em>git push</em> before verify. No quiet stop with open tasks.</h1>
<div class="row" style="margin-top:36px;gap:24px">
<div class="term" style="flex:1"><div class="bar"><i></i><i></i><i></i><span>Bash · git push origin main</span></div>
<pre><span class="r">permissionDecision: deny</span>

${esc(reason(G.push).split(' To lift')[0])}

<span class="m">git commit → ${G.commit === null ? '<span class="g">allowed</span>' : 'denied'}
plan verified, git push → ${G.verifiedPush === null ? '<span class="g">allowed</span>' : 'denied'}</span></pre></div>
<div class="term" style="flex:1"><div class="bar"><i></i><i></i><i></i><span>Stop · end of turn</span></div>
<pre><span class="r">decision: ${esc(G.stop.decision)}</span>

${esc(reason(G.stop).split(' If you are waiting')[0])}</pre></div>
</div>`, 'gates');

cards['05-fix'] = page(`
<div class="eyebrow">/keystone:fix · gate 4 of 4</div>
<h1 style="font-size:60px">Regression test first.<br>And the agent can't <em>"fix" the old tests.</em></h1>
<div class="row" style="margin-top:44px;gap:24px">
<div class="term" style="flex:1.25"><div class="bar"><i></i><i></i><i></i><span>Write src/invoice.test.ts  (committed in HEAD)</span></div>
<pre><span class="r">deny</span>
${esc(reason(G.fixOld).split(' To lift')[0])}</pre></div>
<div class="term" style="flex:.75"><div class="bar"><i></i><i></i><i></i><span>Write src/invoice.rounding.test.ts</span></div>
<pre>${G.fixNew === null ? '<span class="g">allowed</span>\n\n<span class="m">a new file is the\nregression test:\nit fails first,\nthen the smallest fix\nmakes it pass.</span>' : 'denied'}</pre></div>
</div>`, 'fix');

const verdict = (name, color, text) => `<div class="card" style="border-left:8px solid ${color}"><div class="mono" style="font-size:40px;font-weight:800;color:${color}">${name}</div><div style="font-size:27px;line-height:1.4;margin-top:16px;color:var(--chipText)">${text}</div></div>`;
cards['06-verify'] = page(`
<div class="eyebrow">/keystone:verify · fresh context</div>
<h1 style="font-size:60px">A checked box is not evidence.</h1>
<p class="lede" style="font-size:27px">Build, tests and lint run first. Then a separate verifier, with none of the implementer's chat, grades every task and every intent line: <span class="mono">ok · missing · wrong · not proven · BLOCKED</span>.</p>
<div class="row" style="margin-top:38px;gap:22px;margin-bottom:60px">
${verdict('PASS', 'var(--ok)', 'Every row has evidence. Status → verified, <code>git push</code> opens.')}
${verdict('PASS-UNPROVEN', 'var(--warn)', 'Nothing wrong, but something has no proof (e.g. email delivery). Push stays closed until you prove it or <code>accept</code> it.')}
${verdict('FAIL', 'var(--bad)', 'Missing, wrong or unrequested work. Every <code>wrong</code> comes with a <code>Repro:</code> line.')}
</div>`, 'verify');

const shown = T.oks.slice(0, 11).map((l) => esc(l.length > 104 ? l.slice(0, 101) + '…' : l).replace(/^ok/, '<span class="g">ok</span>')).join('\n');
cards['07-tests'] = page(`
<div class="eyebrow">How do you test a workflow made of prompts?</div>
<h1 style="font-size:54px">Contract tests on the skill text, behaviour tests on the hooks. <em>${T.pass}/${T.tests} green.</em></h1>
<div class="term" style="margin-top:32px"><div class="bar"><i></i><i></i><i></i><span>$ npm test</span></div>
<pre style="font-size:19px;line-height:1.5">${shown}
<span class="m">…</span>
<span class="w"># tests ${T.tests}</span>   <span class="g"># pass ${T.pass}</span>   <span class="w"># fail ${T.fail}</span>   <span class="m"># duration ${(T.ms / 1000).toFixed(1)}s · node --test, zero dependencies</span></pre></div>`, 'tests');

const bar = (label, real, fals, cost, hi) => `<div style="margin-bottom:34px"><div style="display:flex;justify-content:space-between;font-size:30px;margin-bottom:14px"><b style="color:${hi ? 'var(--key)' : 'var(--title)'}">${label}</b><span class="mono" style="color:var(--sub);font-size:24px">${cost}</span></div>
<div style="display:flex;gap:8px;height:64px">${Array.from({ length: real }, () => `<div style="width:110px;background:var(--ok);border-radius:10px"></div>`).join('')}${Array.from({ length: fals }, () => `<div style="width:110px;background:var(--bad);border-radius:10px"></div>`).join('')}</div>
<div style="font-size:24px;color:var(--sub);margin-top:10px"><span class="g">${real} real</span> · <span class="${fals ? 'r' : 'm'}">${fals} false</span></div></div>`;
cards['08-check'] = page(`
<div class="eyebrow">/keystone:check · blind comparison</div>
<h1 style="font-size:56px">Two checkers, the same two plans, <em>before any code.</em></h1>
<div style="margin-top:46px">
${bar('Keystone check  (analyzer + validator, clean contexts)', 6, 0, '$10.43', true)}
${bar('AI Factory improve +check', 2, 1, '$9.96', false)}
</div>
<p style="font-size:23px;color:var(--muted);margin-top:4px">Real Next.js + NestJS + Supabase monorepo, fresh clones, Opus graders saw shuffled, unlabeled findings. n = 1 — a signal, not a statistic.</p>`, 'check');

// the mod's own parser and /keystone-status text on a sample plan (13 done, 1 BLOCKED) and a sample cost ledger
const statusPlan = parsePlan('docs/keystone/2026-10-12-invoice-reminders/plan.md', [
  '# Plan: invoice reminders', '', 'Level: L · Mode: feature · Status: implementing',
  'Done means: npm test green; a reminder row appears for an invoice 1 day overdue', '', '## Tasks',
  ...Array.from({ length: 13 }, (_, i) => `- [x] ${i + 1}. task`), '- [ ] 14. send via SMTP — BLOCKED: staging SMTP not reachable',
].join('\n'));
const ledger = { plan: 4.1, check: 3.2, implement: 2.3 };
const total = Object.values(ledger).reduce((a, b) => a + b, 0);
// same format as $.ui.status in hooks/keystone.ts
const statusLine = `Keystone · ${statusPlan.level} · ${statusPlan.status} · ${statusPlan.done}/${statusPlan.total}${statusPlan.blocked ? ` · ${statusPlan.blocked} blocked` : ''} · $${total.toFixed(2)}`;
const st = esc(statusText(statusPlan, ledger)).split('\n').map((l) => l.replace(/^(Next:)/, '<span class="m">$1</span>').replace(/(\$\d+\.\d\d)/g, '<span class="k">$1</span>')).join('\n');
cards['09-status'] = page(`
<div class="eyebrow">/keystone-status · no model call</div>
<h1 style="font-size:54px">Where am I, what did each stage cost, <em>what's next?</em></h1>
<div class="term" style="margin-top:32px"><div class="bar"><i></i><i></i><i></i><span>claude</span></div>
<pre style="font-size:20px;line-height:1.5">&gt; /keystone-status
${st}
<span class="m">──────────────────────────────────────────────────────────────────────</span>
<span class="k">${esc(statusLine)}</span>   <span class="m">← status line under the prompt</span></pre></div>`, 'status');

// ---------- render ----------
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch {
  console.error('Playwright not found. Install it, or point NODE_PATH at a global node_modules that has it.');
  process.exit(1);
}
const browser = await chromium.launch();
const pageObj = await browser.newPage({ viewport: { width: 1600, height: 900 } });
for (const [name, html] of Object.entries(cards)) {
  await pageObj.setContent(html, { waitUntil: 'load' });
  await pageObj.screenshot({ path: join(out, `${name}.png`) });
  console.log(`img/${name}.png`);
}
await browser.close();
console.log(`tests ${T.pass}/${T.tests} · gates: draft edit ${G.draftEdit ? 'denied' : 'allowed'}, push ${G.push ? 'denied' : 'allowed'}, stop ${G.stop?.decision}`);
