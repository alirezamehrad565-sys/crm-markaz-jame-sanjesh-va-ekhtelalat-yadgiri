# یادداشت‌های ممیز testing — run «aud-20261124-8ca4227»

- مخزن: `/home/z/my-project/gh-rust`، شاخه `rust`، revision `8ca4227`، درخت تمیز، نسخهٔ اپ `1.27.74`
- روش: تحلیل استاتیک فقط‌خواندنی (اجرأ تست/بیلد ممنوع؛ بدون node_modules/dist/باندل؛ بدون شبکه؛ بدون jCodeMunch طبق ADRrevision 8ca4227)
- تاریخ ممیزی: 2026-11-24T22:16:13Z

## ۱. فهرست برداشت هارنس و پوشش کلی

- ۲۹۳ فایل تست با ۳٬۱۸۴ رخداد `it/test` (شمارش نحوی، نه شمارش اجرا):
  application 126 (102 در `src/application/__tests__` + 24 در زیرپوشه‌ها)، `src/__tests__` 79، domain 52، core 20، node-sync* 11 (node-sync 5، node-sync-runner 5، node-sync-client 1)، internal-sync 3، server 2.
- هارنس e2e (`src/test/harness.ts` ۲۹۰ خط): اپ واقعی `createApp` از `@app/api-routing` + MockD1 روی `node:sqlite` + اجرای کامل ۱۲+ مایگریشن `migrations/` + سید `scripts/seed-dev.sql` — تست‌ها همان مسیر پروداکشن را می‌پیمایند؛ الگوی قوی.
- `vitest.config.ts`: `environment: 'node'`، include فقط `src/**/__tests__` و `server/**/__tests__`؛ هیچ پروژهٔ DOM/مرورگری تعریف نشده و devDependencies هیچ ابزار jsdom/playwright/cypress ندارد.
- نقطهٔ قوت: `e2e-auth.test.ts` چرخهٔ نشست را کامل می‌پوشاند (login، logout→ابطال سمت‌سرور، نشست‌های مستقل، نشست منقضی، توکن legacy بدون sid، دستکاری توکن، throttle دومِ IP، پیام خطای عامدانهٔ یکسان برای کاربر ناشناس) — پادزهر خوب در برابر تأییدِ فقط-happy-path.

## ۲. کیفیت mock-d1.ts — چه چیزی شبیه‌سازی نمی‌شود (یافتهٔ testing-003)

- `isRowReturning` (خط ۳۳) فقط `SELECT|WITH|PRAGMA|EXPLAIN` را از آغاز می‌شناسد → `DELETE/INSERT ... RETURNING` به `run()` می‌رود و `all()/first()` در ماک `[]/null` می‌دهند در حالی که D1 واقعی سطرها را برمی‌گرداند. قربانی عینی: `src/application/client-errors/service.ts:121` (pruneOld → count همیشه ۰ در ماک؛ تست e2e-client-errors:151 به‌جای مقدار برگشتی، سطرهای DB را می‌سنجد) و `src/application/rum/service.ts:133`.
- `batch()` (خط ۸۸) فقط `{success, meta}` برمی‌گرداند — سطرهای نتیجهٔ هر statement در D1 واقعی دور ریخته می‌شود؛ مصرف‌کنندگان فعلی فقط `meta.changes` می‌خوانند (`src/node-sync/service.ts:789`) پس الان بی‌علامت، اما هر batch-خوانندهٔ آینده در تست با دادهٔ متفاوت می‌دود.
- `normalizeParam` (خط ۱۹) boolean را بی‌سروصدا به ۱/۰ می‌برد در حالی که D1 واقعی bind بولین را رد می‌کند — کلاسی از باگ‌ها در تست پنهان می‌ماند.
- نبودها: `meta.rows_read/rows_written` واقعی، `D1Database.exec/dump/session` (مصرف‌کنندهٔ فعلی در src وجود ندارد).

## ۳. پوشش auth در core/auth (یافته‌های testing-001 و testing-004)

| ماژول | خط | تست مستقیم | پوشش غیرمستقیم |
|---|---|---|---|
| middleware.ts | 166 | هیچ | شاخهٔ Bearer نشست (sid/ابطال/انقضا) و dev-bypass از e2e-auth؛ شاخهٔ CF Access و X-Api-Key هیچ |
| session-jwt.ts | 100 | هیچ | از مسیر e2e-auth (امضا/دستکاری/انقضا/legacy) |
| jwt.ts (verifyAccessToken) | 80 | هیچ | هیچ — مسیر احراز اصلی استقرار CF |
| password.ts | 79 | بله (password.test.ts) | — |
| api-keys.ts | 60 | فقط هلپرها (generate/hash/looksLike) | شاخهٔ middleware هیچ |
| login.ts / staff.ts / runtime-secret.ts | 24/33/76 | runtime-secret بله | login/staff فقط از راه e2e |
- نتیجه: احراز «نشست» به‌خوبی محافظت شده؛ دو مسیر احراز دیگر (CF Access JWT و X-Api-Key) بدون هیچ آزمون رفتاری‌اند.

