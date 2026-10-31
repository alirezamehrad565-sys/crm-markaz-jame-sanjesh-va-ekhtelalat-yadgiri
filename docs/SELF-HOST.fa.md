# راهنمای راه‌اندازی سلف‌هاست — اجرای سامانه بدون Cloudflare

> این راهنما برای کسانی است که می‌خواهند سامانه را روی **کامپیوتر شخصی، لوکال یا سرور خودشان**
> اجرا کنند و از Cloudflare Workers/D1 استفاده نکنند.
> کل سامانه (اپ + دیتابیس + زمان‌بندها + استاتیک) در یک کانتینر داکر آمادهٔ ران است.
> طرح فنی و منطق مهاجرت: [`docs/DOCKERIZE.md`](DOCKERIZE.md)

---

## ۱) معماری در یک نگاه

```
┌──────────────────── Docker Host (لوکال یا VPS خودتان) ────────────────────┐
│                                                                            │
│  (اختیاری، فقط برای انتشار عمومی)  Caddy — پورت 80/443 + TLS خودکار        │
│        │                                                                   │
│  کانتینر اپ (node:24-bookworm-slim، کاربر غیر-root، HEALTHCHECK)           │
│   ├── همان کد اپ پروداکشن (src/index.ts → باندل esbuild)                   │
│   ├── استاتیک: public/ با همان قواعد کش _headers                           │
│   ├── ۴ زمان‌بند cron (یادآوری/خلاصهٔ روز/ارسال) — همان ساعت‌های پروداکشن    │
│   └── دیتابیس: SQLite با WAL → /data/app.db روی volume دائمی               │
└────────────────────────────────────────────────────────────────────────────┘
```

نکتهٔ کلیدی: **هیچ خطی از کد اپ عوض نشده** — سرور Node همان ورودی Workers
(`src/index.ts`) را با درایور `node:sqlite` سازگار با D1 صدا می‌زند؛ پس رفتار
سامانه با نسخهٔ Cloudflare بیت‌به‌بیت یکی است (۱۳۲۱ تست سبز روی همین قرارداد).

---

## ۲) پیش‌نیازها

| نیاز | حداقل |
|------|-------|
| Docker + Compose v2 | Docker 24+ (دستور `docker compose version` جواب بدهد) |
| RAM | ۵۱۲MB کافی است |
| دیسک | ۱GB + حجم دیتای شما |
| Node (فقط اگر بدون Docker اجرا می‌کنید) | **۲۴** (یا ۲۲.۱۳+ به‌خاطر `node:sqlite`) |

---

## ۳) شروع سریع — لوکال در ۴ دستور

```bash
git clone <آدرس-مخزن>
cd crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri
cp .env.selfhost.example .env          # فعلاً می‌تواند خالی بماند
docker compose up -d --build
```

حالا باز کنید: **http://localhost:3000** — صفحهٔ ورود سامانه باید بالا بیاید.

راستی‌آزمایی سالم بودن:

```bash
curl http://localhost:3000/health
# {"ok":true,"version":"...","ts":"..."}
```

> مهاجرت‌های دیتابیس در هر بوت **خودکار و idempotent** اعمال می‌شوند — لازم نیست
> چیزی دستی اجرا کنید.

### راه دوم — ایمیج آمارهٔ GHCR (بدون کلون و بدون build)

با هر پوش روی main و هر تگ نسخهٔ `v*`، یک GitHub Action ایمیج را خودکار می‌سازد
و روی **GHCR** منتشر می‌کند (amd64 + arm64). پس اگر نخواهید مخزن را کلون و بیلد کنید:

```bash
# ۱) ایمیج آماره را بکشید (آخرین نسخهٔ main)
docker pull ghcr.io/alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri:latest

# ۲) بگذارید کنار فایل .env و اجرا کنید
docker run -d --name center-system \
  -p 127.0.0.1:3000:3000 \
  -v center-appdata:/data \
  -e TZ=Asia/Tehran \
  --env-file .env \
  --restart unless-stopped \
  ghcr.io/alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri:latest
```

اگر با `docker compose` راحت‌ترید، نیازی به ویرایش فایل نیست — کافی است ایمیج را
با متغیر `CENTER_IMAGE` عوض کنید:

```bash
CENTER_IMAGE=ghcr.io/alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri:latest \
  docker compose up -d
```

