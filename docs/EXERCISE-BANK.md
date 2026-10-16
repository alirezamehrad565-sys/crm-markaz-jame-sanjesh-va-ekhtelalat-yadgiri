# EXERCISE-BANK — بانک تمرین و کاربرگ + حلقهٔ تکلیف بله ( / S3)

> **وضعیت:** پیاده‌سازی شد — هر دو زیرفاز کامل:
> **** بانک فایل + آپلود درگ‌اند‌دراپ + برچسب‌گذاری + جریان تو‌در‌توی بات + ارسال تکلیف به اولیا؛
> ** (حلقهٔ بازگشت فایل):** خانواده عکس/فایل نتیجه را در بات می‌فرستد → webhook رسانه‌ای → دانلود با Bot API → ObjectStore → رکورد بازگشت + done شدن تکلیف → اعلان به ثبت‌کنندهٔ تکلیف → چسبیدن به تایم‌لاین پرونده.
> **قانون اجرا:** همان انضباط همیشگی — migration فقط additive، تست سبز در هر فاز، `tsc strict` تمیز، باندل و worklog.

---

## ۰. هدف و شرح

بانک مرکزی از **تمرین‌ها/کاربرگ‌ها/بازی‌های آموزشی** با فایل پیوست، به تفکیک برچسب (پایه، نوع اختلال، …). درمانگر/معلم از طریق پنل فایل را با **درگ‌اند‌دراپ** آپلود و برچسب می‌زند و از طریق **بات بله** — با منوی تو‌در‌تو — فایل‌ها و دانش‌آموزانش را مرور و تکلیف را به چت متصل **ولیّ** دانش‌آموز می‌فرستد. سه‌ضلعی درمانگر ↔ خانواده ↔ پروفایل:

1. **بانک:** آپلود فایل (PDF/تصویر/HTML کاربرگ/Word/Excel تا ۵۱۲KB) + عنوان، توضیح راهنما، قالب (کاربرگ/بازی/دستورالعمل) و برچسب‌ها از تاکسونومی مشترک `tags`.
2. **تخصیص:** انتخاب تمرین → انتخاب دانش‌آموز از دامنهٔ نقش → تأیید → ثبت `exercise_assignments` + پیام فارسی به همهٔ چت‌های متصل ولیّ (bot_links ∪ notification_prefs) با dedup.
3. **بازگشت:** خانواده عکس/فایل نتیجه را در بات می‌فرستد → ذخیره در ObjectStore → رکورد `exercise_submissions` + وضعیت تکلیف «done» → اعلان به ثبت‌کنندهٔ تکلیف + رویداد تایم‌لاین پرونده.

## ۱. معماری (هم‌تراز چهارلایه)

```
src/core/storage/ ← رابط ObjectStore (بدون دامنه)
 types.ts # ObjectStore {put,get,delete} + R2LikeBucket ساختاری
 d1-store.ts # پیش‌فرض — base64 داخل جدول exercise_files (الگوی assessments )
 r2-store.ts # با binding اختیاری R2 — انتخاب خودکار در composition root

src/domain/exercise-bank/ ← مالک جداول (الگوی committee)
 types.ts / pure.ts / service.ts / routes.ts / index.ts / README.md
 createExerciseBankService({ db, audit, logger, storage, downloadSecret })

src/application/notify/
 exercise-bank-bot.ts ← createExerciseBankBot({ db, audit, logger, notify, settings,
 exerciseBank, publicBaseUrl }) — منوی تو‌در‌تو + ارسال
```

- **ObjectStore رابط-اول است:** آداپتر D1 همیشه کار می‌کند (dev/تست/استقرار ساده)؛ با تعریف binding `EXERCISE_FILES` در wrangler.toml، همان کد R2 را برمی‌دارد — بدون تغییر دامنه. سرویس ابری دیگر (Drive و…) = آداپتر جدید.
- **mime منبع حقیقتش ستون `file_mime` جدول exercises است** (آداپتر R2 mime خنثی برمی‌گرداند).

