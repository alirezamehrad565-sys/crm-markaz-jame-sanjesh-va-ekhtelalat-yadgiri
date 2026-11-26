# Backlog مهاجرت/بدهی فنی — خروجی AUD-4 (به‌روز sdt159)

تکمیل‌کنندهٔ `repodocs/decisions.md`. ترتیب پیشنهادی اجرا از بالا به پایینِ هر گروه است. «موج» جایگاه پیشنهادی در نقشهٔ راه است؛ تصمیم نهایی با کارفرما. بسته‌شده‌های sdt155 تا sdt161 از فهرست‌ها خارج شدند (۱۶ قلم sdt160 + ۴ معماری + سه تصمیم در sdt161) (security-005/007/008/009، data-001، data-005، performance-001، architecture-001، architecture-004، testing-002).

## صف high (۰)

خالی — پس از sdt159 هیچ قلم high بازی در رجیستری نیست.

## صف medium — خالی شد (sdt161)

چهار یافتهٔ معماری باقی‌مانده (arch-003/005/006/007) بسته شدند و سه تصمیم محصولی (playwright/TTL/CSP بوت) اجرا شد — ADR-019..021. performance-003 باز است (بند eager ≤۶ به دو فاساد باندلر گره دارد — پیشرفت در lifecycle ثبت است). صف low (۲۰ قلم) طبق سنت فقط با مأموریت صریح کارفرما.

## صف medium (باقی‌مانده پس از sdt160 — ۱۶ قلم بسته شد)

بسته‌شدگان این چرخه از فهرست خارج شدند: ui-003/005/006، bloat-005، stack-003، data-002/003/004/006، testing-003/004/005/007، architecture-002، performance-002، architecture-008.

## صف medium (باقی‌مانده — از این قرار: ۲ پذیرش‌شده + باقی صف)

پذیرش‌شده (ADR-006): stack-001، bloat-001.

صف: architecture-002 (حلقهٔ اعلان سه‌گانه)، architecture-003 (وابستگی معکوس domain→application)، architecture-005/006/007/008 (مرزهای لایه و زنجیرهٔ عمومی)، data-002 (FK روی exercise_file_chunks)، data-003 (FK و قید report_snapshots.student_id)، data-004 (نگهداشت audit_log/rum_events)، data-006 (تمرین بازیابی: راستی‌آزمایی restore)، performance-002 (رفت‌وبرگشت enqueue اعلان)، performance-003 (حاشیهٔ بودجهٔ مسیر بحرانی ~۲۳۶بایت)، stack-003 (workerd به‌عنوان ران‌تایم محلی)، testing-003 (واگرایی MockD1/RETURNING)، testing-004 (شاخهٔ X-Api-Key بی‌تست)، testing-005 (cron orchestration بی‌تست)، testing-007 (پنج ماژول بزرگ بی‌تست عمیق)، ui-003 (۱۲ اندازهٔ فونت خام خارج اسکیل)، ui-005 (server-pill بدون aria/role)، ui-006 (کنتراست #fff روی --danger تیره)، bloat-005 (۸۰ کلاس مردهٔ views.css)، واریانت q فهرست طرح‌های درمان (موج B2 sdt155 — service.ts:1287).

## صف low (۲۰ — خلاصهٔ گروهی)

bloat 6 (schemas/constants/exportهای مرده، اسکریپت‌های بی‌اشاره، dispatch دوبل اعلان) · stack 6 (web-vitals بی‌مصرف، wrangler 3.x، کف Node در Dockerfile/manifest، ObjectStore دوبل، scoring.js جابه‌جا، ارجاع اسکریپت‌های ناموجود) · performance 3 (LIKE %q% سراسری، سقف per-isolate، N+1 دیجست) · testing 3 (وابستگی ساعت دیوار، پین wrangler.prod.toml ناموجود در crons.test، node-main بی‌تست) · architecture 2 (probe/wrapper تکراری index.ts، ابزار دفن‌شدهٔ finance/routes).

## قاعدهٔ اجرا

هر مورد هنگام برداشتن از صف، هم‌الگوی موج‌های sdt154/155 رفتار می‌شود: یافته → اصلاح → گیت/تست تازه → کامیت مستقل → هم‌گام‌سازی همین backlog و رجیستری.
