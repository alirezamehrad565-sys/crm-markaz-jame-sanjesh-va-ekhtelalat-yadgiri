---
name: m-milestone-delivery
description: Milestone-driven delivery workflow for Cloudflare Workers + D1 + R2 projects, proven over 210 milestones. Covers the design.md contract (binding design document), m-numbered work phases, single-number version bump per release, worklog journaling, and atomic GitHub-push + Cloudflare-deploy coordination on named branches with up to 3 team collaborators. Integrates three companion skills — find-skills (ecosystem skill discovery via `npx skills find`), strix (AI penetration testing / OWASP security gates), and dimensional-drawing (Apple-style UI spec sheets) — wired into the lifecycle's planning, implementation, and quality-gate steps. Use this skill whenever the user asks to start or continue a milestone (mNNN), write or update a worklog, bump or sync the version, deploy a Worker, recover a drifted local copy, work on a specific GitHub branch, run a security test / pentest / OWASP scan (strix), make a UI dimensional drawing / spec sheet (dimensional-drawing), or find & install a skill for a capability (find-skills) — and for Persian phrases like «فاز بعدی m», «ورک‌لاگ بنویس», «بامپ نسخه», «دیپلوی روی کلادفلر», «برنچ X رو بگیر و کار کن», «هماهنگی گیت‌هاب و کلادفلر», «تست امنیت», «پنتست», «نقشه فنی UI», or team vibe-coding setup.
---

# M-Milestone Delivery

A complete delivery system for solo or small-team (≤3 people) TypeScript projects on
Cloudflare Workers. Every unit of work is a **milestone** (`m1`, `m2`, … `m210`, …) that
moves through one fixed lifecycle: *sync from GitHub truth → implement → quality gates →
version bump → commit + push → deploy → verify live → write the worklog entry*. The
discipline is the product: after 210 milestones the system still has zero version drift,
a fully aligned documentation set, and a journal that reconstructs any session.

## 1. The Design Contract — `design.md` (read this FIRST)

Before touching any code, locate the project's `design.md` and read it **completely**.
It is the binding contract for every decision you make in this repo.

- **Where to look:** repo root, `docs/design.md`, or wherever the user points you.
  If none exists, generate one from `assets/design-template.md`, review it with the
  user, and only then proceed (creating it is milestone `m1` of the project).
- **What it contains:** product goal, architecture layers, module map, data rules,
  API rules, a "never-do" list, coding style, and the definition of done.
  The exact required sections and a full template are in `references/design-contract.md`.
- **Adherence rules:**
  1. When code, docs, convenience, and `design.md` disagree — `design.md` wins.
     Ask the user instead of improvising around it.
  2. If a task genuinely cannot be done within the contract, the fix is an explicit
     `design.md` amendment (its own milestone entry, e.g. `m57(design): …`), never a
     silent deviation.
  3. Never-do lists in `design.md` (things like "never hand-edit applied migrations")
     are absolute. Re-read them before destructive operations.
- Why this matters: agent sessions are stateless; `design.md` is the memory that keeps
  milestone 1 and milestone 200 consistent. Skipping it is how conventions rot.

## 2. Core Concepts

| Concept | Meaning |
|---|---|
| **Milestone (`mNNN`)** | One coherent work unit: one feature, one fix, one refactor, or one docs pass. Numbers are monotonic and **never reused**. Hotfixes take letter suffixes (`m201a`); never renumber. |
| **Release version** | Display string like `1.00.79` (`MAJOR.MINOR.RELEASE`). Only the **last number** moves — bumped exactly once per release milestone. Docs-only/chore milestones deploy nothing and bump nothing. Not semver: preserve leading zeros, never normalize. |
| **Single source of truth** | `src/core/version.ts` exports `APP_VERSION` + `APP_MILESTONE`. Everything else is a mirror kept in sync by the **six-fold bump** (see §6). |
| **Worklog** | `worklog.md` at repo root, **gitignored** — a local, frank, append-at-bottom journal. One entry per milestone. Format in `references/worklog.md`. |
| **CHANGELOG** | The public, versioned record: `## [1.00.79] — m209 — <title>` per release. This is the canonical milestone↔version map. |
| **Live probe** | `GET /health` returns `{version, milestone, db, ok}` — the deployed truth. Every session starts and ends by comparing it against the repo. |

## 3. Session Lifecycle (the fixed loop)

Run these steps in order for every milestone. The loop is intentionally boring —
predictability across sessions is what makes the system audit-able.

### Step 0 — Load the design contract
Read `design.md` fully (§1). Note the never-do list before planning anything.

### Step 1 — Sync from GitHub truth ("restart from truth")
Local copies drift between sessions; production is the arbiter, `origin` is its record.

```bash
git fetch origin
git status                          # any local mess → surface it before destroying it
git branch --show-current
```

- **Default branch:** work happens on named branches, then merges to `main`
  (see §7 / `references/team-workflow.md`). If the user names a branch
  («روی برنچ X کار کن»), `git checkout X` after confirming it exists on origin;
  if it doesn't, create it from the freshest `origin/main`.
