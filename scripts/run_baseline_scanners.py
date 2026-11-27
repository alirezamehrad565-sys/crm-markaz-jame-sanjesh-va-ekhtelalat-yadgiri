#!/usr/bin/env python3
"""Run the methodology's scanners on the host with their pinned versions.

Docker is not installed in this sandbox, so the pinned scanner image cannot be built.
This runner reproduces the argv builders of the methodology's scanners.py with host
paths, writes each raw report under <out>/<label>/, and appends one RunRecord per tool
(ledger.py model) to <out>/ledger-<label>.json. Secret-bearing keys are scrubbed from
the stored raw JSON exactly as the methodology does before it stores a report.

Usage:
  python3 -I run_baseline_scanners.py <project> <out> <label> <mode> <tool,tool,...>
  mode: "dir" for a working tree, "git" to let gitleaks scan the history
"""
import json
import os
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

EXCLUDED = [".git", ".next", ".nox", ".nuxt", ".pytest_cache", ".ruff_cache", ".tox", ".turbo",
            "__pycache__", "audit", "build", "coverage", "dist", "env", "htmlcov", "node_modules", "venv"]
REFS = Path("/home/z/my-project/refs")
OK_CODES = {"semgrep": {0}, "bandit": {0}, "osv-scanner": {0}, "gitleaks": {0}, "checkov": {0},
            "hadolint": {0}, "zizmor": {0}, "actionlint": {0}, "lizard": {0}, "jscpd": {0},
            "ruff": {0}, "trivy": {0}}
FINDING_CODES = {"semgrep": {1}, "bandit": {1}, "osv-scanner": {1}, "gitleaks": {2}, "checkov": {1},
                 "hadolint": {1}, "zizmor": {11, 12, 13, 14}, "actionlint": {1}}
SCRUB = {"semgrep": {"metavars", "fix", "fix_regex", "lines"}, "gitleaks": {"Secret", "Match"},
         "checkov": {"code_block"}, "zizmor": {"feature", "fixes"}, "actionlint": {"snippet"},
         "jscpd": {"fragment"}, "trivy": {"Code"}}
PACKS = ["p/owasp-top-ten", "p/cwe-top-25", "p/python", "p/javascript", "p/typescript"]
TOOL_TIMEOUT = 1500


def now() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def tail(text: str) -> str:
    return " ".join((text or "").split())[-400:]


def scrub(node, keys):
    if isinstance(node, dict):
        for key in list(node.keys()):
            if key in keys:
                node[key] = "<scrubbed>"
            else:
                scrub(node[key], keys)
    elif isinstance(node, list):
        for item in node:
            scrub(item, keys)


def scrub_file(path: Path, keys) -> None:
    if not path.is_file() or path.stat().st_size == 0:
        return
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (ValueError, OSError):
        return
    scrub(data, keys)
    path.write_text(json.dumps(data, ensure_ascii=False), encoding="utf-8")


def workflow_files(project: Path) -> list:
    wf = project / ".github" / "workflows"
    if not wf.is_dir():
        return []
    return sorted(".github/workflows/%s" % p.name for p in wf.iterdir()
                  if p.is_file() and p.suffix in (".yml", ".yaml"))


def dockerfiles(project: Path) -> list:
    names = []
    for root, dirs, files in os.walk(project):
        dirs[:] = [d for d in dirs if d not in EXCLUDED]
        for name in files:
            if name == "Dockerfile" or name.startswith("Dockerfile."):
                names.append(os.path.relpath(os.path.join(root, name), project))
    return sorted(names)


