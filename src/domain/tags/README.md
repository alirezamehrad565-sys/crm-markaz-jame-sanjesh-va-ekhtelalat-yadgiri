# domain/tags — برچسب‌گذاری دانش‌آموز (M8)

مالک جدول‌های `tags` و `student_tags` (migration 0006).

## قرارداد

| Endpoint | دسترسی | توضیح |
|---|---|---|
| `GET /api/tags?category=&active=` | همه کارکنان | فهرست برچسب‌ها با `usageCount` |
| `POST /api/tags` | مدیر | ساخت برچسب `{name, category, color?}` — یکتایی (category,name) |
| `POST /api/tags/:id/deactivate` | مدیر | غیرفعال‌سازی (بدون حذف) |
| `GET /api/students/:id/tags` | همه کارکنان | برچسب‌های فعال یک دانش‌آموز |
| `PUT /api/students/:id/tags` | همه کارکنان | جایگزینی کامل `{tag_ids: uuid[]}` — حداکثر ۳۰ |

## دسته‌ها

- `disorder` — نوع اختلال (نارساخوانی، نارسانویسی، نارساریاضی، ADHD، اتیسم، …)
- `grade` — پایه تحصیلی (پیش‌دبستانی تا دوازدهم)
- `school_type` — نوع مدرسه (دولتی، غیرانتفاعی، استثنایی، خاص)
- `custom` — آزاد (مدیر می‌سازد)

## قواعد

- برچسب‌ها soft-state هستند (active 0/1) — هیچ‌گاه hard-delete نمی‌شوند تا سابقه student_tags معتبر بماند.
- جایگزینی برچسب‌های دانش‌آموز با audit از نوع `student.tags.replace` ثبت می‌شود و فقط diff (افزوده/حذف‌شده) ذخیره می‌شود.
- یکی بودن (category, name) در سطح DB با UNIQUE تضمین شده — تداخل = 409.
