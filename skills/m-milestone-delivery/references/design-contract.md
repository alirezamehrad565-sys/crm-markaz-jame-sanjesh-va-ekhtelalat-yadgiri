# The Design Contract — `design.md`

## Role

`design.md` is the binding agreement between the human and every future agent session.
It converts tacit conventions ("the way we've always done it") into written law, so a
session that starts with zero context still behaves like the session that wrote the
code. In the reference project this role is played by `docs/ARCHITECTURE.md` (1,259
lines, 12 sections) plus `docs/CODE-STYLE.md`; the skill normalizes them into one
front-loaded contract file.

**The three adherence rules** (from SKILL.md §1, repeated here because they are the
most-violated discipline in agent-driven work):

1. **design.md wins.** When it conflicts with speed, convenience, model preference, or
   even the user's half-remembered habit — stop and ask. The document exists precisely
   for moments where improvising would be faster.
2. **Deviations are amendments.** If the task truly can't fit the contract, the fix is
   an explicit amendment milestone (`mNNN(design): allow X because Y`) that updates
   `design.md` first, then the code. Silent drift is forbidden.
3. **Never-do lists are absolute.** Read the "never" section before *any* destructive
   or schema-touching operation: hand-running SQL on production, editing applied
   migrations, adding heavy dependencies, physical deletes, logging PII.

## Required sections (in this order)

A minimal-but-complete `design.md` has eight sections. If any is missing, the file is
"a sketch", not a contract — offer to complete it as its own milestone.

| # | Section | What it must nail down |
|---|---------|------------------------|
| 1 | **Product goal** | 3–10 lines. What the system is for, who uses it, what "working" means. Enough to judge scope questions later. |
| 2 | **Architecture** | Layers + the dependency rule (which layer may import which), runtime targets (Workers + D1 + R2), entry points. |
| 3 | **Module map** | Every domain module with a one-line responsibility + the standard file contract each module follows. |
| 4 | **Data rules** | Where schemas live, how migrations are numbered/named, immutability rules (never edit applied migrations), backup policy. |
| 5 | **API rules** | Auth model, validation strategy (centralized zod), error shape, pagination, `no-store`, the `/health` contract with `version` + `milestone`. |
| 6 | **Never-do list** | The absolute prohibitions, numbered so commits can cite them. Keep 8–18 items — long enough to matter, short enough to be re-read. |
| 7 | **Coding style** | Language of comments, comment format (`// mNNN — reason`), naming, file layout rules, what triggers a new module vs extending one. |
| 8 | **Definition of done** | The gates (typecheck zero, all tests green, bundle rebuilt from src, mirrors synced, CHANGELOG + worklog written, live `/health` verified). |

## Amendment protocol

```text
1. Open a milestone with the (design) scope:
      m57(design): allow chunked uploads because R2 single-PUT fails >100MB
2. Edit design.md in the SAME commit as the first code change that relies on it.
3. Update any section that the amendment touches — do not append contradictory
   paragraphs; rewrite the rule in place and keep the never-do list numbered.
4. Record the amendment in the worklog entry ("design amended: rule 6.3 now allows …").
```

If you discover the code already violates the contract (legacy drift), do not silently
fix or silently ignore. Add it to a "known drift" note in `design.md` and decide with
the user: fix now (own milestone) or accept documented.

## Starter template

A full fill-in template ships at `assets/design-template.md`. Generate a project's
`design.md` from it, walk the user through each section **before writing any
application code**, and treat that conversation as milestone `m1` — the project's
first entry in CHANGELOG and worklog.
