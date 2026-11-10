#!/usr/bin/env python3
# پیکسل‌سنجی خودکار اسکرین‌شات‌های پوسته — قرارداد «دو نما» (۱.۲۵.۴۵)
# عمودی دیگر پوشش قفل نیست: حلقهٔ صفحه یا کرم است، یا شبِ اسکن، یا سرمهٔ numline —
# هویت هر بازی روی خود صحنه است. گیت دوم: بریدگی لبهٔ پایین در هر ارتفاعی ممنوع.
# مصرف: بعد از scripts/shots-audit.mjs
from PIL import Image
import glob, os

PAGE_CREAM = (245, 240, 229)   # حلقهٔ کرم صفحه — پایه
SCAN_NIGHT = (11, 37, 53)      # اسکن — تنها پوسته‌ای که بدنهٔ صفحه را هم شب می‌کند (body:has در skins/scan.css)
NUMLINE_NAVY = (18, 56, 75)    # numline — آسمان سرمه‌ای بدنه (skins/numline.css)
LEGAL_CORNER = [PAGE_CREAM, SCAN_NIGHT, NUMLINE_NAVY]

def close(a, b, tol=34):
    return all(abs(x - y) <= tol for x, y in zip(a, b))

bad = 0
print(f"{'file':40s} {'corner-bg':16s} {'corner-ok':9s} {'bottom-clip':12s}")
for f in sorted(glob.glob('/tmp/shots/*.png') + glob.glob('/tmp/shots-qa/*.png') + glob.glob('/tmp/shots-gonogo/*.png')):
    img = Image.open(f).convert('RGB')
    w, h = img.size
    name = os.path.basename(f)
    corner = img.getpixel((4, 4))
    is_parent = '-1-parent' in name  # کارت والد: پوسته روی کارت است، نه صفحه
    if is_parent:
        ok = True
    else:
        ok = any(close(corner, c) for c in LEGAL_CORNER)
    status = ('parent' if is_parent else ('YES' if ok else 'NO'))
    if not ok and not is_parent:
        bad += 1
    clip = ''
    if 'trial' in name or 'stuck' in name:
        # گیت بریدگی واقعی: انحراف از رنگ میانهٔ خودِ ردیف — پس‌زمینه یکدست است،
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
    print(f"{name:40s} {str(corner):16s} {status:9s} {clip:12s}")
print('BAD =', bad)
raise SystemExit(1 if bad else 0)
