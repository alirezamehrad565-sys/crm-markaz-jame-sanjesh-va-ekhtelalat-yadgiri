# one-off generator for gh-work quick-wins:
#  1) insert "batteryCategory" into the 3 battery JSON blocks (minimal one-line insert after "source")
#  2) generate migrations/0126_tool_metadata_backfill.sql with tool_source = verbatim JSON source
#     and tool_norm = band/norm status label
#  3) generate docs/INSTRUMENT-SOURCES.md with verbatim quotes
# Run with: python3 -I /home/z/my-project/scripts/quickwins_battery_category.py
import json
import re
from pathlib import Path

REPO = Path("/home/z/my-project/gh-work")
CE = REPO / "src/domain/clinical-engine"

# key -> batteryCategory (9 Persian categories)
CATEGORY = {
    "ce-sdq-t-v1": "اجتماعی-هیجانی",
    "ce-snap-iv-p-v1": "توجه/اجرایی",
    "ce-snap-iv-t-v1": "توجه/اجرایی",
    "ce-scared-p-v1": "اجتماعی-هیجانی",
    "ce-sensory-chip-v1": "غربگری",
    "ce-read-core-v1": "زبان-گفتار",
    "ce-sdq-p-v1": "اجتماعی-هیجانی",
    "ce-anamnesis-v2": "غربگری",
    "ce-anamnesis-v3": "غربگری",
    "ce-probe-read-v1": "زبان-گفتار",
    "ce-probe-write-v1": "زبان-گفتار",
    "ce-probe-calc-v1": "شناختی/هوش",
    "ce-dcdq-v1": "حرکتی",
    "ce-sld-read-v1": "زبان-گفتار",
    "ce-sld-wri-v1": "زبان-گفتار",
    "ce-sld-calc-v1": "شناختی/هوش",
    "ce-asd-criteria-v1": "اجتماعی-هیجانی",
    "ce-speech-criteria-v1": "زبان-گفتار",
    "ce-odd-criteria-v1": "رفتار/تنظیم",
    "ce-id-adapt-v1": "شناختی/هوش",
    "ce-sld-class-t-v1": "غربگری",
}

# band/norm status per key; None = form has no bands/norms at all (leave tool_norm NULL)
NORM_STATUS = {
    "ce-sdq-t-v1": "کالیبراسیون داخلی",        # باندهای زیرمقیاس «کالیبراسیون داخلی — بازتأیید با دادهٔ مرکز»
    "ce-snap-iv-p-v1": "کالیبراسیون داخلی",    # «باند مرزی داخلی»
    "ce-snap-iv-t-v1": "مستند",                 # برش‌ها صدک ۹۵ معلم (Swanson 2001)
    "ce-scared-p-v1": "مستند",                  # برش‌ها مطابق برگهٔ رسمی (AACAP/OHSU)
    "ce-sensory-chip-v1": "کالیبراسیون داخلی", # «تصمیم بالینی داخلی — کالیبراسیون با دادهٔ مرکز در آینده»
    "ce-read-core-v1": "بدون مبدأ — نیازمند تأیید",  # اعداد باند بدون مرجع
    "ce-sdq-p-v1": "مستند",                     # برش رسمی نسخهٔ والد برگهٔ ۴–۱۷
    "ce-anamnesis-v2": None,                    # فرم بدون باند/هنجار
    "ce-anamnesis-v3": None,                    # فرم بدون باند/هنجار
    "ce-probe-read-v1": "بدون مبدأ — نیازمند تأیید",  # هنجار WCPM در instruments.ts بی‌مرجع
    "ce-probe-write-v1": "بدون مبدأ — نیازمند تأیید",
    "ce-probe-calc-v1": "بدون مبدأ — نیازمند تأیید",
    "ce-dcdq-v1": "کالیبراسیون داخلی",          # «منبع باند مرزی ندارد» (باند مرزی داخلی)
    "ce-sld-read-v1": "کالیبراسیون داخلی",      # لنگر شدت سه‌درجه‌ای m86 (درون‌مرکزی)
    "ce-sld-wri-v1": "کالیبراسیون داخلی",
    "ce-sld-calc-v1": "کالیبراسیون داخلی",
    "ce-asd-criteria-v1": "کالیبراسیون داخلی",
    "ce-speech-criteria-v1": "کالیبراسیون داخلی",
    "ce-odd-criteria-v1": "کالیبراسیون داخلی",
    "ce-id-adapt-v1": "کالیبراسیون داخلی",      # «برش‌های سه‌گانه اولیه است — کالیبراسیون با دادهٔ مرکز»
    "ce-sld-class-t-v1": "کالیبراسیون داخلی",
}