- **Drift recovery:** if local `main` diverged from `origin/main`, run the drift
  checklist in `references/team-workflow.md` §6 — never blind-merge; the standard
  protocol is `git fetch` + `git reset --hard origin/main` **after** confirming
  nothing local is unpushed or uncommitted.
- **Verify production:** `curl -s <prod-url>/health` and record
  `version` + `milestone`. If `/health` disagrees with `origin/main`'s
  `version.ts`, stop and reconcile before any new work.

### Step 2 — Claim the next milestone number
Find the highest `mNNN` across: last CHANGELOG entry, last worklog entry,
`git log --oneline -20`. The next number is **highest + 1**. In team mode, numbers
are claimed, not guessed (`references/team-workflow.md` §2).

### Step 3 — Plan the milestone (one coherent unit)
- One milestone = one theme. A feature milestone does not silently absorb an
  unrelated refactor; if you meet an opportunistic-refactor candidate, log it as a
  follow-up milestone instead of scope-creeping.
- Check `design.md` for anything that constrains the approach (layers, data rules,
  naming). State the plan and the target version to the user before coding.

### Step 4 — Implement
Follow the architecture in `references/architecture.md` (layered TypeScript, module
contract, centralized zod). **For UI milestones**, generate a dimensional drawing
of the target component first (`references/companion-skills.md` §3) — it fixes
spacing/radius/layer variables before any CSS is written. Non-negotiable rules:

- Dependency direction is one-way downward; a module's internals are only imported
  via its `index.ts`.
- All input validation through the centralized zod schemas — never inline `z.object`
  inside route handlers.
- SQL is parameterized, always; schema changes only through new, additively-numbered
  migrations (`0075_<slug>_m<NNN>.sql`); never edit an applied migration.
- Code comments reference milestones with a *reason*: `// m198 — empty string means
  unset` — the number links to the CHANGELOG entry.
- No secrets, no PII in logs, no physical deletes unless the design contract allows.

### Step 5 — Quality gates (both, or don't proceed)
```bash
npm run typecheck   # tsc --noEmit, strict — must be zero errors
npm test            # full suite — must be all green; record the count (e.g. 1376/1376)
```
**Security-sensitive milestones** (API routes, auth, input validation, uploads,
access control) add a strix quick scan on top of these gates
(`references/companion-skills.md` §2) — run against local/staging, never
production; findings become hotfix (`mNNNa`) or `mNNN(sec)` milestones.
Rebuild the deploy bundle from `src/` (never surgical-edit a generated bundle) and
byte-compare it against the repo copy. Gates are quoted verbatim in the commit body —
that habit is what made the history trustworthy.

### Step 6 — Version bump + docs
```bash
python3 scripts/bump_version.py <repo-root> --milestone mNNN --title "<one-line title>"
```
The script implements the **six-fold bump** in one atomic pass:
`version.ts` + `package.json` + `package-lock.json` + all `?v=` cache-busters in
`index.html` + `sw.js` VERSION + new CHANGELOG heading. Details and edge cases
(stale mirrors, hotfix bumps, comment-balance check) in `references/versioning.md`.

**Skip rules:** docs-only or chore milestones → no bump, no deploy
(`m207(docs)`, `m210(docs)` pattern). When in doubt, no-bump is the safer default;
a wasted number is harmless, a double-bump is a lie in the audit trail.

### Step 7 — Commit + push to GitHub
Conventional commits with the milestone number:
```
m211(finance): توضیح کوتاه فارسی — یا English summary
```
- Release milestones historically run a rich single commit, or the classic triple
  (`mNNN …` → `bundle: mNNN / 1.00.NN — rebuilt from src` → `worklog: mNNN — deployed & verified`).
  Either is fine; pick one style per repo and keep it.
- Title stays one line; test counts, gate results, and checklists go in the body.
- Push the working branch first; merge to `main` only after CI is green
  (`references/team-workflow.md` §4). `main` must always be deployable.

### Step 8 — Deploy to Cloudflare Workers + verify live
Never a bare `wrangler deploy` against production. The reference sequence
(reference implementation: a repo `scripts/update-remote.mjs`) is:

1. **Pre-deploy check** — `python3 scripts/predeploy_check.py <repo-root> --milestone mNNN`
2. **Backup** — full D1 export to `backups/backup-<timestamp>.sql`
3. **Migrate** — apply pending D1 migrations (tracked, idempotent), never raw SQL by hand
4. **Publish** — `wrangler deploy --var ENV:production`
5. **Verify** — `GET /health` must return the exact new `version` + `milestone`;
   spot-check a live asset byte-for-byte against the repo

If deploy fails: fix forward with a hotfix milestone (`mNNNa`) — never re-deploy an
old version to "roll back" silently.