## ۲. Migrationهای 0023 + 0024 (فقط اضافه‌ای)

| جدول | نقش | نکته‌ها |
|------|-----|---------|
| `exercises` | تمرین | عنوان/توضیح/قالب (worksheet، game، instruction — enum در کد، الگوی D7)/published/file meta/created_by → staff/soft delete |
| `exercise_tags` | برچسب‌ها | PK (exercise_id, tag_id) → تاکسونومی مشترک `tags`؛ حداکثر ۱۰ برچسب (Zod) |
| `exercise_assignments` | تکلیف | assigned_by **بدون FK به staff** (معلم مدرسه ردیف staff ندارد؛ شکل: staff id یا `class:<id>`)؛ via = bot/panel؛ status = assigned/done/cancelled |
| `exercise_files` | blob پیش‌فرض | key/mime/size/content_b64 — فقط وقتی ObjectStore نوع D1 است؛ کلید بازگشتی‌ها هم همین‌جا (`submission/<id>`) |
| `exercise_submissions` (0024) | بازگشتی‌ها | هر پیام رسانه‌ای خانواده یک ردیف — assignment_id/student_id (FK) + file meta + file_key در ObjectStore + source_chat_id + note (کپشن، سقف ۵۰۰)؛ حذف نرم ندارد (رویداد پیوست‌شدنی است)؛ ایندکس‌های assignment/student |
| `bot_menu_state` | وضعیت بات | chat_id PK + payload JSON — شناسه‌ها UUIDاند و callback_data سقف ۶۴ بایت دارد؛ callback فقط **اندیس** حمل می‌کند؛ جریان بازگشت از کلید `sub` داخل همان JSON استفاده می‌کند (file_id + کپشن در منوی انتخاب) |

## ۳. Endpointها

| مسیر | متد | دسترسی | شرح |
|------|-----|--------|-----|
| `/api/exercises/meta` | GET | کارکنان | نام storage + دسته‌های برچسب (فیلترهای پنل) |
| `/api/exercises` | GET | کارکنان | فیلتر `q`/`tag_id`/`published` + صفحه‌بندی (پیش‌فرض ۲۰/سقف ۱۰۰) |
| `/api/exercises` | POST | سه نقش | ساخت + فایل اختیاری (base64 — الگوی assessments؛ بدون multipart) |
| `/api/exercises/:id` | GET/PATCH/DELETE | خواندن همه؛ نوشتن سه نقش | ویرایش/انتشار/حذف نرم |
| `/api/exercises/:id/file` | PUT | سه نقش | تعویض فایل |
| `/api/exercises/:id/file` | GET | کارکنان | دانلود (Content-Disposition امن UTF-8) |
| `/api/exercises/:id/assignments` | GET | کارکنان | تکلیف‌های ثبت‌شدهٔ تمرین |
| `/api/exercises/submissions` | GET | کارکنان | فهرست بازگشتی‌ها — فیلتر `student_id`/`assignment_id` + سقف limit (پیش‌فرض ۵۰/سقف ۲۰۰) — **قبل از مسیر `:id` رجیستر شده** |
| `/api/exercises/submissions/:id/file` | GET | کارکنان | دانلود فایل بازگشتی |
| `/public/exercise-files/:id?token=` | GET | **عمومی** | دانلود خانواده — توکن HMAC-SHA256 با انقضای ۷ روز؛ فقط تمرین منتشرشده؛ قبل از authMiddleware (کنار /public/announcements) |

**اعتبارسنجی فایل:** همان مرزهای assessments — MIME whitelist (سند/تصویر + `text/html`)، سقف ۵۱۲KB، sanitize نام، حجم از طول base64. گارد سرویس `assertStaffRole` علاوه بر `requireRole` (الگوی دولایه).

## ۴. جریان بات — «بانک تمرین» / /bank

