# طرح داکرایز کردن سامانه — استقلال از Cloudflare

> **وضعیت: پیاده‌سازی شد ✅** — لایهٔ Node (درایور `node:sqlite` + ورودی سرور + کرون + استاتیک + CLI)
> و بستهٔ داکر (`Dockerfile` + `docker-compose.yml` + اورلی Caddy) تحویل شده است.
> انتشار خودکار ایمیج روی **GHCR** هم فعال است (`.github/workflows/docker-publish.yml`):
> با هر پوش روی main و هر تگ `v*`، ایمیج amd64+arm64 ساخته و به
> `ghcr.io/<مالک>/<مخزن>:latest` منتشر می‌شود — کاربرها بدون build مستقیم `docker pull` می‌کنند.
> راهنمای اجرا: [`docs/SELF-HOST.fa.md`](SELF-HOST.fa.md) — این سند به‌عنوان طرح مرجع و
> مستندات معماری/ریسک باقی می‌ماند.

> هدف: اجرای کامل سامانه روی سرور خودمان با Docker، بدون وابستگی به Workers / D1 / Cron Triggers کلادفلر.
> نتیجهٔ ممیزی کد: **هزینهٔ این مهاجرت پایین است** — چون بدترین جفت‌گاه‌ها از قبل به طبیعت باند نزدیک شده‌اند.

---

## ۱) ممیزی وابستگی‌ها — دقیقاً چه چیزهایی به کلادفلر چسبیده است؟

| # | وابستگی | وضعیت فعلی | سختی جداسازی |
|---|---------|------------|---------------|
| ۱ | **D1** (دیتابیس) | فقط از دو نقطه لمس می‌شود: (a) wrapper واحد `createDb(env.DB)` در `src/core/db/client.ts` با ۵ متد (query/queryOne/execute/batch/transaction)؛ (b) چند فراخوانی مستقیم `env.DB.prepare()` در ماژول auth (throttle لاگین، ارتقای هش رمز، runtime-secret) | 🟢 آسان — **همین الان ماک D1 روی `node:sqlite` داریم**: `src/test/mock-d1.ts` (۱۱۳ خط) که تمام ۱۳۰۰ تست از جمله e2e روی آن سبز است |
| ۲ | **Hono** (فریم‌ورک) | نسخهٔ ۴.۶ — Hono ذاتاً چند-پلتفرمی است و با `@hono/node-server` بدون تغییر کد روی Node اجرا می‌شود | 🟢 صفر |
| ۳ | **Workers Assets** (فایل‌های استاتیک) | سروِ فایل‌های `public/` + قواعد `_headers` (کش immutable برای img/font، ۵ دقیقه‌ای برای js/css، no-cache برای پوسته) | 🟡 ساده — یک middleware استاتیک با همان قواعد کش |
| ۴ | **Cron Triggers** (۴ زمان‌بند) | هندلر `scheduled(event, env, ctx)` که فقط `event.cron` را با دو ثابت مقایسه می‌کند | 🟢 آسان — `node-cron` با همان عبارات و فراخوانی همان توابع |
| ۵ | **WebCrypto / fetch** | با فلگ `nodejs_compat` کد روی APIهای استاندارد وب است؛ Node ۱۸+ هر دو را سراسری دارد | 🟢 صفر |
| ۶ | **Secrets** | رمزها/توکن‌ها در خود D1 ذخیره می‌شوند (`runtime-secret.ts` — d1AsSecretStore)، نه در Workers Secrets | 🟢 صفر — چون دیتابیس با خودمان می‌آید |
| ۷ | **ctx.waitUntil** | فقط در fetch/scheduled | 🟢 شیم ۳ خطی |
| ۸ | **تلگرام بات** | کاملاً outbound (fetch به api.telegram.org) + webhook ورودی | 🟢 صفر — فقط آدرس webhook باید به دامنهٔ جدید ثبت شود |
| ۹ | WebSocket / DO / KV / R2 / Queues | **استفاده نمی‌شوند** (بررسی bundle) | — |

