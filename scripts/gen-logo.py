#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""۱.۲۷.۴۷ — نشان مونوکروم فانوس (خواست کارفرما: لوگوی مناسب تم مشکی‌وسفید، بزرگ).

خروجی‌ها:
  - public/favicon.svg (برداری، کاشی مشکی + فانوس سفید)
  - public/favicon.png (64) + public/assets/img/logo-{32,64,192,512}.png
  - desktop/src-tauri/icons/icon.png (512) + icon.ico (16..256)

هندسهٔ فانوس: حلقه بالا + گنبد پهن + بدنهٔ گرد + پنجرهٔ تیره + شعلهٔ سفید + پایه.
PIL شکل‌ها را روی بوم ۱۰۲۴ می‌کشد و به اندازه‌ها کاهش می‌دهد.
"""
from PIL import Image, ImageDraw

S = 1024            # بوم اصلی
SCALE = S / 512.0   # مختصات طراحی بر پایهٔ viewBox 512

INK = (10, 10, 10, 255)      # کاشی مشکی خالص
PAPER = (255, 255, 255, 255)  # فانوس سفید


def rr(d, box, radius, fill):
    d.rounded_rectangle(box, radius=radius, fill=fill)


def draw_mark(tile, glyph, window):
    """کاشی + فانوس؛ tile/glyph/window به‌صورت RGBA"""
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)

    # کاشی: مربع گردی‌دار (اپ‌آیکون)
    rr(d, (0, 0, S - 1, S - 1), int(116 * SCALE), tile)

    def X(v):
        return int(v * SCALE)

    # حلقهٔ بالا
    d.ellipse((X(256 - 38), X(106 - 38), X(256 + 38), X(106 + 38)),
              outline=glyph, width=int(26 * SCALE))
    # گنبد پهن‌تر از بدنه (روی بدنه می‌نشیند — پیوند بی‌درز)
    rr(d, (X(142), X(150), X(370), X(222)), int(36 * SCALE), glyph)
    # بدنه
    rr(d, (X(170), X(196), X(342), X(432)), int(48 * SCALE), glyph)
    # پنجرهٔ تیره
    rr(d, (X(198), X(246), X(314), X(378)), int(22 * SCALE), window)
    # شعلهٔ سفید — همان مسیر بِزیهٔ SVG با نمونه‌برداری (دو قوس متقارن، سرِ تیز بالا/پایین)
    def bez(p0, p1, p2, p3, n=24):
        pts = []
        for i in range(n + 1):
            t = i / n
            x = (1 - t) ** 3 * p0[0] + 3 * (1 - t) ** 2 * t * p1[0] + 3 * (1 - t) * t ** 2 * p2[0] + t ** 3 * p3[0]
            y = (1 - t) ** 3 * p0[1] + 3 * (1 - t) ** 2 * t * p1[1] + 3 * (1 - t) * t ** 2 * p2[1] + t ** 3 * p3[1]
            pts.append((X(x), X(y)))
        return pts
    right = bez((256, 258), (284, 300), (284, 340), (256, 372))
    left = bez((256, 372), (228, 340), (228, 300), (256, 258))
    d.polygon(right + left, fill=glyph)
    # پایه
    rr(d, (X(158), X(446), X(354), X(476)), int(15 * SCALE), glyph)
    return im


def save(im, path, size):
    out = im.resize((size, size), Image.LANCZOS)
    if path.endswith('.png'):
        out.save(path, 'PNG')
    else:
        out.save(path)
    print(path, size)


def main():
    mark = draw_mark(INK, PAPER, INK)

    # فاوآیکون برداری — همان هندسه با مختصات ۳۲ (کاشی مشکی، فانوس سفید)
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <!-- ۱.۲۷.۴۷ — نشان مونوکروم فانوس (خواست کارفرما: مناسب تم مشکی‌وسفید) -->
  <rect width="512" height="512" rx="116" fill="#0A0A0A"/>
  <circle cx="256" cy="106" r="38" fill="none" stroke="#FFFFFF" stroke-width="26"/>
  <rect x="142" y="150" width="228" height="72" rx="36" fill="#FFFFFF"/>
  <rect x="170" y="196" width="172" height="236" rx="48" fill="#FFFFFF"/>
  <rect x="198" y="246" width="116" height="132" rx="22" fill="#0A0A0A"/>
  <path d="M256 258 C284 300 284 340 256 372 C228 340 228 300 256 258 Z" fill="#FFFFFF"/>
  <rect x="158" y="446" width="196" height="30" rx="15" fill="#FFFFFF"/>
</svg>
"""
    with open('public/favicon.svg', 'w', encoding='utf-8') as f:
        f.write(svg)
    print('public/favicon.svg OK')

    save(mark, 'public/favicon.png', 64)
    save(mark, 'public/assets/img/logo-512.png', 512)
    save(mark, 'public/assets/img/logo-192.png', 192)
    save(mark, 'public/assets/img/logo-64.png', 64)
    save(mark, 'public/assets/img/logo-32.png', 32)
    save(mark, 'desktop/src-tauri/icons/icon.png', 512)

    # ICO چند-اندازه برای دسکتاپ
    ico_sizes = [16, 32, 48, 64, 128, 256]
    frames = [mark.resize((s, s), Image.LANCZOS) for s in ico_sizes]
    frames[-1].save('desktop/src-tauri/icons/icon.ico', format='ICO',
                    sizes=[(s, s) for s in ico_sizes])
    print('desktop/src-tauri/icons/icon.ico OK')


if __name__ == '__main__':
    main()
