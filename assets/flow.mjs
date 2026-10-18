// Usage: node assets/flow.mjs assets — writes assets/flow-dark.svg: the user flow mapped onto
// Anthropic's AI-native SDLC playbook (Plan → Design → Build → Test → Deploy → Maintain). Dark only: the SVG carries
// its own background, so it reads the same on GitHub's light and dark themes.
import { writeFileSync } from 'node:fs';
const out = process.argv[2];
const T = {
  dark: { bg: '#0d1220', panel: '#151b2e', box: '#1d2540', edge: '#3b4668', title: '#f3f5fb', text: '#d6dcef', sub: '#9aa4c2', key: '#f5b83d', keyText: '#1a1300', lane: '#7c89b0', arrow: '#5b678c', lock: '#f5b83d' },
};
const F = `font-family="'Segoe UI', Inter, 'Helvetica Neue', Arial, sans-serif"`;
const M = `font-family="'JetBrains Mono', 'Cascadia Code', Consolas, monospace"`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const COL = (i) => 210 + i * 160, W = 150;

function box(c, x, y, w, h, title, lines = [], hot = false) {
  let s = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${hot ? c.key : c.box}" stroke="${hot ? c.key : c.edge}" stroke-width="1.5"/>`;
  s += `<text x="${x + w / 2}" y="${y + 21}" text-anchor="middle" ${M} font-size="${title.length > 16 ? 11.5 : 13}" font-weight="700" fill="${hot ? c.keyText : c.text}">${esc(title)}</text>`;
  lines.forEach((l, i) => { s += `<text x="${x + w / 2}" y="${y + 38 + i * 14}" text-anchor="middle" ${F} font-size="11" fill="${hot ? c.keyText : c.sub}">${esc(l)}</text>`; });
  return s;
}
const arrow = (c, x1, y, x2) => `<line x1="${x1}" y1="${y}" x2="${x2 - 6}" y2="${y}" stroke="${c.arrow}" stroke-width="1.6"/><path d="M${x2 - 7},${y - 4} L${x2},${y} L${x2 - 7},${y + 4} Z" fill="${c.arrow}"/>`;
const lock = (c, x, y, text) => `<g><rect x="${x}" y="${y}" width="${text.length * 6.3 + 30}" height="22" rx="11" fill="none" stroke="${c.lock}" stroke-width="1.3" stroke-dasharray="3 2"/><text x="${x + 10}" y="${y + 15}" ${F} font-size="11.5" fill="${c.lock}">🔒 ${esc(text)}</text></g>`;
const laneLabel = (c, y, h, label, hint) => `<rect x="40" y="${y}" width="150" height="${h}" rx="10" fill="${c.panel}"/><text x="56" y="${y + 24}" ${M} font-size="15" font-weight="800" fill="${c.key}">${label}</text><text x="56" y="${y + 42}" ${F} font-size="11" fill="${c.sub}">${esc(hint)}</text>`;

