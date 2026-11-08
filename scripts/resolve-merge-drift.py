#!/usr/bin/env python3
# drift recovery — حل سه‌طرفهٔ تعارض‌های add/add بر پایهٔ مقایسهٔ blob با merge-base
# قانون: هم‌محتوا → هر طرف | theirs==base → ours (محلی رشد کرده) | ours==base → theirs | وگرنه دستی
import subprocess, sys, hashlib

repo = "/home/z/my-project/crm"

def blob(stage: str, path: str):
    r = subprocess.run(["git", "-C", repo, "show", f":{stage}:{path}"],
                       capture_output=True)
    return r.stdout if r.returncode == 0 else None

def h(b):
    return hashlib.sha256(b).hexdigest() if b is not None else None

conflicts = subprocess.run(["git", "-C", repo, "diff", "--name-only", "--diff-filter=U"],
                           capture_output=True, text=True).stdout.split("\n")
conflicts = [c for c in conflicts if c.strip()]

manual, stats = [], {"same": 0, "ours": 0, "theirs": 0}
for path in conflicts:
    base, ours, theirs = blob("1", path), blob("2", path), blob("3", path)
    ho, ht, hb = h(ours), h(theirs), h(base)
    if ho == ht:                       # هر دو یکسان — هر کدام
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        stats["same"] += 1
    elif ht == hb and ho is not None:  # ریموت برابر پایه، محلی رشد کرده → محلی
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        stats["ours"] += 1
    elif ho == hb and ht is not None:  # محلی برابر پایه، ریموت رشد کرده → ریموت
        subprocess.run(["git", "-C", repo, "checkout", "--theirs", "--", path], check=True)
        stats["theirs"] += 1
    else:
        manual.append(path)

print("auto-resolved:", stats)
print("manual remaining:", len(manual))
for m in manual:
    print("  MANUAL:", m)
