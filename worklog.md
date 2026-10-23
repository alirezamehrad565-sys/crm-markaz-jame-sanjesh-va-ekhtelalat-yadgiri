
---
Task ID: m170+m171
Agent: main (Z.ai)
Task: ساختن «پشتوانهٔ علمی / نحوهٔ استفاده» برای بقیهٔ ابزارها (تعمیم الگوی m169 به کل کتابخانه)

Work Log:
- TOOL_GUIDES در clinical-content.js: ابتدا ۲۵ کلید، بعد از مقایسه با API (۳۳ نوع فعال) تکمیل به ۳۳ کلید — پوشش ۱۰۰٪
- scienceNote() عمومی در ui.js (details تاشو science-guide) + CSS مشترک با rehab-fx-guide
- چهار نقطهٔ اتصال: openDynamicForm (همهٔ فرم‌های کتابخانه)، openChecklistSendModal (راهنمای زنده با تغییر قالب)، openProbeModal، openRehabFxModal
- راستی‌آزمایی مرورگری زنده روی تولید: مودال پروب (۵ بند ✓)، مودال ارسال چک‌لیست (به‌روزرسانی زنده هنگام تغییر قالب ✓)، مودال گزارش جلسهٔ OT از ۸ کلید جدید (✓)
- درس: اولین eval بعد از کلیک ممکن است قبل از باز شدن مودال (فراخوانی‌های API) اجرا شود — نتیجهٔ 'NO GUIDE' گمراه‌کننده بود
- دو نسخه: 1.00.46/m170 (۲۵ کلید) و 1.00.47/m171 (۳۳ کلید — هفت‌کلیدِ کشف‌شده از API: home_behavior، quick-multi-v1، ce-sdq-p-v1، ce-id-adapt-v1، ce-sld-class-t-v1، ce-needs-v1، intervention، ce-ot-session-v1)

Stage Summary:
- تولید: 1.00.47 / m171 — /health ✓، ۳۳ کلید در asset زنده ✓
- فرانت‌اند محض (بدون تغییر bundle/backend) — 1298 test ✓، tsc ✓
- باقی‌مانده (مایلستون بعدی): نمایش راهنما در صفحهٔ وب عمومی خانواده/معلم (لینک بله) — نیاز به دادهٔ سمت سرور و تغییر public-form.ts + bundle

---
Task ID: m173
Agent: main (Z.ai)
Task: حذف جای‌نگهدار مردهٔ «اقدام بعدی ثبت نشده» در پروفایل دانش‌آموز + هم‌اندازه‌سازی UX/UI نوار اکشن‌ها + طرح داکرایز کردن

Work Log:
- کشف از git history: مکانیک پیگیری در m166 حذف شده بود اما جای‌نگهدار «اقدام بعدی ثبت نشده / با ثبت نوبت آینده یا پیگیری باز…» مانده بود
- buildNextActionBlock(null) → null (اقدام واقعی: نوبت آینده/پیگیری باز، همچنان نمایش داده می‌شود)
- نوار اکشن‌ها: class جدید profile-actions (+__row) در views.css، ارتفاع یکنواخت ۳۴px دکمه‌ها و سلکت (لمسی ۳۸px)
- مودیفایر select--sm در components.css (padding-block 5px، fs-sm — هم‌قوارهٔ btn--sm) + تنظیم pointer:coarse
- آیکون متمایز: ارسال چک‌لیست → checklist، ارسال تمرین → file (قبلاً هر دو zap)
- سلکت مسئول پرونده: width auto + flex انعطاف‌پذیر (210–300px)، برچسب بدون شکستن خط
- bump چهارگانه: index.html ?v=، sw.js VERSION، version.ts، bundle.js — 1.00.49 / m173
- 1300 test ✓ · tsc 0 ✓ — deploy موفق (نسخهٔ اول APIError گذرا، تلاش دوم ✓)
- /health: {"ok":true,"db":"up","version":"1.00.49","milestone":"m173"} — assetها تأیید شد (جمله حذف شده، profile-actions و select--sm در CSS زنده)
- ممیزی کامل وابستگی‌های Cloudflare برای طرح داکر: D1 فقط از createDb + چند env.DB.prepare در auth؛ Hono 4.6؛ بدون WS/DO/KV/R2/Queues؛ secrets در D1؛ ASSETS لایهٔ config است
- کشف کلیدی: src/test/mock-d1.ts هم‌اکنون D1Database روی node:sqlite (Node≥22.5) را پیاده می‌کند و ۱۳۰۰ تست روی آن سبز است → درایور پروداکشن داکر از همین الگو
- سند docs/DOCKERIZE.md: ممیزی + معماری هدف (Caddy→node:22-alpine، @hono/node-server، node:sqlite WAL، node-cron) + Dockerfile/compose آماده + انتقال داده با d1 export + چک‌لیست سوئیچ (شامل setWebhook تلگرام) + مسیر جایگزین miniflare — تخمین کل ~۳–۴ روز کاری

Stage Summary:
- تولید: 1.00.49 / m173 — پروفایل دانش‌آموز تمیز شد (جای‌نگهدار مرده حذف، اکشن‌ها هم‌اندازه ۳۴/۳۸px)
- طرح داکرایز مستند شد؛ دو فایل کلیدی شروع (node-d1.ts، node-main.ts) در سند مشخص‌اند
