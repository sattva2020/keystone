#!/usr/bin/env bash
# Reproduce the gate screenshots from the Twitter series: a throwaway repo, a plan in each status,
# and the exact JSON Claude Code receives from hooks/gate.mjs. Usage: bash docs/social/twitter/demo-gates.sh
set -euo pipefail
GATE="$(cd "$(dirname "$0")/../../.." && pwd)/hooks/gate.mjs"
D=$(mktemp -d); trap 'rm -rf "$D"' EXIT
cd "$D" && git init -q
TASK=docs/keystone/2026-10-12-invoice-reminders
mkdir -p "$TASK" src
plan() { printf '# Plan: invoice reminders\n\nLevel: L · Mode: %s · Status: %s\n\n## Tasks\n- [ ] 1. reminder table\n' "$1" "$2" > "$TASK/plan.md"; }
hook() { echo "$1" | node "$GATE"; echo; }
echo x > src/invoice.test.ts
plan feature draft
git add -A && git -c user.name=demo -c user.email=demo@demo commit -qm init

echo "## 1. plan is draft → code edit"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"src/billing.ts\"}}"
echo "## 2. plan is draft → edit inside the plan folder (allowed, no output)"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Edit\",\"tool_input\":{\"file_path\":\"$TASK/plan.md\"}}"

plan feature implementing
echo "## 3. plan is implementing → git push"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git push origin main\"}}"
echo "## 4. plan is implementing, a task is still [ ] → end of turn"
hook "{\"hook_event_name\":\"Stop\",\"cwd\":\"$D\"}"

plan fix implementing
echo "## 5. fix mode → overwrite a committed test"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/invoice.test.ts\"}}"
echo "## 6. fix mode → new regression test file (allowed, no output)"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Write\",\"tool_input\":{\"file_path\":\"src/invoice.rounding.test.ts\"}}"

plan feature verified
echo "## 7. plan is verified → git push (allowed, no output)"
hook "{\"hook_event_name\":\"PreToolUse\",\"cwd\":\"$D\",\"tool_name\":\"Bash\",\"tool_input\":{\"command\":\"git push origin main\"}}"
