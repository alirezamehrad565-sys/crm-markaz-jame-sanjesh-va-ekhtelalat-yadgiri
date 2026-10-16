# application/notify — اتصال اعلان‌ها به API (M3)

لایه اتصال هسته `core/notify` به HTTP و cron. هیچ write مستقیم به جدول‌های
`appointments`/`students` انجام نمی‌دهد — فقط از API عمومی ماژول‌های دامنه می‌خواند.

## اجزا

| فایل | مسئولیت |
|------|----------|
| `reminders.ts` | برنامه‌ریز pure یادآوری (`planReminders`) — ورودی/خروجی داده‌ای خالص |
| `service.ts` | `createNotifyAppService` — صف، prefs، کد اتصال، webhook، cron |
| `routes.ts` | مسیرهای REST + webhook بله |

## قرارداد یادآوری‌ها (cron)

- بازه: از «الان» تا `REMINDER_HORIZON_HOURS=24` ساعت بعد (ISO UTC).
- برای هر (نوبت scheduled × دانش‌آموز غیر cancelled):
  - `reminders_enabled=false` → رد (`disabled`)
  - بدون `chat_id` → رد (`no_chat`)
  - فاصله تا نوبت کمتر از `reminder_hours_before` ساعت → رد (`too_soon`)
- dedup_key = `reminder:{appointmentId}:{studentId}` → اجرای مکرر cron پیام تکراری نمی‌سازد.
- audit با actor `system` ثبت می‌شود.

## جریان اتصال بات (link flow)

1. منشی/مدیر: `POST /api/notifications/links { student_id }` → کد ۶ نویسه‌ای (بدون O/0/I/1).
2. ولیّ در بله: `/link CODE` می‌فرستد.
3. بات (webhook): کد پیدا و `status='pending'` است → `bot_links.status='linked'` + chat_id ذخیره
   + `notification_prefs` آن دانش‌آموز با channel=bale و chat_id ساخته/به‌روز می‌شود.
4. پاسخ فارسی موفقیت/عدم اعتبار به همان chat ارسال می‌شود (via sendMessage).

## امنیت webhook

- مسیر `/webhook/bale/:secret` خارج از auth کارمندان است.
- بدون پیکربندی `BALE_WEBHOOK_SECRET` → 404 (غیرفعال).
- secret اشتباه → 403. پاسخ همیشه 200 بعد از پذیرش تا retry طوفانی نشود.

## نقش‌ها

| عملیات | نقش مجاز |
|--------|-----------|
| مشاهده صف/آمار/prefs/links | همه نقش‌های احرازشده |
| dispatch، enqueue یادآوری، ارسال آزمایشی | manager |
| ساخت کد اتصال | manager, secretary |
| ویرایش prefs | همه نقش‌های احرازشده |
