# یادداشت ممیزی bloat — run aud-20261124-8ca4227

مخزن: `/home/z/my-project/gh-rust`، شاخه `rust`، revision `8ca4227`، نسخهٔ اپ 1.27.74، درخت تمیز.
ممیز فقط‌خواندنی؛ هیچ فایل مخزن تغییر نکرد. نتایج ساختاریافته: `repodocs/audit/findings/bloat.json` (اعتبارسنجی `validate-findings`: valid، ۱۱ یافته).

## روش (بدون jCodeMunch)

برای هر ادعای «بدون مصرف‌نده» سه کانال مستقل به‌کار رفت:

1. اسکن شناسه در سطح مخزن: اسکریپت `scripts/export-consumers.py` (۷۹۰ نماد صادرشدهٔ `src/core/shared` و `public/assets/js`، تطبیق word-boundary روی همهٔ فایل‌های ts/js/mjs/html/css/json/md/toml/py با حذف node_modules/dist/باندل‌ها).
2. شمارش/فهرست import و ارجاع ماژول (شکل دوم جستجو) + شمارش ذکر درون‌فایلی هر نماد برای تفکیک «export بی‌مصرف» از «مصرف درونی».
3. خواندن مستقیم فایل نماد مورد ادعا (schema.js، r2-store.ts، api-routing، event-pick.js و …).

برای CSS: اسکریپت `scripts/css-consumers.py` روی ۱۳۱۶ کلاس views.css + کنترل دستیِ ساخت پویا با الگوهای `` class: `x--${…}` ``، الحاق رشته‌ای و جدول‌های class-map. برای اسکریپت‌ها: دو شکل grep (نام کامل و نام بدون پسوند) روی package.json/CI/docs/اسکریپت‌ها و خواندن سرصفحهٔ هر اسکریپت بی‌ارجاع.

## یافته‌های تأییدشده (۷)

| id | شدت | موضوع |
|---|---|---|
| bloat-001 | low | شاخهٔ آداپتور R2 (`src/core/storage/r2-store.ts:4`) سیم‌کشی‌شده ولی در هیچ استقراری غیرقابل‌رسیدن؛ بایند `EXERCISE_FILES` در wrangler.toml/games وجود ندارد (فقط ASSETS/DB/CP)، تنها تأمین‌کننده `src/index.ts:82`، ورودی‌های node/desktop تأمین نمی‌کنند؛ تصمیم P3-12/G6 معلق است — حذف توصیه نمی‌شود. |
| bloat-002 | low | ۵ export مردهٔ JS: `event-pick.js:9` appendEventToTextarea، `:27` eventPickButton، `exercise-pick.js:19` appendExerciseToTextarea، `:32` bankPickButton، `illustrations.js:22` illoHeroOrnament؛ تنها مصرف‌ندهٔ ماژول‌ها (plan-cards.js:6-7) فقط openEventPicker/openExercisePicker را می‌گیرد؛ هیچ تستی به این نام‌ها ارجاع ندارد. |
| bloat-003 | low | ۶ اسکیمای zod مرده در `schemas.ts`: AppointmentStatusSchema (108)، AttendanceStatusSchema (112)، SearchQuerySchema (626)، WaitlistStatusSchema (805)، TodoStatusSchema (889)، TodoBoxSchema (890) — بدون ترکیب درونی و بدون مصرف؛ فقط echo barrel (index.ts: 2/3/22/24/53/93). اتم‌های ترکیب‌شوندهٔ درونی (IsoDateTimeSchema، NationalIdSchema، …) زنده دسته‌بندی شدند. |
| bloat-004 | low | ۱۱ ثابت مردهٔ `constants.ts`: REFERRAL_ROLES/CHANNELS/STATUSES (434-436)، FORM_BLOCK_KINDS (461)، FORM_TITLE_MAX/FORM_DESCRIPTION_MAX/FORM_BLOCKS_MAX/FORM_BLOCK_LABEL_MAX/FORM_BLOCK_OPTIONS_MAX/FORM_OPTION_MAX/FORM_NOTE_MAX (471-477)؛ فقط echo barrel (354-356 و 364-371). |
| bloat-005 | medium | ۸۰ کلاس مرده در `views.css` (از ۱۳۱۶؛ ~۷٪): بلوک کامل صفحهٔ help (۲۵ کلاس، 2187-2305) + موکاپ تلفن `.phone` و ۶ کلاس `phone__*` + قطعه‌های att-*/appt-card (480-542، 2516-2517) + خانوادهٔ exb مرده (exb-pillars، exb-pillar__icon، exb-attrib/cat/check/crumb/selchips، expick-focussel) + تک‌کلاس‌ها (grid-inner--day، btn--warn-ghost، wl-board-card__title، tpl-list-row، staff-score-card، pb-explain__loading، pr-domain-row، docs-file__spacer، fin-headrow، fin-report__sums، clx-layer/clx-layers/clx-syn__conflicts/clx-syn__flags، cbp-grid، jdate__btn، path-head، path-session__items، has-file، is-weekend، staff-mini__nums/__total، wd-appt__ops، chip--btn). زمینهٔ اثر: ratchet بودجهٔ CSS در ۹۹٪ سقف (RISK_REGISTER R2). |
| bloat-006 | low | ۱۶ اسکریپت بی‌اتصال در scripts/: پچ‌های نسخه‌ای (theme-retune-12749.py، fix-copy-week-contract.py، resolve-drift-redo.py)، QA دستی مرورگری (qa-simon-live.mjs، qa-simon-landscape.mjs، qa-stroop-12551.mjs، shots-phases-audit.mjs، shots-phases-pixelcheck.py، seed-probeonly-audit.mjs، check-probe-flow.mjs، cp-correlation-test.mjs)، تولیدکننده‌های seed بی‌اتصال (make-gonogo/nback/numline/simon/span-seed-sql.mjs؛ make-corsi فقط در کامنت make-simon). ذکر نثر خانوادهٔ make-*-seed-sql در docs/research/cognitive-games-critique.md:7 ویرایش پس از حذف است، مانع حذف نیست. |
| bloat-007 | low | تکرار کپی‌وپیست حلقهٔ اعلان در `api-routing/index.ts`: caseEvents.setSendObserver (366-383) و exerciseBank.setSendObserver (423-440) عیناً یکسان + واریانت setFillObserver (386-421)؛ مستند roadmap-audit-taste-sdt153.md:52 نیز همین را ثبت کرده. |

