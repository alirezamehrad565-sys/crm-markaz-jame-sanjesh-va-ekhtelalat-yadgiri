# راهنمای مشارکت

از علاقهٔ شما به بهبود این پروژه سپاسگزاریم! 🎉

## پیش از شروع

1. [`README.md`](./README.md) را بخوانید تا با ماژول‌ها و راه‌اندازی محلی آشنا شوید.
2. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — معماری لایه‌ای و قرارداد ماژول‌ها. **پیش از هر توسعه‌ای یک‌بار بخوانید.**
3. [`docs/FILES.md`](./docs/FILES.md) — نقشهٔ فایل‌ها برای پیدا کردن سریع جای کد.

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
   ```
3. گیت‌های کیفیت را محلی سبز کنید:
   ```bash
   npm run typecheck      # tsc strict — صفر خطا
   npm test               # vitest — ۱۰۰٪ سبز
   ```
4. PR را با شرح فارسی مشکل/راه‌حل و اسکرین‌شات (برای تغییرات UI) باز کنید.

## قواعد کدنویسی این پروژه

- **کامنت‌ها و پیام‌های کاربر فارسی** هستند؛ نام شناسه‌ها انگلیسی.
- **معماری لایه‌ای** رعایت شود: `core` → `domain` → `application` (قانون وابستگی در ARCHITECTURE §۲.۲).
- هر ماژول ساختار استاندارد دارد: `types.ts` · `pure.ts` · `service.ts` · `routes.ts` · `index.ts`.
- **اسکیما فقط additive** از `migrations/` با شمارهٔ جدید — ویرایش فایل اعمال‌شده ممنوع.
- **نسخه در چهار نقطه هم‌گام:** `src/core/version.ts` · `package.json` · `public/index.html (?v=)` · `worker/bundle.js`.
- `worker/bundle.js` منبع حقیقت رفتار بک‌اند است — تغییر جراحی با تست کامل؛ بازتولید ممنوع.
- تاریخ‌ها: ذخیره ISO UTC، نمایش جلالی، مرز روزها با `Asia/Tehran`.
- تست برای رفتار جدید/اصلاح‌شده الزامی است (الگوی تست‌های موجود در `src/application/__tests__/`).

## سبک رفتاری

تعامل محترمانه الزامی است — [`CODE_OF_CONDUCT.md`](./CODE_OF_CONDUCT.md).
