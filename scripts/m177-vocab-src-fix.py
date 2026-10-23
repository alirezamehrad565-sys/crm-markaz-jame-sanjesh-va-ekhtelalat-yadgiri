#!/usr/bin/env python3
# m177 — هم‌راستاسازی ۶ رشتهٔ فرارِ unicode-escaped در سورس با باندل (موتور→خودکار/تحلیل/حذف)
import io, sys

MOT = r'\u0645\u0648\u062A\u0648\u0631'          # موتور
KHOD = r'\u062E\u0648\u062F\u06A9\u0627\u0631'    # خودکار
TAHLIL = r'\u062A\u062D\u0644\u06CC\u0644'        # تحلیل

JOBS = [
    ('src/domain/wechsler-engine/engine.js', 1774, [(MOT, KHOD)], 1),
    ('src/domain/wechsler-engine/engine.js', 1807, [(MOT, KHOD)], 1),
    ('src/domain/wechsler-engine/engine.js', 1811, [(MOT, KHOD)], 1),
    ('src/domain/case-formulation/engine.js', 975, [(MOT, TAHLIL)], 1),
    ('src/domain/case-formulation/engine.js', 1611, [(MOT + ' ', '')], 1),  # «تحلیل موتور انجام» → «تحلیل انجام»
    ('src/domain/case-formulation/engine.js', 1685, [(MOT, TAHLIL)], 1),
]

failed = False
for path, ln, subs, expect in JOBS:
    with io.open(path, encoding='utf-8', newline='') as f:
        lines = f.read().split('\n')
    line = lines[ln - 1]
    if MOT not in line:
        print(f'FAIL {path}:{ln} — موتور escaped یافت نشد'); failed = True; continue
    for old, new in subs:
        line = line.replace(old, new)
    lines[ln - 1] = line
    with io.open(path, 'w', encoding='utf-8', newline='') as f:
        f.write('\n'.join(lines))
    print(f'OK   {path}:{ln}')

sys.exit(1 if failed else 0)
