# گزارش ممیزی stack — run_id: aud-20261124-8ca4227

- مخزن: `/home/z/my-project/gh-rust` · شاخه rust · revision `8ca4227` · درخت تمیز · نسخهٔ اپ 1.27.74 (package.json:3، src/core/version.ts:7)
- تاریخ ممیزی: 2026-11-24 · حالت: فقط‌خواندنی (فقط دو فایل گزارش نوشته شد)
- یافته‌ها: [stack.json](../findings/stack.json) — ۹ یافته: ۳ medium، ۶ low، ۰ high/critical (بدون مورد pending)

## پوشش

- کانفیگ‌های استقرار: `wrangler.toml`، `wrangler.games.toml`، `Dockerfile`، `docker-compose.yml`، `docker-compose.caddy.yml`، `Caddyfile`، `.env.selfhost.example`
- مانیفست‌ها و ابزار: `package.json`، `package-lock.json` (نسخه‌های قفل‌شده)، `vitest.config.ts`، `tsconfig.json`، `tsconfig.node-server.json`
- ورودی‌ها و باندل‌سازی: `worker/entry.js`، `worker/games-entry.js`، `worker/src-entry.mjs`، `worker/src-entry-node.mjs`، `worker/scoring.js` + `scoring.d.ts`؛ اسکریپت‌های ساخت (build-worker-bundle / build-worker-games / build-central-bundle / build-engine-server / build-selfhost / build-client / build-bundle)
- بک‌اند: `src/index.ts` (scheduled + Env)، `src/games-worker.ts`، سیم‌کشی `src/application/api-routing/index.ts`، بازی‌های مستقل `src/application/games-standalone`، سینک نود `src/node-sync/app.ts`، سرور سلف‌هاست `server/node-main.ts` + `server/crons.ts`
- دسکتاپ Rust (مرز استقرار): `desktop/src-tauri/Cargo.toml`، `tauri.conf.json`، `cf_deploy.rs` (آپلود central-bundle با bindings سرّی از طریق API کلادفلر)
- خارج از پوشش (ثبت‌شده در scope.unscanned): ماژول‌های درونی Rust دسکتاپ (lib.rs، engine.rs و…)، server/static.ts، server/env.ts، server/cli.ts، scripts/ops، scripts/load، migrations — برای auditorهای معماری/data.

## ابزارها

- jCodeMunch در دسترس نبود (index/semantic search موجود نشد) — ثبت به‌عنوان limitation در findings JSON.
- هر ادعای «مصرف ندارد / تسهیل مرده» با **دو grep با شکل متفاوت که هم‌نظر بودند + یک خواندن مستقیم** تأیید شد:
  - بدون KV: `grep kv_namespaces` روی تمام toml/json/md + `grep -E "env\.[A-Z_]+\.(get|put|list|delete)"` روی src/server (صفر) + خواندن مستقیم هر دو wrangler.toml.
  - R2 بدون binding: grep `EXERCISE_FILES` (فقط src/index.ts:26,82) + grep `r2_buckets|R2Bucket` در کانفیگ‌ها (exit 1) + خواندن مستقیم wrangler.toml.
  - createD1ObjectStore بدون مصرف تولیدی: grep فایل‌لیست + grep الگوی import `@core/storage` + خواندن مستقیم api-routing:220-222.
  - web-vitals بدون import: grep الگوی import + grep نام بسته در کل مخزن + خواندن مستقیم rum.js:8.
  - ارجاع‌های npm run تعریف‌نشده: استخراج ۳۴ نام یکتای «npm run X» با regex + مقایسه با کلیدهای package.json.
- اجرای کد/تست/بیلد و شبکه انجام نشد؛ نسخه‌ها از lock و مانیفست خوانده شد. مقادیر سرّی هیچ‌جا چاپ نشد — فقط «کجا تعریف شده»: AUTH_SECRET بازی‌ها با `wrangler secret put` (wrangler.games.toml:9-10)، رازهای ورکر مرکزی از طریق provisioning API با `secret_text` (src/application/instance-sync/provision.ts:545، desktop/src-tauri/src/cf_deploy.rs:375-376)، بقیه از env/docker-compose وارد می‌شوند.

