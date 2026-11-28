#!/usr/bin/env python3
# خروجی پژوهش SLD — ساخت md از دامپ تولید (طرح‌های درمان فعال + کارت‌ها + فرم‌ها)
# ورودی: /tmp/sld-export/*.json (با wrangler d1 execute --json کشیده شده)
# خروجی: /home/z/my-project/download/خروجی-پژوهش-SLD-طرح‌ها-و-کارت‌ها.md
import json, os

SRC = '/tmp/sld-export'
OUT = '/home/z/my-project/download/خروجی-پژوهش-SLD-طرح‌ها-و-کارت‌ها.md'

def load(name):
    with open(os.path.join(SRC, name), encoding='utf-8') as f:
        return json.load(f)

templates = load('templates.json')
cards = load('cards.json')
focus = load('focus.json')
files = load('files.json')
forms = load('forms.json')

focus_by_ex = {}
for r in focus:
    focus_by_ex.setdefault(r['exercise_id'], []).append(r['focus_key'])
files_by_ex = {}
for r in files:
    files_by_ex.setdefault(r['exercise_id'], []).append(r['file_name'])

card_by_id = {r['id']: r for r in cards}

TYPE_FA = {
    'exercise': 'تمرین', 'homework': 'تکلیف خانه', 'game': 'بازی',
    'instruction': 'دستورالعمل', 'event': 'رویداد', 'probe': 'پروب سنجش', 'family': 'خانواده',
}
CAT_FA = {
    'intake': 'ورودی و سوابق', 'sld': 'سنجش‌های SLD', 'scales': 'مقیاس‌های معلم/والد',
    'family': 'خانواده و خانه', 'monitor': 'پایش و پیگیری', 'comorbid': 'ابزارهای هم‌بودی و افتراق',
    'clinic': 'ثبت جلسه و جمع‌بندی درمانگر', 'custom': 'ابزارهای سفارشی مرکز', 'battery': 'باتری سنجش',
}

L = []
L.append('# خروجی پژوهش — پلتفرم کلینیک اختلال یادگیری و دیرآموزی')
L.append('')
L.append('> **هدف این سند:** دادهٔ کامل و ساخت‌یافتهٔ محتوای درمانیِ فعالِ سیستم برای پژوهش با مدل‌های زبانی')
L.append('> (طرح‌های درمان، کارت‌های تمرین، فرم‌های باتری). همهٔ متن‌ها عیناً از پایگاه دادهٔ تولید')
L.append('> (Cloudflare D1) استخراج شده‌اند — بدون بازنویسی. تاریخ خروجی: ۲۰۲۶-۱۱-۲۸ · نسخهٔ سیستم: 1.27.93.')
L.append('')
L.append('## زمینهٔ محصول (برای مدل پژوهشگر)')
L.append('')
L.append('- مرکز درمانی تخصصی **اختلال یادگیری (SLD) و دیرآموزی** — نارساخوانی، نارسانویسی، دیسکالکولی، حافظهٔ کاری و توجه پشتیبان.')
L.append('- پلتفرم: مدیریت پروندهٔ دانش‌آموز، باتری سنجش (فرم‌های والد/معلم/خانواده + پروب‌های اجرایی خواندن/نوشتن/حساب)،')
L.append('  بانک کارت‌های تمرین با فایل چاپی، و طرح‌های درمانِ چندجلسه‌ایِ ساخت‌یافته با معیار گذر برای هر جلسه.')
L.append('- شش طرح درمان سیستمی فعال است: خواندن، نوشتن، ریاضی (پایه‌های ۱-۳) + سه بستهٔ پایهٔ اول تا سوم')
L.append('  (حافظهٔ کاری، نوشتن و املای ۱-۲، پیش‌مطلب ریاضی).')
L.append('- پرسش راهنمای پژوهش: چه تمرین‌ها/بازی‌ها/ابزارهایی برای تقویت هر حیطه (آگاهی واجی، رمزگشایی، روانی-خوانی،')
L.append('  آگاهی املایی، نویسندگی، حس عدد و محاسبه، حافظهٔ کاری، توجه، هماهنگی دیداری-حرکتی) لازم است و کدام‌یک از')
L.append('  موارد موجود این خروجی را می‌توان ارتقا داد؟ رویکرد هدف مرکز: بازی‌درمانی و کاربرگ بازی.')
L.append('')

