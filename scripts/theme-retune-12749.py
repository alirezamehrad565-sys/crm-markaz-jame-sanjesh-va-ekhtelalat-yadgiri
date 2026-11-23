#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""۱.۲۷.۴۹ — بازتنظیم بصری پوسته به خواست کارفرما:
① تایپوگرافی یک پله کوچک‌تر (کف ۱۳→۱۲، بدنه ۱۶→۱۵، تیتر ۳۱→۲۸، هیرو ۲۶→۲۴)
② لوگو کوچک‌تر (سایدبار ۵۶→۴۶، ورود ۹۶→۸۰)
③ سایه‌ها کمتر و نرم‌تر (سه‌لایه→دولایه، آلفاها پایین، تیره هم‌کالیبره)
"""
import io

def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if s.count(old) == 0:
            assert s.count(new) >= 1, f'{p}: neither :: {old[:60]!r}'
            continue  # ایدمپوتنت
        assert s.count(old) == 1, f'{p}: count={s.count(old)} :: {old[:60]!r}'
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
    print(p.split('/')[-1], 'OK')

B = 'public/assets/css/base.css'
V = 'public/assets/css/views.css'
C = 'public/assets/css/components.css'
T = 'src/__tests__/front-font-floor.test.ts'

# ① سایه‌های روشن — دولایه نرم
patch(B, [(
"""  /* ۱.۲۷.۴۷ — عمق بیشتر کارت‌ها (خواست کارفرما) — سه‌لایه: تماس + میانی + پراکنده */
  --shadow-1: 0 1px 2px rgba(32, 42, 58, 0.08), 0 6px 18px rgba(32, 42, 58, 0.09), 0 14px 34px -12px rgba(32, 42, 58, 0.14);
  --shadow-2: 0 2px 6px rgba(32, 42, 58, 0.09), 0 12px 32px rgba(32, 42, 58, 0.13), 0 22px 52px -16px rgba(32, 42, 58, 0.18);
  --shadow-3: 0 6px 16px rgba(32, 42, 58, 0.10), 0 24px 56px rgba(32, 42, 58, 0.20), 0 36px 72px -20px rgba(32, 42, 58, 0.22);
  --shadow-sidebar: 0 8px 20px rgba(32, 42, 58, 0.11), 0 30px 60px rgba(32, 42, 58, 0.17), 0 44px 80px -24px rgba(32, 42, 58, 0.20);""",
"""  /* ۱.۲۷.۴۹ — عمق نرم‌تر (بازتنظیم به خواست کارفرما): دولایه، آلفا پایین، لبهٔ ملایم */
  --shadow-1: 0 1px 2px rgba(32, 42, 58, 0.05), 0 4px 12px rgba(32, 42, 58, 0.06);
  --shadow-2: 0 2px 5px rgba(32, 42, 58, 0.06), 0 8px 22px rgba(32, 42, 58, 0.08);
  --shadow-3: 0 4px 12px rgba(32, 42, 58, 0.07), 0 16px 36px rgba(32, 42, 58, 0.11);
  --shadow-sidebar: 0 6px 16px rgba(32, 42, 58, 0.07), 0 20px 44px rgba(32, 42, 58, 0.10);""")])

# ② سایه‌های تیره — هم‌کالیبره با روشن
patch(B, [(
"""  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.34), 0 6px 18px rgba(0, 0, 0, 0.32), 0 14px 34px -12px rgba(0, 0, 0, 0.40);
  --shadow-2: 0 4px 16px rgba(0, 0, 0, 0.44), 0 12px 32px rgba(0, 0, 0, 0.36), 0 22px 52px -16px rgba(0, 0, 0, 0.42);
  --shadow-3: 0 12px 36px rgba(0, 0, 0, 0.54), 0 24px 56px rgba(0, 0, 0, 0.44), 0 36px 72px -20px rgba(0, 0, 0, 0.46);
  --shadow-sidebar: 0 8px 20px rgba(0, 0, 0, 0.44), 0 30px 60px rgba(0, 0, 0, 0.52), 0 44px 80px -24px rgba(0, 0, 0, 0.50);""",
"""  /* ۱.۲۷.۴۹ — نرم‌سازی هم‌کالیبرهٔ تم تیره */
  --shadow-1: 0 1px 2px rgba(0, 0, 0, 0.20), 0 4px 12px rgba(0, 0, 0, 0.18);
  --shadow-2: 0 2px 5px rgba(0, 0, 0, 0.24), 0 8px 22px rgba(0, 0, 0, 0.22);
  --shadow-3: 0 4px 12px rgba(0, 0, 0, 0.28), 0 16px 36px rgba(0, 0, 0, 0.26);
  --shadow-sidebar: 0 6px 16px rgba(0, 0, 0, 0.26), 0 20px 44px rgba(0, 0, 0, 0.24);""")])

# ③ مقیاس تایپ — یک پله پایین
patch(B, [(
"""  /* ۱.۲۷.۴۷ — تایپوگرافی بزرگ‌تر (خواست کارفرما) — یک پله بالاتر در هر سطح؛
     فونت همان وزیرمتن متغیر باندل‌شده (woff2، محور wght ۱۰۰–۹۰۰) با fallback کالیبرهٔ بالای فایل */
  --fs-2xs: 0.8125rem; /* 13 */
  --fs-xs: 0.875rem; /* 14 */
  --fs-sm: 0.9375rem; /* 15 */
  --fs-md: 1rem;       /* 16 — بدنه پیش‌فرض */
  --fs-lg: 1.09375rem; /* 17.5 */
  --fs-xl: 1.3125rem;  /* 21 */
  --fs-2xl: 1.5625rem; /* 25 */
  --fs-3xl: 1.9375rem; /* 31 */""",
"""  /* ۱.۲۷.۴۹ — تایپوگرافی یک پله کوچک‌تر (بازتنظیم به خواست کارفرما: متن‌ها کمی بزرگ شده بودند)؛
     فونت همان وزیرمتن متغیر باندل‌شده (woff2، محور wght ۱۰۰–۹۰۰) با fallback کالیبرهٔ بالای فایل */
  --fs-2xs: 0.75rem;   /* 12 — کف گیت */
  --fs-xs: 0.8125rem;  /* 13 */
  --fs-sm: 0.875rem;   /* 14 */
  --fs-md: 0.9375rem;  /* 15 — بدنه پیش‌فرض */
  --fs-lg: 1rem;       /* 16 */
  --fs-xl: 1.1875rem;  /* 19 */
  --fs-2xl: 1.4375rem; /* 23 */
  --fs-3xl: 1.75rem;   /* 28 */""")])

# ④ هیرو و shadow-4 (روشن و تیره)
patch(B, [(
"  --fs-display: 1.625rem; /* 26 — : امتیاز هیرو (حلقهٔ داشبورد)؛ مقدار مردهٔ 44 حذف شد */",
"  --fs-display: 1.5rem; /* 24 — ۱.۲۷.۴۹: امتیاز هیرو (حلقهٔ داشبورد)؛ هم‌مقیاس با تایپ بازتنظیم‌شده */"),
("  --shadow-4: 0 8px 22px rgba(15, 23, 42, 0.10), 0 26px 60px rgba(15, 23, 42, 0.18);",
 "  --shadow-4: 0 4px 12px rgba(15, 23, 42, 0.07), 0 18px 40px rgba(15, 23, 42, 0.11); /* ۱.۲۷.۴۹ نرم‌تر */"),
("  --shadow-4: 0 10px 26px rgba(0, 0, 0, 0.38), 0 28px 64px rgba(0, 0, 0, 0.50);",
 "  --shadow-4: 0 6px 16px rgba(0, 0, 0, 0.26), 0 18px 40px rgba(0, 0, 0, 0.24); /* ۱.۲۷.۴۹ نرم‌تر */")])

# ⑤ لوگو — کوچک‌تر
patch(B, [(
"""  /* ۱.۲۷.۴۷ — لوگوی بزرگ‌تر (خواست کارفرما) */
  width: 56px;
  height: 56px;""",
"""  /* ۱.۲۷.۴۹ — لوگو کوچک‌تر (بازتنظیم به خواست کارفرما) */
  width: 46px;
  height: 46px;""")])
patch(V, [(
"""  /* ۱.۲۷.۴۷ — لوگوی بزرگ‌تر (خواست کارفرما) — SVG کاشی‌دار؛ گردی از خود نشان می‌آید */
  width: 96px; height: 96px; border-radius: 24px;""",
"""  /* ۱.۲۷.۴۹ — لوگوی ورود کوچک‌تر (بازتنظیم به خواست کارفرما) */
  width: 80px; height: 80px; border-radius: 20px;""")])

# ⑥ دکمه‌های قرصی — عمق نرم‌تر (سه‌لایه رنگی → دولایه)
patch(C, [(
"""  /* ۱.۲۷.۴۷ — عمق زیاد دکمه (خواست کارفرما): سایهٔ رنگی سه‌لایه + هایلایت بالای قرص */
  box-shadow:
    0 2px 6px color-mix(in srgb, var(--primary) 32%, transparent),
    0 14px 28px -10px color-mix(in srgb, var(--primary) 55%, transparent),
    0 24px 44px -18px color-mix(in srgb, var(--primary) 38%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);""",
"""  /* ۱.۲۷.۴۹ — عمق نرم‌تر دکمه (بازتنظیم به خواست کارفرما): دولایه ملایم + هایلایت بالای قرص */
  box-shadow:
    0 1px 4px color-mix(in srgb, var(--primary) 22%, transparent),
    0 8px 20px -8px color-mix(in srgb, var(--primary) 32%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.18);"""),
("""  box-shadow:
    var(--glow-primary),
    0 18px 34px -10px color-mix(in srgb, var(--primary) 62%, transparent),
    0 30px 52px -18px color-mix(in srgb, var(--primary) 42%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.22);""",
"""  box-shadow:
    0 2px 6px color-mix(in srgb, var(--primary) 26%, transparent),
    0 12px 26px -8px color-mix(in srgb, var(--primary) 40%, transparent),
    inset 0 1px 0 rgba(255, 255, 255, 0.18); /* ۱.۲۷.۴۹ نرم‌تر — glow سه‌لایهٔ hover حذف شد */"""),
("  box-shadow: 0 1px 3px color-mix(in srgb, var(--primary) 16%, transparent), 0 6px 14px -6px color-mix(in srgb, var(--primary) 22%, transparent); /* ۱.۲۷.۴۷ عمق ملایم */",
 "  box-shadow: 0 1px 3px color-mix(in srgb, var(--primary) 12%, transparent), 0 4px 10px -4px color-mix(in srgb, var(--primary) 16%, transparent); /* ۱.۲۷.۴۹ نرم‌تر */"),
("  box-shadow: 0 2px 6px color-mix(in srgb, var(--accent) 34%, transparent), 0 12px 26px -10px color-mix(in srgb, var(--accent) 55%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.2); /* ۱.۲۷.۴۷ */",
 "  box-shadow: 0 1px 4px color-mix(in srgb, var(--accent) 22%, transparent), 0 8px 18px -8px color-mix(in srgb, var(--accent) 34%, transparent), inset 0 1px 0 rgba(255, 255, 255, 0.18); /* ۱.۲۷.۴۹ نرم‌تر */")])

# ⑦ پین گیت کف فونت — هم‌گام با مقیاس تازه
patch(T, [(
"""  it('توکن کف --fs-2xs همان 0.8125rem (۱۳px) مانده است', () => {""",
"""  it('توکن کف --fs-2xs همان 0.75rem (۱۲px) مانده است', () => {"""),
("""    expect(tokens).toMatch(/--fs-2xs:\\s*0\\.8125rem/); /* ۱.۲۷.۴۷ — کف ۱۲→۱۳: تایپوگرافی بزرگ‌تر به خواست کارفرما */""",
"""    expect(tokens).toMatch(/--fs-2xs:\\s*0\\.75rem/); /* ۱.۲۷.۴۹ — بازتنظیم یک پله پایین به خواست کارفرما؛ کف گیت همان ۱۲px */""")])

print('theme retune done')