### Step 9 — Write the worklog entry
Append one entry at the bottom of `worklog.md` (never rewrite history there).
Copy the skeleton from `assets/worklog-entry-template.md`. Fields: `Task ID:` /
`Agent:` / `Task:` (quote the user's request verbatim) / `Work Log:` (evidence-dense
bullets: discoveries, files touched, test counts, gate results, deploy id, live
verification, lessons) / `Stage Summary:` (production state + what remains).
Full field guide and real examples: `references/worklog.md`.

Commit the worklog only if the repo convention says it's tracked; the reference
system keeps it **gitignored** (frank local voice) and commits the CHANGELOG instead.

## 4. Team Mode (up to 3 collaborators)

The same lifecycle scales to a small vibe-coding team with four ownership rules:

1. **Milestone numbers are claimed**, not invented — a shared queue (CHANGELOG
   "In progress" line or an issue per mNNN) prevents two people shipping m211.
2. **Version bump belongs to the deployer** — whoever actually deploys bumps.
   No one else touches version.ts in a merge; two simultaneous bumps = rebase war
   resolved by "the deploy wins, the other re-milestones as a letter suffix".
3. **One deploy at a time** — deploys serialize on a single lock (a chat message is
   enough at ≤3 people). Verify `/health` matches *your* version before hand-off.
4. **Module-level file ownership** — collaborators own different domain modules;
   cross-module changes are agreed in the design.md/PR first, so merge conflicts
   become rare instead of managed.

Branch model, drift recovery protocol, and the merge checklist:
`references/team-workflow.md`.

## 5. Recovery Recipes

- **"What version is live?"** → `curl <prod>/health`; compare with `version.ts` and
  the top CHANGELOG heading. Three-way agreement = healthy.
- **"Local repo is stale/behind"** → §3 Step 1 protocol; document the sync in the
  next worklog entry (the reference system logs every such catch-up).
- **"Numbers diverged (two m211s exist)"** → the later one renumbers to the next
  free number with a `mNNN(m): renumber from m211` commit and a CHANGELOG note;
  never delete history.
- **"A bump was missed / a mirror is stale"** → run
  `bump_version.py --check`, fix the stale mirror(s) in a `mNNN(chore): version
  mirrors` commit, and record the incident in the worklog.

## 6. Quick Reference

```bash
# sync                    # claim next mNNN              # gates
git fetch origin          # last CHANGELOG/worklog/git   npm run typecheck
git reset --hard origin/main   # number + 1              npm test

# bump (release milestones only)
python3 scripts/bump_version.py . --milestone m211 --title "one-line title"

# pre-deploy gate → backup → migrate → publish → verify
python3 scripts/predeploy_check.py . --milestone m211
wrangler d1 export DB --output backups/backup-$(date +%s).sql
wrangler d1 migrations apply DB --remote
wrangler deploy --var ENV:production
curl -s https://<worker>.workers.dev/health
```

Commit: `mNNN(scope): one-line` · `mNNNa` hotfix · rich body with gate counts.
Bump mirrors: `version.ts` · `package.json` · `package-lock.json` · `index.html ?v=` ·
`sw.js` · `CHANGELOG.md` (+ rebuild `worker/bundle.js` from src).

## 7. Companion Skills (external integrations)

Three external skills bolt onto the lifecycle without changing it:

| Skill | Source | Fires at | Purpose |
|---|---|---|---|
| **find-skills** | `skills.sh/vercel-labs/skills/find-skills` | Step 3 (planning) | Discover & install skills for capabilities the stack lacks (`npx skills find <query>`); new toolchain = own chore milestone, never silent |
| **strix** | `npx skills add usestrix/strix` | Step 5 (gates) + Step 8 (pre-deploy) | AI pentest agents with real PoCs (OWASP Top 10, IDOR, SQLi, XSS, SSRF…); quick scan per security-sensitive milestone, deep scan scheduled; local/staging targets only |
| **dimensional-drawing** | `github.com/enesozturk/dimensional-drawing` | Step 4 (UI milestones) | Apple-style monochrome spec drawings — paddings/gaps/radii/layers as named variables; produce before writing CSS, attach as worklog evidence |

Install commands, lifecycle hooks, and trigger phrases:
`references/companion-skills.md`.

## 8. Reference Index

| File | Read when |
|---|---|
| `references/design-contract.md` | Starting a project, creating/amending `design.md`, or a task seems blocked by it |
| `references/versioning.md` | Any bump, any version-drift suspicion, CHANGELOG formatting |
| `references/worklog.md` | Writing an entry; recovering context from past entries |
| `references/architecture.md` | Implementing anything (layers, module contract, TS config, zod, tests, bundle) |
| `references/team-workflow.md` | Branch selection, merging, deploy locking, drift recovery, ≤3-person coordination |
| `references/companion-skills.md` | Installing/using find-skills, strix security scans, or dimensional-drawing UI specs |
| `scripts/bump_version.py` | Step 6 (has `--check` mode for audits) |
| `scripts/predeploy_check.py` | Step 8 gate before every production deploy |
| `assets/design-template.md` | Project has no `design.md` yet |
| `assets/worklog-entry-template.md` | Step 9, every milestone |
