# موتور محلی — اجرا، تصمیم‌ها، محدودیت‌ها (فاز ۲ خط rust)

> مکمل `docs/rust/design.md` §۴ و `docs/rust/phases.md` فاز ۲. موتور محلی = سایدکار `workerd` با باندل‌های منجمد `worker/bundle.js` و `worker/games-bundle.js` روی D1 فایل‌محور — بدون miniflare، بدون wrangler، بدون شبکه.

## اجرا

```bash
npm run engine:start            # بوت روی engine-data/ با پورت ۸۷۸۷ (بازی‌ها ۸۷۸۸)
node scripts/engine/engine.mjs --port 8790 --data-dir /path/to/data --seed   # آرگومان‌های کامل
npm run seed:demo -- --data-dir /path/to/data   # دیتای نمایشی جداگانه (idempotent)
npm run engine:smoke            # گیت فاز ۲ — ۱۹ بررسی روی دایرکتوری موقت
```

- ترتیب بوت در `engine.mjs`: مایگریشن (idempotent، جدول `_migrations`) → seed (فقط `--seed` یا اجرای اول) → تولید کانفیگ capnp-text → `spawn workerd serve --experimental --import-path=node_modules/workerd <config>` → انتظار `/health` (۳۰ ثانیه) → اجرا تا سیگنال؛ خاموشی تمیز SIGTERM/SIGINT.
- خروجی‌های پوشهٔ داده: `workerd.capnp` (کانفیگ)، `workerd.log` (لاگ سایدکار)، `d1/miniflare-D1DatabaseObject/<hash>.sqlite` (فایل D1 — همین فایل با `node:sqlite` مایگریت/سید می‌شود).
- کاربرهای seed: `manager` / `secretary` / `therapist` — رمز «۱۲۳۴» با همان PBKDF2 هستهٔ auth (`pbkdf2$25000$salt$hash`، ۳۲ بایت خروجی — `pbkdf2Sync` نود «بایت» می‌گیرد نه بیت).
- دسکتاپ: `desktop/src-tauri/src/engine.rs` باینری workerd را پیدا می‌کند (متغیر `CENTER_WORKERD_BIN` ← کنار برنامه ← `node_modules`)، پورت آزاد می‌گیرد (۸۷۸۷ پیش‌فرض)، spawn و `/health` را در thread پول می‌کند و پنجره را به `http://127.0.0.1:<port>/` می‌فرستد؛ `Drop` = خاموشی. کانفیگ با `CENTER_ENGINE_CONFIG` بازنویسی می‌شود. **کامپایل Rust در CI** انجام می‌شود (cargo در محیط سندباکس مرگزا نیست).

## تصمیم‌های ماندگار

1. **کانفیگ فقط capnp-text**: workerd کانفیگ را فقط به‌صورت `using W = import "/workerd/workerd.capnp"; const config :W.Config = (...)` می‌پذیرد (نه JSON)؛ رزولوشن import با `--import-path=node_modules/workerd` (پس از زیرفرمان `serve`، نه قبل از آن) و فلگ `--experimental` برای سرویس D1 الزامی است.
2. **چیدمان عین miniflare برای D1**: دیسک `d1:storage` + ورکر DO با `database.worker.js` مینیفلر (`uniqueKey = miniflare-D1DatabaseObject`) + ورکر ورودی هر دیتابیس (`MINIFLARE_NAMESPACE`/`MINIFLARE_OBJECT`) + بایند `wrapped` روی ماژول داخلی `cloudflare-internal:d1-api` با inner binding `fetcher`. وابستگی‌های ماژول DO از پسوندهای سراسری `miniflare:shared` و `miniflare:zod` تأمین می‌شود.
3. **مسیر قطعی فایل SQLite**: چون uniqueKey و نام دیتابیس («main») ثابت‌اند، workerd همیشه فایل `d1/miniflare-D1DatabaseObject/1ef2f391…fa6c.sqlite` را می‌سازد (کشف با پروب واقعی، تثبیت در `engine-paths.mjs`) — مایگریشن/seed پیش از بوت مستقیم روی همین فایل.
4. **assets با سه ورکر سبک مینیفلر**: `assets-kv` (بلاف‌ها + `ASSETS_REVERSE_MAP`)، `assets` (مانیفست دودویی + `ASSETS_KV_NAMESPACE`)، `assets:router` (`has_user_worker: true` در CONFIG الزامی است — پیش‌فرض worker روتر بدون این کلید هرگز به ورکر کاربر نمی‌رسد). مانیفست هم‌الگوریتم مینیفلر: `sha256("/path")[:16]` + `sha256(absPath+mtime)[:16]` + ۸ بایت صفر، هدر ۲۰ بایتی.
5. **توکن نشست Bearer است نه کوکی**: ورود توکن را در بدنهٔ پاسخ می‌دهد (`data.token`) و مسیرهای محافظت‌شده `Authorization: Bearer` می‌خواهند — smoke و آیندهٔ سینک بر همین قرارداد.
6. **runtime-secret مشترک**: `sys_auth_secret` در settings (توسط engine تضمین می‌شود) + همان مقدار به‌عنوان `AUTH_SECRET` به هر دو ورکر — توکن بین اپ اصلی و بستهٔ بازی‌ها معتبر است.
7. **ENV=development برای میز**: کوکی‌ها/رفتارهای سخت-تولید روی http://127.0.0.1 مزاحم نمی‌شوند؛ data در پوشهٔ کاربر (فاز ۵: رمزگذاری در حال سکون).

## محدودیت‌ها (ثبت صادقانه)

- **قواعد `_headers`/`_redirects` پارسی و اعمال نمی‌شوند** — مانیفست فقط فایل‌های استاتیک را پوشش می‌دهد؛ هدرهای امنیتی از خود باندل ورکر می‌آیند (smoke سبز همین را تثبیت می‌کند).
- خروج به اینترنت (`globalOutbound`) بسته است — موتور آفلاین است؛ سینک ترکیبی فاز ۴ از مسیر خودش خواهد آمد.
- کرون‌های `wrangler.toml` (digest/reminder) در موتور محلی اجرا نمی‌شوند.
- `migrateDatabase` مینیفلر (ایجاد اولیهٔ دیتابیس D1 از طریق API خودش) بازسازی نشده — جای آن، مایگریشن مستقیم SQLite است که قراردادهای آزمون‌خوردهٔ ۲۲۸۳ e2e را دارد.
