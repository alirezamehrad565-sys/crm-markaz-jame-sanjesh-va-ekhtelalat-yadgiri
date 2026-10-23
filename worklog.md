
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
