# Team Workflow — Branches, ≤3 Collaborators, Coordination

Designed for a small "vibe-coding" team: 1–3 people (humans + agent sessions), one
production Worker, GitHub as the shared brain. The system stays fast by making the
*few* things that must not collide explicit, and leaving everything else free.

## 1. Branch model

| Branch | Purpose | Rules |
|--------|---------|-------|
| `main` | Deployable truth. What production runs. | Protected by convention: only merges from milestone branches, CI green required. Always deployable — if `main` is broken, fixing it is milestone #1 priority. |
| `mNNN/<slug>` | One milestone, one branch (`m211/finance-invoices`). | Branched from freshest `origin/main`. Merged (or squash-merged) when gates pass. Deleted after merge. |
| `wip/<who>-<slug>` | Long-running or experimental work. | Archive pattern from the reference project (`wip/m197-family-composer`) — push even half-done work so it survives a dead laptop; record its existence in the worklog. |
| `hotfix/mNNNa` | Production emergency. | Same gates, fastest path; letter-suffix milestone; merge + deploy + verify immediately. |

**Working on a user-named branch:** if the user says «روی برنچ X کار کن» — fetch,
`git checkout X` (create from `origin/main` if missing), and treat it as the
milestone branch. Never assume `main` — confirm which branch each session works on
as Step 1 output.

## 2. Milestone number claiming

The m-counter is a shared token. Three mechanisms, pick one per repo (cheap wins at
≤3 people):

1. **CHANGELOG claim line** — a `## In progress` section at top: `m211 — finance
   invoices — @alireza`. Claim before coding, move to a real entry at release.
2. **GitHub issue per milestone** — issue title IS the milestone id. Merging the PR
   closes it. Slightly heavier, survives people forgetting the chat.
3. **Chat lock** — "taking m211" in the team chat. Fine for two people, fragile at three.

Number allocation: next = highest across CHANGELOG + worklog + `git log` + open
claims + 1. **Never reuse** a number, even for an abandoned attempt — abandoned
numbers get a one-line CHANGELOG entry ("m212 — abandoned, absorbed into m214") so
the audit trail stays gapless.

## 3. File ownership matrix

At 1–3 people the cheapest conflict prevention is module-level ownership: each
collaborator "owns" a set of domain modules (recorded in `design.md` §3 module map).
Owning means: your review is required for changes to those modules.

- Cross-module changes: agree in the PR description (or an amendment to design.md)
  *before* the code.
- Shared files (`version.ts`, `CHANGELOG.md`, `worklog.md`, `api-routing/index.ts`)
  are **coordination files** — expect conflicts there by design; resolution rules:
  - `version.ts`: the deployer's value wins (§4).
  - `CHANGELOG.md`: keep both entries; order by release, not by merge time.
  - `worklog.md`: it's gitignored/local — if tracked, both append, conflicts
    resolved by re-appending both blocks intact.

## 4. Version bump ownership — one rule

**Whoever deploys, bumps.** One number per release, minted by the deployer at Step 6,
in their own branch, merged with it. This kills the classic failure: two people both
bump to 1.00.80; the second merge overwrites; production runs "1.00.80" that was
never tested as the final tree.

Two simultaneous releases ready at once: the earlier deploy wins the number; the
second re-bases, re-bumps to the next number, re-runs gates (its CHANGELOG entry
moves too). Annoying — which is the point: it serializes releases without tooling.

## 5. Deploy serialization

One deploy at a time, enforced socially at ≤3 people:

```
[team chat] "deploying m211 / 1.00.80 — starting backup"
    → backup → migrate → wrangler deploy → /health verify → byte-compare
[team chat] "m211 live — /health = 1.00.80/m211 — deploy lock free"
```

The lock covers the whole sequence (backup → publish → verify), not just the
`wrangler deploy` second. Two interleaved deploys are indistinguishable from
corruption in the audit trail.

## 6. Drift recovery ("restart from truth")

Between sessions, local copies rot: someone committed elsewhere, production raced
ahead, a worklog went unpushed. The reference system treats this as a *scheduled*
event, not an accident — every multi-session gap ended with a documented catch-up.

**Drift checklist (in order, no shortcuts):**

1. `git fetch origin` — see all remote state without touching local.
2. `git status` + `git stash list` — inventory everything local: uncommitted work,
   stashes, unpushed commits (`git log origin/main..HEAD --oneline`).
3. Unpushed local commits? → push or merge them first; they are real work.
4. Uncommitted junk (build artifacts, .DS_Store)? → clean it.
5. Genuine local-only work mixed with drift → branch it (`wip/pre-sync-<date>`)
   before any destructive step.
6. Nothing valuable local → `git reset --hard origin/main` on the default branch.
7. `curl <prod>/health` — compare production's `version`+`milestone` against
   `origin/main`'s `version.ts`:
   - production **behind** main → a release was pushed but not deployed; deploy it
     (own milestone) before new work.
   - production **ahead** of main → someone deployed unpushed code; treat that
     worker version as truth and backfill the repo (the m210 pattern: bundle
     byte-compared, then docs realigned).
8. Record the whole catch-up as bullets in the next worklog entry.

## 7. Merge checklist (before any `main` merge)

```text
[ ] design.md contract respected (no silent deviations)
[ ] npm run typecheck → zero
[ ] npm test → all green (record the count)
[ ] bundle rebuilt from src + byte-identical
[ ] six-fold bump done by the deployer (--check passes) — release milestones only
[ ] CHANGELOG entry with mNNN + version + title
[ ] worklog entry written (or committed, if tracked)
[ ] CI green on the branch
[ ] worktree clean; branch rebased on origin/main
```

## 8. CI as the third teammate

The reference CI (GitHub Actions on `main`): `npm ci` → `typecheck` → `test` →
`node --check worker/bundle.js` → self-host build + `/health` smoke. **No Cloudflare
deploy in CI** — deploys stay manual and serialized (Step 8), because a backup +
migration step is too dangerous to fire on every merge. Add a Docker/GHCR publish
workflow only if you ship containers (the reference does, tagging
`v1.00.57 → 1.00.57` — mind the leading zeros: match by regex, not semver).