# کلیدهای کد-مقیم: ردیف case_event_types ندارند (SENSORY_CHIP_KEY/READ_CORE_KEY در pure.ts)؛
# برای آن‌ها UPDATE نمی‌نویسیم — شناسنامه‌شان فقط در JSON + docs/INSTRUMENT-SOURCES.md است.
CODE_RESIDENT = {"ce-sensory-chip-v1", "ce-read-core-v1"}

FILES = {
    "screening": CE / "battery-screening.json",
    "specific": CE / "battery-specific.json",
    "clinical": CE / "battery-clinical.json",
}

blocks = {}  # key -> (file, source, category, norm)
for name, path in FILES.items():
    data = json.loads(path.read_text(encoding="utf-8"))
    for b in data:
        k = b["key"]
        assert k not in blocks, f"duplicate key {k}"
        assert k in CATEGORY, f"no category mapping for {k}"
        assert k in NORM_STATUS, f"no norm mapping for {k}"
        blocks[k] = (path.name, b.get("source", ""), CATEGORY[k], NORM_STATUS[k])
    # minimal insert: one "batteryCategory" line right after each block's "source" line (4-space indent)
    text = path.read_text(encoding="utf-8")
    lines = text.split("\n")
    out = []
    seen = set()
    src_re = re.compile(r'^    "source": ')
    cat_re = re.compile(r'^    "batteryCategory": ')
    key_re = re.compile(r'^    "key": "(ce-[^"]+)",?$')
    cur = None
    for i, ln in enumerate(lines):
        out.append(ln)
        km = key_re.match(ln)
        if km:
            cur = km.group(1)
        if src_re.match(ln):
            assert cur, "source line before key"
            if i + 1 < len(lines) and cat_re.match(lines[i + 1]):
                seen.add(cur)  # rerun of this script: already inserted, keep as-is
                continue
            seen.add(cur)
            out.append(f'    "batteryCategory": "{CATEGORY[cur]}",')
    assert len(seen) == len(data), f"{path.name}: inserted {len(seen)} of {len(data)}"
    path.write_text("\n".join(out), encoding="utf-8")

# sanity: JSON still parses and every block got the field
for name, path in FILES.items():
    data = json.loads(path.read_text(encoding="utf-8"))
    for b in data:
        assert b.get("batteryCategory") == CATEGORY[b["key"]], f"bad batteryCategory for {b['key']}"

def sql(s: str) -> str:
    return s.replace("'", "''")

def status_fa(norm) -> str:
    return norm if norm is not None else "بدون باند/هنجار"

