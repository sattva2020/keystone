import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8').replace(/\r/g, '');
const json = (p) => JSON.parse(read(p));
const front = (p) => read(p).split('---')[1];
const body = (p) => read(p).split('\n').filter((l) => !l.includes('derived from ai-factory@')).join('\n');
const SKILLS = ['architecture', 'ask', 'check', 'ci', 'distill', 'dockerize', 'docs', 'evolve', 'fix', 'grill', 'implement', 'intent', 'plan', 'qa', 'qa-check', 'reference', 'review', 'roadmap', 'security', 'setup', 'start', 'transfer', 'verify'];
const AGENTS = ['analyzer.md', 'review-validator.md', 'validator.md', 'verifier.md'];
const allSkillFiles = () => SKILLS.flatMap((s) => {
  const refs = existsSync(join(root, 'skills', s, 'references')) ? readdirSync(join(root, 'skills', s, 'references')).map((f) => `skills/${s}/references/${f}`) : [];
  return [`skills/${s}/SKILL.md`, ...refs];
});

test('plugin: keystone manifest, marketplace, one version, hooks wired', () => {
  const p = json('.claude-plugin/plugin.json');
  assert.equal(p.name, 'keystone');
  assert.equal(p.version, '0.8.2');
  assert.equal(json('package.json').version, p.version);
  assert.deepEqual(json('.claude-plugin/marketplace.json').plugins.map((x) => [x.name, x.source]), [['keystone', './']]);
  assert.ok(existsSync(join(root, 'hooks/hooks.json')));
});

test('I-2: exactly the 23 skills and four agents; name = file', () => {
  assert.deepEqual(readdirSync(join(root, 'skills')).sort(), SKILLS);
  assert.deepEqual(readdirSync(join(root, 'agents')).sort(), AGENTS);
  for (const s of SKILLS) assert.equal(front(`skills/${s}/SKILL.md`).match(/^name:\s*(\S+)/m)?.[1], s);
  for (const a of AGENTS) {
    const fm = front(`agents/${a}`);
    assert.equal(fm.match(/^name:\s*(\S+)/m)?.[1], a.replace('.md', ''));
    assert.match(fm, /^model: opus$/m, a);
    assert.doesNotMatch(fm, /^tools:.*\b(Write|Edit)\b/m, `${a} is read-only`);
  }
});

test('frontmatter values containing ": " are quoted (valid YAML)', () => {
  for (const f of [...SKILLS.map((s) => `skills/${s}/SKILL.md`), ...AGENTS.map((a) => `agents/${a}`)])
    for (const l of front(f).trim().split('\n')) {
      const m = l.match(/^([a-z-]+): (.+)$/);
      if (m && m[2].includes(': ')) assert.match(m[2], /^".*"$/, `${f}: ${m[1]}`);
    }
});

test('plan, implement, fix run only on explicit /keystone:* (no clash with aif-* triggers)', () => {
  for (const s of ['plan', 'implement', 'fix']) assert.match(front(`skills/${s}/SKILL.md`), /^disable-model-invocation: true$/m, s);
});

test('I-15: no AI Factory leftovers in skills (attribution lines excepted)', () => {
  for (const f of allSkillFiles()) {
    const t = body(f);
    assert.doesNotMatch(t, /\/aif-|HANDOFF_MODE|Handoff|TaskCreate|TaskUpdate|TaskList|TaskGet|ultra|spec.md/, f);
    if (/config\.yaml/.test(t)) assert.match(t, /paths\.specs/, `${f}: config.yaml only for paths.specs`);
  }
});

