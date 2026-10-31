# special-needs (فاز ۷ — §12 + §15)

نیازهای ویژهٔ دانش‌آموزان + وضعیت همکاری مدرسه — ماژول **فقط-خواندنی** (Projection + derivation) و مالک هیچ جدولی نیست (§4).

## مالکیت داده

| داده | مالک | نقش این ماژول |
|---|---|---|
| `students.special_need_type / special_need_severity / identified_at` | `student-profile` (Migration 0020، تصمیم D3) | فقط خواندن برای گرید |
| `followups` | `followups` (فاز ۳) | فقط خواندن برای قاعدهٔ توجه |
| `appointments / appointment_students` | `appointment-core` | فقط خواندن (آخرین/بعدی جلسه) |
| وضعیت پذیرش (`wait_status`) | پروجکشن inline از `waitlist` (M21) | همان الگوی بقیهٔ ماژول‌های فقط-خواندنی |
| `schools / classes / class_bot_links` | `student-profile` / notify | فقط خواندن |

Write نیاز ویژه: `PATCH /api/students/:id/special-need` در `student-profile` (مالک students) — فقط منشی/مدیر، با audit هم‌تراکنش `student.special_need.changed` (فقط id فیلدها — §12.10؛ ستون متن آزاد تشخیص عمداً وجود ندارد).

## قواعد «نیاز به توجه دارد» (derivation قطعی در pure.ts)

۱. `overdue_followup` — پیگیری باز با due_at گذشته
۲. `long_open_followup` — پیگیری باز با created_at قدیمی‌تر از ۳۰ روز
۳. `awaiting_assessment` — `case_status = awaiting_assessment`
۴. `no_recent_session` — در خدمت فعال (پذیرش‌شده یا سابقهٔ جلسه) ولی بیش از ۳۰ روز جلسهٔ برگزارشده ندارد **و** نوبت آینده‌ای ثبت نشده

## Endpoints (هر دو فقط منشی/مدیر — درمانگر 403)

- `GET /api/special-needs/grid?school_id&grade&severity` — گرید مدرسه×پایه + overall + فهرست توجه؛ مخرج درصد از `students` فعال
- `GET /api/schools/:id/overview` — متریک‌های همکاری مدرسه (§15.2) + بخش توجه (§15.3) — بازخوانِ همان لایهٔ derivation، نه کوئری موازی

## نام‌گذاری

نام «هوش مدرسه» (School Intelligence §15) طبق خواستهٔ کاربر اجرا نشد — نام به‌کاررفته: **«وضعیت همکاری مدرسه»** با بخش **«نیاز به توجه دارد»** و endpoint `overview`.
