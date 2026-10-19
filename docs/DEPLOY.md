# راهنمای استقرار (Deploy Guide) — سامانهٔ مرکز جامع

> نسخهٔ سند: هم‌گام با انتشار **۱.۰۰.۰** · به‌روزرسانی استقرارِ موجود → [`UPDATE.md`](./UPDATE.md) ·
پنل مدیریت وب + API در **یک Worker واحد** با دیتابیس **D1**. فرانت‌اند بدون build است
(ES Module خام در `public/`)، فونت وزیرمتن self-hosted، تاریخ جلالی، RTL و تم روشن/تاریک.

---

## ۱) معماری استقرار در یک نگاه

| جزء | مقدار | توضیح |
|-----|-------|-------|
| Worker | `center-system` | ورودی دو لایه: `worker/entry.js` → باندل زندهٔ `worker/bundle.js` + لایهٔ امتیاز `worker/scoring.js` |
| Assets | `public/` با binding `ASSETS` | فایل‌های استاتیک مستقیم سرو می‌شوند؛ مسیرهای بدون فایل به Worker می‌روند (API) |
| دیتابیس | D1 `center-system-db` | binding `DB`؛ مایگریشن‌ها از `migrations/` با ردیابی `d1_migrations` |
| Cron | ۴ تریگر | یادآوری‌ها (۲۰:۳۰ و ۱۰:۰۰ تهران)، خلاصهٔ روز + KPI هفتگی (۰۷:۳۰)، ساعت ارسال اعلان (۱۸:۰۰) |
| Secrets | `BALE_BOT_TOKEN`, `BALE_WEBHOOK_SECRET` | با `wrangler secret put` — در باندل جابه‌جا نمی‌شوند |
| ENV | `production` (پیش‌فرض امن) | بای‌پس توسعه‌ای `X-Dev-Staff-Id` فقط با `ENV=development` (فایل `.dev.vars` فقط برای `wrangler dev`) |

> **نکتهٔ بک‌اند:** بک‌اند استقراری، باندل `worker/bundle.js` است (ورودی دولایه در `wrangler.toml` مستند است).
> تغییرات رفتاری روی فایل‌های `worker/` اعمال و با مجموعهٔ تست `src/` راستی‌آزمایی می‌شود.

## ۲) پیش‌نیازها

```bash
npm install # وابستگی‌ها — wrangler 3.114.17 (عمداً v4 نه؛ رفتار پایدار استقرار)
node -v # ≥ 20
```

احراز هویت Cloudflare با **توکن حساب-محدود** (لاگین تعاملی `wrangler login` هم ممکن است،
اما در استقرار خودکار توکن + account id به‌صورت env داده می‌شود تا wrangler به `/memberships` نرود):

```bash
export CLOUDFLARE_API_TOKEN=<token حساب-محدود>
export CLOUDFLARE_ACCOUNT_ID=666575717adac931e0cd175d1310c4bf
```

`account_id` ثابت تولید از قبل در `wrangler.toml` ثبت است.

## ۳) نصب از صفر (فقط بار اول)

```bash
# ۱. دیتابیس
npx wrangler d1 create center-system-db # database_id خروجی را در wrangler.toml بگذارید
npm run migrate:remote # اعمال migrations (0001…) روی D1 تولید

# ۲. روز صفر — فقط حساب اولین مدیر (بدون هیچ دادهٔ نمونه)
npm run bootstrap:remote # ورود: manager / 1234 — بلافاصله رمز را عوض کنید

# ۳. secrets بات
npx wrangler secret put BALE_BOT_TOKEN
npx wrangler secret put BALE_WEBHOOK_SECRET

# ۴. انتشار
node scripts/update-remote.mjs --yes # یا CLOUDFLARE_API_TOKEN=… در جلو
```

اجرا و توسعهٔ محلی:

```bash
npm run migrate:local # D1 محلی
npm run bootstrap # حساب مدیر محلی
npm run dev # http://localhost:8787 — هویت توسعه: کلیک روی چیپ نام کاربر (X-Dev-Staff-Id)
```

## ۴) چرخهٔ به‌روزرسانی (هر انتشار)

یک فرمان، چهار گام امن با ترتیب ثابت — جزئیات کامل در [`UPDATE.md`](./UPDATE.md):

```bash
node scripts/update-remote.mjs # با تأیید گام‌به‌گام
node scripts/update-remote.mjs --yes # بدون پرسش
node scripts/update-remote.mjs --dry-run # فقط نمایش
npm run backup:remote # فقط پشتیبان‌گیری
```

