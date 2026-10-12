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
const SKILLS = ['check', 'fix', 'grill', 'implement', 'intent', 'plan', 'start', 'verify'];
const AGENTS = ['analyzer.md', 'validator.md', 'verifier.md'];
const AD = 'adapters/ai-factory/';
const allSkillFiles = () => SKILLS.flatMap((s) => {
  const refs = existsSync(join(root, 'skills', s, 'references')) ? readdirSync(join(root, 'skills', s, 'references')).map((f) => `skills/${s}/references/${f}`) : [];
  return [`skills/${s}/SKILL.md`, ...refs];
});

test('plugin: keystone manifest, marketplace, one version, hooks wired', () => {
  const p = json('.claude-plugin/plugin.json');
  assert.equal(p.name, 'keystone');
  assert.equal(p.version, '0.6.0');
  assert.equal(json('package.json').version, p.version);
  assert.deepEqual(json('.claude-plugin/marketplace.json').plugins.map((x) => [x.name, x.source]), [['keystone', './']]);
  assert.ok(existsSync(join(root, 'hooks/hooks.json')));
});

test('I-2: exactly the eight skills and three agents; name = file', () => {
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
    assert.doesNotMatch(t, /\/aif-|HANDOFF_MODE|Handoff|TaskCreate|TaskUpdate|TaskList|TaskGet|ultra|spec\.md|DESCRIPTION\.md|ARCHITECTURE\.md/, f);
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

test('I-11: AI Factory adapter frozen and still well-formed', () => {
  const m = json(AD + 'extension.json');
  assert.equal(m.name, 'keystone-aif');
  for (const inj of m.injections) assert.ok(existsSync(join(root, AD, inj.file)), inj.file);
  assert.match(read(AD + 'injections/plan.md'), /\/keystone:check <intent path> <plan path>/);
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
  for (const f of ['README.md', 'README.ru.md']) {
    const t = read(f);
    assert.match(t, /github\.com\/sattva2020\/memlab/, f);
    assert.match(t, /\/plugin install memlab@memlab/, f);
  }
});