**دسترسی:** کارکنان متصل (staff_bot_links — همهٔ نقش‌ها) و معلمان کلاس (class_bot_links). والد/مهمان → `bot_exercise_denied`. کلید قطع `exercise_bank_enabled` (تنظیمات، پیش‌فرض روشن) → `bot_exercise_disabled`.

**منوی تو‌در‌تو (همه با دکمهٔ inline و callback `exb:…`):**

```
ریشه: [همهٔ تمرین‌ها] [اختلال‌ها] [پایه‌ها] [سایر برچسب‌ها]
 → دسته: برچسب‌های آن دسته (صفحه ۵تایی)
 → فهرست تمرین‌های منتشرشدهٔ آن برچسب (صفحه ۵تایی)
 → جزئیات: عنوان/قالب/توضیح/برچسب‌ها/فایل + [📤 ارسال تکلیف به خانواده]
 → دانش‌آموزانِ من (صفحه ۶تایی)
 → تأیید (تمرین + دانش‌آموز) → [✅ ارسال]
```

- **دامنهٔ «دانش‌آموزان من»:** درمانگر = دانش‌آموزان جلسات خودش؛ مدیر/منشی = همهٔ پرونده‌های فعال؛ معلم کلاس = دانش‌آموزان کلاس. (همان مرز «نوبت‌های من».)
- **ارسال:** ثبت تکلیف → صف اعلان با قالب `homework_assigned` به همهٔ چت‌های ولیّ با dedup `hw:{assignmentId}:{chatId}` → dispatchPending(50). بدون ولیّ متصل: تکلیف ثبت می‌شود و پاسخ صادقانه «ارسال نشد» می‌آید.
- **ضد دوباره‌کاری:** پس از موفقیت، state همان chat با `sent` علامت می‌خورد — دکمهٔ قدیمی دوباره «قبلاً ارسال شد» می‌دهد.
- **state کهنه:** اندیس خارج از محدوده → «این منو قدیمی است» + دکمهٔ بازگشت.
- audit: `exercise.assigned` (در سرویس) + `exercise.homework.sent` (بازیگر: staff یا bale-bot برای معلم کلاس).

## ۴-ب. حلقهٔ بازگشت فایل — سمت خانواده

**بدون دستور و بدون منو:** خانواده فقط عکس یا فایل نتیجه را در همان چت بله می‌فرستد (عکس/سند — ویدئو و صدا نادیده). پارسر pure (`extractMedia`) پیام‌های رسانه‌ای را **قبل از گارد متن** می‌گیرد؛ کپشن پیام به‌عنوان «پیام خانواده» ذخیره می‌شود (نرمال فاصله، سقف ۵۰۰ نویسه).

**مسیریابی قطعی (`resolveSubmissionTarget`) — برای هر فرزند متصلِ chat:**

| وضعیت | مسیر |
|--------|------|
| دقیقاً یک تکلیف باز (assigned) | **auto** — پیوست مستقیم |
| چند تکلیف باز | **pick** — منوی دکمه‌ای «نتیجهٔ کدام تکلیف است؟» (سقف ۱۰) — `file_id` + کپشن در state می‌ماند و بعد از انتخاب از بله دانلود می‌شود |
| بدون باز، ولی بازگشتی در ۴۸ ساعت اخیر (`SUBMISSION_ATTACH_WINDOW_HOURS`) | **extra** — صفحهٔ بعدیِ همان تکلیف (چند عکس طبیعی است)؛ وضعیت done دست نمی‌خورد |
| بدون باز و بدون بازگشتیِ تازه | **none** — پیام «تکلیف بازی ندارید» + راهنما |

