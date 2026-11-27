#!/usr/bin/env python3
"""Measure bench-counted LOC added by my edits: non-empty, non-comment added lines per file."""
import subprocess, re, sys

FILES = [
    "src/domain/case-events/survey-insights.ts",
    "src/domain/case-events/types.ts",
    "src/domain/case-events/service.ts",
    "public/assets/js/case-events.js",
    "src/domain/case-events/__tests__/survey-insights.test.ts",
]

def counted(lines):
    n = 0
    for l in lines:
        t = l.strip()
        if not t:
            continue
        if t.startswith("//") or t.startswith("*") or t.startswith("/*"):
            continue
        n += 1
    return n

total = 0
for f in FILES:
    out = subprocess.run(["git", "diff", "-U0", "--", f], capture_output=True, text=True).stdout
    added = [l[1:] for l in out.splitlines() if l.startswith("+") and not l.startswith("+++")]
    c = counted(added)
    total += c
    print(f"{c:5d}  {f}")
print(f"{total:5d}  TOTAL counted added")
budget = 108311 * 1.02 - 110533
print(f"need to cut ~{-budget:.0f} counted lines to fit 2% cap")
