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
PROVIDER='ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|ghs_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-ant-[A-Za-z0-9_-]{10,}|sk-(proj-)?[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|sk_live_[A-Za-z0-9]{10,}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{35}|-----BEGIN [A-Z ]*PRIVATE KEY-----'
# generic: a quoted literal of 12+ chars assigned to a secret-like name; placeholders and ${VAR} references are skipped
GENERIC='(password|passwd|secret|api_?key|token|private_key)["'"'"']?\s*[:=]\s*["'"'"'][^"'"'"'$ {}<>]{12,}["'"'"']'
SECRETS=$( { grep -rInE "${INCLUDES[@]}" "${EXCLUDES[@]}" "$PROVIDER" . 2>/dev/null
  grep -rInE "${INCLUDES[@]}" "${EXCLUDES[@]}" --exclude-dir=test --exclude-dir=tests --exclude-dir=__tests__ \
    --exclude="*.test.*" --exclude="*.spec.*" "$GENERIC" . 2>/dev/null | \
    grep -viE "example|placeholder|changeme|your[_-]|xxxx|dummy|process\.env|os\.environ|getenv"; } | \
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
    if gitleaks detect --no-banner >/dev/null 2>&1; then
      echo -e "${GREEN}✅ gitleaks: no leaks in git history${NC}"
    else
      echo -e "${RED}⚠️  gitleaks reported leaks in git history - run 'gitleaks detect --no-banner'${NC}"
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
  if grep -q "\.env" .gitignore; then
    echo -e "${GREEN}✅ .env in .gitignore${NC}"
  else
    echo -e "${YELLOW}⚠️  .env not in .gitignore${NC}"
    ISSUES=$((ISSUES+1))
  fi
else
  echo -e "${YELLOW}⚠️  No .gitignore found${NC}"
fi
echo ""

# 4. NPM Audit (if package.json exists)
if [ -f package.json ]; then
  echo "📝 Running npm audit..."
  NPM_OUT=$(npm audit --audit-level=high 2>&1); NPM_RC=$?
  if [ $NPM_RC -eq 0 ]; then
    echo -e "${GREEN}✅ No high/critical vulnerabilities${NC}"
  elif echo "$NPM_OUT" | grep -qiE "ENOTFOUND|EAI_AGAIN|ECONNREFUSED|ETIMEDOUT|network|offline|audit endpoint"; then
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
LOGS=$(grep -rn -E "console\.(log|debug|info|trace)" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" src/ 2>/dev/null | \
  grep -v "test" | grep -v "spec" | head -10 || true)

if [ -n "$LOGS" ]; then
  echo -e "${YELLOW}⚠️  Verbose console output found (must be removed or gated outside production):${NC}"
  echo "$LOGS"
else
  echo -e "${GREEN}✅ No verbose console output in src/${NC}"
fi
echo ""

# 6. Check for raw error rendering patterns
echo "📝 Checking for raw client-facing error patterns..."
RAW_ERRORS=$(grep -rn -E "(error|err)\.message|String\((error|err)\)|\.stack" \
  --include="*.ts" --include="*.tsx" --include="*.js" --include="*.jsx" src/ 2>/dev/null | \
  grep -v "test" | grep -v "spec" | head -10 || true)

if [ -n "$RAW_ERRORS" ]; then
  echo -e "${YELLOW}⚠️  Raw error usage found (verify production UI/API returns normalized client-safe errors):${NC}"
  echo "$RAW_ERRORS"
else
  echo -e "${GREEN}✅ No obvious raw error rendering patterns in src/${NC}"
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
