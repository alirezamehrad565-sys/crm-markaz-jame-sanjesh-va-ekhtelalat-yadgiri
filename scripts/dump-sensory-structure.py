#!/usr/bin/env python3
"""dump-sensory-structure.py — export 2 completed sensory-form case_events as
SANITIZED structure (question keys kept, answer values truncated), so content
agents can design the analysis without touching family answers."""
import json
import os
import re
import subprocess

E = "/home/z/my-project/download/evidence/d1-inventory"
WRAP = "/tmp/sens-events-raw2.json"

schemas = json.load(open(f"{E}/schemas.json"))
cols = []
for r in schemas:
    if r["name"] == "case_events":
        body = re.sub(r"^CREATE TABLE [^(]*", "", r.get("sql") or "", flags=re.I)
        cols = re.findall(r"(?:\(|,)\s*\"?(\w+)\"?\s+\w", body)
print("case_events columns:", cols)
pay = next((c for c in cols if "payload" in c or "answer" in c or c in ("data", "content", "fill")), None)
if not pay:
    raise SystemExit(f"no payload-like column in {cols}")

sql = (
    "SELECT id, status, created_at, updated_at, substr("
    + pay
    + ",1,6000) AS payload_head FROM case_events WHERE event_type_id="
    "(SELECT id FROM case_event_types WHERE key='t-9fa42a382d') AND status='completed' LIMIT 2"
)
p = subprocess.run(
    ["npx", "wrangler", "d1", "execute", "center-system-db", "--remote", "--json", "--command", sql],
    cwd="/home/z/my-project/gh-work", capture_output=True, text=True, timeout=90,
    env=dict(os.environ),
)
if p.returncode != 0:
    raise SystemExit("wrangler failed: " + (p.stderr or p.stdout)[-300:])
d = json.loads(p.stdout)
rows = d[0]["results"] if isinstance(d, list) else d.get("results")
out = []
for r in rows:
    try:
        parsed = json.loads(r["payload_head"])
    except Exception:
        parsed = {"_raw": (r["payload_head"] or "")[:300]}
    if isinstance(parsed, dict):
        out.append({
            "id8": r["id"][:8], "status": r["status"],
            "payload_top_keys": list(parsed.keys()),
            "sample_truncated": {k: str(v)[:60] for k, v in list(parsed.items())[:14]},
        })
    else:
        out.append({"id8": r["id"][:8], "status": r["status"], "payload_type": type(parsed).__name__,
                    "sample_truncated": str(parsed)[:400]})
with open(f"{E}/prod-sensory-event-structure.json", "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=1)
print("sanitized rows:", len(out))
print(json.dumps(out, ensure_ascii=False)[:1200])
