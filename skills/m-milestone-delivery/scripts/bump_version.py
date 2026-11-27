#!/usr/bin/env python3
"""bump_version.py — atomic six-fold version bump for m-milestone projects.

Mirrors kept in sync (each optional; missing files degrade to WARN):
  1. src/core/version.ts      APP_VERSION + APP_MILESTONE  (single source of truth)
  2. package.json             "version"
  3. package-lock.json        "version" occurrences equal to the old value
  4. public/index.html        every ?v=<old> cache-buster
  5. public/sw.js             const VERSION = 'v<old>'
  6. CHANGELOG.md             new heading:  ## [<version>] — <milestone> — <title>

Usage:
  bump_version.py <repo-root> --check
  bump_version.py <repo-root> --milestone m211 --title "one-line title"
  bump_version.py <repo-root> --milestone m211 --title "x" --set 1.00.85 --dry-run

Stdlib only. Exit 0 = success/in-sync, 1 = failure or drift detected.
"""
import argparse
import json
import re
import sys
from pathlib import Path


def fail(msg):
    return f"  FAIL  {msg}"


def ok(msg):
    return f"  PASS  {msg}"


def warn(msg):
    return f"  WARN  {msg}"


VERSION_TS_RE = re.compile(r"(APP_VERSION\s*=\s*')([^']+)(')")
MILESTONE_TS_RE = re.compile(r"(APP_MILESTONE\s*=\s*')([^']+)(')")
SW_RE = re.compile(r"(VERSION\s*=\s*')v([^']+)(')")
CB_RE_TMPL = r"\?v=" + re.escape("{old}")
SEMVER_RE = re.compile(r"^\d+\.\d+\.\d+$")


def read_mirrors(root):
    """Read version+milestone from every mirror that exists. Returns dict."""
    root = Path(root)
    m = {"version": None, "milestone": None, "files": {}}

    def record(name, path, value):
        m["files"][name] = str(path)
        if value is not None:
            m.setdefault("_" + name + "_v", value)

    vt = root / "src/core/version.ts"
    if vt.exists():
        txt = vt.read_text(encoding="utf-8")
        v = VERSION_TS_RE.search(txt)
        mi = MILESTONE_TS_RE.search(txt)
        m["version"] = v.group(2) if v else None
        m["milestone"] = mi.group(2) if mi else None
        record("version.ts", vt, m["version"])
    pj = root / "package.json"
    if pj.exists():
        try:
            m["files"]["package.json"] = str(pj)
            pkg = json.loads(pj.read_text(encoding="utf-8"))
            pv = pkg.get("version")
            if m["version"] is None:
                m["version"] = pv
            record("package.json", pj, pv)
        except Exception as e:
            warn(f"package.json unreadable: {e}")
    sw = root / "public/sw.js"
    if sw.exists():
        s = SW_RE.search(sw.read_text(encoding="utf-8"))
        m["sw"] = s.group(2) if s else None
        record("sw.js", sw, m.get("sw"))
    ih = root / "public/index.html"
    if ih.exists():
        m["files"]["index.html"] = str(ih)
    return m


def sync_status(root):
    """Compare all mirror values against version.ts. Returns (list_of_lines, ok_bool)."""
    root = Path(root)
    lines, good = [], True
    m = read_mirrors(root)
    base = m["version"]
    if not base:
        lines.append(fail("no version found (src/core/version.ts missing or unparsable)"))
        return lines, False
    if not SEMVER_RE.match(base):
        lines.append(warn(f"version '{base}' is not X.Y.Z — proceeding as display string"))
    lines.append(ok(f"src/core/version.ts = {base} / {m.get('milestone', '?')}"))
    pj = root / "package.json"
    if pj.exists():
        try:
            pv = json.loads(pj.read_text(encoding="utf-8")).get("version")
            lines.append((ok if pv == base else fail)(f"package.json = {pv}"))
            good &= pv == base
        except Exception:
            pass
    pl = root / "package-lock.json"
    if pl.exists():
        txt = pl.read_text(encoding="utf-8")
        stale = len(re.findall(r'"version"\s*:\s*"' + re.escape(base) + r'"', txt)) < 2
        lines.append((fail if stale else ok)(f"package-lock.json mirrors {'stale' if stale else 'in sync'}"))
        good &= not stale
    sw = root / "public/sw.js"
    if sw.exists():
        s = SW_RE.search(sw.read_text(encoding="utf-8"))
        sv = s.group(2) if s else None
        lines.append((fail if sv != base else ok)(f"public/sw.js = v{sv}"))
        good &= sv == base
    ih = root / "public/index.html"
    if ih.exists():
        n = len(re.findall(r"\?v=" + re.escape(base), ih.read_text(encoding="utf-8")))
        if n == 0:
            lines.append(warn("index.html: no ?v= cache-busters found"))
        else:
            lines.append(ok(f"index.html: {n} cache-buster(s) at {base}"))
    ch = root / "CHANGELOG.md"
    if ch.exists():
        head = ch.read_text(encoding="utf-8").splitlines()[:30]
        fa = base.translate(str.maketrans("0123456789.", "۰۱۲۳۴۵۶۷۸۹."))
        hit = any(re.match(r"^##\s*\[", ln) and (base in ln or fa in ln) for ln in head)
        lines.append((ok if hit else warn)(f"CHANGELOG.md top entry {'mentions' if hit else 'does not mention'} {base}"))
    return lines, good


