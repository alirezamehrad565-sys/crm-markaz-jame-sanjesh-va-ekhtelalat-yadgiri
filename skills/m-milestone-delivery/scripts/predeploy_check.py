#!/usr/bin/env python3
"""predeploy_check.py — the gate before every production Worker deploy.

Run AFTER the six-fold bump, BEFORE backup/migrate/wrangler deploy:

  predeploy_check.py <repo-root> --milestone m211
  predeploy_check.py <repo-root> --milestone m211 --prod-url https://app.example.workers.dev
  predeploy_check.py <repo-root> --milestone m211 --run-gates        # + typecheck & tests
  predeploy_check.py <repo-root> --allow-dirty                       # dev/staging only

Checks (FAIL → exit 1; WARN → eye required):
  git repo · branch · clean worktree · version mirrors in sync
  version.ts milestone == --milestone · CHANGELOG top entry mentions version+milestone
  worklog entry exists for the milestone · worker bundle not older than src
  index.html comment balance (<!-- vs -->) · optional live /health comparison

Stdlib only. Exit 0 = deploy may proceed, 1 = a FAIL was raised.
"""
import argparse
import json
import re
import subprocess
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from bump_version import read_mirrors, sync_status  # noqa: E402

RESULTS = []


def add(level, msg):
    RESULTS.append((level, msg))
    print(f"  {level:<4}  {msg}")


