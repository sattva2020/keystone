// Class: a compose `ports` / project form must give Compose's final value (fix verify 2026-11-26)
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { scanCheckout } from '../skills/implement/scripts/worktree-check.mjs';

const roots = [];
after(() => { for (const r of roots) try { rmSync(r, { recursive: true, force: true }); } catch { /* Windows file locks */ } });
const scan = (files) => {
  const d = mkdtempSync(join(tmpdir(), 'ks-wtf-'));
  roots.push(d);
  for (const [p, c] of Object.entries(files)) writeFileSync(join(d, p), c);
  return scanCheckout(d);
};
const of = (s, kind) => s.resources.filter((r) => r.kind === kind).map((r) => r.value).sort();

test('compact sequence under ports: (items at the key indent), short and long form', () => {
  const s = scan({ 'docker-compose.yml': 'services:\n  db:\n    ports:\n    - "5432:5432"\n    - target: 80\n      published: 8080\n    environment:\n    - A=1\n' });
  assert.deepEqual(of(s, 'host-port'), ['5432', '8080']);
  assert.deepEqual(s.unknown, []);
});

test('an anchor on the first service key keeps the indent state', () => {
  const s = scan({ 'docker-compose.yml': 'services:\n  db: &db\n    image: x\n    ports:\n      - "5432:5432"\n  api:\n    container_name: api\n    ports:\n      - &p "6000:6000"\n' });
  assert.deepEqual(of(s, 'host-port'), ['5432', '6000']);
  assert.deepEqual(of(s, 'container-name'), ['api']);
  assert.deepEqual(s.unknown, []);
});

test('quoted published (Compose docs form), on the dash line and below it', () => {
  const s = scan({ 'compose.yaml': "services:\n  w:\n    ports:\n      - target: 80\n        published: \"8080\"\n      - published: '8081'\n        target: 81\n" });
  assert.deepEqual(of(s, 'host-port'), ['8080', '8081']);
  assert.deepEqual(s.unknown, []);
});

test('COMPOSE_PROJECT_NAME in .env overrides compose name:', () => {
  const s = scan({ 'docker-compose.yml': 'name: app\nservices:\n  db:\n    image: x\nvolumes:\n  data:\n', '.env': 'COMPOSE_PROJECT_NAME=app-wt1\n' });
  assert.deepEqual(of(s, 'compose-project'), ['app-wt1']);
  assert.deepEqual(of(s, 'volume'), ['app-wt1_data']);
  assert.deepEqual(of(scan({ 'docker-compose.yml': 'name: app\nservices:\n  db:\n    image: x\n' }), 'compose-project'), ['app']);
});
