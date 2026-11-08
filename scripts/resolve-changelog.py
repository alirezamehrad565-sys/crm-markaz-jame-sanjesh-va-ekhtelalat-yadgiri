#!/usr/bin/env python3
# مرحلهٔ ۳ — CHANGELOG: ترکیب دو خط‌کاری + شماره‌گذاری مجدد G1/M2/G3 → ۳۶/۳۷/۳۸
import subprocess

repo = "/home/z/my-project/crm"
def show(ref): return subprocess.run(["git", "-C", repo, "show", ref],
                                     capture_output=True, text=True).stdout

ours = show(":2:CHANGELOG.md")
assert ours and "<<<" not in ours, "ours blob has markers?"

# شماره‌گذاری مجدد — ترتیب نزولی تا دوبارجایگزینی نشود
ours = ours.replace("## [۱.۲۵.۳۷] — ۱۴۰۵/۰۸/۱۷ — G3 آموزش و جریان کودک",
                    "## [۱.۲۵.۳۸] — ۱۴۰۵/۰۸/۱۷ — G3 آموزش و جریان کودک")
ours = ours.replace("## [۱.۲۵.۳۶] — ۱۴۰۵/۰۸/۱۷ — M2 لایهٔ تجاری دیداری",
                    "## [۱.۲۵.۳۷] — ۱۴۰۵/۰۸/۱۷ — M2 لایهٔ تجاری دیداری")
ours = ours.replace("## [۱.۲۵.۳۵] — ۱۴۰۵/۰۸/۱۷ — G1 تثبیت موتور و صحت داده",
                    "## [۱.۲۵.۳۶] — ۱۴۰۵/۰۸/۱۷ — G1 تثبیت موتور و صحت داده")

# ورودی CP ریموت از origin/main استخراج می‌شود (از سرِ ۱.۲۵.۳۵ تا پیش از ۱.۲۵.۳۴)
remote = show("origin/main:CHANGELOG.md")
start = remote.index("## [۱.۲۵.۳۵]")
end = remote.index("## [۱.۲۵.۳۴]")
cp_entry = remote[start:end].rstrip() + "\n"

note = ("\n> **یادداشت نسخه‌گذاری (ادغام خط‌کاری‌های موازی):** انتشار «سیم‌کشی کنترل‌پلین شبکه» "
        "با اصلاحیه‌های 1.25.35b/35c روی origin/main مستقر شد و نسخهٔ 1.25.35 را اشغال کرد؛ "
        "سه انتشار زنجیرهٔ Fish & Crab که هم‌زمان روی کپی محلی با شماره‌های 1.25.35/36/37 ثبت شده بودند، "
        "بدون تغییر محتوا به **1.25.36 (G1) / 1.25.37 (M2) / 1.25.38 (G3)** شماره‌گذاری مجدد شدند. "
        "تاریخچهٔ کامیت هر دو خط‌کاری حفظ شده است.\n")

anchor = "## [۱.۲۵.۳۴]"
idx = ours.index(anchor)
merged = ours[:idx] + cp_entry + note + "\n" + ours[idx:]
open(f"{repo}/CHANGELOG.md", "w", encoding="utf-8").write(merged)
print("CHANGELOG combined; headings order:")
for line in merged.splitlines():
    if line.startswith("## ["):
        print(" ", line[:80])
