// Class: a compose structural key whose block is written inline (flow style) is never skipped silently —
// it gives an `unknown` entry on its line (fix verify 2026-11-26, run 2).
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCheckout } from '../skills/implement/scripts/worktree-check.mjs';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const scan = (yml) => {
  const d = mkdtempSync(join(tmpdir(), 'ks-wtb-'));
  roots.push(d);
  writeFileSync(join(d, 'docker-compose.yml'), yml);
  return scanCheckout(d);
};

// [layout, line of the inline block]
const INLINE = {
  'flow service with ports': ['services:\n  db: { image: x, ports: ["5432:5432"] }\n', 2],
  'flow service with container_name': ['services:\n  db: { container_name: db }\n', 2],
  'second service inline': ['services:\n  api:\n    image: x\n  db: { ports: ["5432:5432"] }\n', 4],
  'flow services section': ['services: { db: { ports: ["5432:5432"] } }\n', 1],
  'flow volumes section': ['volumes: { data: { name: shared } }\n', 1],
  'flow networks section': ['networks: { n: { name: shared } }\n', 1],
};

for (const [name, [yml, line]] of Object.entries(INLINE)) {
  test(`inline block is not checked, not dropped: ${name}`, () => {
    const s = scan(yml);
    assert.ok(s.unknown.some((u) => u.line === line && u.reason === 'unsupported-yaml'), `${name}: ${JSON.stringify(s)}`);
  });
}

test('empty inline blocks stay silent; block services after an inline one are still parsed', () => {
  assert.deepEqual(scan('services: {}\nvolumes: {}\n').unknown, []);
  const s = scan('services:\n  db: { image: x }\n  web:\n    ports:\n      - "8080:80"\n');
  assert.deepEqual(s.resources.filter((r) => r.kind === 'host-port').map((r) => r.value), ['8080']);
});