test('I-15/I-18: every ported file carries the attribution and is listed in THIRD_PARTY_NOTICES', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  assert.match(read('LICENSE'), /MIT License/);
  const ported = ['skills/plan/SKILL.md', 'skills/plan/references/PLAN-FORMAT.md', 'skills/check/SKILL.md',
    'skills/check/references/ANALYZE.md', 'skills/check/references/VALIDATOR.md', 'agents/analyzer.md', 'agents/validator.md',
    'skills/implement/SKILL.md', 'skills/implement/references/LOGGING.md', 'skills/fix/SKILL.md', 'skills/verify/SKILL.md',
    'skills/verify/references/CHECKS.md', 'agents/verifier.md'];
  for (const f of ported) {
    assert.ok(existsSync(join(root, f)), f);
    assert.match(read(f), /derived from ai-factory@2\.19\.0 .*\(MIT\)/, f);
    assert.ok(notices.includes('`' + f + '`'), `${f} listed in NOTICES`);
  }
});

// Key phrases of the blocks the plan ports verbatim; cross-checked against upstream when it is installed.
const VERBATIM = [
  ['skills/plan/SKILL.md', 'aif-plan/SKILL.md', 'do not silently choose between conflicting sources'],
  ['skills/plan/SKILL.md', 'aif-plan/SKILL.md', 'speculative Cartesian product'],
  ['skills/plan/SKILL.md', 'aif-plan/SKILL.md', 'wording, casing'],
  ['skills/plan/references/PLAN-FORMAT.md', 'aif-plan/references/ULTRA-FORMAT.md', 'blocking open question'],
  ['skills/check/references/ANALYZE.md', 'aif-improve/SKILL.md', 'Code that already partially implements what a task describes'],
  ['skills/check/references/VALIDATOR.md', 'aif-improve/references/VALIDATOR.md', 'You are an independent validator of plan-refinement findings produced by another agent'],
  ['skills/check/SKILL.md', 'aif-improve/references/CHECK-MODE.md', 'malformed, kept as-is'],
  ['skills/implement/SKILL.md', 'aif-implement/SKILL.md', 'ERROR [requirement-conflict]'],
  ['skills/implement/SKILL.md', 'aif-implement/SKILL.md', 'Do not infer a restriction on one dimension from a rule about another'],
  ['skills/implement/SKILL.md', 'aif-implement/SKILL.md', 'but the corresponding code is missing'],
  ['skills/fix/SKILL.md', 'aif-fix/SKILL.md', 'Execute the check before implementation and confirm it fails or reproduces the reported problem'],
  ['skills/fix/SKILL.md', 'aif-fix/SKILL.md', 'Do not tailor the test to the implementation you plan to write'],
  ['skills/fix/SKILL.md', 'aif-fix/SKILL.md', 'treat it as a reproduction mismatch'],
  ['agents/verifier.md', 'aif-verify/SKILL.md', 'Separate tests for each dimension do not prove their interaction'],
  ['skills/verify/references/CHECKS.md', 'aif-verify/SKILL.md', 'Only lint the changed files to keep output focused'],
];
test('I-15: verbatim blocks kept (and match upstream when installed)', () => {
  const up = join(homedir(), '.claude', 'skills');
  const flat = (s) => s.replace(/\s+/g, ' ');
  for (const [f, src, phrase] of VERBATIM) {
    assert.ok(flat(read(f)).includes(phrase), `${f}: ${phrase}`);
    const u = join(up, src);
    if (existsSync(u)) assert.ok(flat(readFileSync(u, 'utf8')).includes(phrase), `upstream ${src}: ${phrase}`);
  }
});

test('I-3: plan infers Settings, never asks', () => {
  const t = read('skills/plan/SKILL.md') + read('skills/plan/references/PLAN-FORMAT.md');
  assert.match(t, /Settings:/);
  assert.match(t, /infer|inferred/i);
  assert.doesNotMatch(t, /AskUserQuestion[^\n]*(tests|logging|docs)/i);
  assert.match(read('skills/implement/SKILL.md'), /Settings/);
  assert.match(read('agents/verifier.md') + read('skills/verify/SKILL.md'), /Settings: ?(ok|violated)/);
});

