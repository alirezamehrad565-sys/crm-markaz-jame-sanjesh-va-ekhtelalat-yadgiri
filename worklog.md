# worklog — سامانه مرکز جامع (center-system)

آخرین به‌روزرسانی: 2026-10-23 — m169 / 1.00.45
این فایل عمداً داخل مخزن نگه‌داری می‌شود تا بعد از بازنشانی workspace از GitHub برگردد.

## وضعیت تولید
- URL: https://center-system.sanjeshm.workers.dev — بررسی: `curl -s https://center-system.sanjeshm.workers.dev/health` → `{"ok":true,"db":"up","version":...,"milestone":...}`
- ریپو: `/home/z/my-project/gh-work` (branch main — GitHub: alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri)
- پیش‌نمایش چت: سرور استاتیک :3000 روی `/home/z/my-project/www/index.html` (ردیّافت به تولید) — Caddy :81 دست root است و قابل تغییر نیست

## دستورهای کلیدی
- دیپلوی تولید:
  ```
  cd /home/z/my-project/gh-work && export CLOUDFLARE_API_TOKEN=<TOKEN — در chat context> CLOUDFLARE_ACCOUNT_ID=666575717adac931e0cd175d1310c4bf && npx wrangler deploy
  ```
- D1 ریموت: `npx wrangler d1 execute center-system-db --remote --command "..." --json`
- ورود برای تست API: `POST /api/auth/login` با `{username:"2520151110", password:"1234"}` → `data.token`
- تست کامل: `npx vitest run` · تایپ‌چک: `npx tsc --noEmit`

## چک‌لیست هر مایلستون (نسخهٔ چهارتایی)
1. `public/index.html` — همهٔ `?v=` bump شود
2. `public/sw.js` — `VERSION`
3. `src/core/version.ts` — `APP_VERSION` / `APP_MILESTONE`
4. `worker/bundle.js` — منبع استقرار زنده (سطرهای `APP_VERSION`/`APP_MILESTONE` داخلش هم bump شود) — تغییرات backend جراحی و کامل باشد
5. `CHANGELOG.md` + همین `worklog.md` + `npx vitest run` (باید کامل سبز شود) + `tsc --noEmit` + deploy + verify `/health`

## SOP بازیابی بعد از rollback فضای کار (دو بار رخ داده)
1. `cd gh-work && git fetch origin && git reset --hard origin/main`
2. اگر فایل‌های اپ قدیمی (scaffold Next.js) دوباره ظاهر شدند، حذفشان کن
3. راه‌اندازی دوباره :3000:
   `nohup python3 -m http.server 3000 --bind 0.0.0.0 --directory /home/z/my-project/www > /tmp/www3000.log 2>&1 &`
4. worklog.md اکنون داخل مخزن است — این فایل با reset از GitHub برمی‌گردد

## تاریخچهٔ مایلستون‌ها (خلاصه — کامل در git log)
- m169 / 1.00.45 — حذف کامل پروتکل عملکردی شناختی ce-rehab-cogperf-v1 (نظر کاربر: طراحی خوب نبود) + ساده‌سازی شدید متن «پشتوانهٔ علمی و نحوهٔ استفاده» خط پایه + رفع شمارنده‌های «کارنامهٔ من» این بار در bundle + این فایل به مخزن اضافه شد
- m168 / 1.00.44 — بازطراحی علمی فرم شناختی → پروتکل ۱۲تکلیفی ce-rehab-cogperf-v1 (در m169 کامل حذف شد) + رفع شمارنده (فقط در src مانده بود، به bundle نرسیده بود) + سه سند docs/clinical (حذف‌شده در m169)
- m167 / 1.00.43 — گزارش جلسه‌به‌جلسه + پاک‌سازی مخزن (~۱۲٬۷۰۰ خط کامنت نویز از ۴۴۳ فایل)
- m166 / 1.00.42 — پالیش سراسری UI/UX بر اساس فهرست ۱۰ ایراد کاربر
- m165 / 1.00.40–41 — تب مداخلهٔ توانبخشی (پیش‌فرض چک‌لیست مهارتی جلسه‌به‌جلسه + پنل پیشرفت) + انتقال چک‌لیست از «ارزیابی عملکردی» به «مداخله»
- m164 / 1.00.39 — گزارش پیشرفت چاپی PDF (شیب OLS + RCI)
- m163 / 1.00.38 — بلوک تاشوی «پشتوانهٔ علمی و نحوهٔ استفاده» + بازسنجی از پنل پیشرفت
- m162 / 1.00.37 — فلوی مسیر توانبخشی: ترتیب «ارزیابی عملکردی ← چک‌لیست مهارتی»
- m161 / 1.00.36 — فرم «ارزیابی عملکردی توانبخشی ذهنی» ce-rehab-fx-v1 (خط پایهٔ شش‌حیطه‌ای) + گیت‌های مسیرآگاه
- m160 / 1.00.35 — پروب‌های مرکزی CBM خواندن/نوشتن/حساب + بازطراحی مرحلهٔ ۴ حالت SLD