**نتیجه:** تنها کار واقعیِ مهندسی، یک درایور SQLite برای «پروداکشن» + سرو استاتیک + کرون است. تقریباً همهٔ اجزا در مخزن موجودند.

---

## ۲) معماری هدف

```
┌──────────────────── Docker Host (VPS خودمان) ────────────────────┐
│                                                                   │
│  Caddy (پورت 80/443، TLS خودکار Let's Encrypt)                    │
│    ├── app:3000        → کانتینر اپ                               │
│    └── (اختیاری) backup-sidecar                                   │
│                                                                   │
│  کانتینر اپ (node:22-alpine، user غیر-root، HEALTHCHECK)          │
│    ├── @hono/node-server  → همان app موجود (src/index.ts)         │
│    ├── استاتیک: public/ با قواعد _headers بازسازی‌شده             │
│    ├── node-cron × ۴       → همان توابع scheduled                 │
│    └── node:sqlite (WAL)   → /data/app.db  (volume دائمی)         │
└───────────────────────────────────────────────────────────────────┘
```

- **Node ≥ 22.5** الزامی است (به‌خاطر `node:sqlite` که ماک D1 و درایور پروداکشن روی آن سوارند).
- دیتابیس یک فایل SQLite با WAL است → بکاپ، کپی، انتقال، همهٔ آن ساده.
- بار کاری ما (یک مرکز، تک‌نویسنده) با SQLite+WAL کاملاً جواب می‌دهد؛ `busy_timeout` تنظیم می‌شود.

---

## ۳) فاز ۱ — لایهٔ اجرای Node (تخمین: ۱ تا ۲ روز)

### ۳-۱) درایور D1-سازگارِ پروداکشن
فایل جدید `src/core/db/node-d1.ts`: همان کلاس `MockD1` با این تفاوت‌های عملیاتی (حدود ۴۰ خط اضافه):

```ts
const store = new DatabaseSync('/data/app.db');
store.exec('PRAGMA journal_mode = WAL;');
store.exec('PRAGMA foreign_keys = ON;');
store.exec('PRAGMA busy_timeout = 5000;');
```

- اینترفیس عمومی همان D1Database می‌ماند (prepare/bind/all/first/run/batch) تا **هیچ خط کد اپلیکیشن عوض نشود**.
- انتخاب دیتابیس با env: `DB_DRIVER=workers | node` در نقطهٔ ورود — باند کلادفلر برای دیپلوی Workers دست‌نخورده می‌ماند (دو حالت موازی قابل نگهداری).

### ۳-۲) نقطهٔ ورود Node
فایل جدید `server/node-main.ts`:

```ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import app from '../src/index';          // همان اپ فعلی
import { openNodeDb } from '../src/core/db/node-d1';
import { registerCrons } from './crons';

const env = { DB: openNodeDb(process.env.DATA_DIR ?? '/data'), ENV: 'production',
              CLINIC_NAME: 'مرکز جامع', PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL };

// استاتیک با قواعد _headers (img/font → immutable یک‌ساله، js/css → 5min must-revalidate، پوسته → no-cache)
app.use('/assets/*', serveStatic({ root: './public', rewriteRequestPath: (p) => p.split('?')[0] }));
app.use('*', serveStatic({ root: './public' }));

serve({ fetch: (req) => app.fetch(req, env, { waitUntil: (p) => p, passThroughOnException: => {} }) },
      (info) => console.log(`up on :${info.port}`));

registerCrons(env);   // node-cron با همان ۴ عبارت wrangler.prod.toml → همان runDigestCycle/runBatchDispatchCycle/runNotificationCycle
```

- نکتهٔ کش: چون ما در HTML نسخه‌دار هستیم (`?v=`)، قواعد ساده کفایت می‌کند و PWA/SW همان‌طور که هست کار می‌کند.

