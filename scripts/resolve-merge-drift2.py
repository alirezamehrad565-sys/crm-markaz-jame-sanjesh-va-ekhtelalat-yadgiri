#!/usr/bin/env python3
# مرحلهٔ ۲ — برای add/addهای بدون پایه: اگر نسخهٔ ریموت == درخت origin/main (یعنی CP دست نزده) → محلی برنده
import subprocess, hashlib

repo = "/home/z/my-project/crm"
def blob(ref: str, path: str):
    r = subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None
def h(b): return hashlib.sha256(b).hexdigest() if b is not None else None

ALWAYS_MANUAL = {"CHANGELOG.md", "package.json", "public/index.html", "public/sw.js",
                 "src/core/version.ts", "worker/bundle.js", "data/app.db"}

conflicts = [c for c in subprocess.run(
    ["git", "-C", repo, "diff", "--name-only", "--diff-filter=U"],
    capture_output=True, text=True).stdout.split("\n") if c.strip()]

for path in conflicts:
    if path in ALWAYS_MANUAL:
        print("KEEP-MANUAL:", path); continue
    ours, theirs, remote_tree = blob(":2", path), blob(":3", path), blob("origin/main", path)
    if h(theirs) == h(remote_tree):
        # ریموت از پایه‌اش جلو نرفته (همان درخت origin/main) — محلی رشد کرده
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        print("OURS (local evolved):", path)
    elif h(ours) == h(remote_tree):
        subprocess.run(["git", "-C", repo, "checkout", "--theirs", "--", path], check=True)
        print("THEIRS:", path)
    else:
        print("REAL-DIVERGENCE:", path)
