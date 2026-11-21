#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""۱.۲۷.۴۸ — اصلاح قرارداد کپی هفته (باگ دکمهٔ «کپی از هفته قبل» در تقویم).

ریشهٔ باگ: تقویم هفته را از شنبه می‌سازد (weekStart = YMD شنبه) ولی بک‌اند هر دو
تاریخ را به دوشنبه قفل کرده بود → هر کلیکِ دکمه 400 «باید دوشنبه باشد» می‌خورد.
تست‌ها هم مستقیم با تاریخ دوشنبه API را صدا می‌زدند و شکاف را نمی‌دیدند.

اصلاح قراردادی: نام فیلدها صادقانه source_week_start/target_week_start + پذیرش شنبه؛
تست‌ها به شنبه مهاجرت و یک رگرسیونِ ردِ دوشنبه اضافه شد.
"""
import io

def patch(p, pairs):
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if s.count(old) == 0:
            assert s.count(new) >= 1, f'{p}: neither old nor new :: {old[:60]!r}'
            continue  # قبلاً اعمال شده — ایدمپوتنت
        assert s.count(old) == 1, f'{p}: count={s.count(old)} :: {old[:60]!r}'
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
    print(p.split('/')[-1], 'OK')

def patch_all(p, pairs):
    """۱.۲۷.۴۸ — همهٔ وقوع‌ها (برای فراخوان‌های تکراری همان payload در یک فایل تست)"""
    s = io.open(p, encoding='utf-8').read()
    for old, new in pairs:
        if s.count(old) == 0:
            assert s.count(new) >= 1, f'{p}: neither old nor new :: {old[:60]!r}'
            continue
        s = s.replace(old, new)
    io.open(p, 'w', encoding='utf-8').write(s)
    print(p.split('/')[-1], 'OK(all)')

# ① تایپ مشترک
patch('src/core/shared/types.ts', [(
"""export interface CopyWeekInput {
  sourceMonday: string; // تاریخ به شکل YYYY-MM-DD
  targetMonday: string; // تاریخ به شکل YYYY-MM-DD""",
"""export interface CopyWeekInput {
  /* ۱.۲۷.۴۸ — قرارداد صادقانه: هفتهٔ برنامه از شنبه است (تقویم UI)؛ نام قدیمی sourceMonday دروغ می‌گفت */
  sourceWeekStart: string; // شنبهٔ هفتهٔ مبدأ — YYYY-MM-DD
  targetWeekStart: string; // شنبهٔ هفتهٔ مقصد — YYYY-MM-DD""")])

# ② اسکیما
patch('src/core/shared/schemas.ts', [(
"""export const CopyWeekSchema = z.object({
  source_monday: TehranYmdSchema,
  target_monday: TehranYmdSchema,""",
"""export const CopyWeekSchema = z.object({
  /* ۱.۲۷.۴۸ — کپی هفته بر پایهٔ شنبه (مرز هفتهٔ تقویم) */
  source_week_start: TehranYmdSchema,
  target_week_start: TehranYmdSchema,""")])

# ③ مسیر
patch('src/domain/appointment-core/routes.ts', [(
"""    const input: CopyWeekInput = {
      sourceMonday: body.source_monday,
      targetMonday: body.target_monday,""",
"""    const input: CopyWeekInput = {
      sourceWeekStart: body.source_week_start,
      targetWeekStart: body.target_week_start,""")])

# ④ منطق کپی
patch('src/domain/appointment-core/week-copy.ts', [(
"""  for (const [label, ymd] of [['source_monday', input.sourceMonday], ['target_monday', input.targetMonday]] as const) {
    const day = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
    if (day !== 1) {
      throw new ValidationError(`${label} باید دوشنبه باشد (${ymd})`);
    }
  }
  if (Date.parse(input.targetMonday) <= Date.parse(input.sourceMonday)) {
    throw new ValidationError('target_monday باید بعد از source_monday باشد');
  }""",
"""  /* ۱.۲۷.۴۸ — مرز هفته = شنبه (تقویم UI شنبه‌محور است؛ شرط قدیمی دوشنبه دکمهٔ کپی را همیشه می‌شکست) */
  for (const [label, ymd] of [['source_week_start', input.sourceWeekStart], ['target_week_start', input.targetWeekStart]] as const) {
    const day = new Date(`${ymd}T00:00:00.000Z`).getUTCDay();
    if (day !== 6) {
      throw new ValidationError(`${label} باید شنبه باشد (${ymd})`);
    }
  }
  if (Date.parse(input.targetWeekStart) <= Date.parse(input.sourceWeekStart)) {
    throw new ValidationError('target_week_start باید بعد از source_week_start باشد');
  }"""),
("  const sourceRange = tehranDayRange(input.sourceMonday);",
 "  const sourceRange = tehranDayRange(input.sourceWeekStart);"),
("  const shiftMs = Date.parse(`${input.targetMonday}T00:00:00.000Z`) - Date.parse(`${input.sourceMonday}T00:00:00.000Z`);",
 "  const shiftMs = Date.parse(`${input.targetWeekStart}T00:00:00.000Z`) - Date.parse(`${input.sourceWeekStart}T00:00:00.000Z`);"),
("""        source_monday: { from: null, to: input.sourceMonday },
        target_monday: { from: null, to: input.targetMonday },""",
"""        source_week_start: { from: null, to: input.sourceWeekStart },
        target_week_start: { from: null, to: input.targetWeekStart },""")])

