#!/usr/bin/env python3
# پیکسل‌سنجی شات‌های فاز-به-فاز (هم‌قانون shots-pixelcheck.py برای /tmp/shots-phases)
# حلقهٔ صفحه یا کرم است، یا شبِ اسکن، یا سرمهٔ numline؛ گیت دوم: بریدگی لبهٔ پایین ممنوع
from PIL import Image
import glob, os

PAGE_CREAM = (245, 240, 229)
SCAN_NIGHT = (11, 37, 53)
NUMLINE_NAVY = (18, 56, 75)
LEGAL_CORNER = [PAGE_CREAM, SCAN_NIGHT, NUMLINE_NAVY]

def close(a, b, tol=34):
    return all(abs(x - y) <= tol for x, y in zip(a, b))

bad = 0
rows = []
for f in sorted(glob.glob(os.environ.get('SHOTS_DIR', '/tmp/shots-phases') + '/*.png')):
    img = Image.open(f).convert('RGB')
    w, h = img.size
    name = os.path.basename(f)
    corner = img.getpixel((4, 4))
    is_parent = '-parent' in name and 'parent-gate' not in name
    ok = True if is_parent else any(close(corner, c) for c in LEGAL_CORNER)
    if not ok:
        bad += 1
    clip = ''
    if any(k in name for k in ('main', 'practice', 'end', 'stuck', 'gate')):
        clipped = 0
        for y in (h - 1, h - 2, h - 3):
            px = [img.getpixel((x, y)) for x in range(20, w - 20, 4)]
            med = tuple(sorted(c[i] for c in px)[len(px) // 2] for i in range(3))
            dev = sum(1 for c in px if max(abs(c[i] - med[i]) for i in range(3)) > 70)
            clipped += dev
        clip = 'CLIP?' if clipped > 16 else 'ok'
        if clip == 'CLIP?':
            bad += 1
    rows.append(f"{name:44s} {str(corner):16s} {'parent' if is_parent else ('YES' if ok else 'NO'):9s} {clip}")

for r in rows:
    print(r)
print('files =', len(rows), ' BAD =', bad)
raise SystemExit(1 if bad else 0)