> بوت‌استرپ روز صفر (بخش ۴) روی این مسیر هم به همان شکل کار می‌کند؛ فقط به‌جای
> `docker compose exec` از `docker exec center-system ...` استفاده کنید.
> تگ‌های دیگر: `:1.00.57` (نسخهٔ مشخص) · `:sha-xxxxxxx` (کامیت مشخص) · `:main` (سر خط main).
> ایمیج روی [github.com/alirezamehrad565-sys?tab=packages](https://github.com/alirezamehrad565-sys?tab=packages) قابل مشاهده است.



---

## ۴) اولین حساب مدیر (روز صفر)

نصب تازه هیچ کاربری ندارد. اولین مدیر را با اسکریپت بوت‌استرپ بسازید:

```bash
docker compose exec app node dist/cli.js sql scripts/bootstrap.sql
```

- حساب: نام کاربری `manager` / رمز `1234`
- ⚠️ **بلافاصله بعد از اولین ورود** از ماژول کارکنان رمز را عوض کنید و در صورت
  نیاز بعد از ساخت کارکنان واقعی، این حساب موقت را غیرفعال کنید.

وضعیت دیتابیس را هر وقت خواستید ببینید:

```bash
docker compose exec app node dist/cli.js status
```

---

## ۵) تنظیمات — فایل `.env`

فایل `.env.selfhost.example` را به `.env` کپی کنید و طبق جدول زیر پر کنید.
همهٔ موارد اختیاری‌اند؛ سامانه بدون هیچ‌کدام بالا می‌آید.

| متغیر | نقش | پیش‌فرض |
|-------|-----|---------|
| `CLINIC_NAME` | نام مرکز در سربرگ پیام‌ها | «مرکز جامع» |
| `PUBLIC_BASE_URL` | آدرس عمومی سایت برای ساخت لینک داخل پیام‌های بله (فرم خانواده/معلم، فایل تمرین) | خالی |
| `BALE_BOT_TOKEN` | توکن بات بله — بدون آن بات غیرفعال است و بقیهٔ سامانه سالم است | خالی |
| `BALE_WEBHOOK_SECRET` | رمز مسیر وب‌هوک (`/webhook/bale/<رمز>`) | خالی |
| `AUTH_SECRET` | رمز امضای JWT/لینک دانلود (≥۱۶ کاراکتر) — اگر خالی باشد به‌صورت خودکار در دیتابیس ساخته و نگهداری می‌شود | خالی |
| `PUBLIC_DOMAIN` | فقط برای لایهٔ Caddy | `app.example.ir` |
| `CRON_MANUAL` | `1` = امکان تریگر دستی کرون از `/__scheduled` — فقط برای دیباگ | `0` |

---

## ۶) انتقال داده از Cloudflare به نصب محلی (اختیاری)

اگر از قبل روی Cloudflare داده دارید و می‌خواهید همین داده را لوکال بیاورید:

```bash
# ۱) خروجی کامل از پروداکشن (نیازمند توکن Cloudflare روی همان ماشین)
npx wrangler d1 export center-system-db --remote --output dump.sql --config wrangler.prod.toml

# ۲) فایل را به کانتینر بدهید و اجرا کنید
docker compose cp dump.sql app:/tmp/dump.sql
docker compose exec app node dist/cli.js sql /tmp/dump.sql

# ۳) راستی‌آزمایی شمارش‌ها
docker compose exec app node dist/cli.js status
```

نکته‌ها:
- خروجی `d1 export` استاندارد SQLite است و اسکما + داده را با هم می‌آورد؛ بنابراین
  این کار را **روی نصب تازه** (volume خالی) انجام دهید. سرور هوشمند است: اگر
  اسکیما از قبل موجود باشد، مهاجرت‌ها را بدون اجرا «اعمال‌شده» ثبت می‌کند و
  هیچ ALTER تکراری‌ای خطا نمی‌دهد.
- اگر خواستید برعکس کنید (لوکال → Cloudflare)، همین dump را می‌توانید با ماژول
  پشتیبان‌گیری خود سامانه یا `wrangler d1 import` برگردانید.

---

## ۷) بات بله روی نصب محلی

بات بله فقط یک «وب‌هوک ورودی» و «تماس‌های خروجی» است؛ روی Node هم همان‌طور کار
می‌کند. شرط لازم: **تلگرام/بله باید بتواند به آدرس شما POST بزند** — یعنی یک
آدرس HTTPS عمومی (بخش ۸).

```bash
# بعد از بالا آمدن با دامنهٔ عمومی + پر کردن BALE_BOT_TOKEN/BALE_WEBHOOK_SECRET در .env:
curl "https://botapi.bale.ai/bot<BALE_BOT_TOKEN>/setWebhook" \
  -H 'content-type: application/json' \
  -d '{"url": "https://دامنه-شما/webhook/bale/<BALE_WEBHOOK_SECRET>"}'
```

- اگر فقط روی لوکال بدون دامنه عمومی اجرا می‌کنید: وب‌سایت و پنل کامل کار می‌کند،
  فقط بات پیام نمی‌گیرد. بعداً هر وقت دامنه وصل شد `setWebhook` را بزنید.
- کرون‌های یادآوری/خلاصهٔ روز خودکار اجرا می‌شوند (همان ۴ ساعت پروداکشن، بر اساس
  UTC مثل Cloudflare). برای آزمون دستی یک چرخه:

```bash
# فقط با CRON_MANUAL=1
curl "http://localhost:3000/__scheduled?cron=0%204%20*%20*%20*"
```

---

## ۸) انتشار عمومی روی سرور شخصی (HTTPS)

استک پایه پورت را فقط روی `127.0.0.1` باز می‌کند (امن). برای انتشار با دامنه:

```bash
# در .env دو مقدار را بگذارید:
#   PUBLIC_BASE_URL=https://app.example.ir
#   PUBLIC_DOMAIN=app.example.ir
docker compose -f docker-compose.yml -f docker-compose.caddy.yml up -d --build
```

Caddy خودش گواهی Let's Encrypt می‌گیرد و تمدید می‌کند. فقط رکورد DNS دامنه را
به IP سرور اشاره دهید و پورت‌های ۸۰/۴۴۳ باز باشند.

---

## ۹) پشتیبان‌گیری و بازیابی

دیتابیس یک فایل SQLite است در volume به نام `appdata`:

```bash
# بکاپ فوری سازگار با WAL — از VACUUM INTO استفاده کنید (نه کپی مستقیم در حین نوشتن)
docker compose exec app node -e "const{DatabaseSync}=require('node:sqlite');new DatabaseSync('/data/app.db').exec(\"VACUUM INTO '/data/backup-$(date +%F).db'\");console.log('ok')"
docker compose cp app:/data/backup-$(date +%F).db ./backups/
```

یا به‌سادگی فایل‌های `app.db`/`app.db-wal` را از volume کپی کنید (روی VPS می‌توانید
یک cron هاستی بگذارید که هر شب همین کار را با نگهداری ۳۰ روزه انجام دهد).

بازیابی:

```bash
docker compose down                 # توقف اپ
docker volume rm <پروژه>_appdata    # حذف دیتای خراب/قدیمی
docker compose up -d --build        # نصب تازه
docker compose cp backup.db app:/tmp/restore.sql   # فایل بکاپ SQL باشد یا db
docker compose exec app node dist/cli.js sql /tmp/restore.sql
```

> اگر فایل بکاپ شما خروجی ماژول پشتیبان‌گیری خود سامانه (SQL) باشد، همین
> دستور `cli.js sql` آن را برمی‌گرداند.

---

## ۱۰) به‌روزرسانی نسخه

```bash
git pull
docker compose up -d --build
```

مهاجرت‌های جدید خودکار اعمال می‌شوند؛ داده دست‌نخورده می‌ماند. برای بازگشت،
کافیست `git checkout <کامیت قبلی>` و دوباره `up -d --build` (دیتابیس forward-only است — قبل از آپدیت بزرگ، بکاپ بگیرید).

---

## ۱۱) اجرای بدون Docker (اختیاری)

```bash
npm ci
npm run build:selfhost     # dist/server.js + dist/cli.js
npm start:selfhost         # DATA_DIR=./data ./data/app.db روی پورت 3000
```

برای ویندوز/مک هم همین دستورها در ترمینال کار می‌کند؛ فقط Node ≥ ۲۲.۱۳ لازم است.

---

## ۱۲) عیب‌یابی

| نشانه | علت/راه‌حل |
|-------|-----------|
| پورت ۳۰۰۰ اشغال است | در `.env` یا `docker-compose.yml` پورت دیگر بگذارید (`PORT`) |
| `node:sqlite در این نسخه Node در دسترس نیست` | Node شما قدیمی است — ≥۲۲.۱۳ یا ۲۴ |
| صفحه بالا نمی‌آید | `docker compose logs app` را ببینید؛ `/health` را چک کنید |
| بات پیام نمی‌گیرد | `setWebhook` زده‌اید؟ آدرس HTTPS عمومی است؟ رمز URL دقیقاً همان `BALE_WEBHOOK_SECRET` است؟ |
| خطای ورود بعد از بازیابی دیتابیس | رمز جلسه داخل DB قدیمی است؛ `AUTH_SECRET` را در `.env` ثابت بگذارید تا بین محیط‌ها یکسان بماند |
| حجم لاگ WAL زیاد شد | طبیعی است؛ روی خاموشی نرم checkpoint می‌شود. برای فشرده‌سازی دستی: `cli.js sql` یک تراکنش کوچک اجرا کنید یا سرویس را restart کنید |

---

## ۱۳) محدودیت‌ها و تفاوت‌های آگاهانه

- **Cron‌ها با UTC** اجرا می‌شوند (پاریتی با Cloudflare؛ عبارت‌ها از قبل برای آفست تهران دستی نوشته شده‌اند) — اگر روزی خواستید مستقیم `Asia/Tehran` بنویسید، عبارت‌ها را در `src/core/shared/constants.ts` بازنویسی کنید.
- **نسخهٔ کانتینر از `wrangler` خبر ندارد** — هیچ فایل/متغیری از Cloudflare لازم نیست؛ `wrangler.prod.toml` فقط برای دیپلوی ابری همان نسخه می‌ماند.
- SQLite+WAL برای بار یک مرکز (تک‌نویسنده، چند صد پرونده) بیش از کافی است؛ اگر چندشعبه‌ای شدید، مسیر ارتقا (Litestream/Postgres) در `docs/DOCKERIZE.md` §۷ آمده است.
- امنیت شبکه‌ای (rate-limit، fail2ban و…) به‌عهدهٔ لایهٔ Caddy/nginx شماست؛ خود اپ همان هدرهای امنیتی و کنترل دسترسی نسخهٔ Workers را دارد.
