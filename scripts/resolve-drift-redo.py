#!/usr/bin/env python3
# بازسازی: حل سه‌طرفهٔ تعارض‌های add/add drift — مرحلهٔ ۱+۲ در یک اسکریپت
# ① هم‌محتوا/برابر-پایه/برابر-ریموت → خودکار ② بقیه به‌جز دستی‌ها → اگر theirs == درخت origin/main → ours
import subprocess, hashlib

repo = "/home/z/my-project/crm"
def blob(ref, path):
    r = subprocess.run(["git", "-C", repo, "show", f"{ref}:{path}"], capture_output=True)
    return r.stdout if r.returncode == 0 else None
def h(b): return hashlib.sha256(b).hexdigest() if b is not None else None

MANUAL = {"CHANGELOG.md", "package.json", "public/index.html", "public/sw.js",
          "src/core/version.ts", "worker/bundle.js", "data/app.db"}

conflicts = [c for c in subprocess.run(
    ["git", "-C", repo, "diff", "--name-only", "--diff-filter=U"],
    capture_output=True, text=True).stdout.split("\n") if c.strip()]

stats, rest = {"same": 0, "ours": 0, "theirs": 0}, []
for path in conflicts:
    if path in MANUAL:
        rest.append(path); continue
    base, ours, theirs, remote_tree = blob(":1", path), blob(":2", path), blob(":3", path), blob("origin/main", path)
    ho, ht, hb = h(ours), h(theirs), h(base)
    if ho == ht:
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        stats["same"] += 1
    elif ht == hb and ho is not None:
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        stats["ours"] += 1
    elif ho == hb and ht is not None:
        subprocess.run(["git", "-C", repo, "checkout", "--theirs", "--", path], check=True)
        stats["theirs"] += 1
    elif h(theirs) == h(remote_tree):
        subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)
        stats["ours"] += 1
    elif h(ours) == h(remote_tree):
        subprocess.run(["git", "-C", repo, "checkout", "--theirs", "--", path], check=True)
        stats["theirs"] += 1
    else:
        rest.append(path)

print("auto:", stats)
print("manual:", rest)

# ─── فایل‌های دستی: شش آینهٔ نسخه → 1.25.38 · data/app.db → محلی ───
subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", "data/app.db"], check=True)
for path in ["package.json", "public/index.html", "public/sw.js", "src/core/version.ts"]:
    subprocess.run(["git", "-C", repo, "checkout", "--ours", "--", path], check=True)

def sub(path, pairs):
    p = f"{repo}/{path}"
    s = open(p, encoding="utf-8").read()
    for a, b in pairs:
        s = s.replace(a, b)
    open(p, "w", encoding="utf-8").write(s)

sub("src/core/version.ts", [("1.25.37", "1.25.38")])
sub("package.json", [("1.25.37", "1.25.38")])
sub("public/sw.js", [("1.25.37", "1.25.38")])
sub("public/index.html", [("?v=1.25.37", "?v=1.25.38")])
# package-lock: نسخهٔ ریشه
s = open(f"{repo}/package-lock.json", encoding="utf-8").read()
s = s.replace('"version": "1.25.37"', '"version": "1.25.38"', 1)
open(f"{repo}/package-lock.json", "w", encoding="utf-8").write(s)
print("mirrors -> 1.25.38")

# ─── CHANGELOG: ours + شماره‌گذاری مجدد + ورودی CP ریموت ───
ours = blob(":2", "CHANGELOG.md").decode("utf-8")
ours = ours.replace("## [۱.۲۵.۳۷] — ۱۴۰۵/۰۸/۱۷ — G3 آموزش و جریان کودک", "## [۱.۲۵.۳۸] — ۱۴۰۵/۰۸/۱۷ — G3 آموزش و جریان کودک")
ours = ours.replace("## [۱.۲۵.۳۶] — ۱۴۰۵/۰۸/۱۷ — M2 لایهٔ تجاری دیداری", "## [۱.۲۵.۳۷] — ۱۴۰۵/۰۸/۱۷ — M2 لایهٔ تجاری دیداری")
ours = ours.replace("## [۱.۲۵.۳۵] — ۱۴۰۵/۰۸/۱۷ — G1 تثبیت موتور و صحت داده", "## [۱.۲۵.۳۶] — ۱۴۰۵/۰۸/۱۷ — G1 تثبیت موتور و صحت داده")
remote = blob("origin/main", "CHANGELOG.md").decode("utf-8")
start = remote.index("## [۱.۲۵.۳۵]"); end = remote.index("## [۱.۲۵.۳۴]")
cp_entry = remote[start:end].rstrip() + "\n"
note = ("\n> **یادداشت نسخه‌گذاری (ادغام خط‌کاری‌های موازی):** انتشار «سیم‌کشی کنترل‌پلین شبکه» "
        "با اصلاحیه‌های 1.25.35b/35c روی origin/main مستقر شد و نسخهٔ 1.25.35 را اشغال کرد؛ "
        "سه انتشار زنجیرهٔ Fish & Crab که هم‌زمان روی کپی محلی با شماره‌های 1.25.35/36/37 ثبت شده بودند، "
        "بدون تغییر محتوا به **1.25.36 (G1) / 1.25.37 (M2) / 1.25.38 (G3)** شماره‌گذاری مجدد شدند. "
        "تاریخچهٔ کامیت هر دو خط‌کاری حفظ شده است.\n")
anchor = ours.index("## [۱.۲۵.۳۴]")
merged = ours[:anchor] + cp_entry + note + "\n" + ours[anchor:]
open(f"{repo}/CHANGELOG.md", "w", encoding="utf-8").write(merged)
print("CHANGELOG combined")
