export type Handoff = {
  level: number
  tokens: number
  window: number
  shown: number // the offer stays hidden while level <= shown (Позже, or already started)
  pending: { file: string; mtime: number } | null
}

declare module 'claude-code' {
  interface PluginState {
    keystone: { buttons: string[]; base: string; plan: string; handoff: Handoff }
  }
}
