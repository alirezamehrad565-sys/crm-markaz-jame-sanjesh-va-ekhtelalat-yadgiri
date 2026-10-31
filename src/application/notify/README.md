# application/notify — اتصال اعلان‌ها به API (M3)

لایه اتصال هسته `core/notify` به HTTP و cron. هیچ write مستقیم به جدول‌های
`appointments`/`students` انجام نمی‌دهد — فقط از API عمومی ماژول‌های دامنه می‌خواند.

## اجزا

| فایل | مسئولیت |
|------|----------|
| `service.ts` | `createNotifyAppService` — صف خروجی، یادآوری cron، کانال بله، webhook؛ بخش‌ها را مونتاژ می‌کند |
| `context.ts` | سبد مشترک بخش‌ها (`NotifyCtx`) + `BOT_ACTOR` + `spreadStmt` |
| `bot-links.ts` | کد اتصال دانش‌آموز/همکار/کلاس + ترجیحات اعلان (prefs) |
| `bot-commands.ts` | تفسیر پیام‌های بله: دستورها، احراز با کد، فایل‌های والد، منوها |
| `senders.ts` | اعلان‌های گزارش/نوبت/حضور/تمرین و پیام آزمایشی |
| `digest.ts` | هلپرهای pure گزارش روزانه + بخش ارسال digest و یادآور پیگیری |
| `reminders.ts` | برنامه‌ریز pure یادآوری (`planReminders`) — ورودی/خروجی داده‌ای خالص |
| `lifecycle.ts` | رویدادهای چرخهٔ نوبت و متن‌های زمان‌بندی |
| `batch.ts` | زمان‌بندی ارسال دسته‌ای |
| `case-events-bot.ts` / `exercise-bank-bot.ts` / `exercise-submission-bot.ts` / `awareness-bot.ts` | بات‌های تخصصی هر دامنه |
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

1. منشی/مدیر/درمانگر (): `POST /api/notifications/links { student_id }` → کد ۶ نویسه‌ای (بدون O/0/I/1).
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