### ۳-۳) اجرای migrationها
اسکریپت کوچک `server/migrate.ts`: ۶۷ فایل `migrations/*.sql` را به‌ترتیب اعمال می‌کند و در جدول `_local_migrations` ثبت می‌کند (idempotent). ورکر مهاجرت‌ها را دستی اجرا می‌کنیم (`node dist/server/migrate.js`).

### ۳-۴) تست‌ها
مجموعهٔ فعلی ۱۳۰۰ تایی از قبل روی همان اینترفیس (MockD1/node:sqlite) سبز است؛ برای درایور پروداکشن یک تست دود اضافه می‌کنیم: open → migrate → login → یک چرخهٔ CRUD کامل.

---

## ۴) فاز ۲ — Docker (تخمین: نیم روز)

### Dockerfile (multi-stage)

```dockerfile
# ---- build ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx tsc -p tsconfig.node-server.json   # خروجی: dist/ (سرور + اپ)

# ---- runtime ----
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production DATA_DIR=/data
RUN addgroup -S app && adduser -S app -G app
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/migrations ./migrations
COPY --from=build /app/node_modules ./node_modules
VOLUME /data
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/health | grep -q '"ok":true'
CMD ["node", "dist/server/node-main.js"]
```

### docker-compose.yml

```yaml
services:
  app:
    build: .
    restart: unless-stopped
    ports: ["127.0.0.1:3000:3000"]
    volumes: ["appdata:/data"]
    environment:
      PUBLIC_BASE_URL: https://app.example.ir   # دامنهٔ جدید
      TZ: Asia/Tehran
  caddy:
    image: caddy:2-alpine
    restart: unless-stopped
    ports: ["80:80", "443:443"]
    volumes:
      - ./Caddyfile:/etc/caddy/Caddyfile:ro
      - caddydata:/data
volumes: { appdata: {}, caddydata: {} }
```

Caddyfile دو خط: `app.example.ir { reverse_proxy app:3000 }` — TLS خودکار.

### پشتیبان‌گیری
- حداقلی: سرویس systemd/کرون روی هاست → `sqlite3 /data/app.db ".backup /backup/app-$(date +%F).db"` (سازگار با WAL) + نگهداری ۳۰ روز.
- حرفه‌ای‌تر: sidecar **litestream** به مقصد S3/MinIO — ریکاوری نقطه‌زمانی.

---

## ۵) فاز ۳ — انتقال داده از D1 (تخمین: نیم روز)

```bash
# ۱) خروجی کامل از پروداکشن فعلی
npx wrangler d1 export center-system-db --remote --output dump.sql --config wrangler.prod.toml

# ۲) ورود به فایل محلی
sqlite3 /data/app.db < dump.sql

# ۳) راستی‌آزمایی شمارشی جدول‌به‌جدول (students, staff, appointments, case_events, exercises, ...)
```

- خروجی D1 استاندارد SQLite است؛ فقط دقت کن `PRAGMA foreign_keys` هنگام import خاموش باشد (ترتیب insertها) و بعد فعال شود.
- `d1 export` شامل migrationها هم می‌شود؛ پس روی مقصد **runner مهاجرت را اجرا نکنیم** (یا برعکس: اسکیما را با runner بسازیم و فقط داده را منتقل کنیم — گزینهٔ دوم تمیزتر است).

---

## ۶) فاز ۴ — اجرای موازی، راستی‌آزمایی، سوئیچ (تخمین: ۱ روز)

1. **استقرار موازی**: استک Docker روی VPS با دامنهٔ آزمایشی؛ Workers فعلی به کارش ادامه می‌دهد.
2. **چک‌لیست جریان‌های کلیدی** (هر دو محیط کنار هم):
   - ورود کاربران (۴ نقش)، تغییر رمز
   - ثبت/ویرایش دانش‌آموز، مسئول پرونده
   - نوبت‌دهی + تقویم + ثبت گزارش جلسه
   - ارسال چک‌لیست/تمرین با بله → پر کردن از سمت خانواده/معلم → دیده‌شدن در تب تفسیر بالینی
   - رویدادساز + پنل پیشرفت
   - آتش‌شدن ۴ کرون (یادآوری، خلاصهٔ روز، صف ارسال) — با اجرای دستی و بررسی لاگ
   - بات تلگرام: دستورها، پاسخ فرم