## نقشهٔ راه فعلی (تنها جهت ارتقا: علمی‌سازی)
- پرسش‌نامه‌ها علمی‌تر شوند
- مسیر اختلال یادگیری و مسیر توانبخشی علمی‌تر شوند
- بانک تمرین: افزودن فعالیت‌های علمی
- بلوک «پشتوانهٔ علمی و نحوهٔ استفاده» برای بقیهٔ ابزارها هم ساخته شود (الگو: REHAB_FX_GUIDE در clinical-content.js)
- درس m168/m169: متن راهنما باید فارسیِ ساده و قابل فهم باشد؛ فرم/پروتکل جدید بدون تأیید طراحی کاربر ساخته نشود

## قراردادها و نکات
- PATCH pathway-templates نیاز به body کامل دارد؛ steps قالب باید key/hint داشته باشند
- اسکریپت‌های موقت در `/home/z/my-project/scripts/` (نه /tmp)
- بازخورد کاربر روی متن: فارسی ساده، جملات کوتاه، بدون اصطلاح تخصصی
- خطوط RTL در ترمینال ممکن است به‌هم‌ریخته نمایش داده شوند (`const [m...` مثل `const onth...` دیده شد) — با Read/tsc راستی‌آزمایی شود

---
Task ID: m169
Agent: main (Z.ai)
Task: حذف فرم جدید (پروتکل عملکردی شناختی ce-rehab-cogperf-v1) + بازیابی worklog به مخزن + ساده‌سازی شدید متن «پشتوانهٔ علمی و نحوهٔ استفاده» خط پایه

Work Log:
- کشف rollback فضای کار: HEAD محلی m165 بود، worklog.md حذف شده بود؛ با git reset --hard origin/main به m168 برگشت
- بازگشت جراحی m168→m167: pure/routes/service/types.ts + clinical-content.js + clinical-insights.js؛ حذف ۳ سند docs/clinical + e2e-cog-perf.test.ts + migration 0065
- کشف مهم: رفع شمارنده‌های «کارنامهٔ من» (مرز UTC/تهران) در m168 فقط در src بود و به worker/bundle.js نرسیده بود (نسخهٔ زنده ۱.۰۰.۴۴ بدون رفع بود) → رفع جراحی روی bundle (پایه m167) اعمال شد
- REHAB_FX_GUIDE با ۶ بند فارسی ساده بازنویسی شد (حذف اصطلاحات: سازه/زدپد/least-to-most prompting/تک‌آزمودنی A→B)
- wrangler.prod.toml (gitignored، حاوی شناسه‌های واقعی) در rollback از بین رفته بود → بازسازی شد (account 6665…c4bf / db cf6bae8d-d574-4b8e-8a99-3b7462ef3f9e)
- worklog.md به مخزن اضافه شد (از .gitignore خارج شد) — نسخهٔ مخزنی توکن ندارد، نسخهٔ محلی /home/z/my-project/worklog.md توکن کامل دارد
- D1: migration 0065 اعمال شده بود و cogperf در تولید اصلاً ساخته نشده بود (صفر رویداد) → فقط ce-rehab-cog-v1 دوباره active=1 شد
- نسخهٔ چهارتایی bump: 1.00.45 / m169 + CHANGELOG + 1298 test ✓ + golden ✓ + tsc 0 ✓

Stage Summary:
- تولید: 1.00.45 / m169 — /health ✓، cogperf در types نیست ✓، ce-rehab-cog-v1 فعال ✓، متن سادهٔ راهنما در asset زنده ✓
- commit: 94bc13a (m169) + 8fb1c6b (worklog follow-up) — push شده به origin/main
