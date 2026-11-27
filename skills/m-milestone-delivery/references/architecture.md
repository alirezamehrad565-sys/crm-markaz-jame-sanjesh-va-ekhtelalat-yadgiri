# Architecture — Layered TypeScript on Cloudflare Workers

The system this workflow was proven on: ~340 TS files, 24 domain modules, 1376
tests, zero `tsc` errors, maintained by agent sessions that share no memory except
the contract. The structure below is what made that possible.

## 1. Layers and the golden dependency rule

```
src/
├── index.ts          ← Worker entry: fetch + scheduled; wires composition root only
├── core/             ← L1: shared infrastructure (db, auth, audit, errors, logger,
│                        notify client, storage R2/D1/chunked, version.ts, zod schemas)
├── domain/           ← L2: business modules (screening, finance, appointments, …)
├── application/      ← L3: HTTP routing, reports, dashboard, excel-import, e2e tests
└── test/             ← harness + mock-d1
```

**Golden rule — dependencies point one way, downward:**
`application → domain → core`. Domain **never** imports application. Core imports
only sibling core. Domain-to-domain imports are allowed only through a typed,
read-only service interface — never reach into another module's internals.

Why: with ≤3 people and stateless agents, the only scalable N-person convention is
one where a change's blast radius is predictable from its layer.

## 2. The domain module contract

Every domain module has the same five files (+README). Uniformity is the feature —
anyone (or any agent) can navigate module #20 as fast as module #1:

| File | Content |
|------|---------|
| `types.ts` | All types for the module — no logic |
| `pure.ts` | Pure functions (validation math, date handling, formatting) — no I/O, trivially testable |
| `service.ts` | The module's engine: injected deps (`{db, audit, logger}`), owns its tables, in-transaction audit writes |
| `routes.ts` | HTTP handlers + `registerRoutes(app, services)` — thin: parse → validate → service → shape response |
| `index.ts` | Re-exports only (the module's single public gate) |
| `README.md` | Fixed sections: Module / Responsibility / Public API / Owns / Depends On / Internal Structure / Testing / Boundaries |

Registration: `api-routing/index.ts` imports each module's `registerRoutes` and
mounts them. Adding a module = create folder → 5 files → update the dependency
matrix in `design.md` → register → migration → tests.

## 3. Validation: centralized zod

All request schemas live in **one** file (`src/core/shared/schemas.ts`), exported
constants, composed from base schemas (`UuidSchema`, `IsoDateTimeSchema`). Handlers
never inline `z.object`. Persian error messages on `.refine()` rules.

```ts
export const NewAppointmentSchema = z
  .object({
    staff_id: UuidSchema,
    start_at: IsoDateTimeSchema,
    end_at: IsoDateTimeSchema,
    students: z.array(AppointmentStudentRefSchema).max(20).default([]),
    note: z.string().max(2000).nullish(),
    session_type: z.enum(SESSION_TYPE_KEYS).nullish()
  })
  .refine((v) => Date.parse(v.end_at) > Date.parse(v.start_at), {
    message: 'زمان پایان باید بعد از زمان شروع باشد',
    path: ['end_at']
  });
```

Why centralized: schemas double as API documentation, prevent per-route divergence,
and make "what does the API accept" a one-file question for the next session.

## 4. Composition root & dependency injection

`src/index.ts` does nothing but build the world and hand it to the app:

```ts
export default {
  async fetch(request, env, _ctx) {
    const db = createDb(env.DB);
    const audit = createAuditWriter(db);
    const logger = createLogger('worker');
    const app = createApp({ db, audit, logger, teamDomain: env.CF_ACCESS_TEAM_DOMAIN, ...buildEnv(env) });
    return app.fetch(request, env, _ctx);
  }
};
```

Every service receives its deps via parameters — no module-level singletons, no
hidden imports of `env`. This is what lets the same code run under `wrangler dev`,
vitest (mock D1), and a self-host Node server unchanged.

## 5. tsconfig (strict, path-aliased)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "Bundler",
    "strict": true,
    "isolatedModules": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "types": ["@cloudflare/workers-types", "vitest/globals"],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@core/*": ["./src/core/*"],
      "@domain/*": ["./src/domain/*"],
      "@app/*": ["./src/application/*"]
    }
  },
  "include": ["src/**/*.ts"]
}
```

Aliases mirror the layers (`@core`, `@domain`, `@app`) — a wrong-direction import
is visible in the import line itself. Mirror the same aliases in `vitest.config.ts`.
A second tsconfig (`tsconfig.node-server.json`) extends this for the self-host
server with `node` types.

## 6. Testing

- **Vitest**, `globals: true`, tests colocated: `src/**/__tests__/*.test.ts`.
- D1 is mocked by a `mock-d1.ts` harness backed by `node:sqlite` — fast, no
  Miniflare, same SQL surface. Every service test runs against realistic rows.
- Two test tiers: **unit** (pure.ts functions) and **e2e** (route-level, through
  the real router). Regression tests are added for every fixed bug — the suite
  grew 1083 → 1376 this way; the count is itself a quality metric recorded in
  every worklog entry.
- Gate: `npm run typecheck` (zero) + `npm test` (all green). Both are quoted
  verbatim in the commit body.

## 7. Migrations

- `migrations/NNNN_<slug>_m<NNN>.sql` — four-digit sequence, slug, milestone ref
  (`0067_informant_bands_m176.sql`).
- **Additive only**: new files, never edits to applied ones. Schema changes exist
  in exactly one place: a migration.
- Applied-migrations are tracked in D1 (`d1_migrations` table) — deploy applies
  pending ones automatically; a filename↔row diff is part of the periodic audit
  (the m210 audit found 2 legacy rows this way).
- Production schema is *never* touched by hand (`d1 execute --file` is forbidden
  on prod — it's in the never-do list).

## 8. Bundle discipline

`worker/bundle.js` is generated from `src/` by `scripts/build-worker-bundle.mjs`
(esbuild, "do not hand-edit" banner). Since m179 the rule is: **always rebuild from
src, never surgical-edit** (pre-m179 surgical edits caused drift that took an audit
milestone to clean). Rebuild after every bump; verify with `node --check` +
byte-compare against the repo copy. A two-layer entry (`worker/entry.js` →
`worker/bundle.js`) keeps the deploy target stable.

## 9. Comment & naming style

- Comments carry **milestone + reason**, never bare numbers:
  `// m198 — empty/whitespace string = unset` → links to the CHANGELOG entry.
  The number without the reason is noise; the reason makes the history searchable.
- Comments in the team's spoken language (Persian in the reference project —
  colloquial, not formal), identifiers in English. Why: comments are read by the
  humans/agents closest to the domain; make them frictionless.
- No commented-out code, no emoji in code (⚠️ allowed), file-header comment for
  files >300 lines, comments updated in the same commit as the code they describe.
- Frontend note: raw ES modules in `public/` (no bundler) with `?v=` cache-busting —
  keep it boring; the SPA complexity budget is spent on the backend.
