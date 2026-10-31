# followups — بنیاد پیگیری (فاز ۳)

ستون فقرات «اقدام بعدی» (Master Spec v2.0 §13) — مالک WRITE جدول `followups` (Migration 0016).

## قواعد

- **مقصد ساختاریافته:** هر پیگیری به یک موجودیت وصل است (`entity_type`/`entity_id`) + پروندهٔ اختیاری (`student_id`).
  `entity_type` در SQL بدون CHECK است (enum در `@core/shared` — الگوی D7) تا فازهای بعد بدون migration توسعه یابند.
- **وضعیت:** `open → in_progress → done | cancelled` — ماتریس در `pure.ts`؛ پایان‌حالت‌ها بسته‌اند.
- **overdue computed است:** باز ∧ `due_at < now` — هیچ ستون denormalized نداریم (مستند در REMAKE-PLAN).
- **گروه‌بندی §13.4:** `overdue / today / week / future / open` — مرزهای تهران در `groupBoundaries` (pure)؛
  پیگیریِ بازِ بی‌مهلت فقط در `open` می‌آید.
- **due_at نرمال:** همیشه `toISOString` ذخیره می‌شود؛ `undefined` در ساخت = مهلت پیش‌فرض `+FOLLOWUP_DEFAULT_DUE_DAYS` روز؛ `null` = بی‌مهلت.
- **RBAC:** خواندن آزاد؛ `POST` فقط manager/secretary؛ `PATCH` مدیر/منشی یا خودِ مسئول پیگیری.
- **Audit هم‌تراکنش:** `followup.created` / `followup.updated` / `followup.completed` — عنوان پیگیری در audit مجاز است (PII نیست).

## هوک‌ها (§37 — ساخت خودکار)

| هوک | مبدأ | مکانیزم |
|-----|------|---------|
| گزارش جلسه با `next_action=follow_up` | `application/session-notes` (PUT note) | `createWithinTx` در همان تراکنش — مسئول = نویسندهٔ گزارش، مهلت پیش‌فرض |
| رد/نیامدِ لیست انتظار | `domain/waitlist` (reject/noShow) | `createWithinTx` در همان تراکنش — مسئول = بازیگر، مهلت پیش‌فرض (پیشنهاد کاربر) |
| «ایجاد پیگیری» بعد از ثبت غیبت | فرانت بورد منشی (`views/working-day.js`) | POST مستقیم با context پرشده — بدون مودال چندمرحله‌ای |

هوک‌ها فقط در «ورود به follow_up» آتش می‌گیرند (قبلاً follow_up بود → پیگیری جدید ساخته نمی‌شود)؛
خروج از follow_up (set به none) پیگیری موجود را تغییر نمی‌دهد — وضعیت پیگیری با PATCH مدیریت می‌شود.

## API

- `GET /api/followups?mine=1&group=overdue|today|week|future|open&entity_type=&entity_id=&student_id=`
- `POST /api/followups` — `{entity_type, entity_id, student_id?, title, assignee_id, due_at?}`
- `GET /api/followups/:id`
- `PATCH /api/followups/:id` — `{status?, assignee_id?, due_at?}` (حداقل یکی)

UI کامل (Action Center) عمداً به فاز ۵ موکول شده است — این فاز API + هوک‌ها + اکشن سبک بورد است.