def build_argv(tool: str, project: Path, out: Path, mode: str) -> list:
    src = str(project)
    if tool == "semgrep":
        argv = [str(REFS / "venv-audit/bin/semgrep")]
        for pack in PACKS:
            argv += ["--config", pack]
        argv += ["--json", "--metrics=off", "--output", str(out / "semgrep.json")]
        for d in EXCLUDED:
            argv += ["--exclude", d]
        return argv + [src]
    if tool == "lizard":
        argv = [str(REFS / "venv-audit/bin/lizard"), "--csv", "-i", "1000000"]
        for d in EXCLUDED:
            argv += ["-x", "*/%s/*" % d]
        return argv + [src]
    if tool == "ruff":
        argv = [str(REFS / "venv-ruff/bin/ruff"), "check", "--output-format", "json", "--exit-zero", "--no-cache"]
        for d in EXCLUDED:
            argv += ["--extend-exclude", "**/%s" % d]
        return argv + [src]
    if tool == "bandit":
        return [str(REFS / "venv-bandit/bin/bandit"), "-r", "-f", "json", "-o", str(out / "bandit.json"),
                "-x", ",".join("*/%s/*" % d for d in EXCLUDED), src]
    if tool == "osv-scanner":
        argv = [str(REFS / "bin/osv-scanner"), "scan", "source", "-r", "--format", "json",
                "--output", str(out / "osv.json")]
        for d in EXCLUDED:
            argv += ["--x-exclude", d]
        return argv + [src]
    if tool == "gitleaks":
        paths = ", ".join("'''(^|/)%s/'''" % re.escape(d) for d in EXCLUDED if d != ".git")
        (out / "gitleaks.toml").write_text(
            "[extend]\nuseDefault = true\n\n[[allowlists]]\ndescription = \"host environments and outputs\"\n"
            "paths = [%s]\n" % paths, encoding="utf-8")
        return [str(REFS / "bin/gitleaks"), "git" if mode == "git" else "dir", "--redact", "--no-banner",
                "--report-format", "json", "--report-path", str(out / "gitleaks.json"), "--exit-code", "2",
                "--config", str(out / "gitleaks.toml"), "--max-target-megabytes", "5", src]
    if tool == "checkov":
        argv = [str(REFS / "venv-checkov/bin/checkov"), "-d", src, "--output", "json", "--quiet",
                "--skip-framework", "secrets"]
        for d in EXCLUDED:
            argv += ["--skip-path", "/%s(/|$)" % re.escape(d)]
        return argv
    if tool == "hadolint":
        return [str(REFS / "bin/hadolint"), "--format", "json"] + ["%s/%s" % (src, d) for d in dockerfiles(project)]
    if tool == "zizmor":
        return [str(REFS / "venv-zizmor/bin/zizmor"), "--format", "json"] + \
               ["%s/%s" % (src, f) for f in workflow_files(project)]
    if tool == "actionlint":
        return [str(REFS / "bin/actionlint"), "-format", "{{json .}}"] + \
               ["%s/%s" % (src, f) for f in workflow_files(project)]
    if tool == "jscpd":
        return ["npx", "--yes", "jscpd@5.4.2", "--reporters", "json", "--output", str(out / "jscpd"),
                "--silent", "--no-tips", "--ignore", ",".join("**/%s/**" % d for d in EXCLUDED), src]
    if tool == "trivy":
        argv = [str(REFS / "bin/trivy"), "fs", "--format", "json", "--output", str(out / "trivy.json"),
                "--exit-code", "0", "--scanners", "vuln,misconfig,license", "--cache-dir", "/tmp/trivy-cache",
                "--disable-telemetry", "--skip-version-check", "--no-progress", "--config", "", "--ignorefile", ""]
        for d in EXCLUDED:
            argv += ["--skip-dirs", d, "--skip-dirs", "**/" + d]
        return argv + [src]
    raise SystemExit("unknown tool: %s" % tool)


def tool_path(tool: str) -> str:
    if tool in ("semgrep", "lizard"):
        return str(REFS / "venv-audit/bin" / tool)
    if tool in ("ruff", "bandit", "checkov", "zizmor"):
        return str(REFS / ("venv-%s/bin/%s" % (tool, tool)))
    if tool == "jscpd":
        return "npx"
    return str(REFS / "bin" / tool)


def version_argv(tool: str) -> list:
    if tool == "gitleaks":
        return [tool_path(tool), "version"]
    if tool == "actionlint":
        return [tool_path(tool), "-version"]
    if tool == "jscpd":
        return ["npx", "--yes", "jscpd@5.4.2", "--version"]
    return [tool_path(tool), "--version"]


