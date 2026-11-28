// Class: a counter over all skills printed in a report about one skill. Every number of the `evolve` header counts that skill only.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import * as fb from '../skills/feedback/scripts/feedback.mjs';

const tmp = () => mkdtempSync(join(tmpdir(), 'ks-fbc-'));
const g = (cwd, ...a) => spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', '-c', 'tag.gpgsign=false', ...a], { cwd, encoding: 'utf8' });
const TEXT = '# Skill\n\n## Step 1 — collect\nCollect.\n\n## Step 2 — run\nRun.\n';

test('each counter of the evolve header belongs to the skill of the header, for every skill', () => {
  const r = tmp(), store = tmp(), env = { ...process.env, SATTVA_FEEDBACK_DIR: store, CLAUDE_CONFIG_DIR: store };
  g(r, 'init', '-q');
  mkdirSync(join(r, '.claude-plugin'), { recursive: true });
  writeFileSync(join(r, '.claude-plugin/plugin.json'), JSON.stringify({ name: 'sattva', version: '0.9.1' }));
  // skill → [findings, logged, in a section changed after the version]
  const want = { verify: [6, 2, 3], plan: [4, 1, 0], implement: [3, 0, 1] };
  for (const s of Object.keys(want)) { mkdirSync(join(r, 'skills', s), { recursive: true }); writeFileSync(join(r, 'skills', s, 'SKILL.md'), TEXT); }
  g(r, 'add', '.'); g(r, 'commit', '-qm', 'init'); g(r, 'tag', 'v0.9.1');
  const recs = [], log = ['# Evolve log', ''];
  for (const [s, [n, logged, changed]] of Object.entries(want)) {
    writeFileSync(join(r, 'skills', s, 'SKILL.md'), TEXT.replace('Collect.', 'Collect once.'));
    const items = Array.from({ length: n }, (_, i) => ({ cause: 'skill-text', source: 'confirmed', skill: s, section: i >= logged && i < logged + changed ? 'Step 1 — collect' : 'Step 2 — run', cls: 'c', text: 't', evidence: 'e' }));
    recs.push({ v: 1, id: `j-${s}`, date: '2026-11-21T10:00:00Z', plugin_version: '0.9.1', project: 'p1-aaaaaa', project_path: '/x', task: 't', skill: 'feedback', session: '-', kind: 'judge', items });
    for (let i = 1; i <= logged; i++) log.push(`- j-${s}#${i} · ${i % 2 ? 'accepted' : 'rejected'}`);
  }
  mkdirSync(join(store, 'p1-aaaaaa'));
  writeFileSync(join(store, 'p1-aaaaaa', 'feedback.jsonl'), recs.map((x) => JSON.stringify(x)).join('\n') + '\n');
  mkdirSync(join(r, 'docs/sattva'), { recursive: true });
  writeFileSync(join(r, 'docs/sattva/evolve-log.md'), log.join('\n') + '\n');
  for (const [s, [n, logged, changed]] of Object.entries(want)) {
    assert.equal(fb.evolveReport({ skill: s }, env, r).split('\n')[1], `${n - logged - changed} to take · ${changed} possibly fixed · ${logged} already in the evolve log`, s);
  }
});
