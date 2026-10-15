import { test, expect } from 'claude-code/testing'
import { linkify, inside } from './links.ts'

const BASE = 'E:/work/repo'
const anyFile = async () => true

test('a path that leaves the session folder through an inner ".." is not linked', async () => {
  for (const p of ['hooks/../../other/x.ts', 'E:/work/repo/../other/x.ts', 'a/b/../../../x.ts']) {
    expect(inside(p, BASE)).toBe(null)
    expect(await linkify(`see \`${p}\``, BASE, anyFile)).toBe(`see \`${p}\``)
  }
})

test('".." that stays inside the session folder resolves to a clean relative link', async () => {
  expect(inside('hooks/../docs/a.md', BASE)).toBe('docs/a.md')
  expect(inside('E:/work/repo/hooks/./x/../keystone.ts', BASE)).toBe('hooks/keystone.ts')
  expect(await linkify('`hooks/../docs/a.md:3`', BASE, anyFile)).toBe('[`hooks/../docs/a.md:3`](docs/a.md:3)')
})