| گام | کار |
|-----|-----|
| ۰ پیش‌پرواز | ورود wrangler، `database_id` واقعی، هم‌خوانی نسخه‌های باندل |
| ۱ پشتیبان | دامپ کامل D1 تولید → `backups/backup-<زمان>.sql` |
| ۲ مایگریشن | فقط مایگریشن‌های اعمال‌نشده (مستقل از نسخه؛ ردیابی خودکار) |
| ۳ انتشار | `wrangler deploy --var ENV:production` |
| ۴ تأیید | `GET /health` و مقایسهٔ نسخهٔ زنده با باندل |

**قواعد طلایی:**
- اسکیمای دستی (`d1 execute --file`) روی تولید **هرگز** اجرا نشود — تغییر اسکیما فقط از `migrations/` با الگوی «افزودنی» (`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ADD COLUMN`)؛ حذف داده بخشی از انتشار نیست.
- secrets و `database_id` روی حساب می‌مانند و با باندل جابه‌جا نمی‌شوند.
- به‌روزرسانی دستی بدون اسکریپت: `npm run deploy` معادل `wrangler deploy` است اما **پشتیبان و مایگریشن و تأیید نسخه را رد می‌کند** — در تولید فقط از `update-remote.mjs` استفاده کنید.

## ۵) تأیید سلامت پس از استقرار

```bash
curl -s https://<your-worker>.<your-subdomain>.workers.dev/health
# {"ok":true,"version":"1.00.0","milestone":"","ts":"…"}

curl -s -o /dev/null -w '%{http_code}' https://<your-worker>.<your-subdomain>.workers.dev/ # 200
curl -s -o /dev/null -w '%{http_code}' https://<your-worker>.<your-subdomain>.workers.dev/assets/js/event-pick.js # 200
```

تست دود ۱۳ اندپوینت کلیدی (لاگین واقعی لازم دارد — روی تولید فقط با اکتان مجاز):

```bash
/home/z/my-project/scripts/smoke-prod.sh <USERNAME> <PASSWORD> <label>
```

## ۶) پشتیبان‌گیری و بازیابی

**گرفتن پشتیبان** (خودکار در هر استقرار؛ دستی هر وقت خواستید):

```bash
npm run backup:remote # → backups/backup-<timestamp>.sql
```

**بازیابی** (فقط در فاجعه — دیتابیس تازه بسازید و دامپ را برگردانید):

```bash
npx wrangler d1 create center-system-db-restore
npx wrangler d1 execute center-system-db-restore --remote --file=backups/backup-<timestamp>.sql
# سپس database_id در wrangler.toml را عوض و update-remote را اجرا کنید
```

`backups/` در `.gitignore` است — دامپ‌ها حاوی دادهٔ واقعی‌اند و هرگز وارد گیت/باندل نمی‌شوند.

## ۷) عیب‌یابی سریع

| علامت | علت محتمل | اقدام |
|-------|-----------|-------|
| `/health` نسخهٔ قدیمی | استقرار ناتمام یا کش | `update-remote.mjs` را تا گام ۴ دوباره اجرا کنید |
| بعد از انتشار، فرانت «کهنه» است | کش مرورگر | پارامتر `?v=` در `index.html` را با نسخهٔ جدید هم‌گام کنید |
| `wrangler: authentication error` | توکن منقضی/بی‌دسترس | توکن حساب-محدود تازه صادر و به env بدهید |
| خطای مایگریشن در گام ۲ | اسکیمای دستی خارج از migrations | دامپ را مقایسه کنید؛ هیچ‌گاه `execute` دستی روی تولید نزنید |
| بات بی‌پاسخ | secret حذف‌شده یا webhook | `wrangler secret list`؛ توکن را دوباره بگذارید |
| ۵۰۰ پراکنده روی API جدید | ناهم‌خوانی باندل/مایگریشن | `/health` + لاگ Worker (`wrangler tail`)؛ در بدترین حالت عقب‌گرد به باندل قبلی |

## ۸) فایل‌ها و فرمان‌های مرجع

| مسیر/فرمان | نقش |
|------------|-----|
| `scripts/update-remote.mjs` | چرخهٔ امن استقرار (۴ گام) |
| `scripts/build-bundle.mjs` | ساخت باندل تحویل‌دادنی `center-system-mNN.zip` |
| `scripts/bootstrap.sql` | روز صفر — فقط مدیر اول |
| `migrations/` | تک‌منبع تغییرات اسکیما |
| `worker/entry.js` + `worker/bundle.js` | ورودی و باندل زندهٔ بک‌اند |
| `npm run typecheck` / `npm test` | گیت کیفیت قبل از هر انتشار |
| `/home/z/my-project/scripts/check_imports.mjs` | گیت ایمپورت فرانت (ES Module خام) |
| `wrangler tail` | لاگ زندهٔ Worker در تولید |