## فرضیه‌های ردشده (۴ — برای جلوگیری از پیگیری دوباره)

- **bloat-008 (countUp):** مصرف درونی ui.js:915 + انتقال عمدی ۱.۲۵.۰۵ + تست گیت front-hygiene-12505.test.ts:39-41.
- **bloat-009 (tutorial):** dynamic import از app.js:651 و cloud-setup/run.ts:67؛ index.ts همهٔ شش زیرماژول را می‌گیرد؛ چانک tutorial.CYFFDKED.js در build-manifest.
- **bloat-010 (qrcode-generator):** مصرف در games-console.js:11,393.
- **bloat-011 (format.js):** ۵۷ فایل مصرف‌نده؛ PLACEHOLDER_NID_PREFIX تنها export بی‌مصرفِ بیرونی است که درونی (isPlaceholderNid) مصرف می‌شود.

## نتایج تمیز (بدون یافته)

- **KV:** صفر مصرف — نه KVNamespace، نه kv_namespaces در wrangler.toml/games؛ ادعای «باید صفر باشد» تأیید شد.
- **وابستگی‌های package.json:** همه (hono، zod، mime، @hono/node-server، qrcode-generator، esbuild، fast-check، web-vitals، wrangler، typescript، @types/*، workers-types) import/استفادهٔ واقعی دارند.
- **tutorial/cloud-setup:** زنده (بالا).
- **آرتیفکت‌های کامیت‌شدهٔ بیلد** (public/assets/dist، worker/bundle.js و …): طبق کامنت .gitignore عمداً «آرتیفکت مرجع» هستند و خارج از دامنهٔ این ممیزی قرار گرفتند.
- نمادهای test-only (۵۶ نماد، عمدتاً exportهای health-panel/cloud-setup که فقط تست‌های متنی می‌گیرند): مصرف‌کنندهٔ مستقل ندارند اما در مصرف درونی view هستند یا به‌عمد برای تست صادر شده‌اند؛ مانع حذف = تست خود نماد؛ به‌عنوان bloat گزارش نشدند.

## دامنهٔ پوشش‌نیافته و محدودیت‌ها

- پوشش‌نیافته: `desktop/src-tauri/src` (کد Rust فقط در سطح ارجاع اسکریپت‌ها بررسی شد)، `desktop/src-tauri/boot-dist`، `public/assets/vendor` (ثالث)، `public/assets/play` (فقط در سطح کلاس CSS اسکن شد، export-level نه)، `public/assets/fonts` و `public/assets/img`، `package-lock.json`، `migrations` (تاریخچهٔ تغییرناپذیر).
- محدودیت‌ها: بدون jCodeMunch (تصمیم ثبت‌شدهٔ 8ca4227)؛ اسکن مرجع اسکریپت‌ها فقط پسوندهای json/md/toml/yml/yaml/ts/mjs/rs/html/sh/py/conf؛ تطبیق شناسه case-sensitive است و ساخت نام پویا (مثل `hue-${n}`) با کنترل دستی جبران شد؛ یک مثبت کاذب روشی (`.phone` به‌خاطر برخورد با شناسهٔ JS) کشف و اصلاح شد — این خطا برای هر ادعای مرده کنترل شد.
- هیچ کد پروژه اجرا نشد، بیلد/تست اجرا نشد، شبکه استفاده نشد.
