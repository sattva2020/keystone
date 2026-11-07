// Keystone: UserPromptSubmit hook. When the app reports on child sessions (<side-sessions-event>), ask the model to
// sort them with the keystone:sessions skill before it answers. Any other prompt, or any error → silent, exit 0.
// The skill must come through the Skill tool: only then is ${CLAUDE_SKILL_DIR} in its commands filled in.
// Off switch: KEYSTONE_SESSIONS=off in Claude Code's environment. KEYSTONE_GATES=off does not touch this hook.
if (String(process.env.KEYSTONE_SESSIONS).toLowerCase() === 'off') process.exit(0);
const CONTEXT = 'Keystone: до ответа на событие вызови навык keystone:sessions (Skill tool) и разбери дочерние сессии.';

let raw = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  try {
    const prompt = String(JSON.parse(raw).prompt ?? '');
    if (prompt.includes('<side-sessions-event>')) {
      process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'UserPromptSubmit', additionalContext: CONTEXT } }));
    }
  } catch { /* not our event */ }
  process.exit(0);
});