## ۴. server/ و node-sync-client (یافته‌های testing-005 و testing-010)

- server ۵ فایل/۴۹۶ خط: crons.ts و static.ts تست دارند (پارس کرون، traversal/ETag/هدرها)؛ `cli.ts` (۸۷)، `env.ts` (۴۶)، `node-main.ts` (۱۰۹) هیچ — node-main فقط با smoke سلامت `/health` در ci.yml گام «Self-host build & smoke».
- `src/index.ts` (۴۰۴ خط): ورکر ورودی؛ `scheduled()` در خط ۳۸۵ با ~۲۷۰ خط هماهنگی کرون‌ها (digest، reminders، cp-sync/cp-report/cp-content، bug-report-forward، alert cycle، نگه‌داری audit) هیچ تستی فراخوانی‌اش نمی‌کند؛ سرویس‌های زیرمجموعه جدا تست شده‌اند اما ترتیب/ایزوله‌سازی خطا/پارس env نه.
- node-sync-client: ۱ فایل تست ولی باکیفیت — کلید غایب، cursor، whitelist push، throttled/retry_after، قطع شبکهٔ نرم؛ پوشش متناسب با ۳۶۱ خط client.ts.

## ۵. ماژول‌های بزرگ domain — نسبت کد به تست

| ماژول | خطوط prod | خطوط تست درون‌پوشه | فایل تست درون‌پوشه | پوشش غیرمستقیم e2e |
|---|---|---|---|---|
| clinical-engine | ۶٬۹۳۳ | ۲٬۵۷۵ | ۱۱ | e2e-clinical-engine و… |
| games | ۶٬۴۵۳ | ۳٬۲۹۰ | ۱۸ | ۹+ فایل e2e-games-* |
| exercise-bank | ۴٬۰۰۱ | ۶۲۴ | ۳ | e2e-exercise-bank/bot/files/packages |
| case-events | ۴٬۵۵۳ | ۵۵۳ | ۴ | e2e-case-event-forms، case-event-preview |
| waitlist | ۲٬۵۴۲ | ۳۹۱ | ۲ | e2e-waitlist، e2e-bot-waitlist |
| wechsler-engine | ۲٬۱۳۵ | ۰ | ۰ | فقط e2e-wechsler-restoration (یک پروفایل مرجع) |
| case-formulation | ۲٬۱۸۲ | ۰ | ۰ | e2e-case-formulation + cutoffs-12506 |
| student-profile | ۲٬۱۸۹ | ۰ | ۰ | e2e-students-domain و… |
| ot-engine | ۱٬۴۷۶ | ۰ | ۰ | e2e-ot-engine |
| finance | ۱٬۲۱۴ | ۰ | ۰ | e2e-finance |
- یافتهٔ testing-007: پنج ماژول بدون تست درون‌پوشه فقط از چند مسیر e2e عبور می‌کنند؛ مرزهای جداول نمره‌گذاری (IQ مقیاس‌نشده، قطع‌نامه‌ها) با تعداد انگشت‌شماری از ورودی‌ها آزمون می‌شوند.

## ۶. فرانت‌اند: گیت‌های متنی در برابر اجرا (یافتهٔ testing-002)