## نتایج تمیز (تأییدشده، بدون یافته)

- هیچ KV تعریف یا مصرف نشده است (فقط دابل تست در system-routes و prose در node-sync-runner).
- ورکر اصلی Hono است: `createApp` در api-routing/index.ts:547-550 با `new Hono`، مونت از src/index.ts:1,369.
- تست‌ها vitest بدون Miniflare — ماک D1 روی node:sqlite در src/test/mock-d1.ts (کف Node >=22.5).
- توازن کرون: ۴ عبارت wrangler.toml:19 دقیقاً با ALL_CRONS سلف‌هاست (server/crons.ts:14 + constants.ts:187-196) یکی است؛ CP_SYNC_CRON عمداً در ابر نیست (سقف ۵ کرون پلن Free — wrangler.toml:17-18، سینک فرصت‌طلب روی fetch).
- envهای اعلامی بی‌مصرف یافت نشد: API_RATE_LIMIT_PER_MIN (games-standalone:71، api-routing:594، node-sync/app.ts:190)، GAMES_HEALTH_URL (index.ts:380 + adapter)، BALE_*/CF_ACCESS_TEAM_DOMAIN/AUDIT_LOG_RETENTION_DAYS همگی مصرف دارند.
- وابستگی‌های runtime دیگر (hono، @hono/node-server، zod، mime، qrcode-generator، esbuild، fast-check) مصرف واقعی دارند.
- wrangler.games.toml به‌عنوان کانفیگ «آمادهٔ استقرار، نه مستقر» با database_id مشترک اپ اصلی — هدر فایل (خطوط ۱-۱۱) این تصمیم و دو تلهٔ فعال‌سازی را مستند کرده است؛ دیپلوی خودکار ندارد.

## خلاصهٔ یافته‌ها

| id | شدت | مسیر | خلاصه |
|---|---|---|---|
| stack-001 | medium | wrangler.toml / src/index.ts:26,82 | آداپتور R2 از env.EXERCISE_FILES تغذیه می‌شود که binding ندارد — در همهٔ اهداف استقرار ذخیرهٔ فایل روی chunked-D1 می‌افتد |
| stack-002 | medium | desktop/src-tauri/tauri.conf.json:4 | پوستهٔ دسکتاپ 1.27.58 در برابر APP_VERSION 1.27.74 — گیت desktop:check برابری را می‌خواهد و در این revision قرمز است |
| stack-003 | medium | scripts/engine/engine.mjs:276 | باینری workerd فقط وابستگی ترانزیتیو wrangler است ولی مستقیم ران‌تایم موتور محلی و مانیفست نصاب است |
| stack-004 | low | package.json:66 | بستهٔ npm web-vitals بی‌مصرف؛ ران‌تایم از نسخهٔ vendor‌شده استفاده می‌کند |
| stack-005 | low | src/core/storage/d1-store.ts:27 | دو ObjectStore هم‌هدف روی D1؛ تولید فقط chunked را مصرف می‌کند، d1-store فقط تستی است |
| stack-006 | low | package.json:65 | wrangler 3.x و vitest 2.x قدیمی؛ workers-types (2026-07) از compat-date و workerd جلوتر است |
| stack-007 | low | package.json | کف Node (>=22.5 به‌خاطر node:sqlite) در engines اعلان نشده؛ سه خط Node متفاوت (24 / 22.23.5) |
| stack-008 | low | scripts/desktop/build-installer-runtime.mjs:180 | ارجاع به npm run build:worker ناموجود در کد؛ desktop:dev / engine:dev / usb:pack در docs |
| stack-009 | low | worker/scoring.js | کتابخانهٔ منبع scoring.js داخل دیرکتوری باندل‌های تولیدی نگه‌داری می‌شود و TSها با مسیر نسبی import می‌کنند |
