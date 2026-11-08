#!/usr/bin/env python3
# پیکسل‌سنجی خودکار اسکرین‌شات‌های پوسته — رنگ پس‌زمینهٔ هر بازی + بریدگی لبهٔ پایین
# مصرف: بعد از scripts/shots-audit.mjs — گیت سریع «هر بازی رنگ خودش را دارد؛ هیچ شاتی زیر لبه بریده نیست»
# روی پایهٔ G7: پوسته از body:has(.play-skin--<kind>) می‌آید — گوشهٔ تصویر رنگ همان است.
from PIL import Image
import glob, os

KIND_BG = {  # رنگ پوشش قفل جهت (عمودی لمسی) — پوستهٔ هم‌تم هر بازی؛ باید به‌ازای هر نوع متمایز باشد
    'gonogo': (234, 243, 239), 'numline': (18, 56, 75),
    'scan': (13, 43, 61), 'stroop': (23, 16, 49),
    'flanker': (27, 36, 54), 'trail': (11, 30, 49), 'nback': (11, 46, 56),
}
PAGE_CREAM = (245, 240, 229)  # حلقهٔ صفحه در افقی — قرارداد G7 (صحنه رنگ‌پوسته است، صفحه کرم)

def close(a, b, tol=34):
    return all(abs(x - y) <= tol for x, y in zip(a, b))

bad = 0
print(f"{'file':38s} {'corner-bg':16s} {'kind-skin':10s} {'bottom-clip':12s}")
for f in sorted(glob.glob('/tmp/shots/*.png')):
    img = Image.open(f).convert('RGB')
    w, h = img.size
    name = os.path.basename(f)
    corner = img.getpixel((4, 4))
    kind = name.split('-')[0]
    is_parent = '-1-parent' in name  # کارت والد: پوسته روی کارت است، نه صفحه
    if is_parent:
        ok = True
    elif kind == 'scan':
        # اسکن — تنها پوسته‌ای که بدنهٔ صفحه را هم شب می‌کند (body:has در skins/scan.css)
        ok = close(corner, (11, 37, 53))
    elif h == 390 or '-7-intro-desktop' in name:
        # افقی/دسکتاپ — حلقهٔ صفحه کرم (قرارداد G7)؛ هویت روی خود صحنه است
        ok = close(corner, PAGE_CREAM)
    else:
        # عمودی — پوشش قفل با تم پوستهٔ همان بازی؛ متمایز به‌ازای هر نوع
        ok = close(corner, KIND_BG.get(kind, (0, 0, 0)))
    status = ('parent' if is_parent else ('YES' if ok else 'NO'))
    if not ok and not is_parent:
        bad += 1
    clip = ''
    if h == 390 and ('trial' in name or 'stuck' in name):
        # گیت بریدگی واقعی: انحراف از رنگ میانهٔ خودِ ردیف — پس‌زمینهٔ تیرهٔ پوسته یکدست است،
        # متن/محتوای بریده‌شده از میانهٔ همان ردیف فاصله می‌گیرد
        clipped = 0
        for y in (h - 1, h - 2, h - 3):
            px = [img.getpixel((x, y)) for x in range(20, w - 20, 4)]
            med = tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))
            dev = sum(1 for c in px if max(abs(c[i] - med[i]) for i in range(3)) > 70)
            clipped += dev
        clip = 'CLIP?' if clipped > 16 else 'ok'
        if clip == 'CLIP?':
            bad += 1
    print(f"{name:38s} {str(corner):16s} {status:10s} {clip:12s}")
print('BAD =', bad)
raise SystemExit(1 if bad else 0)
