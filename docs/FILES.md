# نقشهٔ فایل‌ها — توضیح تک‌تک فایل‌ها و پوشه‌ها

راهنمای فارسی ساختار مخزن. برای معماری مفهومی [`ARCHITECTURE.md`](./ARCHITECTURE.md) را ببینید.

## ریشهٔ پروژه

| فایل | توضیح |
|------|-------|
| `README.md` | معرفی سامانه، ماژول‌ها، راه‌اندازی محلی و استقرار |
| `CHANGELOG.md` | تاریخچهٔ نسخه‌ها بر اساس Keep a Changelog |
| `LICENSE` | مجوز MIT |
| `package.json` | وابستگی‌ها (hono، zod) و اسکریپت‌های npm (dev/test/typecheck/migrate/…) |
| `package-lock.json` | قفل دقیق نسخهٔ وابستگی‌ها برای نصب تکرارپذیر (`npm ci`) |
| `tsconfig.json` | پیکربندی TypeScript strict با alias های `@core/@domain/@application` |
| `vitest.config.ts` | پیکربندی اجرای تست‌های واحد و e2e (محیط workers) |
| `wrangler.toml` | پیکربندی Cloudflare Workers: ورودی، assets، D1، cron ها، متغیرها و secrets |
| `.gitignore` / `.gitattributes` | قواعد گیت: نادیده‌گرفتن‌ها + یکسان‌سازی خط پایان و آمار زبان |

## `src/` — سورس TypeScript لایه‌ای

> هر ماژول ساختار استاندارد دارد: `types.ts` (تایپ‌ها) · `pure.ts` (منطق محض) · `service.ts` (سرویس) · `routes.ts` (مسیرهای REST) · `index.ts` (barrel) · `README.md` (سند ماژول).

### `src/core/` — لایهٔ ۱: زیرساخت مشترک (وابسته به هیچ ماژولی نیست)

| فایل/پوشه | توضیح |
|-----------|-------|
| `core/shared/` | ابزارهای مشترک: `time.ts` (منطقهٔ زمانی تهران و مرز روزها)، `national-id.ts` (کدملی)، `schemas.ts` (اسکیمای Zod)، `constants.ts`، `types.ts`، `features.ts` (کلیدهای فیچر) |
| `core/db/` | کلاینت D1 و helper های کوئری (`client.ts`) |
| `core/auth/` | احراز هویت هسته: `jwt.ts` (توکن پنل)، `session-jwt.ts`، `password.ts` (هش رمز)، `login.ts` (ورود با تلاش‌محدود)، `api-keys.ts`، `middleware.ts` (گارد نقش)، `runtime-secret.ts` (خواندن امن secret)، `staff.ts` |
| `core/audit/` | ثبت رخدادهای audit به‌صورت append-only (`writer.ts`) |
| `core/errors/` | کلاس‌های خطای تایپ‌دار (۴xx/۵xx ساخت‌یافته) |
| `core/logger/` | لاگر ساخت‌یافتهٔ Worker |
| `core/notify/` | هستهٔ اعلان: `bale/` (کلاینت بات بله: `client.ts`، `webhook.ts`، `media.ts`)، `templates.ts` (قالب پیام‌ها)، `service.ts` (صف/ارسال/dedup)، `repository.ts`، `internal-channel.ts` |
| `core/storage/` | ذخیره‌سازی فایل: `d1-store.ts` (پیش‌فرض، سقف ۵۱۲KB)، `r2-store.ts` (ظرفیت بالا)، `chunked-d1-store.ts` (فایل تکه‌تکه) |
| `core/version.ts` | تک‌منبع نسخهٔ سامانه (`APP_VERSION`) — با package.json و index.html هم‌گام |

### `src/domain/` — لایهٔ ۲: منطق دامنه (یکی ماژول به‌ازای هر حوزهٔ کاری)

