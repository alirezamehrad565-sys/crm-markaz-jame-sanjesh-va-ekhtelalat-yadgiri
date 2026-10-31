# keys — کلیدهای API (M6)

مالک جدول `api_keys` (migration 0005). کلیدها برای اتصال سرویس‌های خارجی و اتوماسیون
(بات بله، ابزار گزارش‌گیری، اسکریپت‌های ETL) به API استفاده می‌شوند.

## قرارداد

| Endpoint | RBAC | توضیح |
|---|---|---|
| `GET /api/keys` | manager | فهرست امن (prefix — بدون hash/token) |
| `POST /api/keys` | manager | ساخت کلید؛ `{ name, role }` → پاس ۲۰۱ با `token` **فقط یک‌بار** |
| `POST /api/keys/:id/revoke` | manager | ابطال (active=0 + revoked_at) |

## نحوه استفاده

```bash
curl -H "X-Api-Key: ck_live_xxx..." "https://<worker>/api/appointments?week=2026-10-03"
```

- فرمت کلید: `ck_live_<40 کاراکتر>` — در DB فقط SHA-256 hex ذخیره می‌شود
- هویت: role کلید → همان RBAC کارکنان (`requireRole`)؛ attribution در audit به مالک (سازنده) کلید
- `last_used_at` با `waitUntil` به‌روزرسانی می‌شود (بدون تأثیر بر تأخیر پاسخ)
- ترتیب احراز در middleware: dev bypass → `X-Api-Key` → JWT (Cloudflare Access)
