# todos (فاز ۴ — هماهنگی داخلی منشی↔مدیر)

ماژول کارهای داخلی طبق REMAKE-PLAN فاز ۴ و Master Spec v2.0 §9/§9.5 — متمایز از
پیگیری (followups): کار داخلی «هماهنگی مرکز» است، نه «اقدام بعدی بالینی».

## مالکیت داده

- تنها نویسندهٔ جدول `todos` همین ماژول است (migration `0017_todos.sql` — additive).
- badge (urgent/overdue/attention) کاملاً computed است — هیچ ستون denormalized.
- حذف فقط نرم (`deleted_at`)؛ رکورد حذف‌شده در همهٔ خواندن‌ها و UPDATEها 404 است.

## قواعد نقش (§9)

- کل ماژول (حتی خواندن) فقط `manager`/`secretary` — درمانگر 403.
- گیرندهٔ کار باید همکار مقابل باشد: self-task → 400، گیرندهٔ therapist → 400، ناموجود → 404.
- ویرایش inline و حذف نرم: فقط ثبت‌کننده (`assigner`).
- تکمیل (`complete`): فقط مسئول انجام (`assignee`)؛ `pending→done` یک‌طرفه (تکرار → 409).

## Endpoint ها

| متد | مسیر | توضیح |
|---|---|---|
| GET | `/api/todos?box=inbox\|outbox` | فهرست صندوق + `badge: {urgent, overdue, attention}` |
| POST | `/api/todos` | ساخت کار (title/note/assignee_id/due_at/priority) |
| PATCH | `/api/todos/:id` | ویرایش inline + حذف نرم با `deleted: true` |
| POST | `/api/todos/:id/complete` | تکمیل کار توسط مسئول |

## مهلت (due_at)

- تاریخ خالی `YYYY-MM-DD` → پایانِ همان روزِ تهران (نرمال‌سازی در سرویس با `tehranDayRange`) —
  «مهلت امروز» تا آخر شبِ تهران عقب‌افتاده نمی‌شود.
- ISO کامل هم پذیرفته می‌شود؛ `null` یعنی حذف مهلت.

## اعلان (§9.5/§22)

`todo_assigned` — تنها رویداد اعلان‌ساز این ماژول. الگوی M5: چت‌های متصل بلهٔ مسئول
(`staff_bot_links`) مقصد هستند؛ اگر توکن بله تنظیم نشده باشد پیام روی کانال internal
صف می‌شود تا در dev گم نشود؛ بدون هیچ لینکی رکورد بی‌مصرف ساخته نمی‌شود.
dedup: `todo-assigned:{todoId}:{assigneeId}` — تخصیص دوباره به همان شخص اعلان تکراری
نمی‌سازد. ناظر با `setNotifier` در api-routing وصل می‌شود؛ خطای اعلان هرگز عملیات اصلی
را fail نمی‌کند.

## Audit (هم‌تراکنش)

`todo.created` · `todo.updated` (شامل حذف نرم) · `todo.completed` — title در audit مجاز
است (دادهٔ PII نیست؛ هم‌ارز followup)؛ متن note در audit نمی‌آید.

## تست‌ها

- `__tests__/pure.test.ts` — ماتریس، عقب‌افتادگی computed، شمارش‌های badge با هم‌پوشانی.
- `src/application/__tests__/e2e-todos.test.ts` — RBAC کامل، self-task، مالکیت ویرایش/تکمیل،
  soft delete، badge، audit، قالب اعلان و dedup.
