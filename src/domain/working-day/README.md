# @domain/working-day — بورد «مدیریت روز کاری در یک نگاه» (M15)

ماژول M15: بازسازی ماژول حضور و غیاب به یک بورد روزانه یکپارچه. هر همکار یک ستون دارد؛
نوبت‌های همان روزِ او زیر نامش می‌آید و وضعیت حضور خودش هم در همان ستون ثبت می‌شود.
منشی/مدیر برای هر روز «توضیحات روز» ثبت می‌کند و هر ثبت لاگ می‌شود (نویسنده + زمان).

## مالکیت

| جدول / منبع | دسترسی |
|---|---|
| `day_notes` | **مالک WRITE** — append-only؛ حذف فقط مدیر |
| `staff_attendance` | فقط-خواندنی (مالک: `@domain/attendance/staff`) |
| `working_hours` | فقط-خواندنی (مالک: `@domain/working-hours`) |
| `appointments` + `appointment_students` | فقط-خواندنی (مالک: `@domain/appointment-core`) |
| `staff` | فقط-خواندنی (مالک: `@domain/staff`) |

## قواعد

1. بورد هر تاریخی قابل مشاهده است (مرور گذشته / برنامه آینده) — ثبت حضور همکاران
   همان قاعده M14 «فقط امروز تهران» را دارد که مالکش `@domain/attendance/staff` است.
2. توضیحات روز **append-only** است: هر ثبت یک ردیف جدید با نویسنده و زمان — ویرایش وجود ندارد؛
   حذف فقط مدیر (audit: `day_note.delete`).
3. آمار جلسات روز (`sessionStats`) از خود نوبت‌ها محاسبه می‌شود — نوبت لغوشده
   در شمارش حاضر/غایب/درانتظار نمی‌آید (فیلد جداگانه `cancelledAppointments`).
4. نوبت‌های بی‌صاحب (همکار غیرفعال/حذف‌شده) در ستون جداگانه `unassigned` برمی‌گردند.
5. بازه‌های کاری ستون هر همکار از برنامه هفتگی او (`working_hours.weekday`) برای
   روز‌هفته‌ی تاریخ انتخابی خوانده می‌شود.

## Endpoints

| Method | Path | نقش | توضیح |
|---|---|---|---|
| GET | `/api/working-day?date=YYYY-MM-DD` | همه | بورد کامل یک روز (پیش‌فرض امروز تهران) |
| POST | `/api/working-day/notes` | manager, secretary | ثبت توضیحات روز (لاگ) |
| DELETE | `/api/working-day/notes/:id` | manager | حذف توضیحات |

## Depends On

- `@core/*` — db / audit / errors / logger / shared
- `@domain/attendance` — فقط برای `daySummary` (خلاصه حضور همان روز)