**گاردها به ترتیب:** chat بدون `bot_links` فعال → `bot_submission_denied`؛ کلید قطع `exercise_bank_enabled` → `bot_exercise_disabled`؛ بدون توکن بله (MediaFetcher null) → `bot_submission_unavailable`؛ حجم اعلامی/واقعی > ۵۱۲KB → `bot_submission_too_large` (قبل و بعد از دانلود)؛ سند با MIME خارج whitelist → `bot_submission_bad_type` (عکس همیشه مجاز)؛ خطای دانلود → `bot_submission_failed` (هرگز throw به webhook).

**پیوست موفق (addSubmission در دامنه، هم‌تراکنش):** فایل در ObjectStore (`submission/<id>`) → رکورد `exercise_submissions` → وضعیت تکلیف assigned→done → audit `exercise.submitted` (resource_type=exercise_assignment، changes شامل submissionId/filename) → پاسخ `bot_submission_received` به خانواده → اعلان `homework_returned` به ثبت‌کنندهٔ تکلیف: همکار مرکز = چت‌های `staff_bot_links` او، معلم کلاس = چت‌های `class_bot_links` کلاس — dedup `hwret:{submissionId}:{chatId}` + dispatchPending(50) — best-effort (خطای اعلان ثبت بازگشت را برنمی‌گرداند) + audit `exercise.homework.returned`.

**ضد دوباره‌ثبت:** state منوی انتخاب قبل از دانلود پاک می‌شود — دکمهٔ pick قدیمی → «فهرست قدیمی»؛ تکلیف در لحظهٔ pick هم دوباره بررسی می‌شود (لغو/done از مسیر دیگر → پیام قدیمی).

**تایم‌لاین:** whitelist تایم‌لاین (§11.2) با kind جدید `exercise` گسترش شد — `exercise.assigned` → «تکلیف تمرین ارسال شد» و `exercise.submitted` → «نتیجهٔ تمرین بازگشت» (زیرعنوان: نام تمرین + نام فایل؛ ref بازگشت = خود submission تا چند صفحهٔ یک تکلیف ادغام نشوند). فیلتر «تکلیف تمرین» در پروفایل دانش‌آموز اضافه شد.

**پنل:** تب «📤 بازگشتی‌ها» در نمای بانک تمرین — فهرست نتیجه‌ها (دانش‌آموز/تمرین/نام فایل/حجم/تاریخ/پیام خانواده) + دانلود مستقیم.

## ۵. پیکربندی

| کلید | پیش‌فرض | شرح |
|------|---------|-----|
| `exercise_bank_enabled` (settings) | روشن | کلید قطع جریان بات و ثبت تکلیف؛ پنل کارکنان می‌ماند |
| `PUBLIC_BASE_URL` (vars) | خالی | با مقداردهی، پیام خانواده لینک «📎 دانلود کاربرگ» (توکن ۷روزه) می‌گیرد؛ خالی = پیام متن تمرین + «برای دریافت فایل تماس بگیرید» |
| binding `EXERCISE_FILES` (R2) | کامنت‌شده | بدون آن ذخیرهٔ D1 (۵۱۲KB)؛ فعال‌سازی: `wrangler r2 bucket create …` + خروج از کامنت |
| `AUTH_SECRET` / fallback webhookSecret | — | secret امضای لینک دانلود |

## ۶. فرانت (پنل)

نمای `#/exercises` (منوی «بانک تمرین» — هر سه نقش) با دو تب **«📚 بانک تمرین»** و **«📤 بازگشتی‌ها»**: نوار فیلتر (جستجوی debounced + برچسب + وضعیت انتشار)، کارت تمرین‌ها (قالب/انتشار/برچسب‌ها/فایل و حجم/تاریخ)، مودال «تمرین جدید» با **درگ‌اند‌دراپ** (پرکردن خودکار عنوان از نام فایل)، انتخاب برچسب چیپ‌محور به تفکیک دسته، ویرایش، تعویض فایل، حذف نرم با تأیید. تب بازگشتی‌ها: کارت هر نتیجه با badge «بازگشتی» + پیام خانواده + دکمهٔ دانلود. اعتبارسنجی سمت کاربر همان مرز سرور (MIME/۵۱۲KB). CSS `.exb-*` با دارک‌مود و موبایل ۳۹۰px.

