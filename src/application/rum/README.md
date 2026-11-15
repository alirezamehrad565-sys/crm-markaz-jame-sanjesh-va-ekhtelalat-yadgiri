# rum — پایش کارایی از سوی کاربر (RUM) — 

تله‌متری بی‌نام Core Web Vitals برای تصمیم‌گیری داده‌محور در بهینه‌سازی سرعت.

## قرارداد

- **نوشتن عمومی:** `POST /public/rum` — بیرون از `authMiddleware` و گیت ناظر (الگوی `/public/announcements`).
  مرزها: اسکیمای zod ماژول (۵ سنجه، سقف ۱۰ رویداد per درخواست)، بدنهٔ ≤۴KB، محدودکنندهٔ نرخ درون‌حافظه (۱۲۰/دقیقه per isolate).
- **جمع‌بندی:** `GET /api/rum/summary?days=7` — فقط `manager` (ناظر هم ۴۰۳ می‌گیرد). خروجی: صدک p50/p75 + سهم «ضعیف» per سنجه.
- **حریم:** بدون IP، بدون User-Agent، بدون شناسهٔ کاربر/سشن — فقط اعداد کارایی + بافت فنی (نما/ویوپورت/نوع اتصال/PRM/تم).
- **ذخیره‌ساز:** جدول `rum_events` (مایگریشن ۰۰۸۶ — additive).
- **منبع فرانت:** `public/assets/js/rum.js` با عامل فروش‌شدهٔ `public/assets/vendor/web-vitals.attribution.js` (GoogleChrome/web-vitals، MIT).
