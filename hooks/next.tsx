// Keystone band above the prompt: the plan's next commands as buttons, and the offer to move the task to a clean
// session when the context has grown. A button only fills the box; you send it. keystone.ts publishes the buttons
// and the active plan into $.state and checks the agent's handoff answer; this file draws and starts things.
import type { EngineInterface, Register } from 'claude-code'
import { handoffPrompt, kTokens, levelFor, thresholdsFor } from './handoff.ts'

const IDLE = { level: 0, tokens: 0, window: 0, shown: 0, pending: null }
const BUSY = new Set(['pending', 'running', 'waiting'])

// The band's look, pure: a chip names the stage (the full command with its plan path goes into the box), bars fill
// by fraction — Svg on the desktop, block glyphs in the terminal — and the context bar warms up with the handoff level.
type Tone = 'success' | 'suggestion' | 'warning' | 'error'
export const chip = (cmd: string) => (cmd === '/keystone-status' ? 'статус' : cmd.match(/^\/keystone:([a-z]+)/)?.[1] ?? cmd)
export const pct = (f: number) => `${Math.round(Math.max(0, Math.min(1, f)) * 100)}%`
export const toneFor = (level: number): Tone => (level >= 2 ? 'error' : level === 1 ? 'warning' : 'suggestion')
export const barText = (f: number, cells: number) => {
  const n = Math.round(Math.max(0, Math.min(1, f)) * cells)
  return '█'.repeat(n) + '░'.repeat(cells - n)
}
const HEX: Record<Tone, string> = { success: '#2da44e', suggestion: '#3b82f6', warning: '#d97706', error: '#dc2626' }
export const barSvg = (f: number, tone: Tone, w: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="8" viewBox="0 0 ${w} 8">` +
  `<rect width="${w}" height="8" rx="4" fill="#8888884d"/>` +
  `<rect width="${Math.round(Math.max(0, Math.min(1, f)) * w)}" height="8" rx="4" fill="${HEX[tone]}"/></svg>`

const clear = ($: EngineInterface) => $.state.set({ plugin: 'keystone', key: 'buttons' }, [])

async function pick($: EngineInterface, cmd: string) {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: box.text === '' ? cmd : ` ${cmd}`, mode: 'append' })
  if (filled.isFilled) await clear($)
  else $.ui.toast(`Keystone: ${cmd}`) // no box or a dialog holds it: show the command instead of running a model turn
}

// Asks the agent to bring plan.md up to date; keystone.ts's turn.complete runs /clear once it answers the marker.
async function startHandoff($: EngineInterface): Promise<string> {
  const { value: file = '' } = await $.state.get({ plugin: 'keystone', key: 'plan' })
  if (!file) return 'Нет активного плана Keystone — передавать нечего.'
  if ((await $.agent.list()).some((a) => BUSY.has(a.status))) return 'Keystone: дождитесь субагентов, потом передавайте задачу.'
  const mtime = (await $.fs.stat(file)).mtimeMs
  const { value: ho = IDLE } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
  await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, shown: ho.level, pending: { file, mtime } })
  // a prompt cannot be sent while a command's own dispatch runs: send it once that has finished
  $.clock.after(0, () => void $.prompt.submit({ text: handoffPrompt(file) }).catch(() => undefined))
  return 'Keystone: агент обновит план, затем сессия очистится и следующая команда встанет в поле ввода.'
}

export const register: Register = (on) => {
  on('session.measure', async ($, e, next) => {
    try {
      const { tokens, window } = e.context
      const level = levelFor(tokens, thresholdsFor(window))
      const { value: ho = IDLE } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
      if (ho.level !== level || ho.tokens !== (tokens ?? 0) || ho.window !== window)
        await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, level, tokens: tokens ?? 0, window, shown: Math.min(ho.shown, level) })
    } catch {
      // the offer is optional
    }
    return next(e)
  })

  on('command.run', { command: 'keystone-handoff' }, async ($) => ({ text: await startHandoff($) }))

  // after the handoff's /clear: the plan's next command waits in the box, the buttons are back
  on('classic.SessionStart', async ($, e, next) => {
    if (e.source === 'clear') {
      const cmd = (await $.store.get('handoff:next').catch(() => undefined)) as string | undefined
      if (cmd) {
        await $.store.delete('handoff:next').catch(() => undefined)
        await $.state.set({ plugin: 'keystone', key: 'handoff' }, IDLE).catch(() => undefined)
        await $.state.set({ plugin: 'keystone', key: 'buttons' }, [cmd, '/keystone-status']).catch(() => undefined)
        $.clock.after(0, async () => {
          const filled = await $.prompt.fill({ text: cmd, mode: 'append' }).catch(() => ({ isFilled: false }))
          if (!filled.isFilled) $.ui.toast(`Keystone: ${cmd}`)
        })
      }
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.isWorking || e.props.hasSurvey) return next(e)
    const { value: buttons = [] } = await $.state.get({ plugin: 'keystone', key: 'buttons' })
    const { value: ho = IDLE } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
    const { value: plan = '' } = await $.state.get({ plugin: 'keystone', key: 'plan' })
    const { value: pr = null } = await $.state.get({ plugin: 'keystone', key: 'progress' })
    const offer = plan !== '' && ho.pending === null && ho.level > ho.shown
    if (buttons.length === 0 && !offer) return next(e)
    const { Box, Button, Text, Svg } = $.ui.resolve(e)
    const desktop = e.surface === 'desktop'
    const cols = e.props.bodyColumns
    const wide = cols >= 72
    const cells = Math.max(6, Math.min(24, cols - (wide ? 30 : 0) - 34))
    const bar = (key: string, label: string, frac: number, tone: Tone, tail: string, extra?: unknown) => (
      <Box key={key} flexDirection="row" alignItems="center" columnGap={1}>
        <Text dimColor>{label}</Text>
        {desktop ? (
          <Svg source={barSvg(frac, tone, cells * 8)} alt={`${label} ${pct(frac)}`} width={cells * 8} height={8} />
        ) : (
          <Text color={tone}>{barText(frac, cells)}</Text>
        )}
        <Text wrap="truncate-end">{tail}</Text>
        {extra ?? null}
      </Box>
    )
    const bars = []
    if (pr && pr.total > 0)
      bars.push(bar('plan-bar', 'План    ', pr.done / pr.total, 'success', `${pr.done}/${pr.total}${pr.blocked ? ` · ${pr.blocked} blocked` : ''}`))
    if (ho.window > 0)
      bars.push(
        bar('ctx-bar', 'Контекст', ho.tokens / ho.window, toneFor(ho.level), wide ? `${pct(ho.tokens / ho.window)} · ${kTokens(ho.tokens)}/${kTokens(ho.window)}` : pct(ho.tokens / ho.window),
          offer ? [
            <Button key="handoff-go" label="Передать" variant="primary" onPress={async () => $.ui.toast(await startHandoff($))} />,
            <Button key="handoff-later" label="Позже" dimColor onPress={() => $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, shown: ho.level })} />,
          ] : undefined),
      )
    const title = pr ? `Keystone · ${pr.level} · ${pr.status}` : 'Keystone'
    const rows = []
    rows.push(
      wide ? (
        <Box key="bars" flexDirection="row" columnGap={2}>
          <Box width={28}><Text dimColor wrap="truncate-end">{title}</Text></Box>
          <Box flexDirection="column">{bars}</Box>
        </Box>
      ) : (
        <Box key="bars" flexDirection="column">
          <Text dimColor wrap="truncate-end">{title}</Text>
          {bars}
        </Box>
      ),
    )
    if (buttons.length > 0)
      rows.push(
        <Box key="next" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          {buttons.map((cmd, i) => (
            <Button key={`next${i + 1}`} label={chip(cmd)} variant={i === 0 ? 'primary' : 'secondary'} onPress={() => pick($, cmd)} />
          ))}
          <Box flexGrow={1} />
          <Button key="dismiss" label="×" role="dismiss" dimColor onPress={() => clear($)} />
        </Box>,
      )
    // the band is shared: keep what other mods draw below ours
    const rest = await next(e)
    return <Box flexDirection="column">{rows}{rest ?? null}</Box>
  })
}