| ماژول | توضیح |
|-------|-------|
| `student-profile/` | پروندهٔ دانش‌آموز: CRUD، مدارس/کلاس/معلم، تاریخچهٔ تحصیلی (`repository.ts` دسترسی داده) |
| `appointment-core/` | هستهٔ نوبت‌دهی: ساخت/ویرایش/لغو، `week-copy.ts` (کپی هفته)، قواعد شبکهٔ ۱۵ دقیقه‌ای |
| `conflict-engine/` | موتور تشخیص تداخل نوبت‌ها (هشدار نرم) |
| `working-hours/` | ساعات کاری مرکز و درمانگرها + `rules.ts` قواعد تولید اسلات |
| `working-day/` | بورد روز کاری: یادداشت‌ها و وضعیت عملیاتی |
| `attendance/` | حضور و غیاب دانش‌آموزان + کارکنان (`staff.ts`) |
| `waitlist/` | لیست انتظار: ثبت، تماس، تبدیل اتمیک به پرونده/نوبت |
| `screening/` | غربالگری ورودی |
| `tags/` | برچسب‌گذاری مشترک (دانش‌آموز/تمرین/…) |
| `case-events/` | رویدادساز: فرم/پرسش‌نامه/چک‌لیست + `public-form.ts` (فرم عمومی خانواده/معلم) |
| `clinical-engine/` | موتور بالینی: باتری‌های سنجش (JSON در همین پوشه)، `rules.ts`، `infer.ts` (استنتاج)، `narrative.ts` (متن روایت)، `targets.ts` (اهداف مداخله)، `dsm-criteria.ts`، `instruments.ts` |
| `ot-engine/` | چک‌لیست‌های کاردرمانی (OT) و بررسی علمی |
| `exercise-bank/` | بانک تمرین: کاربرگ/بازی/دستورالعمل + `multipart.ts` (آپلود فایل) |
| `followups/` | پیگیری‌ها: گروه‌بندی امروز/عقب‌افتاده، هوک‌های خودکار از جلسه و لیست انتظار |
| `todos/` | کارهای داخلی هماهنگی منشی↔مدیر |
| `knowledge/` | پایگاه دانش داخلی مرکز |
| `staff/` | کارکنان، نقش‌ها و پوزیشن‌ها |
| `announcements/` | اعلان مدیر: بنر ورود + پنل |

### `src/application/` — لایهٔ ۳: سرویس‌های کاربردی و HTTP

| ماژول | توضیح |
|-------|-------|
| `api-routing/` | نقطهٔ اتصال همهٔ ماژول‌ها به ورودی Worker (composition root) |
| `auth/` | ورود پنل و نشست کاربر |
| `dashboard/` | KPI ها، جمع‌بندی‌ها و هدف غربالگری (`kpis.ts`, `screening-goal.ts`) |
| `reports/` | گزارش دوره، تحلیل پیشرفته، گزارش مدارس (`pure.ts` محاسبات محض) |
| `search/` | جستجوی سراسری چندموجودیتی |
| `student-timeline/` | تایم‌لاین یکپارچهٔ رویدادهای پرونده |
| `session-notes/` | گزارش جلسه و اقدام بعدی |
| `special-needs/` | برنامهٔ نیازهای ویژه |
| `settings/` | تنظیمات مرکز |
| `keys/` | کلیدهای API با قطع فلگی |
| `notify/` | اعلان‌های کاربردی: `reminders.ts` (یادآوری نوبت)، `digest.ts` (خلاصهٔ روز)، `batch.ts` (ساعت ارسال)، `lifecycle.ts`، و بات‌های نقش‌آگاه: `awareness-bot.ts`، `case-events-bot.ts`، `exercise-bank-bot.ts`، `exercise-submission-bot.ts`، `student-actions-bot.ts`، `waitlist-intake-bot.ts` |
| `http/` | زیرساخت پاسخ/خطای HTTP (`responses.ts`, `error-handler.ts`) |

### `src/index.ts`
نقطهٔ ورود آینهٔ TS (ساخت‌یافته برای تست) — همان رفتار `worker/bundle.js`.

### تست‌ها
- `src/application/__tests__/` — ۹۰ فایل تست واحد و e2e (با D1 شبیه‌سازی‌شده)
- `src/__tests__/format-front.test.ts` — تست قالب‌بندی فرانت
- `src/test/` — هارنس مشترک: `harness.ts` (اپ تستی) و `mock-d1.ts` (D1 درون‌حافظه‌ای)

## `worker/` — بک‌اند استقراری

| فایل | توضیح |
|------|-------|
| `entry.js` | ورودی دولایه: مسیرهای `/api/scoring/*` به لایهٔ امتیاز، بقیه به باندل؛ `scheduled` (cron) عبوری |
| `bundle.js` | بک‌اند کامل سامانه (Hono + D1) — منبع حقیقت رفتار زنده؛ تغییر جراحی |
| `scoring.js` + `scoring.d.ts` | لایهٔ امتیاز سراسری: پروجکشن فقط-خواندنی از audit_log + جدول‌های محتوا |

## `public/` — پنل مدیریت (SPA بدون bundler)

