# Companion Skills — Discovery, Security Testing, UI Drawings

The milestone lifecycle is self-sufficient, but three external skills plug directly
into it. Install them once per machine; the lifecycle tells you *when* each one
fires. Rule of thumb: **discovery** belongs to planning (Step 3), **security
testing** belongs to the quality gate (Step 5) and pre-deploy (Step 8), and **UI
dimensional drawings** belong to implementation (Step 4) — but any of them can run
standalone when the user asks.

---

## 1. find-skills — discover skills you don't have yet

**Source:** <https://www.skills.sh/vercel-labs/skills/find-skills> (vercel-labs/skills)

The package manager for the open agent-skills ecosystem. When a milestone needs a
capability that isn't installed (chart generation, PDF export, i18n tooling, …),
don't hand-roll it and don't guess — search the ecosystem first.

```bash
# one-time install of the discovery skill
npx skills add https://github.com/vercel-labs/skills --skill find-skills

# search the ecosystem
npx skills find <query>
```

**Lifecycle hook — Step 3 (planning):** while scoping a milestone, if the plan
requires a specialized capability, run a discovery pass before committing to an
approach. Search results are ranked by install count (prefer 1K+ installs), source
reputation (official sources like Vercel or Anthropic), and GitHub stars; check the
skills.sh leaderboard before deep CLI searches.

**Milestones never silently absorb a new dependency.** If a discovered skill
changes the toolchain (new build step, new runtime dependency), that is a
`design.md` amendment or its own chore milestone (`mNNN(chore): adopt <skill>`),
recorded in the worklog like any other decision.

**Triggers:** «اسکیلی برای X هست؟», "find a skill for X", "is there a skill that
does X", any wish for help in a domain the current stack doesn't cover.

---

## 2. strix — AI penetration testing as a quality gate

**Source:** <https://github.com/usestrix/strix> (72k★, Apache-2.0)

Autonomous AI pentest agents that run your code dynamically and validate
vulnerabilities with real proofs-of-concept — not static-analysis noise. Covers
the OWASP Top 10 plus injection, XSS, SSRF, IDOR, broken access control, and
business-logic flaws, in white-box, black-box, or combined mode.

```bash
# install the 9 agent skills (pentest, fix findings, CI scanning — OWASP included)
npx skills add usestrix/strix

# standalone CLI (alternative): needs Docker running + an LLM API key
curl -sSL https://strix.ai/install | bash
export STRIX_LLM="openai/gpt-5"        # any supported provider
export LLM_API_KEY="your-api-key"

# run an assessment (headless -n for CI)
strix --target ./app-directory
strix -n --target ./app-directory      # headless, CI-friendly
```

Results land in `strix_runs/<run-name>/` — add `strix_runs/` to `.gitignore` in
the same commit that adopts strix.

**Lifecycle hooks:**

- **Step 5 (quality gates):** the standing gates are typecheck + tests. Add a
  strix *quick scan* for any milestone that touches API routes, auth, input
  validation, file upload, or access control. Quick mode is time-boxed and
  high-impact-only (auth, access control, RCE, SQLi, SSRF) — it fits a milestone
  session; deep mode is a scheduled event, not a per-milestone habit.
- **Step 8 (pre-deploy):** for security-sensitive releases, run the scan against
  a **local dev server or staging**, not production. Never point autonomous
  pentest agents at the live production Worker without the user's explicit,
  informed consent.
- **Findings become milestones:** a confirmed vulnerability is fixed as a hotfix
  (`mNNNa`) or a dedicated security milestone (`mNNN(sec)`), with the strix run
  name + finding ID quoted in the worklog entry. Re-run the scan after the fix —
  "fixed" means "re-scanned clean", same logic as re-running tests.

**Team mode:** treat a strix run like a deploy (§5 of team-workflow) — announce it
in the team chat, since aggressive scanning against shared staging can collide
with someone else's testing.

**Triggers:** «تست امنیت», «پنتست», "security test this", "pentest the API",
"scan for vulnerabilities", OWASP review, pre-release security audit.

---

## 3. dimensional-drawing — Apple-style UI spec sheets

**Source:** <https://github.com/enesozturk/dimensional-drawing> (HTML/JS/CSS)

Turns any UI component into a one-page **technical dimensional drawing** in the
style of Apple accessory spec sheets: measured paddings, gaps, corner radii,
layers, and viewport placement — with a title block, plan view, exploded layers,
detail views, and variable tables. Can animate the assembly (Playwright + ffmpeg).

```bash
# install for Claude Code
git clone https://github.com/enesozturk/dimensional-drawing
cp -r dimensional-drawing/skills/* ~/.claude/skills/

# for other SKILL.md-compatible agents: point the agent at the SKILL.md files,
# or zip a skill folder for claude.ai / Claude desktop (Settings → Capabilities)
```

**Usage:** ask for a drawing and point at the source — a repo file, a Storybook
story, a URL, or a screenshot. Example: *"Make a dimensional drawing of the Card
component in src/components/Card.tsx"*.

**Lifecycle hooks:**

- **Step 3 → 4 (plan → implement):** for UI milestones, produce the dimensional
  drawing **before** writing CSS. It fixes the spacing/radius/layer variables as
  named values (`--pad-lg`, `--radius-card`) instead of magic numbers, which is
  exactly what the architecture contract wants. The drawing becomes the visual
  supplement to the milestone plan.
- **design.md UI specs:** embed or link drawings next to the UI rules section so
  future sessions rebuild components to the same measurements.
- **Step 9 (worklog):** attach the drawing path as worklog evidence for UI
  milestones — it documents *what was built* better than a bullet list can.

**Drawing rules the skill enforces:** monochrome, architecture over content,
variables instead of raw numbers, unbranded, and it never invents unknown values
(if a measurement isn't derivable, it flags it rather than guessing).

**Triggers:** «نقشه فنی UI», "dimensional drawing of this component", "spec sheet
for the Card component", measuring/labeling paddings, gaps, radii, or layers,
Apple-style component drawings.

---

## Install once, reference forever

```bash
npx skills add https://github.com/vercel-labs/skills --skill find-skills   # discovery
npx skills add usestrix/strix                                             # security (9 skills)
git clone https://github.com/enesozturk/dimensional-drawing               # UI drawings
cp -r dimensional-drawing/skills/* ~/.claude/skills/
```

After adoption, record all three in `design.md` (§ coding style / toolchain) so
every future session knows they exist and when to invoke them.