def run(cmd, cwd, timeout=60):
    try:
        r = subprocess.run(cmd, cwd=str(cwd), capture_output=True, text=True, timeout=timeout)
        return r.returncode, (r.stdout or "").strip(), (r.stderr or "").strip()
    except Exception as e:
        return 1, "", str(e)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root")
    ap.add_argument("--milestone", required=True, help="milestone being deployed, e.g. m211")
    ap.add_argument("--prod-url", help="e.g. https://<worker>.workers.dev — probes live /health")
    ap.add_argument("--run-gates", action="store_true", help="also run npm run typecheck + npm test")
    ap.add_argument("--allow-dirty", action="store_true", help="permit uncommitted changes (never for prod)")
    args = ap.parse_args()

    root = Path(args.root).resolve()
    print(f"pre-deploy gate — repo {root.name}, target {args.milestone}\n" + "-" * 62)

    # 1. git repo
    if not (root / ".git").exists():
        add("FAIL", "no .git here — wrong directory?")
    else:
        add("PASS", "git repository present")

    # 2. branch
    rc, out, _ = run(["git", "rev-parse", "--abbrev-ref", "HEAD"], root)
    branch = out if rc == 0 else ""
    if branch:
        add("PASS" if branch == "main" else "WARN",
            f"branch = {branch}" + ("" if branch == "main" else "  (deploying a non-main branch — intentional?)"))
    else:
        add("FAIL", "cannot determine current branch")

    # 3. clean worktree
    rc, out, _ = run(["git", "status", "--porcelain"], root)
    dirty = [ln for ln in out.splitlines() if ln.strip()] if rc == 0 else []
    if not dirty:
        add("PASS", "worktree clean — everything committed")
    elif args.allow_dirty:
        add("WARN", f"worktree dirty ({len(dirty)} paths) but --allow-dirty given")
    else:
        add("FAIL", f"worktree dirty ({len(dirty)} paths) — commit or stash first")
        for ln in dirty[:6]:
            print(f"        {ln}")

    # 4. version mirrors
    lines, good = sync_status(root)
    for ln in lines:
        lv = "PASS" if ln.startswith("  PASS") else "FAIL" if "FAIL" in ln else "WARN"
        add(lv, ln.strip().split(None, 1)[-1] if ln.strip() else ln)
    if not good:
        add("FAIL", "version mirrors out of sync — run bump_version.py --check and fix")

    # 5. milestone matches version.ts
    m = read_mirrors(root)
    ts_milestone = m.get("milestone")
    if ts_milestone == args.milestone:
        add("PASS", f"version.ts APP_MILESTONE = {args.milestone}")
    else:
        add("FAIL", f"version.ts APP_MILESTONE = {ts_milestone!r} but deploying {args.milestone!r} — bump first?")

    # 6. CHANGELOG top entry
    ch = root / "CHANGELOG.md"
    ver = m.get("version")
    if ch.exists() and ver:
        top = "\n".join(ch.read_text(encoding="utf-8").splitlines()[:25])
        has_v = ver in top
        has_m = re.search(r"m\d+[a-z]?", top) is not None
        add("PASS" if (has_v and has_m) else "WARN",
            f"CHANGELOG top entry {'covers' if (has_v and has_m) else 'missing'} version{'' if has_v else ''}/{'' if has_m else ' or milestone'}")
    elif not ch.exists():
        add("WARN", "no CHANGELOG.md — the public milestone↔version map lives there")

    # 7. worklog entry
    wl = root / "worklog.md"
    if not wl.exists():
        add("WARN", "worklog.md absent — entry must be written at Step 9")
    elif args.milestone.split("(")[0] in wl.read_text(encoding="utf-8", errors="ignore"):
        add("PASS", f"worklog already mentions {args.milestone}")
    else:
        add("WARN", f"worklog has no {args.milestone} entry — fine if written post-deploy (Step 9)")

    # 8. bundle freshness
    bundle = root / "worker/bundle.js"
    src = root / "src"
    if bundle.exists() and src.exists():
        newest_src = max(p.stat().st_mtime for p in src.rglob("*") if p.is_file())
        if bundle.stat().st_mtime < newest_src:
            add("FAIL", "worker/bundle.js is older than src — rebuild bundle before deploy")
        else:
            add("PASS", "worker/bundle.js newer than src (rebuilt)")

    # 9. index.html comment balance
    ih = root / "public/index.html"
    if ih.exists():
        t = ih.read_text(encoding="utf-8")
        o, c = t.count("<!--"), t.count("-->")
        add("PASS" if o == c else "FAIL", f"index.html comment balance {o}/{c}" +
            ("" if o == c else "  (the m201a lesson: an unclosed comment blanks all stylesheets)"))

    # 10. live probe (informational pre-deploy)
    if args.prod_url:
        try:
            with urllib.request.urlopen(args.prod_url.rstrip("/") + "/health", timeout=10) as r:
                payload = json.loads(r.read().decode("utf-8"))
            live = f"{payload.get('version')}/{payload.get('milestone')}"
            if payload.get("version") == ver and payload.get("milestone") == args.milestone:
                add("WARN", f"live /health = {live} — target already live? redeploying same version")
            else:
                add("PASS", f"live /health = {live} → will be replaced by {ver}/{args.milestone}")
        except Exception as e:
            add("WARN", f"/health probe failed: {e}")

    # 11. optional gates
    if args.run_gates:
        rc, out, err = run(["npm", "run", "typecheck"], root, timeout=300)
        add("PASS" if rc == 0 else "FAIL", "npm run typecheck" + (" zero errors" if rc == 0 else f" exit {rc}"))
        if rc != 0 and err:
            print("        " + err.splitlines()[-1][:100])
        rc, out, err = run(["npm", "test"], root, timeout=1200)
        tail = (out or err).splitlines()[-1] if (out or err) else ""
        add("PASS" if rc == 0 else "FAIL", "npm test " + (tail[:80] if rc == 0 else f"exit {rc}"))

    # summary
    n_fail = sum(1 for lv, _ in RESULTS if lv == "FAIL")
    n_warn = sum(1 for lv, _ in RESULTS if lv == "WARN")
    print("-" * 62)
    if n_fail:
        print(f"RESULT: BLOCKED — {n_fail} FAIL, {n_warn} WARN. Fix FAILs, then re-run.")
        return 1
    print(f"RESULT: GO — 0 FAIL, {n_warn} WARN. Sequence: backup → migrate → deploy → verify /health.")
    return 0


if __name__ == "__main__":
    start = time.time()
    code = main()
    print(f"(gate ran in {time.time() - start:.1f}s)")
    sys.exit(code)
