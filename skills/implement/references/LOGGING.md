<!-- derived from ai-factory@2.19.0 skills/aif-implement/references/LOGGING-GUIDE.md (MIT); see THIRD_PARTY_NOTICES.md -->
# Logging while implementing

Read this only when the plan header says `logging — standard` or `verbose`. For `minimal`, add no new logs beyond what
the project's existing code already does at the same place.

AI-generated code often has subtle bugs that are hard to debug without proper logging. The level is the plan's
`Settings:` line; use the project's existing logger and style first.

| Level | What to log |
|---|---|
| minimal | nothing new; keep existing logs working |
| standard | external calls (API, DB, file, network), state changes, and error context |
| verbose | everything in standard, plus function entry/exit with parameters and return values |

## Guidelines

1. **Log function entry/exit** with parameters and return values (verbose only).
2. **Log state changes** — before and after mutations.
3. **Log external calls** — API requests, database queries, file operations.
4. **Log error context** — include the relevant variables, not just the error message.
5. **Use structured logging** when possible (JSON format).

## Example pattern (verbose)

```typescript
function processOrder(order: Order): Result {
  console.log('[processOrder] START', { orderId: order.id, items: order.items.length });

  try {
    const validated = validateOrder(order);
    console.log('[processOrder] Validation passed', { validated });

    const result = submitToPayment(validated);
    console.log('[processOrder] Payment result', { success: result.success, transactionId: result.id });

    return result;
  } catch (error) {
    console.error('[processOrder] ERROR', { orderId: order.id, error: error.message, stack: error.stack });
    throw error;
  }
}
```

## Logs must be configurable and manageable

1. **Use log levels** — DEBUG, INFO, WARN, ERROR.
2. **Environment-based control** — a `LOG_LEVEL` env variable.
3. **Easy to disable** — a single flag or env var turns verbose logs off.
4. **Consider rotation** — for file-based logs, implement rotation or use existing tools.

```typescript
// Good: configurable logging
const LOG_LEVEL = process.env.LOG_LEVEL || 'debug';
const logger = createLogger({ level: LOG_LEVEL });

// Good: can be disabled
if (process.env.DEBUG) {
  console.log('[debug]', data);
}

// Bad: hardcoded verbose logs that can't be turned off
console.log(hugeObject); // will pollute production logs
```

## Why this matters

- Generated code may have edge cases not covered.
- Logs help identify WHERE things go wrong; debugging without logs wastes time.
- The user can remove logs later, but missing logs during development is costly.
- Production safety — logs must be reducible to avoid performance and storage costs.

Do not skip the logging the Settings line asks for to "keep code clean" — and do not add more than it asks for.
