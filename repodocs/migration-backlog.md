# Backlog مهاجرت/بدهی فنی — خروجی AUD-4 نشست sdt155

تکمیل‌کنندهٔ `repodocs/decisions.md`. ترتیب پیشنهادی اجرا از بالا به پایینِ هر گروه است. «موج» جایگاه پیشنهادی در نقشهٔ راه است؛ تصمیم نهایی با کارفرما.

## صف high (۵)

| شناسه | موضوع کوتاه | موج پیشنهادی |
|---|---|---|
| architecture-001 | ترکیب DI در createApp/createServices — رفاکس با گیت رفتاری | موج رفاکس ۱ |
| architecture-004 | خروج لایهٔ HTTP از ۲۸ فایل domain | موج رفاکس ۲ |
| data-001 | شماره‌های تکراری/جاافتادهٔ مایگریشن در نصب تازه | موج داده — با گیت نصب از صفر |
| performance-001 | خواندن تکه‌ای پیوست D1 با پرس‌وجوهای متوالی | موج کارایی |
| testing-002 | شکنندگی گیت‌های regex-محور front | با مسیر گیت رندر واقعی |

## صف medium (۲۵ — از این قرار: ۴ پذیرش‌شده + ۲۱ صف)

پذیرش‌شده (ADR-004..006): security-007، security-009، stack-001، bloat-001.

صف: architecture-002 (حلقهٔ اعلان سه‌گانه)، architecture-003 (وابستگی معکوس domain→application)، architecture-005/006/007/008 (مرزهای لایه و زنجیرهٔ عمومی)، data-002 (FK روی exercise_file_chunks)، data-003 (FK و قید report_snapshots.student_id)، data-004 (نگهداشت audit_log/rum_events)، data-005 (ایندکس created_at روی audit_log — ارزان و پردردشت)، data-006 (تمرین بازیابی: راستی‌آزمایی restore)، performance-002 (رفت‌وبرگشت enqueue اعلان)، performance-003 (حاشیهٔ بودجهٔ مسیر بحرانی ~۲۳۶بایت)، stack-003 (workerd به‌عنوان ران‌تایم محلی)، testing-003 (واگرایی MockD1/RETURNING)، testing-004 (شاخهٔ X-Api-Key بی‌تست)، testing-005 (cron orchestration بی‌تست)، testing-007 (پنج ماژول بزرگ بی‌تست عمیق)، ui-003 (۱۲ اندازهٔ فونت خام خارج اسکیل)، ui-005 (server-pill بدون aria/role)، ui-006 (کنتراست #fff روی --danger تیره)، bloat-005 (۸۰ کلاس مردهٔ views.css)، واریانت q فهرست طرح‌های درمان (موج B2 sdt155 — service.ts:1287).

## صف low (۲۰ — خلاصهٔ گروهی)

bloat 6 (schemas/constants/exportهای مرده، اسکریپت‌های بی‌اشاره، dispatch دوبل اعلان) · stack 6 (web-vitals بی‌مصرف، wrangler 3.x، کف Node در Dockerfile/manifest، ObjectStore دوبل، scoring.js جابه‌جا، ارجاع اسکریپت‌های ناموجود) · performance 3 (LIKE %q% سراسری، سقف per-isolate، N+1 دیجست) · testing 3 (وابستگی ساعت دیوار، پین wrangler.prod.toml ناموجود در crons.test، node-main بی‌تست) · architecture 2 (probe/wrapper تکراری index.ts، ابزار دفن‌شدهٔ finance/routes).

## قاعدهٔ اجرا

هر مورد هنگام برداشتن از صف، هم‌الگوی موج‌های sdt154/155 رفتار می‌شود: یافته → اصلاح → گیت/تست تازه → کامیت مستقل → هم‌گام‌سازی همین backlog و رجیستری.
