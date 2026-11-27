#!/usr/bin/env python3
"""d1-inventory.py — read-only inventory of the production D1 (center-system-db).

No token is stored in this file; it is read from env (CLOUDFLARE_API_TOKEN /
CLOUDFLARE_ACCOUNT_ID) exported by the caller. Every query is SELECT-only.
Sensitive columns (names, phones, tokens, payloads, notes, b64) are stripped
before writing; big tables are counted/pivoted, never dumped.
"""
import json
import os
import re
import subprocess

DB = "center-system-db"
OUT = "/home/z/my-project/download/evidence/d1-inventory"
os.makedirs(OUT, exist_ok=True)

STRIP = re.compile(
    r"token|secret|password|content_b64|phone|national|first_name|last_name|"
    r"birth|username|email|payload|notes$|_notes|body|fill_|student_id|owner_staff|staff_id$",
    re.I,
)


def wr(sql, name):
    p = subprocess.run(
        ["npx", "wrangler", "d1", "execute", DB, "--remote", "--json", "--command", sql],
        cwd="/home/z/my-project/gh-work",
        capture_output=True, text=True, timeout=90,
        env=dict(os.environ),
    )
    if p.returncode != 0:
        print(f"FAIL {name}: {(p.stderr or p.stdout)[-200:]}")
        return None
    try:
        d = json.loads(p.stdout)
        res = d[0]["results"] if isinstance(d, list) else d.get("results")
    except Exception as e:
        print(f"FAIL parse {name}: {e}")
        return None
    with open(f"{OUT}/{name}.json", "w") as f:
        json.dump(res, f, ensure_ascii=False, indent=1)
    print(f"OK   {name}: {len(res)} rows")
    return res


def sanitize(rows):
    out = []
    for r in rows or []:
        out.append({k: v for k, v in r.items() if not STRIP.search(k)})
    return out


tables = wr("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name", "tables") or []
names = [r["name"] for r in tables]
schemas = wr("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name", "schemas") or []
cols = {}
for r in schemas:
    body = re.sub(r"^CREATE TABLE [^(]*", "", r.get("sql") or "", flags=re.I)
    cols[r["name"]] = set(re.findall(r"(?:\(|,)\s*\"?(\w+)\"?\s+\w", body))

if names:
    parts = [f"SELECT '{n}' AS t, COUNT(*) AS n FROM \"{n}\"" for n in names]
    wr(" UNION ALL ".join(parts) + " ORDER BY n DESC", "counts")

# ---- exercise bank: real uploaded/seeded cards (titles + taxonomy, no names)
if "exercises" in names:
    sel = ["e.title", "e.format", "e.created_at"]
    for c, alias in (("published", "published"), ("status", "status")):
        if c in cols.get("exercises", set()):
            sel.append(f"e.{c} AS {alias}")
    attach = ""
    if "exercise_attachments" in names and "exercise_id" in cols.get("exercise_attachments", set()):
        attach = ",(SELECT COUNT(*) FROM exercise_attachments a WHERE a.exercise_id=e.id) AS files"
    join = ""
    if "created_by" in cols.get("exercises", set()) and "staff" in names and "role" in cols.get("staff", set()):
        join = " LEFT JOIN staff s ON s.id=e.created_by"
        sel.append("s.role AS creator_role")
    wr("SELECT " + ", ".join(sel) + attach + " FROM exercises e" + join +
       " WHERE e.deleted_at IS NULL ORDER BY e.created_at DESC LIMIT 400", "exercises")
    if "exercise_tags" in names:
        wr("SELECT t.label AS tag, COUNT(*) AS n FROM exercise_tags et "
           "JOIN tags t ON t.id=et.tag_id GROUP BY t.label ORDER BY n DESC LIMIT 60", "exercise_tag_usage")

# ---- pathway templates (system + therapist-created), full content
if "pathway_templates" in names:
    wr("SELECT * FROM pathway_templates ORDER BY created_at DESC LIMIT 120", "pathway_templates")