# ─── بخش ۱: طرح‌های درمان ───
L.append(f'## بخش ۱ — طرح‌های درمان فعال ({len(templates)} طرح)')
L.append('')
for t in templates:
    sessions = json.loads(t['sessions_json'] or '[]')
    steps = json.loads(t['steps'] or '[]')
    L.append(f"### {t['title']}  (`{t['key']}`)")
    L.append('')
    if t.get('target_key'):
        L.append(f"- هدف بالینی: `{t['target_key']}`")
    if t.get('protocol'):
        L.append(f"- پروتکل: {t['protocol']}")
    if t.get('description'):
        L.append(f"- توضیح: {t['description']}")
    if steps:
        L.append(f"- گام‌های کلان: {' → '.join(s.get('title', '') for s in steps if isinstance(s, dict))}")
    L.append(f"- تعداد جلسات: {len(sessions)}")
    L.append('')
    for i, s in enumerate(sessions, 1):
        crit = s.get('criterion') or ''
        L.append(f"**جلسهٔ {i} — {s.get('title','')}**")
        if s.get('plan'):
            L.append(f"- برنامه: {s['plan']}")
        if crit:
            L.append(f"- معیار گذر: {crit}")
        for it in s.get('items', []):
            typ = TYPE_FA.get(it.get('type', ''), it.get('type', ''))
            link = it.get('linkId')
            tail = ''
            if link and link in card_by_id:
                c = card_by_id[link]
                fl = files_by_ex.get(link, [])
                tail = f" ← کارت واقعی: «{c['title']}» ({len(fl)} فایل چاپی)"
            elif link:
                tail = ' ← کارت بانک (شناسهٔ واقعی)'
            L.append(f"  - [{typ}] {it.get('text','')}{tail}")
        L.append('')

# ─── بخش ۲: کارت‌های تمرین ───
L.append(f'## بخش ۲ — بانک کارت‌های تمرین منتشرشده ({len(cards)} کارت)')
L.append('')
L.append('هر کارت شامل: فرمت (worksheet/print/instruction/…)، حیطه‌های هدف (focus)، توضیح کامل و فایل‌های چاپی.')
L.append('')
for c in cards:
    fk = focus_by_ex.get(c['id'], [])
    fl = files_by_ex.get(c['id'], [])
    legacy = [c['file_name']] if c.get('file_name') else []
    allf = fl or legacy
    meta = []
    if c.get('format'):
        meta.append(f"فرمت: {c['format']}")
    if fk:
        meta.append('حیطه‌ها: ' + '، '.join(fk))
    if allf:
        meta.append(f"فایل‌ها ({len(allf)}): " + '، '.join(allf[:6]) + ('…' if len(allf) > 6 else ''))
    if c.get('external_url'):
        meta.append(f"پیوند: {c['external_url']}")
    L.append(f"**{c['title']}**" + (' — ' + ' · '.join(meta) if meta else ''))
    if c.get('description'):
        L.append('')
        L.append(c['description'].strip())
    L.append('')

# ─── بخش ۳: فرم‌های باتری ───
L.append(f'## بخش ۳ — فرم‌های فعال باتری سنجش ({len(forms)} فرم)')
L.append('')
by_cat = {}
for r in forms:
    by_cat.setdefault(r.get('category') or 'battery', []).append(r)
for cat in sorted(by_cat):
    L.append(f"### {CAT_FA.get(cat, cat)}")
    L.append('')
    for r in by_cat[cat]:
        bits = [f"`{r['key']}`", r.get('title') or '']
        if r.get('audience'):
            bits.append('مخاطب: ' + r['audience'])
        if r.get('tool_source'):
            bits.append('ابزار: ' + r['tool_source'])
        if r.get('tool_norm'):
            bits.append('هنجار: ' + r['tool_norm'])
        L.append(f"- {' — '.join(b for b in bits if b)}")
        if r.get('description'):
            L.append(f"  - {r['description']}")
    L.append('')

# ─── بخش ۴: بلاک ماشینی ───
L.append('## بخش ۴ — دادهٔ خام ساخت‌یافته (برای پارس ماشینی)')
L.append('')
L.append('```json')
L.append(json.dumps({
    'templates': [{'key': t['key'], 'title': t['title'], 'target_key': t.get('target_key'),
                   'sessions': json.loads(t['sessions_json'] or '[]')} for t in templates],
    'cards': [{'id': c['id'], 'title': c['title'], 'format': c.get('format'),
               'focus': focus_by_ex.get(c['id'], []), 'files': files_by_ex.get(c['id'], []),
               'description': c.get('description')} for c in cards],
    'forms': [{'key': r['key'], 'title': r.get('title'), 'category': r.get('category'),
               'audience': r.get('audience')} for r in forms],
}, ensure_ascii=False, indent=1))
L.append('```')
L.append('')

with open(OUT, 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
print(f'OK: {OUT} — {os.path.getsize(OUT)} bytes, {len(templates)} templates, {len(cards)} cards, {len(forms)} forms')
