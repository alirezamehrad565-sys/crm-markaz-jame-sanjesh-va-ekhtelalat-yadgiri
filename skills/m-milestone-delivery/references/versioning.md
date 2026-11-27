# Versioning — the Six-Fold Bump

## The scheme

Version is a **display string**, not semver: `1.00.79` = `MAJOR.MINOR.RELEASE`.

- Only the **last number** moves, +1 per *release milestone* (a milestone that
  changes behavior on production).
- **Docs-only and chore milestones never bump and never deploy** (`m207(docs)`,
  `m210(docs)` pattern). When unsure, don't bump — an unused number is harmless;
  a number that shipped twice poisons the audit trail.
- Leading zeros are part of the identity. Never normalize `1.00.79` to `1.0.79`.
- `MAJOR`/`MINOR` move only by explicit user decision (they have stayed 1.00
  through 210 milestones — don't invent a reason to move them).

**Milestone numbers** (`mNNN`) are independent of versions: monotonic, never
reused, letter suffixes for hotfixes (`m201a`, `m204a`), composite allowed
(`m170+m171`). The milestone counter can advance without a version bump.

## The six mirrors

The version string is stamped in **six places**. After the m195 drift incident
(one mirror forgotten → stale cache-buster served old assets), bumping became a
single scripted atomic pass instead of a manual checklist:

| # | File | What to update |
|---|------|----------------|
| 1 | `src/core/version.ts` | `APP_VERSION` **and** `APP_MILESTONE` — single source of truth |
| 2 | `package.json` | `"version"` field |
| 3 | `package-lock.json` | both `"version"` occurrences (root + packages."" — was found stale at 1.00.38 during m210 and fixed) |
| 4 | `public/index.html` | every `?v=1.00.79` cache-buster (12 occurrences in the reference project — bump **all**, not just the first) |
| 5 | `public/sw.js` | `const VERSION = 'v1.00.79'` (service-worker cache key — a missed bump serves a stale shell indefinitely) |
| 6 | `CHANGELOG.md` | new heading on top: `## [1.00.80] — m211 — <title>` |

Plus one **derived** artifact, rebuilt not edited: `worker/bundle.js` is generated
from `src/` (esbuild) — it embeds the old constants until rebuilt, so rebuild after
the bump and byte-compare against the repo copy.

### Why CHANGELOG is a "mirror"

The canonical milestone↔version map doesn't exist anywhere else. Commit subjects,
code comments (`// mNNN — reason`), and migration filenames all point *into* the
CHANGELOG entry. If the heading is missing or mistyped, every link dangles.

## Using the script

```bash
# audit only — no writes; reports each mirror's status
python3 scripts/bump_version.py <repo-root> --check

# the atomic bump (version + milestone + CHANGELOG heading)
python3 scripts/bump_version.py <repo-root> --milestone m211 --title "one-line release title"

# override the auto-computed next number (rare: catch-up after drift)
python3 scripts/bump_version.py . --milestone m211 --set 1.00.85 --title "catch-up"

# preview every edit before applying
python3 scripts/bump_version.py . --milestone m211 --title "x" --dry-run
```

The script degrades gracefully on generic projects: a missing `sw.js`, missing
`CHANGELOG.md`, or zero `?v=` occurrences is reported as `WARN`, not a failure —
mirror what your repo actually has.

## Post-bump verification (30 seconds)

```bash
python3 scripts/bump_version.py . --check        # all six mirrors = OK
grep -c '?v=1.00.80' public/index.html           # count equals previous count
node --check worker/bundle.js                    # bundle parses
```

## Hotfix flow

1. Fix on a branch from `origin/main`.
2. Bump with the letter-suffix milestone (`--milestone m201a`) — version still bumps
   (hotfix is a release).
3. If the hotfix touches `index.html`, run a **comment-balance check**
   (`<!--` count == `-->` count): hotfix m201a once ate a `-->` and blanked every
   stylesheet via an unclosed comment — 11/11 balance is now a standing gate.

## Health probe contract

`GET /health` must return (minimally):

```json
{ "ok": true, "db": "up", "version": "1.00.79", "milestone": "m209", "ts": "…" }
```

It must actually touch D1 (`SELECT 1`) so a database outage shows as `503` to
external monitors. Every deploy verification and every session start compares this
triple (`version`, `milestone`, `db`) against `version.ts` and the CHANGELOG head.
