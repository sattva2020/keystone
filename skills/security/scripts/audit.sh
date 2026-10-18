#!/bin/bash
# derived from ai-factory@2.19.0 skills/aif-security-checklist/scripts/audit.sh (MIT); see THIRD_PARTY_NOTICES.md
# Usage: bash ${CLAUDE_SKILL_DIR}/scripts/audit.sh   (run from the project root). Read-only.
# Run comprehensive security checks on a project

set -u  # no set -e: grep returns 1 on no match

echo "🔒 Security Audit"
echo "================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Counters
ISSUES=0
UNASSESSED=0

unassessed() { echo -e "${YELLOW}UNASSESSED: $1${NC}"; UNASSESSED=$((UNASSESSED+1)); }

# Files scanned for secrets: code + config (json/yaml/toml/env), incl. .mcp.json and .claude/settings*.json
INCLUDES=(--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --include="*.mjs" --include="*.py" --include="*.php"
  --include="*.go" --include="*.rb" --include="*.java" --include="*.cs" --include="*.json" --include="*.yml" --include="*.yaml"
  --include="*.toml" --include="*.env" --include=".env*" --include="*.sh")
EXCLUDES=(--exclude-dir=node_modules --exclude-dir=.git --exclude-dir=dist --exclude-dir=build --exclude-dir=vendor
  --exclude="package-lock.json" --exclude="pnpm-lock.yaml" --exclude="*.min.js")

# 1. Check for secrets in code and config (provider key shapes; values are never printed, only file:line)
echo "📝 Checking for hardcoded secrets..."
PROVIDER='ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|(^|[^A-Za-z0-9])sk-(proj-|svcacct-|admin-)?[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
# generic: a quoted literal of 12+ chars assigned to a secret-like name; placeholders and ${VAR} references are skipped
GENERIC='(password|passwd|secret|api_?key|token|private_key)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"'$ {}<>]{12,}["'"'"']'
# placeholder words are matched against the found value only (grep -o), so a real secret next to a comment like "# example" is kept;
# example / sample / template files and folders (.env.example, examples/) are skipped by path (DO-NOT-FLAG.md) — provider-format keys are still reported
SECRETS=$( { grep -rInE "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROVIDER" . 2>/dev/null
  grep -rIinoE "${INCLUDES[@]}" "${EXCLUDES[@]}" --exclude-dir=test --exclude-dir=tests --exclude-dir=__tests__ \
    --exclude="*.test.*" --exclude="*.spec.*" "$GENERIC" . 2>/dev/null | \
    grep -viE "^[^:]*(example|sample|template)[^:]*:[0-9]+:" | \
    grep -viE "^[^:]*:[0-9]+:.*(example|placeholder|changeme|your[_-]|xxxx|dummy|process\.env|os\.environ|getenv)"; } | \
  cut -d: -f1,2 | sort -u | head -20 || true)

if [ -n "$SECRETS" ]; then
  echo -e "${RED}⚠️  Potential secrets found (file:line, values not shown):${NC}"
  echo "$SECRETS"
  ISSUES=$((ISSUES+1))
else
  echo -e "${GREEN}✅ No obvious hardcoded secrets${NC}"
fi

# 1b. Git history (gitleaks if installed)
if [ -d .git ] || git rev-parse --git-dir >/dev/null 2>&1; then
  if command -v gitleaks >/dev/null 2>&1; then
    # gitleaks >= 8.19: `gitleaks git`; older versions only know `detect`
    if gitleaks git --help >/dev/null 2>&1; then GL=(gitleaks git --no-banner .); else GL=(gitleaks detect --no-banner); fi
    if "${GL[@]}" >/dev/null 2>&1; then
      echo -e "${GREEN}✅ gitleaks: no leaks in git history${NC}"
    else
      echo -e "${RED}⚠️  gitleaks reported leaks in git history - run '${GL[*]}'${NC}"
      ISSUES=$((ISSUES+1))
    fi
  else
    unassessed "git history (gitleaks not installed)"
  fi
fi
echo ""

# 2. Check for .env committed
echo "📝 Checking for .env in git..."
TRACKED_ENV=$(git ls-files '.env' '.env.*' '*/.env' '*/.env.*' 2>/dev/null | grep -vE '\.(example|sample|template)$' || true)
if [ -n "$TRACKED_ENV" ]; then
  echo -e "${RED}⚠️  .env file(s) tracked in git:${NC}"
  echo "$TRACKED_ENV"
  ISSUES=$((ISSUES+1))
else
  echo -e "${GREEN}✅ .env is not tracked${NC}"
fi
echo ""

# 3. Check .gitignore
echo "📝 Checking .gitignore..."
if [ -f .gitignore ]; then
  # only a line that ignores .env itself counts (.env.example or a comment does not); `!.env` re-includes it
  if grep -qE '^[[:space:]]*!/?\.env[[:space:]]*$' .gitignore; then
    echo -e "${YELLOW}⚠️  .env is re-included in .gitignore (!.env)${NC}"
    ISSUES=$((ISSUES+1))
  elif grep -qE '^[[:space:]]*(\*\*/)?/?\.env\*?[[:space:]]*$' .gitignore; then  # .env, /.env, **/.env, .env* — not .env.*
    echo -e "${GREEN}✅ .env in .gitignore${NC}"
  else
    echo -e "${YELLOW}⚠️  .env not in .gitignore${NC}"
    ISSUES=$((ISSUES+1))
  fi
else
  echo -e "${YELLOW}⚠️  No .gitignore found${NC}"
fi
echo ""

