// Keystone band above the prompt: the plan's next commands as buttons, and the offer to move the task to a clean
// session when the context has grown. A button only fills the box; you send it. keystone.ts publishes the buttons
// and the active plan into $.state and checks the agent's handoff answer; this file draws and starts things.
import type { EngineInterface, Register } from 'claude-code'
import { coldText, handoffPrompt, kTokens, levelFor, thresholdsFor } from './handoff.ts'
import { strings, type Lang } from './i18n.ts'

const IDLE = { level: 0, tokens: 0, window: 0, shown: 0, pending: null, cold: null }
const BUSY = new Set(['pending', 'running', 'waiting'])

// The band's look, pure: a chip names the stage (the full command with its plan path goes into the box), bars fill
// by fraction — Svg on the desktop, block glyphs in the terminal — and the context bar warms up with the handoff level.
type Tone = 'success' | 'suggestion' | 'warning' | 'error'
export const chip = (cmd: string, status = 'status') => (cmd === '/keystone-status' ? status : cmd.match(/^\/keystone:([a-z]+)/)?.[1] ?? cmd)
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

// the language keystone.ts settled on at session.start; English until then
export async function langOf($: EngineInterface): Promise<Lang> {
  return (await $.state.get({ plugin: 'keystone', key: 'lang' }).catch(() => ({ value: undefined }))).value ?? 'en'
}

const clear = ($: EngineInterface) => $.state.set({ plugin: 'keystone', key: 'buttons' }, [])

async function pick($: EngineInterface, cmd: string) {
  const box = await $.prompt.read()
  const filled = await $.prompt.fill({ text: box.text === '' ? cmd : ` ${cmd}`, mode: 'append' })
  if (filled.isFilled) await clear($)
  else $.ui.toast(`Keystone: ${cmd}`) // no box or a dialog holds it: show the command instead of running a model turn
}

// Asks the agent to bring plan.md up to date; keystone.ts's turn.complete runs /clear once it answers the marker.
async function startHandoff($: EngineInterface): Promise<string> {
  const t = strings(await langOf($))
  const { value: file = '' } = await $.state.get({ plugin: 'keystone', key: 'plan' })
  if (!file) return t.noPlan
  if ((await $.agent.list()).some((a) => BUSY.has(a.status))) return t.waitAgents
  const mtime = (await $.fs.stat(file)).mtimeMs
  const { value: ho = IDLE } = await $.state.get({ plugin: 'keystone', key: 'handoff' })
  await $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, shown: ho.level, pending: { file, mtime } })
  // a prompt cannot be sent while a command's own dispatch runs: send it once that has finished
  $.clock.after(0, () => void $.prompt.submit({ text: handoffPrompt(file) }).catch(() => undefined))
  return t.handoffStarted
}

// Cold cache: /clear with no model turn — the history is not re-read; what the plan lacks is lost. The classic
// SessionStart hook below puts the plan's next command into the box, as after a handoff.
async function startClean($: EngineInterface) {
  const t = strings(await langOf($))
  const { value: pr = null } = await $.state.get({ plugin: 'keystone', key: 'progress' })
  if (!pr?.next) return $.ui.toast(t.noNext)
  await $.store.set('handoff:next', pr.next)
  $.clock.after(0, () =>
    void $.command.run({ command: 'clear' }).catch(() => $.ui.toast(t.clearFailed(pr.next))),
  )
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
    const cold = plan !== '' && ho.pending === null && ho.cold !== null && !!pr?.next
    if (buttons.length === 0 && !offer && !cold) return next(e)
    const { Box, Button, Text, Svg } = $.ui.resolve(e)
    const lang = await langOf($)
    const t = strings(lang)
    const w = Math.max(t.plan.length, t.context.length)
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
      bars.push(bar('plan-bar', t.plan.padEnd(w), pr.done / pr.total, 'success', `${pr.done}/${pr.total}${pr.blocked ? ` · ${pr.blocked} blocked` : ''}`))
    if (ho.window > 0)
      bars.push(
        bar('ctx-bar', t.context.padEnd(w), ho.tokens / ho.window, toneFor(ho.level), wide ? `${pct(ho.tokens / ho.window)} · ${kTokens(ho.tokens)}/${kTokens(ho.window)}` : pct(ho.tokens / ho.window),
          offer ? [
            <Button key="handoff-go" label={t.handoff} variant="primary" onPress={async () => $.ui.toast(await startHandoff($))} />,
            <Button key="handoff-later" label={t.later} dimColor onPress={() => $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, shown: ho.level })} />,
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
    if (cold) {
      const dropCold = () => $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, cold: null })
      rows.push(
        <Box key="cold" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          <Text color="warning" wrap="truncate-end">{coldText((await $.clock.now()) - (ho.cold ?? 0), ho.tokens, lang)}</Text>
          <Button key="cold-clean" label={t.clean} variant="primary" onPress={() => startClean($)} />
          <Button key="cold-save" label={t.save} onPress={async () => { await dropCold(); $.ui.toast(await startHandoff($)) }} />
          <Box flexGrow={1} />
          <Button key="cold-dismiss" label="×" role="dismiss" dimColor onPress={dropCold} />
        </Box>,
        <Text key="cold-note" dimColor wrap="truncate-end">{t.cleanNote}</Text>,
      )
    }
    if (buttons.length > 0)
      rows.push(
        <Box key="next" flexDirection="row" flexWrap="wrap" alignItems="center" columnGap={1}>
          {buttons.map((cmd, i) => (
            <Button key={`next${i + 1}`} label={chip(cmd, t.status)} variant={i === 0 ? 'primary' : 'secondary'} onPress={() => pick($, cmd)} />
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
