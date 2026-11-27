#!/usr/bin/env python3
"""Summarise the raw scanner reports of one run label without printing secret material.

Gitleaks reports are produced with --redact; this summary additionally never prints the
Secret/Match/Line fields, only rule ids, file paths, commit counts and fingerprints.

Usage: python3 -I triage_scanners.py <raw-run-dir>
"""
import json
import sys
from collections import Counter
from pathlib import Path


def load(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return None


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: triage_scanners.py <raw-run-dir>", file=sys.stderr)
        return 2
    d = Path(sys.argv[1])
    out = {}

    sem = load(d / "semgrep.json")
    if sem is not None:
        res = sem.get("results") or []
        out["semgrep"] = {
            "findings": len(res),
            "errors": [{"path": e.get("path"), "message": str(e.get("message"))[:160]} for e in sem.get("errors") or []],
            "by_severity": dict(Counter(r.get("extra", {}).get("severity") for r in res)),
            "by_rule": dict(Counter(f"{r.get('check_id')} @ {r.get('path')}:{r.get('start', {}).get('line')}" for r in res).most_common(40)),
        }

    osv = load(d / "osv.json")
    if osv is not None:
        rows = []
        for r in osv.get("results") or []:
            for p in r.get("packages") or []:
                pk = p.get("package", {})
                vs = p.get("vulnerabilities") or []
                rows.append({"path": r.get("source", {}).get("path"), "ecosystem": pk.get("ecosystem"),
                             "name": pk.get("name"), "version": pk.get("version"), "vulns": len(vs),
                             "ids": [v.get("id") for v in vs][:60],
                             "aliases": sorted({a for v in vs for a in v.get("aliases") or []})[:60]})
        out["osv"] = rows

    gl = load(d / "gitleaks.json")
    if gl is not None:
        out["gitleaks"] = {
            "findings": len(gl),
            "by_rule": dict(Counter(f.get("RuleID") for f in gl)),
            "by_file": dict(Counter(f.get("File") for f in gl).most_common(40)),
            "commits": len({f.get("Commit") for f in gl}),
            "in_working_tree_head": dict(Counter(f.get("File") for f in gl if not f.get("Commit") or f.get("Commit", "").startswith("WORKTREE")).most_common(40)),
            "sample": [{"rule": f.get("RuleID"), "file": f.get("File"), "line": f.get("StartLine"), "commit": (f.get("Commit") or "")[:10],
                        "date": f.get("Date"), "entropy": round(f.get("Entropy", 0), 2), "desc": (f.get("Description") or "")[:90]}
                       for f in sorted(gl, key=lambda x: -(x.get("Entropy") or 0))[:40]],
        }

    ban = load(d / "bandit.json")
    if ban is not None:
        res = ban.get("results") or []
        out["bandit"] = {"findings": len(res), "errors": len(ban.get("errors") or []),
                         "rows": [{"severity": r.get("issue_severity"), "confidence": r.get("issue_confidence"),
                                   "test": r.get("test_id"), "file": r.get("filename"), "line": r.get("line_number")} for r in res[:60]]}

    ck = load(d / "checkov.stdout")
    if ck is not None:
        # checkov -d prints one JSON object per framework: {check_type, results:{failed_checks}, summary}
        objs = ck if isinstance(ck, list) else [ck]
        res = []
        totals = {"passed": 0, "failed": 0, "errors": 0}
        for ob in objs:
            if isinstance(ob, dict):
                res.extend((ob.get("results") or {}).get("failed_checks") or [])
                sm = ob.get("summary") or {}
                totals["passed"] += sm.get("passed") or 0
                totals["failed"] += sm.get("failed") or 0
                totals["errors"] += sm.get("parsing_errors") or 0
        out["checkov"] = {"failed": totals["failed"], "passed": totals["passed"], "parsing_errors": totals["errors"],
                          "by_check": dict(Counter(r.get("check_id") for r in res)),
                          "rows": [{"check": r.get("check_id"), "sev": r.get("severity"), "file": r.get("file_path"),
                                    "line": (r.get("file_line_range") or [None])[0], "platform": r.get("platform_type"),
                                    "resource": (r.get("resource") or "")[:60]} for r in res[:80]]}

    had = load(d / "hadolint.stdout")
    if had is not None:
        out["hadolint"] = [{"file": h.get("file"), "line": h.get("line"), "code": h.get("code"), "level": h.get("level")} for h in had]

    out["zizmor_stderr"] = (d / "zizmor.stderr").read_text(encoding="utf-8", errors="replace")[-600:] if (d / "zizmor.stderr").is_file() else None
    zz = load(d / "zizmor.stdout")
    if zz is not None:
        out["zizmor"] = [{"level": (f.get("determinations") or {}).get("severity"),
                          "confidence": (f.get("determinations") or {}).get("confidence"),
                          "ident": f.get("ident"),
                          "locs": sorted({"%s:%s" % (((lo.get("symbolic") or {}).get("key") or {}).get("Local", {}).get("verbatim_path", "?").split("/")[-1],
                                                      ((lo.get("concrete") or {}).get("location") or {}).get("start_point", {}).get("row"))
                                         for lo in f.get("locations") or []}),
                          "desc": (f.get("description") or f.get("desc") or "")[:110]}
                         for f in (zz if isinstance(zz, list) else zz.get("findings") or [])[:80]]

    ruff = load(d / "ruff.stdout")
    if ruff is not None:
        out["ruff"] = {"findings": len(ruff), "by_rule": dict(Counter(x.get("code") for x in ruff)),
                       "rows": [{"code": x.get("code"), "file": x.get("filename"), "line": x.get("location", {}).get("row")} for x in ruff[:40]]}

    tr = load(d / "trivy.json")
    if tr is not None:
        rows = []
        for r in tr.get("Results") or []:
            for v in r.get("Vulnerabilities") or []:
                rows.append({"target": r.get("Target"), "pkg": v.get("PkgName"), "installed": v.get("InstalledVersion"),
                             "fixed": v.get("FixedVersion"), "sev": v.get("Severity"), "id": v.get("VulnerabilityID")})
            mis = r.get("Misconfigurations") or []
            if mis:
                rows.append({"target": r.get("Target"), "misconfig": [{"id": m.get("ID"), "sev": m.get("Severity"), "title": (m.get("Title") or "")[:80]} for m in mis[:30]]})
            lic = r.get("Licenses") or []
            if lic:
                rows.append({"target": r.get("Target"), "licenses": [{"name": l.get("Name"), "sev": l.get("Severity"), "category": l.get("Category")} for l in lic[:30]]})
        out["trivy"] = rows
        out["trivy_stderr"] = (d / "trivy.stderr").read_text(encoding="utf-8", errors="replace")[-400:]

    js = load(d / "jscpd/jscpd-report.json")
    if js is not None:
        st = js.get("statistics", {}).get("total", {})
        out["jscpd"] = {"clones": st.get("clones"), "duplicatedLines": st.get("duplicatedLines"), "percentage": st.get("percentage"),
                        "formats": js.get("statistics", {}).get("formats"),
                        "top_files": sorted(
                            [{"name": f.get("name"), "clones": f.get("clones"), "lines": f.get("duplicatedLines")}
                             for f in js.get("duplicates", [])[:0]] or
                            [{"name": k, "clones": v.get("clones"), "lines": v.get("lines")} for k, v in (js.get("statistics", {}).get("sources") or {}).items()],
                            key=lambda x: -(x.get("clones") or 0))[:25],
                        "appt_clones": [{"first": (c.get("firstFile") or {}).get("name"), "l1": (c.get("firstFile") or {}).get("start"),
                                         "second": (c.get("secondFile") or {}).get("name"), "l2": (c.get("secondFile") or {}).get("start"), "lines": c.get("lines")}
                                        for c in (js.get("duplicates") or [])
                                        if "appointment" in ((c.get("firstFile") or {}).get("name") or "") or "appointment" in ((c.get("secondFile") or {}).get("name") or "")][:30]}

    print(json.dumps(out, ensure_ascii=False, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