order = list(CATEGORY.keys())
db_order = [k for k in order if k not in CODE_RESIDENT]
mig = []
mig.append("-- ۱.۲۷.۸۸ — ممیزی روان‌سنجی (quick wins): شناسنامهٔ ابزار — پر کردن tool_source/tool_norm برای ۱۹ قالب ce-* باتریِ مقیم DB")
mig.append("-- مقادیر عیناً از فیلد «source» بلوک‌های JSON باتری برداشت شده‌اند (بدون بازنویسی یا بهبود ادعا):")
mig.append("--   tool_source = متن کامل فیلد source همان بلوک (verbatim)؛")
mig.append("--   tool_norm   = وضعیت باند/هنجار بر پایهٔ همان متن (مستند / کالیبراسیون داخلی / بدون مبدأ — نیازمند تأیید)؛")
mig.append("--   فرم‌های بدون باند و هنجار (شرح‌حال v2/v3) عمداً NULL می‌مانند. دو چیپ کد-مقیم ce-sensory-chip-v1 و")
mig.append("--   ce-read-core-v1 ردیف case_event_types ندارند (SENSORY_CHIP_KEY/READ_CORE_KEY در pure.ts) و قالب‌های")
mig.append("--   خارج از باتری ادعای منبعی در JSON ندارند — همه NULL می‌مانند. رجیستری کامل: docs/INSTRUMENT-SOURCES.md")
mig.append("-- این UPDATEها Idempotent هستند (مقدار ثابت می‌نویسند) و فقط-افزودنی‌اند؛ ستون‌ها در 0117_tool_metadata.sql ساخته شده‌اند.")
mig.append("")
for k in db_order:
    fname, src, cat, norm = blocks[k]
    if norm is None:
        mig.append(f"UPDATE case_event_types SET tool_source = '{sql(src)}', updated_at = datetime('now') WHERE key = '{k}';")
    else:
        mig.append(f"UPDATE case_event_types SET tool_source = '{sql(src)}', tool_norm = '{sql(norm)}', updated_at = datetime('now') WHERE key = '{k}';")
mig.append("")
(REPO / "migrations/0126_tool_metadata_backfill.sql").write_text("\n".join(mig), encoding="utf-8")

# ── docs/INSTRUMENT-SOURCES.md ──
doc = []
doc.append("# رجیستری مبدأ ابزارهای بالینی (INSTRUMENT-SOURCES)")
doc.append("")
doc.append("مستند ممیزی روان‌سنجی (۱.۲۷.۸۸): «هر ابزار از کجا آمده و وضعیت هنجار/باندهایش چیست».")
doc.append("این سند از خودِ محتوا تولید شده است — ستون «منبعِ ادعاشده» عیناً (verbatim) فیلد `source` بلوک JSON همان ابزار است؛ هیچ ادعایی بازنویسی، بهبود یا اضافه نشده است.")
doc.append("")
doc.append("قرارداد ستون «وضعیت باند/هنجار»:")
doc.append("")
doc.append("- **مستند** — برش/باند در متن منبع به مرجع استنادی گره خورده است.")
doc.append("- **کالیبراسیون داخلی** — بخشی از باندها/برش‌ها در متن منبع صراحتاً درون‌مرکزی خوانده می‌شود (کالیبراسیون داخلی، باند مرزی داخلی، تصمیم بالینی داخلی، «برش اولیه — کالیبراسیون با دادهٔ مرکز»). برچسب محافظه‌کارانه است: جزئیات در متن verbatim همان ردیف هست.")
doc.append("- **بدون مبدأ — نیازمند تأیید** — عدد هنجار/باند در متن منبع هیچ مرجعی برایش ادعا نشده است.")
doc.append("- **بدون باند/هنجار** — فرم ساختارمند/مصاحبه است و باند یا هنجار عددی ندارد (ستون `tool_norm` در DB عمداً NULL است).")
doc.append("")
doc.append("مقادیر `tool_source`/`tool_norm` جدول `case_event_types` با مایگریشن `0126_tool_metadata_backfill.sql` از همین فیلدها پر شده‌اند و در مسیر sync محتوا (بلوک‌های JSON → `src/domain/clinical-engine/instruments.ts` → مایگریشن‌های محتوا) همین متن مرجع است.")
doc.append("")
doc.append("## باتری غربگری (battery-screening.json)")
doc.append("")
doc.append("| کلید | منبعِ ادعاشده (verbatim) | وضعیت باند/هنجار | محل در کد |")
doc.append("| --- | --- | --- | --- |")
for k in order:
    fname, src, cat, norm = blocks[k]
    if not fname.startswith("battery-screening"):
        continue
    loc = "قالب کد-مقیم (pure.ts — SENSORY_CHIP_KEY/READ_CORE_KEY؛ ردیف DB ندارد)" if k in CODE_RESIDENT else f"`src/domain/clinical-engine/{fname}` بلوک `{k}` → `instruments.ts` (BATTERY)"
    doc.append(f"| `{k}` | {src} | {norm} | {loc} |")
