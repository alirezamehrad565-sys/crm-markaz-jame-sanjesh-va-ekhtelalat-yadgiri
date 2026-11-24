# یادداشت ممیزی performance — run_id: aud-20261124-8ca4227

> این یادداشت توسط عامل اصلی از خلاصهٔ ممیز بازنوشته شد (ممیز پیش از نوشتن فایل به سقف گام رسید؛ JSON یافته‌ها مستقیم توسط خود ممیز نوشته و valid شده است).

## محدوده و ابزارها

- revision: 8ca4227 (شاخه rust، نسخهٔ اپ 1.27.74، درخت تمیز) — تحلیل صرفاً استاتیک.
- jCodeMunch در دسترس نبود (ثبت در limitations)؛ تأیید ادعاها با خواندن مستقیم سورس انجام شد.
- بدون اجرای کد/پروفایل/بیلد و بدون شبکه (قرارداد ممیزی). desktop/، server/، worker/ (باندل تولیدی)، docs/ و scripts/ (به‌جز perf-budget.json) اسکن نشدند.

## یافته‌ها (۶)

1. **performance-001 · high · pending** — `src/core/storage/chunked-d1-store.ts:73-102`: خواندن پیوست D1 = COUNT + ⌈K/6⌉ کوئری متوالی OFFSET و atob کاراکتربه‌کاراکتر در هر خواندن؛ نوشتن K تا INSERT متوالی؛ تورم base64 حدود ۴/۳ حجم (سقف شیء ۵۰MB در `src/core/shared/constants.ts:308`)؛ مسیر پیش‌فرض پیوست exercise-bank/docs/knowledge/clearbook وقتی R2 بسته نشود (`src/application/api-routing/index.ts:220`).
2. **performance-002 · medium** — `src/application/api-routing/index.ts:370,400,427`: حلقهٔ enqueue اعلان per-گیرنده با ۲ رفت‌وبرگشت DB در هر chat (`src/core/notify/service.ts:75`) در سه ناظر تکراری؛ getClinicName بدون کش در هر رویداد (`src/application/settings/service.ts:322`).
3. **performance-003 · medium** — `scripts/perf-budget.json:5`: boot JS با حاشیهٔ ~۲۳۶ بایت از سقف ۵۰٬۴۰۰ و CSS بحرانی با حاشیهٔ ~۲۲۳ بایت از ۷۲٬۴۰۰؛ CSS یکپارچهٔ ~۹٬۹۶۰ خط (views ۴٬۸۶۹ + components ۱٬۸۱۳ + base ۹۱۲) در همهٔ صفحات. (عدد حاشیهٔ 47.8KB در brief اولیه کهنه بود؛ revision جاری حاشیهٔ ~۰.۲KB دارد.)
4. **performance-004 · low** — `src/application/search/service.ts:41,86` + `pure.ts:22`: LIKE «%q%» با wildcard پیشوندی روی ۵–۶ جدول؛ اسکن خطی با حجم جدول ولی LIMIT و Promise.all و مقیاس کلینیک → کم‌اثر.
5. **performance-005 · low** — `src/application/http/rate-limit.ts:6,52`: rate-limit per-isolate درون‌حافظه؛ بودجهٔ مؤثر = سقف × ایزولیت (خود کد مستند کرده)؛ حافظه با maxKeys=4096 بسته؛ پیامد اصلی امنیتی است — به ممیزی security ارجاع شد.
6. **performance-006 · low** — `src/application/notify/digest.ts:141`: دیجست شبانه SELECT per-chat روی notification_prefs (N+1 با N کوچک، یک‌بار در شب)؛ کرون‌های شبانهٔ digest+backup موازی در `src/index.ts:385` — backup جدول سنگین را بدون include_files کنار می‌گذارد (الگوی درست).

## سالم‌های تأییدشده (مستندسازی منفی)

- ایندکس‌های داغ: national_id UNIQUE، staff_bot_links(staff_id,chat_id)، notifications (dedup یکتا، status، dispatch)، appointment_students PK، waitlist، followups، todos — هم‌خوان با WHERE/JOINهای بررسی‌شده؛ کوئری inline staff_bot_links (`api-routing/index.ts:389`) ایندکس‌شده و سالم.
- SWR چهاردقیقه‌ای api.js (TTL 240s) و صفحه‌بندی backup سالم ارزیابی شدند.
