# design.md — <Project Name>

> Binding contract. Every session reads this file FIRST; code, docs, and convenience
> all lose to it. Deviations require an explicit amendment milestone (`mNNN(design): …`).
> Fill every section before writing application code — this conversation is milestone m1.

## 1. Product goal

<3–10 lines: what the system does, for whom, and what "working" means.
Example shape: "A Persian-language CRM for a learning-disability assessment center:
39 assessment scales, appointments, therapeutic exercise bank, and a Telegram bot —
run by a 5-person staff on Cloudflare's free tier.">

## 2. Architecture

- Runtime: <Cloudflare Workers (ES modules) · D1 (SQLite) · R2 objects>
- Entry: <src/index.ts → createApp(composition root) → application/api-routing>
- Layers and the dependency rule:
  <core (infrastructure) ← domain (business modules) ← application (HTTP/UI glue).
  Dependencies point downward only. Domain never imports application.>

## 3. Module map

| Module | Responsibility | Owner (team mode) |
|--------|----------------|-------------------|
| <core/db> | <D1 access, query helpers> | <shared> |
| <domain/screening> | <assessment sessions + scoring> | <@name> |
| <…> | <…> | <…> |

Each domain module follows the file contract: `types.ts · pure.ts · service.ts ·
routes.ts · index.ts (+README.md)`. Public surface = `index.ts` only.

## 4. Data rules

- Schema changes **only** through new migrations: `migrations/NNNN_<slug>_m<NNN>.sql`
- Applied migrations are immutable. Additive evolution, no rewrites.
- Production schema is never touched by hand (no `d1 execute --file` on prod).
- Backups: <full D1 export before every deploy → backups/backup-<ts>.sql>
- Storage: <what lives in R2 vs D1; chunking rule if files are large>

## 5. API rules

- Auth: <e.g. session cookie, HS256, PBKDF2 passwords; role model>
- Validation: centralized zod schemas in <src/core/shared/schemas.ts>; no inline schemas
- Error shape: <{ok:false, error:{code,message}} · Persian user-facing messages>
- Every API route `no-store`; `/health` returns {ok, db, version, milestone, ts}
  and probes D1 with `SELECT 1`

## 6. Never-do list (absolute)

1. Never hand-run SQL against production.
2. Never edit an applied migration.
3. Never deploy with a bare `wrangler deploy` (backup + migrate + verify first).
4. Never surgical-edit the generated bundle — rebuild from src.
5. Never log PII or secrets.
6. Never physical-delete records the domain treats as immutable (<list them>).
7. Never add a heavy npm dependency without an amendment.
8. Never renumber or reuse milestone numbers.
9. <…project-specific prohibitions…>

## 7. Coding style

- Comments: <spoken language, e.g. Persian>, format `// mNNN — <reason>`; every
  milestone number links to its CHANGELOG entry. No commented-out code.
- Identifiers: English. Dates: store ISO-UTC, display <local timezone>.
- New module vs extending one: <rule of thumb, e.g. "new table owner → new module">
- Frontend: <raw ES modules in public/, ?v= cache-busting, no framework>

## 8. Definition of done (per milestone)

- [ ] `npm run typecheck` → zero errors
- [ ] `npm test` → all green (record the count)
- [ ] bundle rebuilt from src + byte-compare
- [ ] six-fold version bump (release milestones only) — `bump_version.py --check` passes
- [ ] CHANGELOG entry (`## [1.00.NN] — mNNN — title`)
- [ ] commit `mNNN(scope): one-line` pushed to GitHub
- [ ] deployed → live `/health` shows the new version+milestone
- [ ] worklog entry appended (Step 9)