function svg(c) {
  const stages = [
    ['Plan', 'intent.md'], ['Design', 'inside plan.md'], ['Build', 'plan.md → diff'],
    ['Test', 'checks + verifier'], ['Deploy', '## Release'], ['Maintain', 'incident → intent'],
  ];
  let s = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="910" viewBox="0 0 1200 910" role="img" aria-label="Keystone user flow mapped onto the AI-native SDLC playbook">`;
  s += `<rect width="1200" height="910" rx="18" fill="${c.bg}"/>`;
  s += `<text x="40" y="46" ${F} font-size="22" font-weight="800" fill="${c.title}">How Keystone runs the AI-native SDLC playbook</text>`;
  s += `<text x="40" y="68" ${F} font-size="12.5" fill="${c.sub}">Top: the playbook's stages (Anthropic). Below: what you type in Claude Code. Every stage ends with a committed file.</text>`;
  // playbook row
  s += `<text x="56" y="112" ${F} font-size="12" font-weight="700" fill="${c.lane}">PLAYBOOK</text>`;
  stages.forEach(([n, a], i) => {
    s += `<rect x="${COL(i)}" y="88" width="${W}" height="48" rx="10" fill="${c.panel}" stroke="${c.edge}" stroke-width="1"/>`;
    s += `<text x="${COL(i) + W / 2}" y="108" text-anchor="middle" ${F} font-size="14" font-weight="700" fill="${c.title}">${i + 1}. ${n}</text>`;
    s += `<text x="${COL(i) + W / 2}" y="125" text-anchor="middle" ${M} font-size="11" fill="${c.sub}">${esc(a)}</text>`;
    s += `<line x1="${COL(i) + W / 2}" y1="138" x2="${COL(i) + W / 2}" y2="166" stroke="${c.edge}" stroke-width="1.2" stroke-dasharray="3 3"/>`;
  });
  // start
  s += box(c, 40, 148, 150, 64, '/keystone:start', ['sizes the task:', 'S · M · L'], true);
  // L lane
  const yL = 180, hL = 84;
  s += laneLabel(c, 222, 150, 'L', 'open decisions, data,');
  s += `<text x="56" y="278" ${F} font-size="11" fill="${c.sub}">security, others' code</text>`;
  const L = [
    ['/keystone:intent', ['grill → your answers;', 'original goal kept'], true],
    ['/keystone:plan', ['plan = spec · risks', 'auto /keystone:check'], false],
    ['/keystone:implement', ['fresh session, task', 'by task · Sonnet'], false],
    ['/keystone:verify', ['Sonnet runs, Opus judges', 'PASS · UNPROVEN · FAIL'], false],
    ['release', ['implement runs R-steps;', 'merge → push on yes'], false],
    ['/keystone:fix', ['bug: regression-first;', 'big finding → intent'], false],
  ];
  L.forEach(([t, l, hot], i) => { s += box(c, COL(i), yL + 42, W, 70, t, l, hot); if (i < 5) s += arrow(c, COL(i) + W, yL + 77, COL(i + 1)); });
  s += lock(c, COL(0) + 4, yL + 120, 'draft: no code edits until Approve');
  s += lock(c, COL(3) + 4, yL + 120, 'security gate on L') + lock(c, COL(4) + 4, yL + 120, "push: this plan's commits wait for verify");
  s += lock(c, COL(2) + 40, yL + 150, 'FAIL → /keystone:fix verify, all findings in one pass · UNPROVEN → prove or accept');
  // M lane
  const yM = 390;
  s += laneLabel(c, yM, 90, 'M', 'one clear approach,');
  s += `<text x="56" y="${yM + 58}" ${F} font-size="11" fill="${c.sub}">several files</text>`;
  const Mx = [['/keystone:plan', ['short plan, Risks;', 'settings inferred'], 1], ['/keystone:implement', ['task by task'], 2], ['/keystone:verify', ['fresh session;', 'verdict + verify.md'], 3], ['merge · push', ['after verify + yes'], 4]];
  Mx.forEach(([t, l, i], k) => { s += box(c, COL(i), yM + 10, W, 62, t, l); if (k < 3) s += arrow(c, COL(i) + W, yM + 41, COL(i + 1)); });
  // S lane
  const yS = 500;
  s += laneLabel(c, yS, 70, 'S', 'diff in one sentence');
  s += box(c, COL(2), yS + 8, W, 54, 'edit + check', ['no intent, no plan'], false);
  s += arrow(c, COL(2) + W, yS + 35, COL(3));
  s += box(c, COL(3), yS + 8, W, 54, 'report', ['Level: S · checks'], false);
  s += `<text x="${COL(4) + 6}" y="${yS + 32}" ${F} font-size="11.5" fill="${c.sub}">a bug → /keystone:fix (S: fix now,</text>`;
  s += `<text x="${COL(4) + 6}" y="${yS + 48}" ${F} font-size="11.5" fill="${c.sub}">regression test as a new file)</text>`;
  // toolbox lane: run on demand, or pulled in by the chain
  const yT = 590;
  s += laneLabel(c, yT, 168, 'tools', 'on demand, or pulled');
  s += `<text x="56" y="${yT + 58}" ${F} font-size="11" fill="${c.sub}">in by the chain</text>`;
  const TB = [
    ['/keystone:setup', ['once per project:', 'CLAUDE.md · rules · MCP']],
    ['/keystone:architecture', ['docs/architecture.md', '→ gate in verify']],
    ['/keystone:docs', ['update from implement', 'when docs — yes']],
    ['/keystone:security', ['OWASP 2025 · LLM Top 10', 'MCP · supply chain · IaC', 'pentest confirms on app']],
    ['/keystone:review', ['diff + validator;', 'rules [ref] without plan']],
    ['evolve · transfer', ['lessons → .claude/rules;', 'add <rule> · after yes']],
  ];
  TB.forEach(([t, l], i) => { s += box(c, COL(i), yT + 8, W, 72, t, l); });
  const TB2 = [
    ['/keystone:roadmap', ['milestones M-n;', 'intent → Roadmap: M-n']],
    ['ask · reference', ['evidence-only answers;', 'docs/references/']],
    ['/keystone:distill', ['book, docs, URL', '→ a Claude Code skill']],
    ['qa · qa-check', ['test cases → run:', 'human or agent']],
    ['dockerize · ci', ['Docker, compose,', 'GitHub / GitLab CI']],
    ['/keystone:optimize', ['measure before/after;', 'simplify, tests green']],
  ];
  TB2.forEach(([t, l], i) => { s += box(c, COL(i), yT + 88, W, 72, t, l); });
  // footer
  s += `<line x1="40" y1="780" x2="1160" y2="780" stroke="${c.edge}" stroke-width="1"/>`;
  s += `<text x="40" y="804" ${F} font-size="12.5" fill="${c.text}"><tspan font-weight="700" fill="${c.key}">Design is folded into the plan</tspan> — no separate spec.md; every plan row cites an intent line (I-n). Grill runs inside intent; check runs inside plan.</text>`;
  s += `<text x="40" y="826" ${F} font-size="12.5" fill="${c.text}"><tspan ${M} font-weight="700">/keystone-status</tspan> any time: plan, tasks, gates and cost by stage — answered without a model call. Lift a gate: Status: abandoned or KEYSTONE_GATES=off.</text>`;
  s += `<text x="40" y="848" ${F} font-size="12.5" fill="${c.text}"><tspan font-weight="700" fill="${c.key}">Models by role</tspan> — Opus judges (intent, plan, check, the verifier) · Sonnet runs implement and verify · scripts do the mechanics (base, files, tests).</text>`;
  s += `<text x="40" y="872" ${F} font-size="12.5" fill="${c.text}"><tspan font-weight="700" fill="${c.key}">Above the prompt</tspan> — plan and context bars, Next buttons, file links; a handoff to a clean session when the context grows.</text>`;
  s += `<text x="40" y="894" ${F} font-size="12.5" fill="${c.sub}">Run implement and verify in a fresh session (/clear): every turn re-reads the whole context, so a stage at 500k tokens costs several times more.</text>`;
  return s + '</svg>';
}
writeFileSync(`${out}/flow-dark.svg`, svg(T.dark));