# ---- real treatment plans: aggregate only (no clinical text)
if "intervention_paths" in names:
    cset = cols.get("intervention_paths", set())
    sel = ["COUNT(*) AS total"]
    for c in ("status",):
        if c in cset:
            sel.append(f"SUM(CASE WHEN status IS NOT NULL THEN 1 ELSE 0 END) AS with_{c}")
    wr("SELECT " + ", ".join(sel) + " FROM intervention_paths", "plans_count")
    if "created_at" in cset:
        wr("SELECT substr(created_at,1,7) AS month, COUNT(*) AS n FROM intervention_paths "
           "GROUP BY month ORDER BY month DESC LIMIT 18", "plans_by_month")
    if "template_id" in cset and "pathway_templates" in names:
        wr("SELECT pt.name AS template, COUNT(*) AS n FROM intervention_paths ip "
           "JOIN pathway_templates pt ON pt.id=ip.template_id GROUP BY pt.name ORDER BY n DESC LIMIT 40",
           "plans_by_template")
    if "created_by" in cset and "staff" in names and "role" in cols.get("staff", set()):
        wr("SELECT s.role AS creator_role, COUNT(*) AS n FROM intervention_paths ip "
           "JOIN staff s ON s.id=ip.created_by GROUP BY s.role", "plans_by_creator_role")

# ---- case-event type census + status pivot (survey flow visibility)
fk = None
for c in cols.get("case_events", set()):
    if c.endswith("type_id"):
        fk = c
        break
if fk and "case_event_types" in names:
    tsel = ["t.key", "t.title"]
    for c, a in (("audience", "audience"), ("is_system", "is_system"), ("tool_source", "tool_source"), ("tool_norm", "tool_norm")):
        if c in cols.get("case_event_types", set()):
            tsel.append(f"t.{c} AS {a}")
    wr("SELECT " + ", ".join(tsel) + ", COUNT(c.id) AS n FROM case_event_types t "
       f"LEFT JOIN case_events c ON c.{fk}=t.id GROUP BY t.id ORDER BY n DESC", "event_type_census")
    if "status" in cols.get("case_events", set()):
        wr("SELECT t.key, c.status, COUNT(*) AS n FROM case_events c "
           f"JOIN case_event_types t ON t.id=c.{fk} GROUP BY t.key, c.status ORDER BY t.key, n DESC", "event_status_pivot")
    if "created_at" in cols.get("case_events", set()):
        wr("SELECT substr(created_at,1,7) AS month, COUNT(*) AS n FROM case_events "
           "GROUP BY month ORDER BY month DESC LIMIT 18", "events_by_month")

# ---- form responses (aggregate only)
if "form_responses" in names:
    cset = cols.get("form_responses", set())
    g = "form_key" if "form_key" in cset else ("form_id" if "form_id" in cset else None)
    if g:
        selsel = f"{g}, COUNT(*) AS n"
        if "status" in cset:
            selsel += ", status"
        wr(f"SELECT {selsel} FROM form_responses GROUP BY {g}" + (", status" if "status" in cset else "") +
           " ORDER BY n DESC LIMIT 60", "form_responses_agg")

# ---- submissions (family homework loop), knowledge, games, misc
if "exercise_submissions" in names and "status" in cols.get("exercise_submissions", set()):
    wr("SELECT status, COUNT(*) AS n FROM exercise_submissions GROUP BY status", "submissions_agg")
if "knowledge_items" in names:
    wr("SELECT title, category, created_at FROM knowledge_items ORDER BY created_at DESC LIMIT 100", "knowledge_items")
for t in ("games", "game_packages", "screening_entries", "assessment_files", "waitlist", "todos"):
    if t in names:
        wr(f"SELECT '{t}' AS tbl, COUNT(*) AS n FROM \"{t}\"", f"count_{t}")
if "staff" in names and "role" in cols.get("staff", set()):
    wr("SELECT role, COUNT(*) AS n FROM staff WHERE deleted_at IS NULL GROUP BY role", "staff_by_role")
if "students" in names:
    a = ", 1" if "active" not in cols.get("students", set()) else ""
    wr("SELECT COUNT(*) AS total" + (", SUM(CASE WHEN active=1 THEN 1 ELSE 0 END) AS active" if "active" in cols.get("students", set()) else "") + f" FROM students{a}", "students_agg")

print("done →", OUT)