doc.append("")
doc.append("## باتری تخصصی/ملاکی (battery-specific.json)")
doc.append("")
doc.append("| کلید | منبعِ ادعاشده (verbatim) | وضعیت باند/هنجار | محل در کد |")
doc.append("| --- | --- | --- | --- |")
for k in order:
    fname, src, cat, norm = blocks[k]
    if not fname.startswith("battery-specific"):
        continue
    doc.append(f"| `{k}` | {src} | {status_fa(norm)} | `src/domain/clinical-engine/{fname}` بلوک `{k}` → `instruments.ts` (BATTERY) |")
doc.append("")
doc.append("## باتری بالینی/شرح‌حال (battery-clinical.json)")
doc.append("")
doc.append("| کلید | منبعِ ادعاشده (verbatim) | وضعیت باند/هنجار | محل در کد |")
doc.append("| --- | --- | --- | --- |")
for k in order:
    fname, src, cat, norm = blocks[k]
    if not fname.startswith("battery-clinical"):
        continue
    doc.append(f"| `{k}` | {src} | {status_fa(norm)} | `src/domain/clinical-engine/{fname}` بلوک `{k}` → `instruments.ts` (BATTERY) |")
doc.append("")
doc.append("## هنجارهای عددی خارج از باتری — بدون مبدأ، نیازمند تأیید")
doc.append("")
doc.append("| مورد | وضعیت | محل در کد |")
doc.append("| --- | --- | --- |")
doc.append("| هنجارهای صدک ۵۰ نُرم موتور وکسلر WISC-IV | بدون مبدأ — نیازمند تأیید (بدنه و نُرم‌ها «از باندل استخراج‌شده، دست‌نخورده» — مرجعی مستند نشده) | `src/domain/wechsler-engine/engine.js` |")
doc.append("| هنجار WCPM صدک ۵۰ (خواندن بلند، پایه ۱–۸) | بدون مبدأ — نیازمند تأیید (اعداد بی‌مرجع) | `src/domain/clinical-engine/instruments.ts` — `WCPM_NORM_50TH` |")
doc.append("| هنجار آلفا/۱۵ ثانیه (نوشتن، پایه ۱–۸) | بدون مبدأ — نیازمند تأیید (اعداد بی‌مرجع) | `src/domain/clinical-engine/instruments.ts` — `ALPHA_15S_NORM` |")
doc.append("| هنجار ارقام/۲ دقیقه (حساب، پایه ۱–۸) | بدون مبدأ — نیازمند تأیید (اعداد بی‌مرجع) | `src/domain/clinical-engine/instruments.ts` — `DIGITS_2MIN_NORM` |")
doc.append("")
doc.append("دو چیپ غربگری `ce-sensory-chip-v1` و `ce-read-core-v1` «کد-مقیم»ند: ردیفی در جدول `case_event_types` ندارند (`SENSORY_CHIP_KEY`/`READ_CORE_KEY` در `src/domain/case-events/pure.ts`)، پس `tool_source`/`tool_norm` در DB برایشان موضوعیت ندارد و مایگریشن 0126 برایشان UPDATE نمی‌نویسد — شناسنامهٔ آن‌ها همین جدول است.")
doc.append("")
doc.append("قالب‌های `ce-*` خارج از باتری سه‌گانه بالا (وکسلر `ce-wechsler-w4-v1`، پروتکل‌های توان‌بخشی، پایش خانه، فرضیه‌نگار، جمع‌بندی‌ها و نظرسنجی‌ها) فیلد `source` در JSON باتری ندارند؛ `tool_source`/`tool_norm` آن‌ها NULL است تا ادعای منبعی جعل نشود. برای این قالب‌ها شناسنامه باید از طریق فرم‌ساز (شناسنامهٔ ابزار) توسط مرکز ثبت شود.")
doc.append("")
(REPO / "docs/INSTRUMENT-SOURCES.md").write_text("\n".join(doc), encoding="utf-8")

print("OK — 21 blocks updated, migration 0126 + docs/INSTRUMENT-SOURCES.md written")
for k in order:
    print(f"  {k}: cat={CATEGORY[k]} norm={NORM_STATUS[k]}")