def run(tool: str, project: Path, out: Path, mode: str) -> dict:
    started = now()
    try:
        proc = subprocess.run(version_argv(tool), capture_output=True, text=True, timeout=120)
        version = " ".join((proc.stdout or proc.stderr).split())[:120]
    except (OSError, subprocess.TimeoutExpired) as error:
        version = "unavailable: %s" % error
    if not Path(tool_path(tool)).exists() and tool != "jscpd":
        return {"tool": tool, "version": version, "argv": [], "started_at": started, "duration_s": 0.0,
                "exit_code": None, "status": "unavailable",
                "reason": "pinned %s binary is not installed on the host (docker not installed)" % tool,
                "counts": {}}
    argv = build_argv(tool, project, out, mode)
    t0 = time.time()
    try:
        proc = subprocess.run(argv, capture_output=True, text=True, timeout=TOOL_TIMEOUT, cwd=str(project))
        exit_code, stdout, stderr, timed_out = proc.returncode, proc.stdout, proc.stderr, False
    except subprocess.TimeoutExpired as error:
        exit_code, stdout, stderr, timed_out = None, error.stdout or "", error.stderr or "", True
    duration = round(time.time() - t0, 1)
    reports = {"semgrep": "semgrep.json", "bandit": "bandit.json", "osv-scanner": "osv.json",
               "gitleaks": "gitleaks.json", "trivy": "trivy.json", "jscpd": "jscpd/jscpd-report.json"}
    capture = tool in ("lizard", "ruff", "checkov", "hadolint", "zizmor", "actionlint")
    raw_output = None
    if capture:
        (out / ("%s.stdout" % tool)).write_text(stdout or "", encoding="utf-8")
        raw_output = tail(stderr)
    report = out / reports.get(tool, "")
    if tool in SCRUB:
        if capture:
            try:
                scrub_file(Path(out / ("%s.stdout" % tool)), SCRUB[tool])
            except OSError:
                pass
        else:
            scrub_file(report, SCRUB[tool])
    (out / ("%s.stderr" % tool)).write_text(stderr or "", encoding="utf-8")
    exists = (out / ("%s.stdout" % tool)).is_file() if capture else report.is_file()
    if timed_out:
        status, reason = "failed", "timeout after %ds" % TOOL_TIMEOUT
    elif exit_code is None:
        status, reason = "unavailable", tail(stderr)
    elif exit_code in OK_CODES[tool] or exit_code in FINDING_CODES.get(tool, set()):
        status = "completed" if exists else "failed"
        reason = None if status == "completed" else "scanner exited cleanly but wrote no report"
    else:
        status, reason = "failed", tail(stderr)
    counts = {}
    try:
        if tool == "lizard":
            counts["functions"] = max(0, len((stdout or "").splitlines()) - 1)
        if tool == "jscpd" and (out / "jscpd/jscpd-report.json").is_file():
            data = json.loads((out / "jscpd/jscpd-report.json").read_text(encoding="utf-8"))
            stat = data.get("statistics", {}).get("total", {})
            counts = {"clones": stat.get("clones"), "duplicated_lines": stat.get("duplicatedLines"),
                      "percent": stat.get("percentage")}
        if tool == "gitleaks" and report.is_file():
            counts = {"findings": len(json.loads(report.read_text(encoding="utf-8")) or [])}
        if tool == "semgrep" and report.is_file():
            data = json.loads(report.read_text(encoding="utf-8"))
            counts = {"findings": len(data.get("results") or []), "errors": len(data.get("errors") or [])}
        if tool == "osv-scanner" and report.is_file():
            data = json.loads(report.read_text(encoding="utf-8"))
            counts = {"packages": len(data.get("results") or []),
                      "vulns": sum(len(r.get("packages") and [v for p in r["packages"] for v in p.get("vulnerabilities") or []] or [])
                                   for r in data.get("results") or [])}
    except (ValueError, OSError, KeyError, TypeError):
        counts = {"note": "report could not be summarised"}
    return {"tool": tool, "version": version, "argv": argv, "started_at": started, "duration_s": duration,
            "exit_code": exit_code, "status": status, "raw_output": raw_output, "reason": reason,
            "counts": counts}


def main() -> int:
    if len(sys.argv) != 6:
        print("usage: run_baseline_scanners.py <project> <out> <label> <dir|git> <tool,tool>", file=sys.stderr)
        return 2
    project, out, label, mode = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3], sys.argv[4]
    out_dir = out / label
    out_dir.mkdir(parents=True, exist_ok=True)
    ledger = out / ("ledger-%s.json" % label)
    records = json.loads(ledger.read_text(encoding="utf-8")) if ledger.is_file() else []
    for tool in sys.argv[5].split(","):
        print("[%s] running %s ..." % (now(), tool), flush=True)
        rec = run(tool, project, out_dir, mode)
        records = [r for r in records if r.get("tool") != tool] + [rec]
        print("  -> %s exit=%s in %ss counts=%s reason=%s" % (
            rec["status"], rec["exit_code"], rec["duration_s"], rec["counts"], rec["reason"]), flush=True)
        ledger.write_text(json.dumps(records, ensure_ascii=False, indent=1), encoding="utf-8")
    print("LEDGER", ledger)
    return 0


if __name__ == "__main__":
    sys.exit(main())
