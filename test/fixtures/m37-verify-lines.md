# Verify: SEO-кабинет — рабочее пространство /seo с меню модулей (M37)

Date: 2026-11-05 · Base: be12a9d · Verdict: FAIL

## Checks

- commits: 59 (head 73fe422; incl. merged sonnet-latest-model work from main); files: 254
- build: `npm run build` (с `SWC_NATIVE_BINDING_CACHE=<local cache dir>`, зависимости в worktree) → pass
- test: `npm test` → not run (timeout after 600 s)
- lint: `eslint --max-warnings 0` по файлам 73fe422 → clean; общий прогон: 0 errors, 1 warning (eslint.config.mjs ignored by pattern)
- imports: not run (the verifier reads the diff)
- Architecture gate: n/a — no MUST NOT rules with a check
- Security gate: warn — low: S-1 (`POST /seo/proposals/:id/regenerate` and `POST /seo/proposals` without a per-user rate limit; budget is the global `SEO_LLM_MONTHLY_BUDGET_USD`)
- delta: since 2cabbed — 4 files changed since the last verify · judge: 58 rows (Done means 1-5, Task 1-15, 17, Row 1-16, 21-23, 26-28, 30, I-1, I-2, I-4, I-6…I-15, I-20) · rules scope: files changed since 2cabbed + frontend/lib/hooks/use-seo.ts · release refs: none · carried ids: Task 16, Row 17, 18, 19, 20, 24, 25, 29, 31, I-3, I-5, I-16, I-17, I-18, I-19 · late watch: Done means 2 · accepted violations: none
- cost: verify+fix $67.60

## Carried

carried: Task 16 — ok — carried from verify 2cabbed — docs/dev/seo-cabinet.md:136 has the checklist and :151 the mockup comparison. docs/dev/api/reference.md:968 lists the new routes. AGENTS.md:103, project-map.md:54,462 and seo-data-layer.md:5 are updated.
carried: I-19 — ok — carried from verify 2cabbed — see Row 20.

## Report

```text
Keystone verify: docs/keystone/2026-11-04-seo-cabinet-m37/plan.md · base be12a9d
Decisions: none (intent D27 explicitly supersedes D1 of `docs/keystone/2026-10-31-seo-ai-bot-checks/intent.md`; the weekly-letter replacement is recorded in `docs/notes/2026-11-05-seo-кабинет-m37-еженедельное-письмо-…`; nothing in accepted intents or `docs/notes` covers SEO cache invalidation)
Done means 1 — ok — typecheck `npx tsc -p frontend/tsconfig.typecheck.json` returned 0 errors and build passed; `npx vitest run backend/src/seo shared/__tests__` gave 109 files / 1360 passed (the verify-6 commit touched no backend or shared file); `frontend/components/seo` and `lib/hooks` from `frontend/` gave 140 files / 742 passed (from the repo root the `@/` alias is missing, see plan.md:295).
Done means 2 — not proven — all 10 menu items open on site-a.example and site-b.example under a real production login: this is release step R3, not run.
rule .claude/rules/keystone.md:5 — pass — red on revert reported for the new `it.each` (empty helper → 10 failed) and the source guard (1 failed) at plan.md:346
rule .claude/rules/keystone.md:9 — pass — same report
rule .claude/rules/keystone.md:10 — fail — `frontend/lib/hooks/use-site-backups.ts:45-57`; `frontend/lib/hooks/use-site-backups.ts:90-95`. The fix added an SEO cache reset to `useRequestSiteBackupExport` (`use-site-backups.ts:84-85`) because it "writes an event to «Журнал»", but missed two siblings in the same file with the same effect:
  - `useSetSiteBackupSchedule` writes a `site_updated` event into `seo_site_events` through `seo_site_change` (`backend/src/seo/seo-backups.service.ts:169-180`);
  - `useSiteBackupDownload` writes `backup_export_downloaded` (`backend/src/seo/site-backup-exports.service.ts:207`).
  The journal reads every kind of `seo_site_events` (`backend/src/seo/seo-cabinet.service.ts:423`). The guard in `use-seo-cabinet.test.ts` scans only `use-seo.ts`, so it cannot catch this. Repro: open `/seo/<id>/journal`, then within 30 s change the backup interval or download an archive on `/settings/site-backups` and go back to the journal; the new event does not show until `staleTime` runs out.
rule .claude/rules/keystone.md:11 — n/a — no channel or DB diagnosis in this fix
Keystone verify: 58 rows — ok 45, missing 0, wrong 0, not proven 13, BLOCKED 0, pending 0; unrequested 0
```

## Verdict

FAIL — Rules gate keystone.md:10: в `use-site-backups.ts` смена расписания бэкапа и скачивание архива пишут события в «Журнал», но кеш SEO не сбрасывают (сброс есть только у запроса выгрузки, и он без теста). Строк `wrong` нет; 13 not proven (prod R2–R4, «403 без seo.edit» без теста, миграция на одноразовом Postgres — только запись в плане).
