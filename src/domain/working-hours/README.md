# domain/working-hours (M4)

بازه‌های کاری هفتگی هر کارمند — مالک جدول `working_hours` (migration 0003).

## مدل داده
- `weekday`: 0 = شنبه … 6 = جمعه (هفته ایرانی)
- `start_minute` / `end_minute`: دقیقه از نیمه‌شب به وقت تهران (+03:30)
- بازه‌ها روی شبکه ۱۵ دقیقه‌ای (مضرب `SLOT_MINUTES`)
- `[start, end)` — لمس لبه‌ها مجاز است (۱۲:۰۰ پایان و ۱۲:۰۰ شروع تداخل نیست)

## Endpoints
| Method | Path | توضیح |
|--------|------|-------|
| GET | `/api/working-hours?staff_id=…` | بازه‌های یک کارمند (بدون پارامتر: همه) |
| POST | `/api/working-hours` | افزودن یک بازه `{staff_id, weekday, start_minute, end_minute}` |
| PUT | `/api/working-hours/staff/:staffId` | جایگزینی کامل برنامه هفتگی `{items: [...]}` |
| DELETE | `/api/working-hours/:id` | حذف یک بازه |

## قواعد
- هم‌پوشانی بازه‌ها در یک روز برای یک کارمند **خطای سخت** است (409) — برخلاف نوبت‌ها که هشدار نرم دارند؛ داده پایه باید سازگار باشد.
- اعتبارسنجی هم‌پوشانی pure است (`rules.ts` + تست) و هم سمت کلاینت هم اجرا می‌شود.
- `replaceWeek` اتمیک است: DELETE + INSERTها + audit در یک `d1.batch()`.
- audit: `working_hours.create/delete/replace_week`