- ۸۴ فایل JS فرانت با ۴۲٬۶۳۱ خط (فقط views/ = ۲۵٬۸۰۹ خط).
- ۵۱ از ۵۶ فایل front-* با `readFileSync` + `toMatch` متنِ سورس را می‌سنجامند (نمونهٔ عینی: `front-12557.test.ts:15-64` — `expect(wh).toMatch(/const SHIFT_BREAK_MINUTE = 13 \* 60;/)`).
- تنها ۹ ماژول فرانت واقعاً import و اجرا می‌شوند: `ui.js`، `format.js`، `csv-rtl.js`، `taxonomy.js`، `feedback-sheet.js`، `profile/landing.js`، `profile/therapy-line.js`، `views/health-panel.js` (تست‌های رفتاری server-status/sync-status/updater)، `views/cloud-setup.js`. توجه: «import» در front-referral-inbox.test.ts:35 یک ادعای متنی است نه لبهٔ import واقعی (طبق قاعدهٔ طبقه‌بندی _common).
- نماهای بزرگ بدون هیچ اجرا: appointments (۱٬۶۷۳)، student-profile (۲٬۰۲۰)، exercises (۱٬۶۰۷)، clearbook (۱٬۴۲۳)، screening (۱٬۳۱۶)، working-day (۱٬۲۴۷)، settings (۹۹۰)، finance (۹۷۱). health-panel فقط سه دستهٔ تابع خالصش اجرا می‌شود؛ ۲٬۳۴۵ خط آن عمدتاً بدون اجراست.
- این گیت‌ها رگرسیون‌های پین‌شدهٔ نسخه‌ها را می‌گیرند ولی دو ضعف ساختاری دارند: با ریفکتور بی‌ضرر می‌شکنند (کپیِ implementation) و با شکست معنایی که توکن را نگه دارد سبز می‌مانند.

## ۷. گیت‌های scripts/*.mjs در برابر ci.yml — گام‌به‌گام (یافته‌های testing-006 و testing-009)

سیم‌شده در ci.yml (۱۵ گام): npm audit (فقط درخت تولید، سطح HIGH) → typecheck (tsc strict) → vitest → build:client → build-worker-bundle.mjs → `node --check worker/bundle.js` → build-worker-games.mjs → engine-smoke (workerd) → engine-smoke (adapter) → perf-budget.mjs → check-migrations-doc.mjs → check-versions.mjs → check-d1-compat.mjs → check-csp-hash.mjs → build:selfhost + smoke سلامت.
سیم‌نشده (دستی/اسنادی): `bench:gate` (اسناد CODE-QUALITY-BENCHMARK.md:88 «هر نسخه در زنجیرهٔ گیت‌ها» می‌خواهد)، `ui-voice-check.mjs`، `contrast-check.mjs`، `desktop:check`، `smoke:games`، `audit:sec` (sec-audit.mjs)، `bundle-smoke.mjs` (عمداً — توضیح در ci.yml:80-86)، `check-probe-flow`، `restore-drill`، `load:baseline`. desktop-build.yml جداگانه `check-versions.mjs` + `cargo test --all-targets` را می‌دود.
crons.test.ts:33 توازن کرون‌ها را با فهرست ثابت پین می‌کند و به `wrangler.prod.toml` ارجاع می‌دهد که وجود ندارد؛ wrangler.toml:19 فقط ۴ کرون دارد و `*/15` فقط در server/crons.ts است (فقط self-host) — توازن ماشین‌پذیر نیست.

## ۸. شکنندگی/وابستگی به زمان (یافتهٔ testing-008)

- صفر استفاده از `vi.useFakeTimers`/`setSystemTime` در کل مجموعه؛ ۳۸ فایل تست `Date.now()` مستقیم می‌خوانند.
- `quarterHourFromNow`/`tehranTodayAt` در harness (خط ۲۷۲–۲۸۴) پنجرهٔ نوبت‌ها را از ساعت دیوار با آفست ثابت ۲۱۰ دقیقه می‌سازند؛ ~۱۰ سوئیت e2e به آن‌ها وابسته‌اند → رفتار نزدیک نیمه‌شب تهران با میانهٔ روز فرق می‌کند.
- e2e-docs.test.ts:444 ترتیب بارگذاری را با خواب ۱۵ms تضمین می‌کند؛ e2e-rate-limit پنجرهٔ لغزان را با ساعت واقعی می‌شمارد.
- هیچ نشانهٔ flake مدیریت‌شده (retry/skip) وجود ندارد — تست‌ها یا سبزند یا قرمز سخت؛ البته هارنس محدودساز نرخ را با `API_RATE_LIMIT_PER_MIN: '0'` خاموش می‌کند تا رگبار ۴۲۹ آزمون‌های دیگر را نگیرد (تصمیم مستند در خود harness).

## ۹. دامنه و محدودیت‌ها

- شامل: src، server، scripts، .github/workflows، vitest.config.ts، package.json، public/assets/js، سه سند مرتبط.
- مستثنی: node_modules، dist، worker/bundle.js و worker/central-bundle.js (باندل تولید).
- بدون اسکن عمیق: desktop/src-tauri (فقط شمارش: ۹ فایل rs، ۴۷ صفت تست، cargo test در desktop-build.yml).
- هیچ فایل findings پیشین برای testing وجود نداشت (repodocs/audit/findings خالی بود) → همهٔ ۱۰ یافتهٔ این run «new» هستند و هیچ ID بازیافت نشده است.