# 4. Dependency audit per ecosystem; a missing tool or no network is UNASSESSED, never a silent pass
NET_ERR='ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|offline|Could not resolve|Name or service not known|ConnectionError|Max retries exceeded|failed to fetch|network is unreachable'
dep_audit() {  # dep_audit <label> <binary to look for> <command...>
  local label=$1 bin=$2 out rc; shift 2
  echo "📝 Dependency audit: $label ($*)..."
  if ! command -v "$bin" >/dev/null 2>&1; then unassessed "dependency audit: $label ($bin not installed)"; echo ""; return; fi
  out=$("$@" 2>&1); rc=$?
  if [ $rc -eq 0 ]; then
    echo -e "${GREEN}✅ No known vulnerabilities ($label)${NC}"
  elif echo "$out" | grep -qiE "$NET_ERR"; then
    unassessed "dependency audit: $label (no network)"
  else
    echo -e "${RED}⚠️  Vulnerabilities found ($label) - run '$*' for details${NC}"
    ISSUES=$((ISSUES+1))
  fi
  echo ""
}
REQS=$(ls requirements*.txt 2>/dev/null || true)
if [ -n "$REQS" ]; then for REQ in $REQS; do dep_audit "python ($REQ)" pip-audit pip-audit -r "$REQ"; done
elif [ -f pyproject.toml ]; then dep_audit python pip-audit pip-audit .
elif [ -f Pipfile.lock ] || [ -f poetry.lock ]; then unassessed "dependency audit: python (no requirements*.txt or pyproject.toml for pip-audit)"
fi
[ -f Cargo.lock ] && dep_audit rust cargo-audit cargo audit
[ -f go.mod ] && dep_audit go govulncheck govulncheck ./...
if [ -f package.json ] && ! command -v npm >/dev/null 2>&1; then
  unassessed "dependency audit: npm (npm not installed)"
elif [ -f package.json ]; then
  echo "📝 Running npm audit..."
  NPM_OUT=$(npm audit --audit-level=high 2>&1); NPM_RC=$?
  if [ $NPM_RC -eq 0 ]; then
    echo -e "${GREEN}✅ No high/critical vulnerabilities${NC}"
  elif echo "$NPM_OUT" | grep -qiE "[0-9]+ (low|moderate|high|critical)? ?(severity )?vulnerabilit"; then
    echo -e "${RED}⚠️  Vulnerabilities found - run 'npm audit' for details${NC}"
    ISSUES=$((ISSUES+1))
  elif echo "$NPM_OUT" | grep -qiE "ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|offline|audit endpoint"; then
    unassessed "dependency audit (no network)"
  elif echo "$NPM_OUT" | grep -q "ENOLOCK"; then
    unassessed "dependency audit (no package-lock.json)"
  else
    echo -e "${RED}⚠️  Vulnerabilities found - run 'npm audit' for details${NC}"
    ISSUES=$((ISSUES+1))
  fi
  echo ""
fi

# 5. Check for verbose client logging in production code
echo "📝 Checking for verbose console statements..."
# whole tree, not only src/; tests, builds and dependencies are excluded by path, not by a word in the line
SRC_SCOPE=(--include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" --exclude-dir=node_modules --exclude-dir=.git
  --exclude-dir=dist --exclude-dir=build --exclude-dir=vendor --exclude-dir=coverage --exclude-dir=test --exclude-dir=tests
  --exclude-dir=__tests__ --exclude="*.test.*" --exclude="*.spec.*" --exclude="*.min.js")
LOGS=$(grep -rn -E "console\.(log|debug|info|trace)" "${SRC_SCOPE[@]}" . 2>/dev/null | head -10 || true)

if [ -n "$LOGS" ]; then
  echo -e "${YELLOW}⚠️  Verbose console output found (must be removed or gated outside production):${NC}"
  echo "$LOGS"
else
  echo -e "${GREEN}✅ No verbose console output${NC}"
fi
echo ""

# 6. Check for raw error rendering patterns
echo "📝 Checking for raw client-facing error patterns..."
RAW_ERRORS=$(grep -rn -E "(error|err)\.message|String\((error|err)\)|\.stack" "${SRC_SCOPE[@]}" . 2>/dev/null | head -10 || true)

if [ -n "$RAW_ERRORS" ]; then
  echo -e "${YELLOW}⚠️  Raw error usage found (verify production UI/API returns normalized client-safe errors):${NC}"
  echo "$RAW_ERRORS"
else
  echo -e "${GREEN}✅ No obvious raw error rendering patterns${NC}"
fi
echo ""

# 7. Check for TODO security items
echo "📝 Checking for security TODOs..."
TODOS=$(grep -rn --include="*.ts" --include="*.js" --include="*.py" --include="*.php" \
  -i "todo.*security\|fixme.*security\|xxx.*security\|hack" . 2>/dev/null | \
  grep -v node_modules | head -10 || true)

if [ -n "$TODOS" ]; then
  echo -e "${YELLOW}⚠️  Security TODOs found:${NC}"
  echo "$TODOS"
else
  echo -e "${GREEN}✅ No security TODOs${NC}"
fi
echo ""

# Summary
echo "================="
if [ $UNASSESSED -gt 0 ]; then
  echo -e "${YELLOW}$UNASSESSED check(s) UNASSESSED - the security gate is at least 'warn'${NC}"
fi
if [ $ISSUES -gt 0 ]; then
  echo -e "${RED}Found $ISSUES potential issue(s)${NC}"
  echo "Review the items above and fix before deployment."
  exit 1
else
  echo -e "${GREEN}✅ No critical issues found${NC}"
  echo "Remember to also review manually using /keystone:security"
  exit 0
fi
