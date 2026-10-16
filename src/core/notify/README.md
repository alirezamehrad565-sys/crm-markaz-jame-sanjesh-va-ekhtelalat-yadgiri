# core/notify — ماژول اعلان‌ها (M3)

صف ارسال اعلان با پشتیبانی چندکاناله. هسته ماژول هیچ وابستگی به سرویس پیام‌رسان ندارد؛
کانال‌ها با `registerChannel` تزریق می‌شوند (همان الگوی setter injection بقیه پروژه).

## اجزای ماژول

| فایل | مسئولیت |
|------|----------|
| `types.ts` | `NotifyChannel`, `OutboundMessage`, `SendResult`, ورودی‌های صف |
| `templates.ts` | قالب‌های پیام فارسی — pure، فقط رندر |
| `repository.ts` | SQL پارامتری notifications / notification_prefs / bot_links |
| `service.ts` | `createNotifyService` — enqueue با idempotency + dispatch |
| `internal-channel.ts` | کانال مجازی (log فقط) — برای dev و پیام درون‌سیستمی |
| `bale/client.ts` | آداپتور Bot API بله (fetch تزریقی) |
| `bale/webhook.ts` | پارس pure آپدیت‌های بات + تولید کد اتصال |

## قوانین کلیدی

1. **`send` هرگز throw نمی‌کند** — خطا همیشه در `SendResult` است؛ dispatch رکورد به رکورد مستقل است.
2. **dedup_key یگانه‌ی ارسال است** — partial UNIQUE index روی `notifications.dedup_key`؛ enqueue تکراری رکورد جدید نمی‌سازد و `duplicate: true` می‌دهد.
3. **چرخه وضعیت:** `pending → sent | failed | skipped`؛ پس از `MAX_DISPATCH_ATTEMPTS` تلاش، pendingهای خسته به `skipped` می‌روند تا صف بلاک نشود.
4. **template exhaustiveness** — اضافه‌شدن id جدید در `NOTIFICATION_TEMPLATES` بدون اضافه‌کردن case در `renderTemplate` خطای typecheck می‌دهد.
5. **token بله در log نوشته نمی‌شود** — خطاهای شبکه با پیشوند `BALE_NETWORK` بدون جزئیات token گزارش می‌شوند.

## قرارداد کانال

```ts
interface NotifyChannel {
  readonly name: 'bale' | 'internal';
  send(message: OutboundMessage): Promise<SendResult>;
}
```

هر کانال باید network error را خودش بگیرد و به `SendResult` تبدیل کند.

## قالب‌های پیام

`appointment_reminder`, `appointment_cancelled`, `appointment_changed`,
`bot_welcome`, `bot_help`, `bot_link_success`, `bot_link_invalid`, `bot_myid`, `generic`

همه متن‌ها فارسی هستند و متغیرها از `TemplateVars` می‌آیند
(`studentName`, `staffName`, `dateYmd`, `timeLabel`, `clinicName`, `code`, `chatId`, `extra`).

## تست

تست‌های pure در `__tests__/templates.test.ts` — پوشش همه قالب‌ها + fallback کلینیک + exhaustiveness.
منطق dispatch و webhook در تست‌های `application/notify` و smoke test پوشش داده می‌شود.
