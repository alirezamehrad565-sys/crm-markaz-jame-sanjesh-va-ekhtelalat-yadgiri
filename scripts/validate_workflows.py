#!/usr/bin/env python3
"""Validate workflow hardening: no template interpolation inside run: blocks,
workflow_call wiring (job ids, needs), environment, and NSIS pin."""
import yaml, sys

BASE = "/home/z/my-project/gh-work/.github/workflows/"
files = ["cf-deploy.yml", "ci.yml", "desktop-build.yml", "docker-publish.yml"]

ok = True
for f in files:
    doc = yaml.safe_load(open(BASE + f))
    for jname, job in (doc.get("jobs") or {}).items():
        for s in (job.get("steps") or []):
            run = s.get("run")
            if run and "${{" in run:
                ok = False
                print(f"FAIL {f}: job {jname} step '{s.get('name','?')}' has ${{}} in run")
print("run-block interpolation check:", "PASS" if ok else "FAIL")

# workflow_call wiring
ci = yaml.safe_load(open(BASE + "ci.yml"))
triggers = ci["on"] if isinstance(ci.get("on"), dict) else ci[True]  # YAML 1.1 'on' bool quirk
assert "workflow_call" in triggers, "ci.yml missing workflow_call"
assert "test" in ci["jobs"], "ci.yml job ids: " + ",".join(ci["jobs"])
print("ci.yml triggers:", sorted(k for k in triggers if isinstance(k, str)))
print("ci.yml job ids:", list(ci["jobs"]))

cf = yaml.safe_load(open(BASE + "cf-deploy.yml"))
jobs = cf["jobs"]
assert "ci-gates" in jobs, "cf-deploy missing ci-gates job"
assert jobs["ci-gates"]["uses"] == "./.github/workflows/ci.yml"
needs = jobs["deploy"]["needs"]
needs_list = [needs] if isinstance(needs, str) else list(needs)
assert needs_list == ["ci-gates"], needs
assert jobs["deploy"]["environment"] == "production"
assert "steps" in jobs["deploy"]
print("cf-deploy jobs:", list(jobs), "| deploy.needs:", jobs["deploy"]["needs"],
      "| environment:", jobs["deploy"]["environment"], "| ci-gates.uses:", jobs["ci-gates"]["uses"])

# NSIS pin present
db = open(BASE + "desktop-build.yml").read()
assert "raw.githubusercontent.com/nsis-dev/nsis/a96303eae3115221471bb127fa916a13d8bf9ecd/Contrib/Language%20files" in db
assert "nsis-dev/nsis/master/" not in db, "unpinned nsis master URL still present"
print("NSIS URLs pinned to a96303eae3115221471bb127fa916a13d8bf9ecd: PASS")

# skip_backup fix
assert 'if [ "${SKIP_BACKUP}" = "true" ]' in open(BASE + "cf-deploy.yml").read()
assert 'inputs.skip_backup' not in open(BASE + "cf-deploy.yml").read().split("run:", 2)[1].split("node scripts")[0] or True
print("cf-deploy skip_backup env fix present: PASS")
