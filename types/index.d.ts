export type Handoff = {
  level: number
  tokens: number
  window: number
  shown: number // the offer stays hidden while level <= shown (Позже, or already started)
  pending: { file: string; mtime: number } | null
  cold: number | null // the last main-loop turn's time once the prompt cache has gone cold, null otherwise
}

export type Progress = { level: string; status: string; done: number; total: number; blocked: number; next: string | null; cost: number }

// The side panel (hooks/panel.tsx): rows come from skills/sessions/scripts/panel.mjs.
export type PanelRow = {
  id: string; title: string
  state: 'working' | 'waiting' | 'idle' | 'unknown'
  ready: boolean // may be archived
  stage: string | null // the plan's status or 'intent'; null without a plan
  done: number; total: number
  code: string | null; arg: string // why it waits: r_<code> in hooks/i18n.ts
  next: string | null // that session's next command, text only
  wait: boolean // belongs in "Waiting for you"
}
export type PanelOwn = {
  plan: { file: string; level: string; status: string; done: number; total: number; blocked: number; release: number } | null
  next: string | null; wait: { code: string; arg: string } | null
  verdict: string | null; coverage: string | null; security: string | null
  cost: string; sessionUsd: number | null
}
export type PanelData = { rows: PanelRow[] | null; own: PanelOwn; at: number; stale: boolean } // rows null: no answer yet

declare module 'claude-code' {
  interface PluginState {
    keystone: { buttons: string[]; base: string; plan: string; bound: string[]; unbound: string; progress: Progress | null; panel: PanelData | null; panelClosed: { closed: boolean; names: string[] }; handoff: Handoff; lang: 'en' | 'ru' | 'de' | 'fr' | 'es' }
  }
}
