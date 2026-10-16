# settings — ماژول تنظیمات (M5)

مالک WRITE جدول `settings` (key/value با مقدار JSON).

## چرا تنظیمات؟
بازه‌های کاری مرکز «عمدتاً ثابت» هستند (درخواست کاربر، M5). به‌جای تعریف جداگانه برای هر
کارمند، یک‌بار **بازه کاری مرکز** تنظیم و در صورت نیاز با یک کلیک روی همه کارکنان اعمال می‌شود.

## کلیدها
| کلید | مقدار | پیش‌فرض |
|---|---|---|
| `center_hours` | `[{weekday,startMinute,endMinute},…]` | شنبه…چهارشنبه ۹–۱۷، پنجشنبه ۹–۱۳ |
| `clinic_name` | رشته | `DEFAULT_CLINIC_NAME` یا env `CLINIC_NAME` |
| `default_reminder_hours` | عدد ۱..۴۸ | `2` |
| `notify_on_create` / `notify_on_move` / `notify_on_cancel` | boolean | `true` |

## Endpointها
- `GET /api/settings` — همه تنظیمات + meta (baleConfigured/webhookEnabled)
- `PUT /api/settings` — فقط مدیر
- `GET /api/settings/center-hours` — بازه مرکز
- `PUT /api/settings/center-hours` — فقط مدیر؛ هم‌پوشانی → ۴۰۹
- `POST /api/settings/center-hours/apply-to-all` — فقط مدیر؛ کپی روی برنامه هفتگی همه کارکنان فعال

## وابستگی
- `domain/working-hours` → قاعده `findOverlap` (بازه‌های مرکز همان سخت‌گیری بازه کارکنان را دارند)
- برای اعمال روی همه، متد عمومی `workingHours.replaceWeek` صدا زده می‌شود (مالکیت حفظ می‌شود).
