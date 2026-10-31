# راهنمای مشارکت

از علاقهٔ شما به بهبود این پروژه سپاسگزاریم! 🎉

## پیش از شروع

1. [`design.md`](./design.md) — قرارداد طراحی پروژه. در تعارض، همین سند برنده است.
2. [`README.md`](./README.md) را بخوانید تا با ماژول‌ها و راه‌اندازی محلی آشنا شوید.
3. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — معماری لایه‌ای و قرارداد ماژول‌ها.
4. [`docs/FILES.md`](./docs/FILES.md) — نقشهٔ فایل‌ها برای پیدا کردن سریع جای کد.
5. [`docs/CODE-STYLE.md`](./docs/CODE-STYLE.md) — قانون کامنت‌نویسی (فارسی محاوره‌ای، «چرا» نه «چه»).

## گزارش باگ یا پیشنهاد ویژگی

- برای باگ از قالب [Bug Report](/.github/ISSUE_TEMPLATE/bug_report.md) استفاده کنید.
- برای ایدهٔ جدید از قالب [Feature Request](/.github/ISSUE_TEMPLATE/feature_request.md).
- مسائل امنیتی را **هرگز ایشو عمومی نکنید** — طبق [`SECURITY.md`](./SECURITY.md) گزارش دهید.

## جریان کار Pull Request

1. مخزن را fork کنید و از `main` شاخهٔ جدید بسازید:
   ```bash
   git checkout -b feat/my-feature
   ```
2. تغییرات را با پیام‌کامیت قراردادی (Conventional Commits) ثبت کنید:
   ```
   feat(appointments): توضیح کوتاه فارسی
   fix(notify): توضیح کوتاه فارسی
   docs: توضیح کوتاه فارسی
   chore: پاک‌سازی متفرقه
   ```
   عنوان یک‌خطی و کوتاه بماند؛ جزئیات در بدنهٔ کامیت.
3. گیت‌های کیفیت را محلی سبز کنید:
   ```bash
   npm run typecheck      # tsc strict — صفر خطا
   npm test               # vitest — ۱۰۰٪ سبز
   ```
4. PR را با شرح فارسی مشکل/راه‌حل و اسکرین‌شات (برای تغییرات UI) باز کنید.

## قواعد کدنویسی این پروژه

- **کامنت‌ها فارسی محاوره‌ای** هستند؛ نام شناسه‌ها انگلیسی — قانون کامل در [`docs/CODE-STYLE.md`](./docs/CODE-STYLE.md).
- **معماری لایه‌ای** رعایت شود: `core` → `domain` → `application` (قانون وابستگی در ARCHITECTURE §۲.۲).
- هر ماژول ساختار استاندارد دارد: `types.ts` · `pure.ts` · `service.ts` · `routes.ts` · `index.ts`.
- **اسکیما فقط additive** از `migrations/` با شمارهٔ جدید — ویرایش فایل اعمال‌شده ممنوع.
- **نسخه در شش نقطه هم‌گام:** `src/core/version.ts` · `package.json` · `package-lock.json` · `public/index.html (?v=)` · `public/sw.js` · `CHANGELOG.md` — همیشه با هم بامپ می‌شوند؛ `worker/bundle.js` هم پس از آن از src بازتولید و بایتی مقایسه می‌شود.
  **دامنهٔ `?v=`:** فقط CSS/فونت/آیکون‌ها/theme-boot/لوگو. ورودی JS اپ `?v=` ندارد —
  `boot.[hash].js` نام‌دار است و `node scripts/build-client.mjs` آن را می‌سازد (در پیش‌پرواز دیپلوی خودکار؛
  `npm run dev` هم با `predev` اول می‌سازد).
- `worker/bundle.js` منبع حقیقت رفتار بک‌اند است — تغییر جراحی با تست کامل؛ بازتولید ممنوع.
- تاریخ‌ها: ذخیره ISO UTC، نمایش جلالی، مرز روزها با `Asia/Tehran`.
- تست برای رفتار جدید/اصلاح‌شده الزامی است (الگوی تست‌های موجود در `src/application/__tests__/`).

## سبک رفتاری

تعامل محترمانه الزامی است — [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
