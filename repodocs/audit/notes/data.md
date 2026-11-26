# یادداشت ممیزی داده — run aud-20261124-8ca4227

ممیز: data · revision 8ca4227 · اپ 1.27.74 · فقط‌خواندنی؛ هیچ کوئری/بیلد/شبکه‌ای اجرا نشد.

## روش

- ۱۲۶ فایل `migrations/*.sql` شمرده و اسکیماهای کلیدی مستقیم خوانده شد (0001، 0010، 0013، 0021، 0026×2، 0036، 0057، 0086، 0106، 0107، 0109، 0110، 0113، 0115، 0118، 0119، 0122).
- مکانیزم اعمال: `scripts/update-remote.mjs` (wrangler d1 migrations apply --remote، ردیابی با نام فایل در `d1_migrations`) و `scripts/engine/apply-migrations.mjs` (مرتب‌سازی لغو‌نامه‌ای نام فایل برای موتور دسکتاپ). CI همگامی سند: `scripts/check-migrations-doc.mjs` طبق docs/MIGRATIONS.md.
- کد از `src/` خوانده شد؛ باندل‌های `worker/` طبق سیاست ممیزی باز نشدند.

## یافته‌ها (خلاصه — جزئیات و شواهد در findings/data.json)

- **data-001 (high, pending)** — رکورد ①: تکراری‌ها 0026/0046/0047/0101 + غیبت 0031/0065. در پروداکشن ترتیب واقعی 0026 برعکسِ مرتب‌سازی لغو‌نامه‌ای است (اول drop_central_records بعد central_data ⇒ جدول central_records در پروداکشن هست، در نصب تازه نیست). 0046/0047 «بازسازی‌شده از اسکیمای زنده» هستند و محتوای فایل هرگز روی پروداکشن اجرا نشده؛ `d1_migrations` فقط نام فایل را نگه می‌دارد نه هش محتوا ⇒ هم‌ارزی اسکیمای نصب تازه با پروداکشن اثبات‌ناپذیر است. همهٔ این‌ها در docs/MIGRATIONS.md مستند و سیاست «عدم تغییر فایل اعمال‌شده» ثبت است؛ ریسک باقی‌مانده، واگرایی ساختاری fresh-vs-prod است (schema diff فقط‌خواندنی لازم است).
- **data-002 (medium)** — رکورد ③: `exercise_file_chunks` (کلید TEXT بدون FK، PK (key,seq))؛ CASCADE روی exercise_attachments فقط ردیف متادیتا را پاک می‌کند نه chunkها؛ مسیر حذف تک‌پیوست `storage.delete` را صدا می‌زند (service.ts:1136) ولی مسیر حذف کل تمرین ردیابی نشد؛ هیچ sweep/retentionای برای chunkهای یتیم نیست.
- **data-003 (medium)** — رکورد ⑦: `report_snapshots.student_id` (0122) بدون REFERENCES و بدون هیچ DELETE در src ⇒ پس از حذف قطعی دانش‌آموز (student-profile/service.ts:1084، فهرست دستی جداول فرزند) اسنپ‌شات‌ها یتیم و بی‌سیاست نگهداری می‌مانند؛ الگوی حذف دستی + CASCADE دوجانبهٔ حقیقت است و با افزودن جدول جدید ممکن است drift کند.
- **data-004 (medium)** — رکورد ④: نگه‌داشت اجراشده: audit_log ۱۸۰روز (env قابل‌تغییر، writer.ts:123)، rum_events/client_errors ۹۰روز با ایندکس زمان. بی‌سیاست: node_push_events، node_sync_inbox، quota_usage (در 0113 صریحاً «هرس بعداً»)، report_snapshots، exercise_file_chunks؛ گزارش growth جدول‌های بی‌سیاست را لو می‌دهد ولی پاکسازی‌ای ندارد.
- **data-005 (medium)** — رکورد ②: audit_log ایندکس created_at ندارد (0001 فقط resource/actor) در حالی که prune شبانه و خواندن‌های بازه‌ای روی created_at فیلتر می‌زنند ⇒ فول‌اسکن شبانه. بقیهٔ کوئری‌های داغ پوشش ایندکسی دارند: appointments(staff_id,start_at,end_at)+start_at (0001/0021)، students(last_name,school_id)+UNIQUE(national_id)، waitlist چهار ایندکس 0013، assessments سه ایندکس 0010، client_errors/rum ایندکس زمان (0057/0086).
- **data-006 (medium)** — رکورد ⑤: `restore-drill.mjs` فقط فایل را آفلاین اعتبارسنجی می‌کند (قالب gh-backup v1، checksum SHA-256، تطبیق اسکیما با migrations) و هیچ بازیابی واقعی به دیتابیس اجرا نمی‌شود؛ بکاپ پیش‌ازdeploy در update-remote.mjs:193 قالب SQL خروجی wrangler d1 export است — قرارداد متفاوت از gh-backup JSON اپ؛ هم‌خوانی دو فرمت بازیابی‌پذیری آزموده نشده.

## مشاهدات بدون یافته (پوشش‌داده)

- ⑥ safeJsonEmbed (form-page.ts:294 و الگوی مشابه preview-form.ts:171) گریز `</>` و U+2028/2029 را درست انجام می‌دهد؛ اما هیچ سقف حجمی (مثل ۵۱۲KB ادعای دستور ممیزی) در این مسیرها پیدا نشد — سقف مذکور نامعلوم مانده (در limitations ثبت شد).
- sync نودها (0109/0110): sync_nodes کلید را فقط هش SHA-256 نگه می‌دارد؛ idempotency با PK (node_code,id)/(domain,id)؛ دامنه‌ها فهرست‌سفید تله‌متری است، دادهٔ بالینی ممنوع ساختاری؛ سازوکار «درفت نسخه‌ای» وجود ندارد و چون رویدادها فقط‌افزودنی تله‌متری‌اند، تعارض نسخه‌ای طرح‌ریزی نشده — به‌عنوان طراحی ثبت شد نه نقص.
- FK/ON DELETE: اکثر جداول دانش‌آموز-فرزند CASCADE دارند (0035، 0044، 0047، 0088/0089)؛ notifications/finance SET NULL؛ استثنا: assessments.student_id بدون ON DELETE (0010) — حذف قطعی به حذف دستی در همان تراکنش تکیه دارد و report_snapshots اصلاً FK ندارد (data-003).
- پشتیبان محلی دسکتاپ: `scripts/ops/export-local-backup.mjs` موجود است؛ بازیابی درون‌اپی با جایگزینی کامل جداول در یک batch اتمیک (backup/service.ts).

## پوشش‌نیافته / محدودیت‌ها

- وضعیت واقعی `d1_migrations` پروداکشن فقط از طریق docs/MIGRATIONS.md (ادعای سند) شناخته شد — هیچ کوئری فقط‌خواندنی اجرا نشد.
- تابع کامل حذف دانش‌آموز فقط بخشی (حدود 1040–1100) خوانده شد؛ جداول حذف‌شده در ابتدای تابع برشمرده نشد.
- مسیر حذف کل تمرین (routes.ts:270) از نظر پاکسازی chunkها ردیابی نشد.
- سقف ۵۱۲KB ادعایی safeJsonEmbed در مسیرهای بازرسی‌شده یافت نشد.
- desktop/، src/__tests__، scripts/load، docs/rust اسکن نشدند.