## ۷. تست‌ها (۶۷ جدید — مجموع ۷۵۵ سبز)

 (۳۶):

- `core/storage/__tests__/storage.test.ts` — چرخهٔ بایت d1-store روی MockD1 (بازنویسی/حذف/باینری ۳۰۰۰بایتی) + r2-store با باکت جعلی.
- `core/notify/bale/__tests__/webhook-exb.test.ts` — پارس pure: برچسب‌ها (با واریانت ZWNJ)، /bank، هفت callback، نامعتبر → null، callbackهای قدیمی دست‌نخورده.
- `domain/exercise-bank/__tests__/pure.test.ts` — فایل/MIME/حجم/مسیر، pageWindow قطعی، truncateLabel با مرز یونیکد.
- `application/__tests__/e2e-exercise-bank.test.ts` — CRUD کامل، فیلتر برچسب/جستجو، تعویض فایل، دانلود کارکنان، ۴۰۱ بی‌توکن، لینک امضاشده (معتبر/دستکاری/غیرمنتشر)، اعتبارسنجی‌ها، RBAC سه نقش، حذف نرم.
- `application/__tests__/e2e-exercise-bank-bot.test.ts` — گیت نقش (والد/مهمان انکار)، ریشه، فهرست → جزئیات → دانش‌آموزان → تأیید → ثبت + اعلان `homework_assigned` با dedup و status sent (کانال internal)، ضد دوباره‌ارسال، مدیر (صفحه‌بندی ۷ پرونده)، معلم کلاس (`class:` در assigned_by)، کلید قطع.

 — حلقهٔ بازگشت (۳۱):

- `core/notify/bale/__tests__/webhook-media.test.ts` (۱۴) — pickLargestPhoto (file_size/مساحت/آخرین/خالی)، extractMedia (عکس/سند/ویدئو→null)، normalizeCaption (سقف ۵۰۰)، پارس `media_received` با بزرگ‌ترین سایز + کپشن، سند بدون file_id → null، callback `sub:pick` (معتبر/نامعتبر/غیر sub)، سازگاری عقب متن و /bank.
- `domain/exercise-bank/__tests__/submissions.test.ts` (۸) — روی DB واقعی migrations: دو باز → pick، done → auto، addSubmission (رکورد + فایل واقعی در D1 + done + audit)، پنجرهٔ ۴۸ ساعت → extra، خروج از پنجره → none، chat بی‌تکلیف → none، ناسازگاری دانش‌آموز → ValidationError، تکلیف ناموجود → NotFound، video/mp4 → ValidationError.
- `application/__tests__/e2e-submission-loop.test.ts` (۹) — حلقهٔ کامل روی webhook واقعی با MediaFetcher تزریقی: عکس → auto (فایل بزرگ‌ترین دانلود شد + رکورد + done + `homework_returned` با dedup `hwret:`)، سند PDF بعدی → extra، فهرست/دانلود پنل، دو تکلیف باز → منوی `sub:pick` → پیوست به انتخاب، pick قدیمی → «قدیمی» و بدون دوباره‌ثبت، chat بی‌اتصال → انکار، خروج از پنجره → «تکلیف بازی»، کلید قطع → غیرفعال، تایم‌لاین (`kinds=exercise`: ۳ ارسال + ۳ بازگشت)، راهنمای والد با خط «ارسال نتیجهٔ تکلیف».

## ۸. تصمیم‌های طراحی (چرا این شکل)

