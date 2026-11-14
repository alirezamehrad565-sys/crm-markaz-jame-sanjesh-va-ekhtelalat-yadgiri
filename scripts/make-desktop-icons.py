#!/usr/bin/env python3
# مولد آیکن پوستهٔ دسکتاپ — نشان موقت هندسی (پالس سنجش) تا طرح گرافیکی نهایی کارفرما
# استفاده: python3 scripts/make-desktop-icons.py   → desktop/src-tauri/icons/{icon.ico,icon.png}
from PIL import Image, ImageDraw

OUT = "/home/z/my-project/gh-work-rust/desktop/src-tauri/icons"
BASE = 512

def draw_mark(size: int) -> Image.Image:
    im = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    r = int(size * 0.22)  # گوشهٔ گرد
    # زمینهٔ نیلی عمیق
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=r, fill=(30, 42, 90, 255))
    # حلقهٔ بیرونی ظریف
    m = int(size * 0.06)
    d.rounded_rectangle([m, m, size - 1 - m, size - 1 - m], radius=int(r * 0.8),
                        outline=(126, 168, 255, 90), width=max(2, size // 128))
    # پالس (نمودار ضربان سنجش) — خط شکستهٔ سفید در میانه
    cy = size * 0.52
    x0, x1 = size * 0.14, size * 0.86
    pts = [
        (x0, cy),
        (size * 0.30, cy),
        (size * 0.36, cy - size * 0.16),
        (size * 0.44, cy + size * 0.20),
        (size * 0.52, cy - size * 0.08),
        (size * 0.58, cy),
        (x1, cy),
    ]
    d.line(pts, fill=(255, 255, 255, 255), width=max(3, size // 26), joint="curve")
    # نقطهٔ مداخلهٔ بهنگام — سبز توان‌بخشی
    rr = size * 0.045
    d.ellipse([size * 0.80 - rr, cy - rr, size * 0.80 + rr, cy + rr], fill=(96, 220, 160, 255))
    return im

import os
os.makedirs(OUT, exist_ok=True)
base = draw_mark(BASE)
base.save(f"{OUT}/icon.png")
sizes = [16, 24, 32, 48, 64, 128, 256]
frames = [base.resize((s, s), Image.LANCZOS) for s in sizes]
frames[0].save(f"{OUT}/icon.ico", format="ICO", sizes=[(s, s) for s in sizes])
print(f"✓ icons: icon.png ({BASE}px) + icon.ico ({', '.join(map(str, sizes))}px)")