| فایل/پوشه | توضیح |
|-----------|-------|
| `index.html` | پوستهٔ اپ: منو، سایدبار، لودینگ ماژول‌ها با `?v=` نسخه |
| `manifest.webmanifest` + `sw.js` | PWA: مانیفست و سرویس‌ورکر |
| `_headers` | هدرهای امنیتی/کش Cloudflare Pages-استایل |
| `assets/css/` | `tokens.css` (متغیرهای تم)، `base.css`، `components.css`، `views.css` (دارک‌مود و موبایل داخل همه) |
| `assets/img/` | لوگو و آیکون‌های PWA |
| `assets/js/ui.js` | کامپوننت‌های پایه: مودال، toast، tabs، فرم‌ساز |
| `assets/js/api.js` | کلاینت HTTP فرانت (fetch با خطای یکدست) |
| `assets/js/app.js` | بوت‌استرپ اپ، منو، badge ها |
| `assets/js/router.js` | روتر hash-based نماها |
| `assets/js/state.js` | حالت سراسری فرانت |
| `assets/js/format.js` | قالب‌بندی تاریخ جلالی/اعداد/پول |
| `assets/js/charts.js` | نمودارهای ستونی/دونات SVG خام |
| `assets/js/theme-boot.js` | تم روشن/تاریک (بدون فلش لودینگ) |
| `assets/js/login.js` | صفحهٔ ورود |
| `assets/js/global-search.js` | جستجوی سراسری (Ctrl+K) |
| `assets/js/jalali-picker.js` | تقویم جلالی انتخاب تاریخ |
| `assets/js/clinical-content.js` | تک‌منبع محتوای مسیر بالینی (انواع آیتم جلسه و…) |
| `assets/js/clinical-insights.js` | مسیر بالینی: قالب‌ساز و جلسات مداخله |
| `assets/js/event-pick.js` / `exercise-pick.js` | انتخابگر رویدادساز / بانک تمرین در قالب‌ها |
| `assets/js/exercise-send.js` | ارسال تمرین به خانواده |
| `assets/js/waitlist.js` | فرانت لیست انتظار |
| `assets/js/my-todos.js` | کارت «کارهای من» داشبورد |
| `assets/js/tagging.js` | رابط برچسب‌گذاری |
| `assets/js/staff-hue.js` | رنگ اختصاصی همکاران در تقویم |
| `assets/js/case-events.js` / `case-event-icons.js` / `case-formulation.js` | رویدادساز فرانت + آیکون‌ها + فرمولاسیون |
| `assets/js/announcements.js` / `announcements-admin.js` | بنر اعلان + پنل مدیریت اعلان |
| `assets/js/archive-form.js` | فرم بایگانی/صندوق خروجی |
| `assets/js/knowledge-admin.js` | پنل پایگاه دانش |
| `assets/js/ot-checklist.js` | چک‌لیست کاردرمانی فرانت |
| `assets/js/session-type.js` | انواع جلسه |
| `assets/js/student-form.js` | فرم افزودن/ویرایش دانش‌آموز |
| `assets/js/illustrations.js` | تصاویر SVG داخلی (بدون فایل خارجی) |
| `assets/js/views/` | ۱۹ نمای پنل: `dashboard`، `students`، `student-profile`، `appointments`، `working-day`، `working-hours`، `staff`، `reports`، `templates` (قالب‌ساز مسیر)، `exercises` (بانک تمرین)، `screening`، `special-needs`، `schools`، `settings`، `archive`، `outbox`، `case-event-types` (رویدادساز)، `progress-board`، `help` |

## `migrations/` — اسکیمای D1

فایل‌های شماره‌دار `NNNN_<نام>.sql` — فقط **افزودنی** (additive): جدول‌ها/ستون‌های هر ماژول
از نوبت‌دهی و اعلان‌ها تا باتری‌های بالینی، مسیر استاندارد مداخله و قالب جلسات.
هرگز فایل اعمال‌شده را ویرایش نکنید — تغییر اسکیما = فایل جدید.

## `scripts/` — ابزارهای عملیاتی

| فایل | توضیح |
|------|-------|
| `update-remote.mjs` | استقرار امن چهارگامی: پیش‌پرواز → پشتیبان D1 → مایگریشن → deploy → تأیید |
| `build-bundle.mjs` | ساخت باندل انتشار zip (بدون node_modules/backups) |
| `bootstrap.sql` | روز صفر: فقط حساب مدیر (رمز از آرگومان/متغیر) |
| `seed-dev.sql` | دادهٔ آزمایشی ساختگی برای dev محلی |
| `seed-schools.mjs` | درج مدارس از CSV روی استقرار هدف (بدون اعتبار پیش‌فرض) |
| `seed-classes-teachers.mjs` | seed کلاس‌ها و معلم‌های هر مدرسه |