test('plan: header contract, Reconciliation, Rules check, Risks, check before Approve, baseline commit', () => {
  const t = read('skills/plan/SKILL.md') + read('skills/plan/references/PLAN-FORMAT.md');
  for (const s of ['Status: draft', 'Status: approved', '| Decision | Source | Verification evidence |', 'intent — I-',
                   'Project rules check:', '## Risks', '/keystone:check', 'What could this change break', 'Approve',
                   'not `/compact`', 'docs/keystone/'])
    assert.ok(t.includes(s), s);
});

test('check: analyzer + mandatory validator, intent coverage, applies only after the human answers', () => {
  const t = read('skills/check/SKILL.md');
  assert.doesNotMatch(front('skills/check/SKILL.md'), /context: fork/);
  for (const s of ['keystone:analyzer', 'keystone:validator', 'intent-gap', 'rule-violation', 'Coverage:', 'AskUserQuestion', 'Original Request is immutable'])
    assert.ok(t.includes(s), s);
});

test('I-8: implement keeps the Keystone execution rules', () => {
  const i = read('skills/implement/SKILL.md');
  for (const r of [/Baseline first/i, /same commit/, /git diff --cached --stat/, /BLOCKED: <reason>/, /never `?\[x\]`?|stays `\[ \]`/,
                   /pass \| fail \| not run \| BLOCKED/, /a \+ b \+ c \+ d/, /Status: implementing/, /cost: not measured/, /\/keystone:verify/])
    assert.match(i, r);
});

