# سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام

سیستم مدیریت کامل (CRM) مراکز سنجش و اختلالات یادگیری — مدیریت نوبت‌دهی، پروندهٔ دانش‌آموز،
ارزیابی و مسیر بالینی — بر بستر **Cloudflare Workers + D1 + Hono** با فرانت‌اند ES Module
خام (بدون bundler) و رابط کاربری کامل فارسی/RTL.

> 👤 **سازنده:** این برنامه توسط آیدی تلگرام [@sdt144](https://t.me/sdt144) ساخته شده است.

[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](tsconfig.json)
[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers%20%2B%20D1-F38020?logo=cloudflare&logoColor=white)](wrangler.toml)
[![Tests](https://img.shields.io/badge/tests-1083%20passed-brightgreen)](package.json)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

## ماژول‌های سامانه

| حوزه | محتوا |
|------|-------|
| نوبت‌دهی و تقویم | تقویم هفتگی شنبه‌محور، چنددرمانگره، کش‌ودرَپ، کپی از هفته، حضور جلسه‌ای |
| پروندهٔ دانش‌آموز | پروفایل زنده، برچسب‌ها، مدارس/کلاس/معلم، پیوست‌ها، تایم‌لاین |
| ارزیابی و سنجش | پرونده ارزیابی، غربالگری، باتری‌های سنجش، موتور تشخیص، نیم‌رخ وکسلر با ثبت نمرهٔ خام |
| مسیر بالینی | مسیر استاندارد، قالب‌ساز جلسات مداخله، آیتم‌های تمرین/تکلیف/بازی/دستورالعمل/رویداد |
| رویدادساز | ساخت فرم/پرسش‌نامهٔ جلسه/چک‌لیست/یادداشت با مخاطب خانواده/معلم |
| بانک تمرین | تمرین‌ها با پیوست فایل و بازی آنلاین + انتخابگر پیوست به جلسه‌ها |
| لیست انتظار | ثبت، وضعیت انتظار/تماس آخر، تبدیل اتمیک به پرونده و نوبت |
| گزارش‌ها | گزارش دوره، تحلیل پیشرفته، گزارش مدارس، همکاری معلم‌ها، خروجی CSV |
| بات بله | ربات نقش‌آگاه (مدیر/منشی/درمانگر/معلم/والد): یادآوری نوبت، تکلیف و بازگشت فایل، برنامهٔ کلاس |
| مدیریت عملیاتی | روز کاری، حضور همکاران، پیگیری‌ها، صندوق خروجی، بایگانی، امتیازبندی همکاران |
| دسترسی‌ها | نقش‌های مدیر/منشی/درمانگر + احراز JWT + audit append-only |

## وضعیت انتشار (نسخهٔ ۱.۰۰.۲)

- **تست:** ۱۰۸۳/۱۰۸۳ سبز (Vitest — ۹۱ فایل) · **tsc strict:** صفر خطا
- استقرار: Cloudflare Workers واحد + D1 + ۴ cron (یادآوری‌ها، خلاصهٔ روز، ساعت ارسال)
- فرانت: ۱۹ نما، RTL، تقویم جلالی، تم روشن/تاریک، skeleton لودینگ، موبایل‌فرندلی (۳۹۰px)
- PWA: manifest + service worker + آیکون‌ها

## راه‌اندازی محلی

```bash
npm install                                         # wrangler 3.x (عمداً v4 نه)
npx wrangler d1 create center-system-db             # database_id را در wrangler.toml بگذارید
npm run migrate:local                               # مایگریشن‌ها روی D1 محلی
npm run bootstrap                                   # روز صفر — فقط حساب مدیر (manager/1234)
npm run dev                                         # http://localhost:8787
```

- ورود اولیه: `manager / 1234` (فقط محلی — در تولید با `bootstrap:remote` و رمز دلخواه بسازید).
- هویت توسعه: کلیک روی چیپ نام کاربر (هدر `X-Dev-Staff-Id`) — فقط با `ENV=development` در `.dev.vars`.
- تم: دکمهٔ ماه/خورشید · جستجوی سراسری: `Ctrl+K`.
- اعلان‌ها/بات: secrets محلی در `.dev.vars` (`BALE_BOT_TOKEN`, `BALE_WEBHOOK_SECRET`) — تولید با `wrangler secret put`.

## استقرار تولید

```bash
CLOUDFLARE_API_TOKEN=<token حساب-محدود> \
CLOUDFLARE_ACCOUNT_ID=<شناسهٔ حساب شما> \
node scripts/update-remote.mjs --yes
```

یک فرمان، چهار گام امن: پیش‌پرواز → پشتیبان D1 → مایگریشن‌های اعمال‌نشده → `wrangler deploy --var ENV:production` → تأیید `/health`.
جزئیات کامل، بازیابی فاجعه و عیب‌یابی: [`docs/DEPLOY.md`](./docs/DEPLOY.md) · به‌روزرسانی استقرار موجود: [`docs/UPDATE.md`](./docs/UPDATE.md).

## گیت‌های کیفیت (قبل از هر انتشار)

```bash
npm run typecheck                                   # tsc --noEmit → صفر
npm test                                            # vitest run → ۱۰۰٪
```

## ساختار پروژه

```text
src/                  ← سورس TS لایه‌ای (core/domain/application)
worker/               ← ورودی دولایهٔ Worker + بک‌اند کامل + لایهٔ امتیاز
public/               ← پنل مدیریت (SPA بدون bundler) + assets
migrations/           ← تک‌منبع تغییرات اسکیما D1 (فقط additive)
scripts/              ← استقرار امن، باندل انتشار، seed ها
docs/                 ← مستندات فارسی
```

توضیح تک‌تک فایل‌ها و پوشه‌ها: [`docs/FILES.md`](./docs/FILES.md) · معماری کامل: [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md)

## قواعد طلایی

- **نسخه در چهار نقطه هم‌گام:** `src/core/version.ts` · `package.json` · `public/index.html (?v=)` · `worker/bundle.js` — `/health` همان را برمی‌گرداند.
- **بک‌اند:** `worker/bundle.js` منبع حقیقت رفتار بک‌اند است — تغییر جراحی، بدون بازتولید؛ سورس TS در `src/` آینهٔ ساختار و پشتوانهٔ تست‌هاست.
- **اسکیما فقط از `migrations/`** با الگوی افزودنی؛ اسکیمای دستی روی تولید ممنوع؛ پشتیبان خودکار پیش از هر استقرار.
- **زمان:** ذخیره ISO UTC؛ مرز روزها با `Asia/Tehran` (+03:30 ثابت)؛ شبکهٔ نوبت ۱۵ دقیقه‌ای؛ تداخل همیشه هشدار نرم.
- **نویسهٔ آیتم جلسه:** سقف ۵۰۰ نویسه، جداکنندهٔ «؛ » — انتخابگرها (تمرین/رویداد) خودشان رعایت می‌کنند.

## سندها

| سند | محتوا |
|-----|-------|
| [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) | معماری کامل ۴ لایه + قرارداد ماژول‌ها + نقشهٔ ماژول‌ها |
| [`docs/FILES.md`](./docs/FILES.md) | توضیح فارسی تک‌تک فایل‌ها و پوشه‌ها |
| [`docs/DEPLOY.md`](./docs/DEPLOY.md) | نصب از صفر، استقرار، بازیابی، عیب‌یابی |
| [`docs/UPDATE.md`](./docs/UPDATE.md) | به‌روزرسانی استقرار موجود بدون ریسک دیتابیس |
| [`docs/BOT-FLOW.md`](./docs/BOT-FLOW.md) | فلوی نقش‌آگاه بات بله |
| [`docs/EXERCISE-BANK.md`](./docs/EXERCISE-BANK.md) | طراحی بانک تمرین و حلقهٔ تکلیف |
| [`CHANGELOG.md`](./CHANGELOG.md) | تاریخچهٔ نسخه‌ها |

## مشارکت

مشارکت‌ها خوش‌آمد است! لطفاً [`CONTRIBUTING.md`](./CONTRIBUTING.md) را بخوانید.
گزارش باگ یا آسیب‌پذیری: [`SECURITY.md`](./SECURITY.md).

## حریم خصوصی داده‌ها

- این مخزن **فقط کد و اسکیما** است — هیچ دادهٔ واقعی (کارکنان، دانش‌آموزان، مدارس، پشتیبان‌های D1) در آن منتشر نمی‌شود؛ پشتیبان‌های تولید در `backups/` (نادیده‌گرفته‌شده) قرار می‌گیرند.
- `scripts/seed-dev.sql` دادهٔ آزمایشیِ ساختگی است (نام‌ها/کدملی‌های جعلی برای تست محلی).
- اسکریپت‌های seed تولیدی هیچ شناسه/رمز پیش‌فرضی ندارند — با `--user/--pass` یا `SEED_STAFF_ID/SEED_PASSWORD` داده می‌شوند.

## مجوز

انتشار تحت [مجوز MIT](./LICENSE) — ساختهٔ [@sdt144](https://t.me/sdt144).
