// Class: a compose layout with a host port is never dropped silently — it gives a host-port or an unknown entry
// (fix verify 2026-11-26). Each layout below carries host port 5432 somewhere.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCheckout } from '../skills/implement/scripts/worktree-check.mjs';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });

const LAYOUTS = {
  'indented sequence': 'services:\n  db:\n    ports:\n      - "5432:5432"\n',
  'compact sequence': 'services:\n  db:\n    ports:\n    - "5432:5432"\n',
  'compact long form': 'services:\n  db:\n    ports:\n    - target: 1\n      published: 5432\n',
  'anchored first service': 'services:\n  db: &db\n    image: x\n    ports:\n      - "5432:5432"\n',
  'anchored item': 'services:\n  db:\n    ports:\n      - &p "5432:5432"\n',
  'quoted published': 'services:\n  db:\n    ports:\n      - target: 1\n        published: "5432"\n',
  'flow list': 'services:\n  db:\n    ports: ["5432:5432"]\n',
  'flow-map item': 'services:\n  db:\n    ports:\n      - {target: 1, published: 5432}\n',
  'merge key': 'x-p: &p\n  ports:\n    - "5432:5432"\nservices:\n  db:\n    <<: *p\n',
  'alias list': 'x-p: &p\n  - "5432:5432"\nservices:\n  db:\n    ports: *p\n',
  'aliased service': 'x-s: &s\n  ports:\n    - "5432:5432"\nservices:\n  db: *s\n',
  'block scalar ports': 'services:\n  db:\n    ports: >\n      5432:5432\n',
  'four-space indent': 'services:\n    db:\n        ports:\n        - "5432:5432"\n',
};

for (const [name, yml] of Object.entries(LAYOUTS)) {
  test(`no silent drop: ${name}`, () => {
    const d = mkdtempSync(join(tmpdir(), 'ks-wtd-'));
    roots.push(d);
    writeFileSync(join(d, 'docker-compose.yml'), yml);
    const s = scanCheckout(d);
    const found = s.resources.some((r) => r.kind === 'host-port' && r.value === '5432');
    assert.ok(found || s.unknown.length > 0, `${name}: ${JSON.stringify(s)}`);
  });
}