test('I-5: fix is regression-first, S starts implementing, existing tests untouched', () => {
  const f = read('skills/fix/SKILL.md');
  for (const r of [/Mode: fix/, /Status: implementing/, /new file/i, /existing test/i, /## Root cause/, /## Prevention/]) assert.match(f, r);
});

test('I-9/I-7: verify verdicts, accept with sign-off, read-only verifier, /code-review', () => {
  const v = read('skills/verify/SKILL.md');
  for (const s of ['PASS-UNPROVEN', 'Accepted unproven by', 'Status: verified', 'docs(verify)', '/code-review', 'keystone:verifier', 'not evidence'])
    assert.ok(v.includes(s), s);
  assert.doesNotMatch(front('skills/verify/SKILL.md'), /context: fork/);
  const a = read('agents/verifier.md');
  for (const s of ['unrequested', 'not proven', 'BLOCKED', 'Keystone Chain:']) assert.ok(a.includes(s), s);
});

test('I-17: grill goes all the way down', () => {
  const g = read('skills/grill/SKILL.md');
  for (const s of ['relentless', 'every branch', 'silently assumed', 'edge cases', 'frontier', 'Recommended',
                   'Never ask the user for a fact', 'explicit confirmation', 'Writes nothing to disk', 'never recommend an answer that widens'])
    assert.ok(g.toLowerCase().includes(s.toLowerCase()), s);
});

test('intent: IDs, decisions log, paths (docs/keystone or AIF paths.specs), no spec stage', () => {
  const i = read('skills/intent/SKILL.md');
  for (const s of ['- I-1 ', 'never renumbered', '## Decisions log', 'Written after plan:', 'docs/keystone/', 'paths.specs', 'no separate spec stage'])
    assert.ok(i.includes(s), s);
});

test('start routes to the Keystone skills and handles a lingering active plan', () => {
  const t = read('skills/start/SKILL.md');
  for (const s of ['/keystone:plan', '/keystone:implement', '/keystone:verify', '/keystone:fix', 'Status: abandoned', 'Any single L sign makes it L'])
    assert.ok(t.includes(s), s);
});

test('I-19…I-23: Done means, keep going / stop, three-part summary, Repro/Unconfirmed, effort', () => {
  const plan = read('skills/plan/SKILL.md') + read('skills/plan/references/PLAN-FORMAT.md');
  assert.match(plan, /Done means:/);
  const v = read('skills/verify/SKILL.md') + read('agents/verifier.md');
  for (const s of ['Done means:', 'Repro:', 'Unconfirmed', 'Blocked on me:', 'Changed:', 'Found:']) assert.ok(v.includes(s), `verify: ${s}`);
  for (const s of ['implement', 'fix']) {
    const t = read(`skills/${s}/SKILL.md`);
    assert.match(t, /Keep going without asking/i, s);
    for (const h of ['Blocked on me:', 'Changed:', 'Found:']) assert.ok(t.includes(h), `${s}: ${h}`);
  }
  for (const s of ['grill', 'intent', 'plan', 'check', 'fix', 'verify']) assert.match(front(`skills/${s}/SKILL.md`), /^effort: high$/m, s);
  assert.doesNotMatch(front('skills/implement/SKILL.md'), /^effort:/m);
  assert.match(read('skills/start/SKILL.md'), /Effort/);
});

test('stand 12.10 fixes: verify never edits intent, accept re-checks freshness, fix path, BLOCKED in fix, grill coverage table', () => {
  const v = read('skills/verify/SKILL.md');
  assert.match(v, /\/keystone:intent/);
  assert.match(v, /changed after the last `?verify\.md/i);
  assert.match(read('skills/fix/SKILL.md'), /paths\.specs/);
  assert.match(read('skills/fix/SKILL.md'), /BLOCKED: <reason>/);
  assert.match(read('skills/implement/SKILL.md'), /## Open questions \(implement\)/);
  assert.match(read('skills/check/SKILL.md'), /not re-checked/);
  const g = read('skills/grill/SKILL.md');
  assert.match(g, /n\/a \(user\)/);
  assert.match(g, /coverage/i);
});

test('implementation notes: plan template section, implement appends why-lines, verify checks deviations', () => {
  assert.match(read('skills/plan/references/PLAN-FORMAT.md'), /## Implementation notes/);
  const i = read('skills/implement/SKILL.md');
  assert.match(i, /## Implementation notes \(decision journal\)/);
  assert.match(i, /append-only/);
  assert.match(i, /Task <n> — <decision> — why: <reason> — evidence:/);
  assert.match(read('skills/verify/SKILL.md'), /unexplained deviations/);
});

test('README: memlab is a separate plugin with install commands; adapter only for /aif-plan users', () => {
  for (const f of ['README.md', 'README.ru.md'].filter((f) => existsSync(join(root, f)) && read(f).includes('Integrations'))) {
    const t = read(f);
    assert.match(t, /github\.com\/sattva2020\/memlab/, f);
    assert.match(t, /\/plugin install memlab@memlab/, f);
  }
});

test('mod: hooks.json loads the keystone module next to the settings hooks', () => {
  const h = json('hooks/hooks.json');
  assert.deepEqual(h.modules, ['./keystone.ts']);
  assert.ok(h.hooks.PreToolUse && h.hooks.Stop);
  const m = read('hooks/keystone.ts');
  for (const s of ["name: 'keystone-status'", "on('turn.complete'", "on('prompt.submit'", '$.session.usage()', 'Keystone cost meter', "on('prompt.suggest'", 'export function nextCommand'])
    assert.ok(m.includes(s), s);
});

// 0.8.0 — project context and toolbox (docs/keystone/2026-10-12-project-context-and-toolbox/intent.md)
test('0.8 I-1/I-10: setup writes only after a yes, never overwrites, secrets as ${VAR}, no skills.sh installs', () => {
  const s = read('skills/setup/SKILL.md');
  for (const x of ['CLAUDE.md', '.claude/rules/base.md', '.mcp.json', '${', 'enabledPlugins', 'Never overwrite', 'at most 60 lines', 'skills.sh'])
    assert.ok(s.includes(x), x);
  assert.match(front('skills/setup/SKILL.md'), /^disable-model-invocation: true$/m);
  for (const x of ['/keystone:architecture', '/keystone:docs', '/keystone:dockerize', '/keystone:ci']) assert.ok(s.includes(x), `setup offers ${x}`);
  assert.match(s, /`@AGENTS\.md` \(import\)/, 'a new CLAUDE.md must not switch off an existing AGENTS.md');
});

test('0.8 I-2/I-13: plan, check, implement, fix, verify, review, security read the native project context', () => {
  for (const s of ['plan', 'check', 'implement', 'fix', 'verify', 'review', 'security']) {
    const t = read(`skills/${s}/SKILL.md`);
    for (const x of ['CLAUDE.md', '.claude/rules', 'docs/architecture.md']) assert.ok(t.includes(x), `${s}: ${x}`);
  }
});

test('0.8 I-3: security — ignore list with reason, pass/warn/fail gate, audit script by skill dir, wired into plan/verify', () => {
  const s = read('skills/security/SKILL.md');
  for (const x of ['docs/keystone/security-ignores.md', 'Security gate: pass | warn | fail', '${CLAUDE_SKILL_DIR}/scripts/audit.sh'])
    assert.ok(s.includes(x), x);
  for (const r of ['AUTH.md', 'PROMPT-INJECTION.md', 'RACE.md', 'CHECKLIST.md']) assert.ok(existsSync(join(root, 'skills/security/references', r)), r);
  assert.match(read('skills/security/SKILL.md').replace(/\s+/g, ' '), /do \*\*NOT\*\* flag it as a finding/);
  assert.match(read('skills/plan/SKILL.md'), /Threats:/);
  assert.match(read('skills/verify/SKILL.md'), /unignored `?Security gate: fail/);
});

test('0.8 I-4: architecture writes docs/architecture.md with checkable rules; verify runs the architecture gate', () => {
  const a = read('skills/architecture/SKILL.md');
  for (const x of ['docs/architecture.md', 'Codebase Alignment Check', 'MUST NOT:', 'check: grep']) assert.ok(a.includes(x), x);
  assert.match(read('skills/verify/SKILL.md'), /Architecture gate: pass \| fail/);
});

test('0.8 I-5/I-9: docs update from implement; implement proposes rules into .claude/rules only after a yes', () => {
  assert.match(read('skills/docs/SKILL.md'), /README is a landing page, not a manual/);
  assert.match(front('skills/docs/SKILL.md'), /^disable-model-invocation: false$/m);
  const i = read('skills/implement/SKILL.md');
  assert.match(i, /\/keystone:docs update/);
  assert.match(front('skills/implement/SKILL.md'), /^allowed-tools:.*\bSkill\b/m);
  assert.match(i, /\.claude\/rules\//);
  assert.match(i, /to 3 new rules/);
});

test('0.8 I-6: review always runs the clean-context validator (keep / modify / drop) and keeps Unconfirmed', () => {
  const r = read('skills/review/SKILL.md');
  for (const x of ['keystone:review-validator', '`keep`', '`modify`', '`drop`', 'Unconfirmed']) assert.ok(r.includes(x), x);
  assert.match(read('skills/review/references/VALIDATOR.md'), /Never treat a finding as fabricated just because the cited code is absent from disk/);
  assert.match(read('skills/verify/SKILL.md'), /\/keystone:review/);
});

test('0.8 I-7/I-8/I-12: dockerize, ci, research mode; S stays light', () => {
  assert.match(read('skills/dockerize/SKILL.md') + read('skills/dockerize/references/SECURITY-CHECKLIST.md'), /Production hardening overlay|NO `ports:` on infrastructure services/);
  assert.match(read('skills/ci/SKILL.md'), /one workflow per concern/i);
  assert.match(read('skills/intent/SKILL.md'), /research\.md/);
  assert.match(read('skills/start/SKILL.md'), /on S add nothing else/);
});

test('0.8 I-11: every new ported .md carries the attribution and its skill is listed in THIRD_PARTY_NOTICES', () => {
  const notices = read('THIRD_PARTY_NOTICES.md');
  const walk = (d) => readdirSync(join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  for (const s of ['setup', 'security', 'architecture', 'docs', 'review', 'dockerize', 'ci', 'qa', 'qa-check', 'roadmap', 'reference', 'distill', 'evolve', 'transfer', 'ask']) {
    for (const f of walk(`skills/${s}`).filter((f) => f.endsWith('.md'))) assert.match(read(f), /derived from ai-factory@2\.19\.0 .*\(MIT\)|^<!-- original Keystone file \(MIT\) -->/, f);
    assert.ok(notices.includes('`skills/' + s + '/`'), `skills/${s}/ in NOTICES`);
  }
  assert.match(read('agents/review-validator.md'), /derived from ai-factory@2\.19\.0/);
  assert.ok(notices.includes('`agents/review-validator.md`'));
});

// qa-roadmap-lessons (docs/keystone/2026-10-12-qa-roadmap-lessons/intent.md)
const has = (f, ...xs) => { const t = read(f).replace(/\s+/g, ' '); for (const x of xs) assert.ok(t.includes(x), `${f}: ${x}`); };

test('qa/qa-check: files in <task>/qa/, evidence before pass, Playwright replay', () => {
  has('skills/qa/SKILL.md', 'qa/', 'MUST NOT create a `test-plan` without a `change-summary` artifact');
  has('skills/qa-check/SKILL.md', 'MUST NOT mark a case passed in agent mode without concrete evidence', 'replay/', 'Playwright');
});

test('roadmap, reference, distill: stable milestone ids, Context7 first, output location asked', () => {
  has('skills/roadmap/SKILL.md', 'docs/roadmap.md', 'Never remove milestones silently');
  has('skills/intent/SKILL.md', 'Roadmap: M-<n>');
  has('skills/verify/SKILL.md', '/keystone:roadmap', '/keystone:evolve');
  has('skills/reference/SKILL.md', 'docs/references/', 'Context7');
  has('skills/distill/SKILL.md', 'Distill, do not copy.', '${CLAUDE_SKILL_DIR}/scripts/material-prep.py', '~/.claude/skills');
});

test('evolve/transfer: lessons become .claude/rules after a yes, evolve-log, read-only source, no skill-context', () => {
  for (const f of ['skills/evolve/SKILL.md', 'skills/transfer/SKILL.md']) {
    has(f, '.claude/rules/', 'docs/keystone/evolve-log.md');
    assert.doesNotMatch(read(f), /skill-context/, f);
  }
  has('skills/evolve/SKILL.md', 'One prevention point = one rule.');
  has('skills/transfer/SKILL.md', 'The source project is read-only for the whole run.');
});

test('ask: 100/100 or INSUFFICIENT INFORMATION, read-only', () => {
  has('skills/ask/SKILL.md', 'Only provide the final answer if confidence is 100/100 based on evidence available.', 'Result: INSUFFICIENT INFORMATION (no guessing)', 'Context7');
  assert.doesNotMatch(front('skills/ask/SKILL.md'), /^allowed-tools:.*(Write|Edit)/m);
});

test('output is Markdown, not a code-block wall: grill summary table, rendering rule in report skills', () => {
  has('skills/grill/SKILL.md', '| # | Decision | Answer |', 'never inside a code block');
  for (const s of SKILLS) {
    const t = read(`skills/${s}/SKILL.md`);
    if (t.includes('Blocked on me') && s !== 'grill') assert.ok(t.includes('**Output rendering.**'), `${s}: rendering rule`);
  }
});

test('setup proposes the Dokploy MCP by signal, with ${VAR} only', () => {
  has('skills/setup/references/STACK-SIGNALS.md', '@sattva/dokploy-mcp@latest', 'DOKPLOY_API_KEY');
  has('skills/dockerize/SKILL.md', 'github.com/sattva2020/dokploy-mcp');
});

test('stand 12.10 K6: setup writes CLAUDE.md last with links to written files only; review reads a digit-only hash as a ref', () => {
  has('skills/setup/SKILL.md', '`CLAUDE.md` last', 'never retry the same write');
  has('skills/review/SKILL.md', 'abbreviated commit hash → ref');
});

test('security P0: Top 10:2025, agent/supply-chain, Refs, UNASSESSED, mapping references', () => {
  const s = read('skills/security/SKILL.md');
  assert.doesNotMatch(s, /2021/);
  for (const x of ['agent', 'supply-chain', 'Refs:', 'UNASSESSED', 'Security gate: pass | warn | fail']) assert.ok(s.includes(x), `SKILL.md: ${x}`);
  for (const f of ['MAPPING', 'AGENT-MCP', 'SUPPLY-CHAIN']) assert.ok(existsSync(join(root, `skills/security/references/${f}.md`)), f);
  has('skills/security/references/CHECKLIST.md', 'A03:2025', 'A10:2025');
  has('skills/security/references/PROMPT-INJECTION.md', 'LLM08:2026');
  has('skills/security/scripts/audit.sh', 'sk-ant-', 'UNASSESSED');
});

test('session audit 12.10: check falls back to .ai-factory/plans and a D-list intent; start keeps grilled decisions at L', () => {
  has('skills/check/SKILL.md', '.ai-factory/plans/*.md', 'reconstructed from the plan', 'never directly');
  has('skills/start/SKILL.md', 'Decisions already closed in a grill', 'Production, secrets');
});

test('every skill ends with an explicit Next: line; grill run directly routes its decisions; status shows Next', () => {
  for (const s of SKILLS) has(`skills/${s}/SKILL.md`, '**Next step (mandatory).**');
  has('skills/grill/SKILL.md', 'Run directly by the user', 'Next: /keystone:intent <topic>');
  has('hooks/keystone.ts', 'Next: ${nextCommand(p)');
  for (const f of ['docs/scenarios.md', 'docs/scenarios.ru.md']) has(f, '/keystone-status', '/keystone:verify accept');
});

test('audit.sh behaviour: provider and uppercase env secrets found, ${VAR} and plain words clean', async () => {
  const { spawnSync } = await import('node:child_process');
  const { mkdtempSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const script = join(root, 'skills/security/scripts/audit.sh');
  const run = (file, body) => {
    const d = mkdtempSync(join(tmpdir(), 'ks-audit-'));
    writeFileSync(join(d, file), body);
    return spawnSync('bash', [script], { cwd: d, encoding: 'utf8' }).stdout;
  };
  assert.match(run('.mcp.json', '{"env":{"GITHUB_TOKEN":"ghp_' + 'A'.repeat(36) + '"}}'), /\.mcp\.json:1/);
  assert.match(run('.mcp.json', '{"env":{"BRAVE_API_KEY":"BSAq7Zx9LmN2pR4tV6wY8"}}'), /\.mcp\.json:1/);
  assert.doesNotMatch(run('.mcp.json', '{"env":{"GITHUB_TOKEN":"${GITHUB_TOKEN}"}}'), /\.mcp\.json:1/);
  assert.doesNotMatch(run('a.js', 'const s = "see risk-assessmentframeworkversion2";'), /a\.js:1/);
  assert.match(run('.mcp.json', '{"env":{"OPENAI_API_KEY":"${OPENAI_API_KEY:-sk-AbCdEfGhIjKlMnOpQrStUvWx}"}}'), /\.mcp\.json:1/);
  assert.match(run('config.yml', 'OPENAI_API_KEY: sk-proj-Ab_Cd-EfGhIjKlMnOpQrStUvWxYz012345\n'), /config\.yml:1/);
});
