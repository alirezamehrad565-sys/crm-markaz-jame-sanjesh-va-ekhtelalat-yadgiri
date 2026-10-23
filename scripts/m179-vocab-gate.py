#!/usr/bin/env python3
"""گیت واژگان m179 — فایل‌های جدید/تغییریافتهٔ ماژول پشتیبان‌گیری
قاعده: هیچ واژهٔ فنی ممنوع (موتور/کالیبراسیون/سیگنال/…) در متنی که درمانگر/مدیر می‌بیند.
اسکن هم فرم خام و هم فرم unicode-escaped."""
import re
import sys

BASE = '/home/z/my-project/gh-work'
FILES = [
    f'{BASE}/src/application/backup/service.ts',
    f'{BASE}/src/application/backup/routes.ts',
    f'{BASE}/src/application/backup/index.ts',
    f'{BASE}/src/application/backup/README.md',
    f'{BASE}/src/application/backup/__tests__/backup.test.ts',
    f'{BASE}/public/assets/js/views/backup.js',
    f'{BASE}/public/assets/js/app.js',
    f'{BASE}/public/assets/js/api.js',
    f'{BASE}/docs/BACKUP.md',
    f'{BASE}/worker/src-entry.mjs',
    f'{BASE}/scripts/build-worker-bundle.mjs',
]

def esc_form(word: str) -> str:
    return ''.join('\\u%04X' % ord(ch) if ord(ch) > 0x7F else re.escape(ch) for ch in word)

BANNED = ['موتور', 'کالیبراسیون', 'engine', 'پارامتر تفسیر', 'سیگنال']
# استثناها: کامنت/کد فنی که درمانگر نمی‌بیند — فقط «موتور» و «engine» در کامنت‌های فنی مجاز نیست، اما
# در کد JS/TS در هیچ متنی نباید باشد؛ فقط متادیتای source و فیکسچرها مستثنا هستند که اینجا نیستند.

fails = []
for path in FILES:
    try:
        text = open(path, encoding='utf-8').read()
    except FileNotFoundError:
        continue
    for w in BANNED:
        if w in text:
            for i, line in enumerate(text.splitlines(), 1):
                if w in line:
                    fails.append(f'{path}:{i}: {w} :: {line.strip()[:120]}')
        esc = esc_form(w)
        if w != 'engine' and esc in text:
            for i, line in enumerate(text.splitlines(), 1):
                if esc in line:
                    fails.append(f'{path}:{i}: ESCAPED {w} :: {line.strip()[:120]}')

if fails:
    print('✗ گیت واژگان رد شد:')
    for f in fails:
        print(' ', f)
    sys.exit(1)
print('✓ گیت واژگان سبز — هیچ واژهٔ ممنوعی در فایل‌های m179 نیست')
