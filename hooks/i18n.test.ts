import { test, expect } from 'claude-code/testing'
import { LANGS, TABLE, pick, strings, langFromText, pickLang } from './i18n.ts'

const CYR = /[Ѐ-ӿ]/
const sample = (v: unknown) => (typeof v === 'function' ? v('2 h', '180k') : v)

test('every string has English, and English has no Cyrillic', async () => {
  for (const [k, row] of Object.entries(TABLE)) {
    expect([k, typeof sample(row.en)]).toEqual([k, 'string'])
    expect([k, CYR.test(sample(row.en))]).toEqual([k, false])
  }
})

test('a missing translation falls back to English, never to the key or an empty string', async () => {
  expect(pick({ en: 'Later' }, 'de')).toBe('Later')
  for (const lang of LANGS) for (const [k, v] of Object.entries(strings(lang))) expect([k, !!sample(v)]).toEqual([k, true])
  expect(strings('de').h).toBe('h') // de has no row of its own for the unit
  expect(strings('ru').handoff).toBe('Передать')
})

test("Claude Code's language setting maps by name or self-name, any case; anything else is English", async () => {
  expect(['Russian', 'РУССКИЙ', 'ru'].map(langFromText)).toEqual(['ru', 'ru', 'ru'])
  expect(['Deutsch', 'german'].map(langFromText)).toEqual(['de', 'de'])
  expect(['Français', 'francais'].map(langFromText)).toEqual(['fr', 'fr'])
  expect(['Español', 'espanol'].map(langFromText)).toEqual(['es', 'es'])
  expect(['japanese', '', undefined].map(langFromText)).toEqual(['en', 'en', 'en'])
})

test("the plugin option wins over the setting; auto follows it", async () => {
  expect(pickLang('de', 'russian')).toBe('de')
  expect(pickLang('auto', 'russian')).toBe('ru')
  expect(pickLang('auto', undefined)).toBe('en')
  expect(pickLang('zh', undefined)).toBe('en')
})