3. **سوئیچ** (پنجرهٔ کم‌ترافیک): توقف نوشتن در Workers → export نهایی D1 → import → `setWebhook` تلگرام به دامنهٔ جدید → تغییر DNS/ردیرکت.
4. **برگشت‌پذیری**: Workers و دیتابیس D1 حداقل ۲ هفته دست‌نخورده می‌مانند؛ برگشت = یک بار export از SQLite → wrangler d1 import + DNS به قبل.

---

## ۷) ریسک‌ها و ملاحظات

| ریسک | کنترل |
|------|-------|
| تفاوت‌های ریز D1 و SQLite (مثلاً رفتار `RETURNING`، نوع‌ها، `replace(created_at,' ','T')` موجود در کوئری‌ها) | چون D1 خودش SQLite است ریسک کم است؛ با ۱۳۰۰ تست + چک‌لیست فاز ۴ پوشش می‌دهیم |
| **منطقهٔ زمانی کرون‌ها** — الان UTC با آفست تهران دستی نوشته شده | در node-cron مستقیماً `timezone: 'Asia/Tehran'` می‌گذاریم و این تکنیکی‌بازی حذف می‌شود (بهبود جانبی) |
| تک‌فایلی بودن SQLite (نه توزیع‌شده) | برای یک مرکز کافی؛ در آینده اگر چند-شعبه شد، مسیر ارتقا: Litestream replica یا Postgres (wrapper خودش جداست) |
| گم‌شدن کش-پالسی PWA | همان قواعد `_headers` را در middleware بازسازی می‌کنیم + `?v=` از قبل هست |
| وابستگی به IP/امنیت | CF Access فعال نیست (`CF_ACCESS_TEAM_DOMAIN=""`)؛ جای آن rate-limit لایهٔ Caddy |

---

## ۸) مسیر جایگزین «سریع‌تر اما موقت» — Miniflare/workerd داخل Docker

اگر بخواهیم در چند **ساعت** (نه روز) از کلادفلر جدا شویم: ایمیج `workerd` (یا miniflare در حالت production) همان کد Workers را بدون هیچ تغییری اجرا می‌کند و D1 به فایل SQLite محلی مپ می‌شود.

- مزیت: صفر تغییر کد، امروز اجرا می‌شود.
- عیب: زنجیرهٔ ابزار Cloudflare (wrangler/miniflare) و رفتارهای شبیه‌سازی‌شده به زنجیره برمی‌گردد؛ برای «استقلال واقعی بلندمدت» توصیه نمی‌شود — به‌عنوان پل/محیط آماده‌سازی خوب است.

## ۹) جمع‌بندی زمان و ترتیب پیشنهادی

| فاز | خروجی | زمان |
|-----|-------|------|
| ۱. لایهٔ Node (درایور + ورودی + کرون + migrate runner) | اپ کامل روی Node با فایل SQLite | ۱–۲ روز |
| ۲. Docker + Caddy + بکاپ | `docker compose up` کامل | نیم روز |
| ۳. انتقال داده | دیتای پروداکشن روی مقصد | نیم روز |
| ۴. موازی‌اجرا + سوئیچ | قطع کامل از Cloudflare | ۱ روز |
| **جمع** | | **~۳–۴ روز کاری** |

پیشنهاد شروع: فاز ۱-۱ و ۱-۲ (درایور + ورودی Node) — همین دو فایل مشخص‌ترین خروجی را دارند و بدون دست‌زدن به پروداکشن فعلی قابل تست‌اند.
