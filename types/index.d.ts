export type Handoff = {
  level: number
  tokens: number
  window: number
  shown: number // the offer stays hidden while level <= shown (Позже, or already started)
  pending: { file: string; mtime: number } | null
  cold: number | null // the last main-loop turn's time once the prompt cache has gone cold, null otherwise
}

export type Progress = { level: string; status: string; done: number; total: number; blocked: number; next: string | null }

declare module 'claude-code' {
  interface PluginState {
    keystone: { buttons: string[]; base: string; plan: string; bound: string[]; progress: Progress | null; handoff: Handoff; lang: 'en' | 'ru' | 'de' | 'fr' | 'es' }
  }
}