# ⑤ فرانت — payload تازه
patch('public/assets/js/views/appointments.js', [(
"""    const res = await api.post('/api/appointments/copy-week', {
      source_monday: source,
      target_monday: state.weekStart,""",
"""    /* ۱.۲۷.۴۸ — قرارداد شنبه‌محور: قبلاً source_monday می‌فرستادیم و بک‌اندِ دوشنبه‌خواه 400 می‌داد (باگ دکمهٔ کپی) */
    const res = await api.post('/api/appointments/copy-week', {
      source_week_start: source,
      target_week_start: state.weekStart,""")])

# ⑥ docs/ARCHITECTURE.md — سطر قرارداد
patch('docs/ARCHITECTURE.md', [(
"| POST | /api/appointments/copy-week | { source_monday, target_monday, staff_id?, dry_run? } | 200: { batch_id?, copied, conflicts } | 400 |",
"| POST | /api/appointments/copy-week | { source_week_start, target_week_start, staff_id?, dry_run? } — هر دو باید شنبه باشند (مرز هفتهٔ تقویم؛ ۱.۲۷.۴۸) | 200: { batchId?, copied, conflicts } | 400 |")])

# ⑦ تست‌ها — مهاجرت به شنبه (۲۰۳۰-۰۱-۰۵ شنبه است؛ +۷ = ۰۱-۱۲)
patch('src/application/__tests__/e2e-teacher-booking.test.ts', [
("    const src = '2030-01-07'; // دوشنبه\n    const dst = '2030-01-14';",
 "    const src = '2030-01-05'; // شنبه (مرز هفتهٔ تقویم — ۱.۲۷.۴۸)\n    const dst = '2030-01-12';"),
("      source_monday: src, target_monday: dst, staff_id: MARYAM_ID, dry_run: true",
 "      source_week_start: src, target_week_start: dst, staff_id: MARYAM_ID, dry_run: true"),
("      source_monday: src, target_monday: dst, dry_run: true",
 "      source_week_start: src, target_week_start: dst, dry_run: true"),
("      source_monday: src, target_monday: dst, staff_id: ALI_ID, dry_run: true",
 "      source_week_start: src, target_week_start: dst, staff_id: ALI_ID, dry_run: true"),
("    await sec.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-07T08:00:00.000Z', 45, [st.id]));\n    const copy = await sec.post('/api/appointments/copy-week', {\n      source_monday: '2030-01-07', target_monday: '2030-01-14', staff_id: MARYAM_ID, dry_run: false\n    });",
 "    await sec.post('/api/appointments', apptBody(MARYAM_ID, '2030-01-07T08:00:00.000Z', 45, [st.id]));\n    const copy = await sec.post('/api/appointments/copy-week', {\n      source_week_start: '2030-01-05', target_week_start: '2030-01-12', staff_id: MARYAM_ID, dry_run: false\n    });"),
])

patch_all('src/application/__tests__/e2e-appointments-notify.test.ts', [
("const MONDAY_SRC = '2030-01-07';\nconst MONDAY_DST = '2030-01-14';",
 "/* ۱.۲۷.۴۸ — مرز هفتهٔ تقویم شنبه است؛ ۲۰۳۰-۰۱-۰۵ شنبه */\nconst SAT_SRC = '2030-01-05';\nconst SAT_DST = '2030-01-12';"),
("  it('copy-week از دوشنبه به دوشنبهٔ بعد + undo آن', async () => {",
 "  it('copy-week از شنبه به شنبهٔ بعد + undo آن (قرارداد ۱.۲۷.۴۸)', async () => {"),
("      source_monday: MONDAY_SRC,\n      target_monday: MONDAY_DST,",
 "      source_week_start: SAT_SRC,\n      target_week_start: SAT_DST,"),
])

patch('src/application/__tests__/e2e-assessment-blocks.test.ts', [
("    const srcMonday = '2030-01-07'; // دوشنبه\n    const tgtMonday = '2030-01-14'; // دوشنبهٔ بعد",
 "    const srcSat = '2030-01-05'; // شنبه (مرز هفتهٔ تقویم — ۱.۲۷.۴۸)\n    const tgtSat = '2030-01-12';"),
("    const srcWin = tehranMinuteWindow(srcMonday, 570, 630); // ۰۹:۳۰–۱۰:۳۰ تهران",
 "    const srcWin = tehranMinuteWindow(srcSat, 570, 630); // ۰۹:۳۰–۱۰:۳۰ تهران"),
("    // بازهٔ سنجش دوشنبهٔ هدف، همان ساعت — فقط علی درگیر است\n    await m.post('/api/assessment-blocks', { date: tgtMonday, start_minute: 570, end_minute: 690, therapist_ids: [ALI_ID] });\n    const copy = await m.post('/api/appointments/copy-week', { source_monday: srcMonday, target_monday: tgtMonday });",
 "    // بازهٔ سنجش شنبهٔ هدف، همان ساعت — فقط علی درگیر است\n    await m.post('/api/assessment-blocks', { date: tgtSat, start_minute: 570, end_minute: 690, therapist_ids: [ALI_ID] });\n    const copy = await m.post('/api/appointments/copy-week', { source_week_start: srcSat, target_week_start: tgtSat });"),
])

print('contract v2 done')
