// Headless test driver: executor (claude -p, opus) in a scratch clone; simulated user (claude -p, sonnet)
// answers from a hidden scenario. Usage: node drive.mjs <scenario.json>
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN = resolve(dirname(fileURLToPath(import.meta.url)), '../..').replace(/\\/g, '/'); // Keystone plugin root

const sc = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const out = join(dirname(process.argv[2]), 'runs', sc.id);
mkdirSync(out, { recursive: true });
const SETTINGS = resolve(out, 'settings.json').replace(/\\/g, '/');
writeFileSync(SETTINGS, JSON.stringify({ enabledPlugins: { 'keystone@keystone': false } }));
const log = join(out, 'transcript.md');
writeFileSync(log, `# ${sc.id}\n\n`);

const EXEC_SYS = `Это автоматический тест скиллов. Живого пользователя в интерфейсе нет и инструмент AskUserQuestion недоступен.
Когда скилл велит спросить пользователя или запросить подтверждение — напиши вопросы обычным текстом (нумерованно, с рекомендованным ответом, как требует скилл) и ЗАВЕРШИ ход. Ответ придёт следующим сообщением.
Не выдумывай ответы за пользователя. Не делай git push, не трогай сеть, кроме чтения файлов репозитория.`;

const SECRET = /^(SUPABASE|DOKPLOY|RAILWAY|PG|DATABASE|ANTHROPIC_API|OPENAI|OPENROUTER|STRIPE|RESEND|GITHUB_TOKEN|GH_TOKEN|AWS|B2_|SENTRY_AUTH)/i;
function cleanEnv(extra) { const e = { ...process.env }; if (sc.isolate) for (const k of Object.keys(e)) if (SECRET.test(k)) delete e[k]; return { ...e, ...extra }; }
function claude(args, input, env = {}, cwd = sc.cwd) {
  const r = spawnSync('claude', args, { cwd, input, encoding: 'utf8', maxBuffer: 64 << 20,
    env: cleanEnv(env), timeout: 40 * 60 * 1000, shell: true });
  if (r.status !== 0 && !r.stdout) throw new Error(`claude failed: ${r.stderr?.slice(0, 2000)}`);
  return r.stdout;
}

function exec(prompt, sessionId) {
  const args = ['-p', '--model', sc.model || 'opus', '--output-format', 'json', '--permission-mode', 'acceptEdits',
    // the plugin under test via --plugin-dir; the installed keystone@keystone is switched off so only this copy loads
    ...(sc.plugin === false ? [] : ['--plugin-dir', JSON.stringify(PLUGIN), '--settings', JSON.stringify(SETTINGS)]),
    '--allowedTools', '"Read Write Edit Glob Grep Task Skill Bash(git:*) Bash(mkdir:*) Bash(ls:*) Bash(node:*) Bash(shasum:*) Bash(sha256sum:*) Bash(printenv:*) mcp__memlab__search_decisions mcp__memlab__search_code mcp__memlab__explain"',
    ...(sc.noSys ? [] : ['--append-system-prompt', JSON.stringify(EXEC_SYS + (sc.extraSys ? "\n" + sc.extraSys : ''))]),
    ...(sc.isolate ? ['--strict-mcp-config', '--disallowedTools', (sc.allowPush ? '"' : '"Bash(git push:*) ') + 'Bash(node:*) Bash(npx:*) Bash(npm:*) Bash(curl:*) Bash(psql:*) WebFetch WebSearch"'] : [])];
  if (sc.isolate) args.splice(args.indexOf('--allowedTools') + 1, 1, '"Read Write Edit Glob Grep Task Skill Bash(git status:*) Bash(git diff:*) Bash(git log:*) Bash(git add:*) Bash(git commit:*) Bash(git show:*) Bash(git rev-parse:*) Bash(git branch:*) Bash(git checkout:*) Bash(git switch:*) ' + (sc.allowPush ? 'Bash(git push:*) ' : '') + 'Bash(mkdir:*) Bash(ls:*) Bash(printenv:*)"');
  if (sessionId) args.push('--resume', sessionId);
  const seen = sessionId ? turnTexts(sessionId).length : 0;
  const raw = claude(args, prompt, sc.env || {});
  const j = JSON.parse(raw.slice(raw.indexOf('{')));
  // every main-thread assistant message of this turn (j.result is only the last one; a question can sit earlier)
  const all = turnTexts(j.session_id).slice(seen);
  const text = all.length ? all.join('\n\n') : (j.result ?? '');
  return { text, session: j.session_id, cost: j.total_cost_usd ?? 0, turns: j.num_turns };
}

function turnTexts(sid) {
  const dir = join(homedir(), '.claude', 'projects');
  for (const d of readdirSync(dir)) {
    const f = join(dir, d, `${sid}.jsonl`);
    if (!existsSync(f)) continue;
    const out = [];
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.type !== 'assistant' || m.isSidechain) continue;
      for (const c of m.message?.content ?? []) if (c.type === 'text' && c.text.trim()) out.push(c.text);
    }
    return out;
  }
  return [];
}

function simulate(history, lastMsg) {
  const prompt = `Ты играешь роль пользователя — ${sc.persona}
Скрытый сценарий (это ТВОИ решения; агент их не знает):
${sc.hidden}

Правила: отвечай только на то, что спросили, коротко, по-русски, как живой разработчик. Решения бери из сценария.
Если спрашивают факт о коде/системе, который агент мог найти сам, — ответь «не знаю, посмотри в коде» (это проверка).
Если спрашивают то, чего нет в сценарии, — прими рекомендованный агентом вариант, если он разумен, иначе скажи как считаешь нужным.
Если просят подтвердить итог/план — сверь со сценарием: совпадает → «подтверждаю»; нет → назови расхождение.
Предыдущий обмен (кратко): ${history.slice(-3000)}

Последнее сообщение агента:
"""${lastMsg}"""

Твой ответ (только текст ответа):`;
  return claude(['-p', '--model', 'sonnet', '--output-format', 'text', '--tools', '""', '--strict-mcp-config', '--disable-slash-commands', '--setting-sources', '""'], prompt, {}, tmpdir()).trim();
}

let total = 0;
for (const step of sc.steps) {
  appendFileSync(log, `\n## STEP: ${step.prompt}\n`);
  let r = exec(step.prompt, step.newSession ? null : globalThis.sid);
  globalThis.sid = r.session; total += r.cost;
  let history = '';
  for (let i = 0; i < (step.maxRounds ?? 8); i++) {
    appendFileSync(log, `\n### AGENT (turns=${r.turns}, $${r.cost.toFixed(2)})\n${r.text}\n`);
    history += `\nАГЕНТ: ${r.text.slice(-1500)}`;
    if (step.done && new RegExp(step.done, 'i').test(r.text)) break;
    if (!/\?|❓|подтверд|approve|adjust|Q\d/i.test(r.text)) break; // nothing asked
    if (step.noUser) break;
    const ans = simulate(history, r.text);
    appendFileSync(log, `\n### USER(sim)\n${ans}\n`);
    history += `\nПОЛЬЗОВАТЕЛЬ: ${ans}`;
    r = exec(ans, globalThis.sid); total += r.cost;
  }
}
appendFileSync(log, `\n---\nTOTAL $${total.toFixed(2)} session ${globalThis.sid}\n`);
console.log(`${sc.id} done $${total.toFixed(2)} -> ${log}`);