1. **D1 پیش‌فرض به‌جای اجبار R2:** الگوی آزمودهٔ assessments با کل ابزار تست؛ صفر پیش‌نیاز استقرار. R2 پشت همان رابط، با یک binding آماده می‌شود.
2. **bot_menu_state به‌جای UUID در callback:** سقف ۶۴ بایت callback_data؛ اندیس‌ها سبک‌اند و state هر chat مستقل است. تنها جدول state بات — self-contained. جریان بازگشت هم کلید `sub` خود را داخل همان JSON نگه می‌دارد (خواندن-نوشتن کل payload — کلیدهای exb از بین نمی‌روند).
3. **ارسال با لینک امضاشده به‌جای sendDocument:** کلاینت بات فعلاً فقط sendMessage است (بدون آپلود multipart)؛ لینک HMAC ۷روزه امن و بدون تغییر صف اعلان است. sendDocument گزینهٔ آینده.
4. **قالب‌های `homework_assigned`/`homework_returned` فقط با متغیرهای موجود** (studentName/exerciseTitle/extra/clinicName) — exerciseTitle به TemplateVars اضافه شد (additive).
5. **تاکسونومی مشترک tags:** همان برچسب‌های دانش‌آموز؛ بی‌نیاز از دیتای دستی جدید.
6. **بازگشت بدون منو و بدون دستور:** خانواده فقط فایل می‌فرستد — تصمیم مسیر (auto/pick/extra/none) در دامنه قطعی است و UX را ساده نگه می‌دارد. در منوی انتخاب، `file_id` (نه بایت) در state می‌ماند و بعد از انتخاب دانلود می‌شود — بدون جدول موقت و بدون نگه‌داشتن بایت در RAM/DB.
7. **MediaFetcher تزریقی:** رابط `MediaFetcher` با fetch قابل تزریق (الگوی کانال بله) — تست کامل بدون شبکه؛ بدون توکن بله available=false و پاسخ صادقانه «فعال نیست». استقرار: با تنظیم `BALE_BOT_TOKEN` خودکار فعال می‌شود (composition root).
8. **بازگشت روی تایم‌لاین با audit موجود (نه جدول جدید):** تایم‌لاین Projection است؛ رویدادهای `exercise.assigned`/`exercise.submitted` از audit_log با kind جدید `exercise` می‌آیند — بدون کوئری جدید به جدول submissions در تایم‌لاین.

## ۹. ریسک‌ها و ضدها

| ریسک | ضدداخل طراحی |
|------|----------------|
| نشت فایل به بیرون | لینک فقط با توکن امضاشدهٔ منقضی‌شدنی + فقط تمرین منتشرشده؛ فهرست/دانلود کارکنان پشت auth |
| دوباره‌ارسال تکلیف | dedup اعلان per-chat + پرچم `sent` در state |
| state بات فاسد/کهنه | re-validate تمرین/دانش‌آموز در هر مرحلهٔ نوشتن + پیام «منوی قدیمی» |
| تمرین حذف‌شده در منوی باز | getById دوباره چک می‌شود (soft delete → «دیگر منتشر نمی‌شود») |
| فایل بزرگ | سقف ۵۱۲KB در سه لایه (Zod/pure/پیام فارسی فرانت) + گارد قبل از دانلود بر اساس file_size اعلامی بله |
| قطع ناگهانی ماژول | `exercise_bank_enabled` — جریان بات و بازگشت هر دو غیرفعال می‌شوند؛ پنل کارکنان سالم می‌ماند |
| رسانهٔ مخرب/نوع ناجاز در بازگشت | whitelist MIME (عکس همیشه مجاز؛ ویدئو/صدا اصلاً پارس نمی‌شوند) + sanitize نام فایل + حذف پیشوند مسیر |
| خطای دانلود از بله | FetchMediaError با پیام بی‌خطر — هرگز throw به webhook؛ token هرگز در لاگ نمی‌آید |
| دوباره‌ثبت بازگشت با دکمهٔ قدیمی | state منوی انتخاب قبل از دانلود پاک می‌شود + گیت مجدد وضعیت تکلیف در لحظهٔ pick |
| اعلان بازگشت شکست بخورد | best-effort — ثبت بازگشت و فایل سر جایشان می‌مانند؛ خطا در لاگ |
