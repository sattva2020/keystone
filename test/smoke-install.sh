#!/usr/bin/env bash
# Smoke: install + remove the Keystone AI Factory adapter on a throwaway copy of a real project.
# Usage: test/smoke-install.sh <project dir> [scratch dir]
# The project itself is never touched.
set -euo pipefail
EXT="$(cd "$(dirname "$0")/.." && pwd)/adapters/ai-factory"
SRC="${1:?project dir}"
T="${2:-$(mktemp -d)}/proj"
rm -rf "$T"; mkdir -p "$T/.ai-factory"
cp "$SRC/.ai-factory.json" "$T/"
[ -f "$SRC/.ai-factory/config.yaml" ] && cp "$SRC/.ai-factory/config.yaml" "$T/.ai-factory/"
for d in .claude .codex .opencode; do [ -d "$SRC/$d/skills" ] && mkdir -p "$T/$d" && cp -r "$SRC/$d/skills" "$T/$d/"; done
[ -d "$SRC/.ai-factory/extensions" ] && cp -r "$SRC/.ai-factory/extensions" "$T/.ai-factory/"
git -C "$T" init -q

fail=0
check() { if eval "$2"; then echo "ok   $1"; else echo "FAIL $1"; fail=1; fi; }

grep -q "#### Requirements Reconciliation Gate" "$T/.claude/skills/aif-plan/SKILL.md" \
  || { echo "FAIL core < 2.19: no Requirements Reconciliation Gate in aif-plan — run ai-factory update --force"; exit 1; }

(cd "$T" && ai-factory extension add "$EXT" >/dev/null)
check "injection in aif-plan (prepend)" "grep -q 'aif-ext:keystone-aif:aif-plan:prepend:start' '$T/.claude/skills/aif-plan/SKILL.md'"
for s in aif-implement aif-verify; do
  check "injection in $s" "grep -q 'aif-ext:keystone-aif:$s:append:start' '$T/.claude/skills/$s/SKILL.md'"
done
check "adapter installs no skills (they come from the keystone plugin)" "[ ! -e '$T/.claude/skills/grill' ] && [ ! -e '$T/.claude/skills/intent' ]"
check "plan checkpoints before core workflow" "[ \$(grep -n 'MANDATORY checkpoints' '$T/.claude/skills/aif-plan/SKILL.md' | cut -d: -f1) -lt \$(grep -n '^## Workflow' '$T/.claude/skills/aif-plan/SKILL.md' | head -1 | cut -d: -f1) ]"
for s in aif-implement aif-verify; do
  n=$(grep -c "aif-ext:" "$SRC/.claude/skills/$s/SKILL.md" || true)
  check "other extensions intact in $s" "[ \$(grep -c 'aif-ext:' '$T/.claude/skills/$s/SKILL.md') -eq $((n + 2)) ]"
done

(cd "$T" && ai-factory extension remove keystone-aif >/dev/null)
for s in aif-plan aif-implement aif-verify; do
  check "removed cleanly from $s" "diff -q <(tr -d '\r' < '$SRC/.claude/skills/$s/SKILL.md' | sed -e :a -e '/^\n*\$/{\$d;N;ba' -e '}') <(tr -d '\r' < '$T/.claude/skills/$s/SKILL.md' | sed -e :a -e '/^\n*\$/{\$d;N;ba' -e '}') >/dev/null"
done
exit $fail
