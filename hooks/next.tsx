// Keystone band above the prompt: the plan's next commands as buttons, and the offer to move the task to a clean
// session when the context has grown. A button only fills the box; you send it. keystone.ts publishes the buttons
// and the active plan into $.state and checks the agent's handoff answer; this file draws and starts things.
import type { EngineInterface, Register } from 'claude-code'
import { handoffPrompt, kTokens, levelFor, thresholdsFor } from './handoff.ts'

const IDLE = { level: 0, tokens: 0, window: 0, shown: 0, pending: null }
const BUSY = new Set(['pending', 'running', 'waiting'])

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
    const offer = plan !== '' && ho.pending === null && ho.level > ho.shown
    if (buttons.length === 0 && !offer) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    const rows = []
    if (offer)
      rows.push(
        <Box key="handoff" flexDirection="row" alignItems="center" columnGap={1}>
          <Text dimColor>Keystone: контекст {kTokens(ho.tokens)} из {kTokens(ho.window)} — передать задачу в чистую сессию?</Text>
          <Button key="handoff-go" label="Передать" onPress={async () => $.ui.toast(await startHandoff($))} />
          <Button key="handoff-later" label="Позже" onPress={() => $.state.set({ plugin: 'keystone', key: 'handoff' }, { ...ho, shown: ho.level })} />
        </Box>,
      )
    if (buttons.length > 0)
      rows.push(
        <Box key="next" flexDirection="row" alignItems="center" columnGap={1}>
          <Text dimColor>Keystone</Text>
          {buttons.map((cmd, i) => (
            <Button key={`next${i + 1}`} label={cmd} onPress={() => pick($, cmd)} />
          ))}
          <Button key="dismiss" label="×" role="dismiss" onPress={() => clear($)} />
        </Box>,
      )
    // the band is shared: keep what other mods draw below ours
    const rest = await next(e)
    return <Box flexDirection="column">{rows}{rest ?? null}</Box>
  })
}