def bump(root, new_version, milestone, title, dry_run, no_changelog):
    root = Path(root)
    m = read_mirrors(root)
    old = m["version"]
    if not old:
        print("FAIL: cannot determine current version — no src/core/version.ts?")
        return 1
    print(f"bump: {old} → {new_version}  (milestone {m.get('milestone')} → {milestone})")
    edits = []

    def plan(path, fn):
        if path.exists():
            edits.append((path, fn))
        else:
            print(warn(f"skipped (missing): {path}"))

    def sub_version_ts(t):
        t = VERSION_TS_RE.sub(lambda g: g.group(1) + new_version + g.group(3), t)
        t = MILESTONE_TS_RE.sub(lambda g: g.group(1) + milestone + g.group(3), t)
        return t

    vt = root / "src/core/version.ts"
    plan(vt, sub_version_ts)

    pj = root / "package.json"
    if pj.exists():
        plan(pj, lambda t: re.sub(r'("version"\s*:\s*")' + re.escape(old) + r'(")',
                                  lambda g: g.group(1) + new_version + g.group(2), t, count=1))
    pl = root / "package-lock.json"
    if pl.exists():
        plan(pl, lambda t: re.sub(r'("version"\s*:\s*")' + re.escape(old) + r'(")',
                                  lambda g: g.group(1) + new_version + g.group(2), t))
    ih = root / "public/index.html"
    if ih.exists():
        plan(ih, lambda t: t.replace("?v=" + old, "?v=" + new_version))
    sw = root / "public/sw.js"
    if sw.exists():
        plan(sw, lambda t: SW_RE.sub(lambda g: g.group(1) + "v" + new_version + g.group(3), t))

    ch = root / "CHANGELOG.md"
    heading = f"## [{new_version}] — {milestone} — {title}\n"
    if no_changelog:
        print(warn("CHANGELOG update skipped (--no-changelog)"))
    elif not ch.exists():
        print(warn("CHANGELOG.md not found — heading not inserted"))
    else:
        def ins(t):
            lines = t.splitlines(keepends=True)
            for i, ln in enumerate(lines):
                if ln.startswith("## ["):
                    return "".join(lines[:i]) + heading + "\n" + "".join(lines[i:])
            return t.rstrip("\n") + "\n\n" + heading
        plan(ch, ins)

    for path, fn in edits:
        before = path.read_text(encoding="utf-8")
        after = fn(before)
        if after == before:
            print(warn(f"no change produced for {path.name} — check manually"))
            continue
        tag = "DRY-RUN would write" if dry_run else "wrote"
        print(f"  {tag}: {path}")
        if not dry_run:
            path.write_text(after, encoding="utf-8")

    if dry_run:
        print("\ndry-run complete — nothing written. Re-run without --dry-run to apply.")
        return 0
    print("\npost-bump audit:")
    lines, good = sync_status(root)
    for ln in lines:
        print("  " + ln)
    print(f"\nNEXT (manual): rebuild worker bundle from src; node --check it; commit mNNN; push; deploy; verify /health.")
    return 0 if good else 1


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("root", help="repo root")
    ap.add_argument("--check", action="store_true", help="audit mirrors only (read-only)")
    ap.add_argument("--milestone", help="new milestone id, e.g. m211")
    ap.add_argument("--title", default="", help="one-line CHANGELOG title")
    ap.add_argument("--set", dest="set_version", help="explicit version (default: last number + 1)")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--no-changelog", action="store_true")
    args = ap.parse_args()

    if args.check:
        lines, good = sync_status(args.root)
        for ln in lines:
            print(ln)
        return 0 if good else 1

    if not args.milestone:
        ap.error("either --check or --milestone is required")
    m = read_mirrors(args.root)
    old = m["version"]
    if not old:
        print("FAIL: cannot determine current version (no src/core/version.ts?)")
        return 1
    if args.set_version:
        new = args.set_version
    else:
        a, b, c = old.split(".")
        new = f"{a}.{b}.{int(c) + 1}"
    if not SEMVER_RE.match(new):
        print(f"FAIL: computed version '{new}' invalid")
        return 1
    return bump(args.root, new, args.milestone, args.title, args.dry_run, args.no_changelog)


if __name__ == "__main__":
    sys.exit(main())
