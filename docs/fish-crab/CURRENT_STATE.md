# CURRENT_STATE — وضعیت موجود پروژه (M0)

> **FISH & CRAB — Professional Cognitive Game Development · Milestone M0**
> ممیزی روی commit `4fc5f4c` — نسخهٔ **۱.۲۵.۳۴** — تاریخ ممیزی: ۱۴۰۵/۰۸/۱۷ (2026-11-08)
> روش: چهار ممیزی موازی (زیرساخت · موتور کلاینت · دامنهٔ سرور · مستندات/دارایی/کارایی) + راستی‌آزمایی مستقیم روی درخت کد.
> این سند فقط «وضعیت» را ثبت می‌کند؛ حکم فنی در `TECHNICAL_AUDIT.md` و برنامه در `MIGRATION_PLAN.md` است.

---

## ۱. خلاصهٔ یک‌نگاهی

بازی Fish & Crab (گو/نوگو) امروز یک **سکوی شش‌بازی‌ای بالغ** است، نه یک بازی تکی: شش ماژول نمایش (`kinds/`) روی یک موتور مرکزی مشترک (ماشین ۱۴-حالته + زمان‌بند + گردانندهٔ پاسخ + ثبت‌کنندهٔ خام) با نمره‌دهی کاملاً سرور-محور کار می‌کنند. معماری سه‌لایهٔ موردخواست مسترپرامپت (Presentation / Cognitive Task / Data & Analytics) **عملاً موجود است**. حلقهٔ درمانگر (تجویز، لینک امضاشده، پیش‌نمایش پرسنلی، گزارش خام/محاسبه‌شده) و موتورهای کیفیت/شواهد/دشواری تطبیقی هم فعال‌اند. جمع تست: **۱۹۴۰/۱۹۴۰ (۱۶۳ فایل)**.

## ۲. پشتهٔ فناوری

| لایه | انتخاب | نکته |
| --- | --- | --- |
| اجرا | Cloudflare Workers (`wrangler.toml`، `main=worker/entry.js`) | باندل از پیش ساخته‌شده با esbuild → `worker/bundle.js` (۲.۹MB روی دیسک) |
| فریم‌ورک سرور | Hono `^4.6.14` + zod `^3.24.1` | اعتبارسنجی ورودی عمومی با zod |
| دیتابیس | D1 (`center-system-db`)، ۹۹ فایل مایگریشن تا `0097` | R2 کد-پشتیبانی‌شده اما **بایندنشده**؛ ذخیرهٔ فایل فعلاً مسیر chunked-D1 |
| کلاینت SPA | **وانیلا ES Modules — صفر فریم‌ورک** | esbuild باندل؛ dist هشدار-دار، `?v=APP_VERSION`، SW نسخه‌دار |
| بازی‌ها | وانیلا + SVG درون‌کد؛ **صفر دارایی خارجی** | فونت Vazirmatn سلف-هاست (OFL) |
| تست | vitest ۲.۱ (D1 با mock روی `node:sqlite`) + گیت‌های دارایی + گشت مرورگری | CI: typecheck+vitest+`node --check`+smoke سلف‌هاست |
| استقرار | `scripts/update-remote.mjs` — ۵ گام (پیش‌فیلت/بکاپ D1/مایگریشن/دیپلوی/تأیید /health) | rollback = دیپلوی باندل قبلی + بازگردانی بکاپ |

وابستگی‌های runtime فقط ۴ عدد است؛ کلاینت هیچ CDN/منشأ خارجی ندارد (CSP `connect-src 'self'`)، به‌جز یک webhook سمت‌سرور به Bale.

## ۳. ساختار مخزن

- `src/` — ورکر: `core/` (auth/db/storage/audit/notify/version) · `domain/` ≈۳۰ ماژول · `application/` (روتینگ، dashboard، reports، …) · `__tests__/` ۱۲ گیت دارایی (front-*)
- `public/` — پوستهٔ SPA (`index.html`, `sw.js`, `_headers`) · `assets/js` (۴۵ ماژول + ۲۵ نما) · `assets/css` · `assets/fonts` · `assets/img` (فقط آیکون PWA) · `assets/vendor` (web-vitals MIT؛ xlsx ۹۵۱KB تزریق-لنه، گیتِ «هرگز در گراف بوت») · **`assets/play/`** (سکوی بازی کودک)
- `migrations/` — ۰۰۰۱ تا ۰۰۹۷ (دو شمارهٔ تکراری ۰۰۲۶/۰۰۴۶ و سه‌گانهٔ ۰۰۴۷؛ بی‌ضرر برای wrangler)
- `scripts/` — ۲۵ اسکریپت: build-client · build-worker-bundle · perf-budget · bundle-smoke · update-remote · seed/walk مرورگری · مولدهای بانک SQL
- `docs/` — ۱۱ سند عملیاتی + `docs/clinical/` (۱۰ سند) + `docs/research/` (۳ سند)
- `server/` — ریل سلف‌هاست Node+SQLite (Docker/GHCR)

## ۴. سکوی بازی‌ها — آناتومی فعلی

### ۴.۱ نقشهٔ فایل `public/assets/play/` (۲۰ فایل · ۲۱۴,۹۰۳ بایت · ۴,۵۵۷ خط)

| جزء | فایل | بایت | نقش |
| --- | --- | --- | --- |
| ورودی کودک | `play.js` | ۸,۳۷۶ | DOM، لایهٔ شبکه، loadKind، گیت چرخش گوشی |
| ورودی پیش‌نمایش | `preview.js` | ۵,۹۹۱ | پوستهٔ پرسنلی فقط-خواندنی |
| جنبش تزئینی | `fx.js` | ۱۰,۲۲۷ | WAAPI + گارد کاهش‌جنبش؛ بدون ساعت اندازه‌گیری |
| استایل | `play.css` | ۳۷,۲۰۹ | پوستهٔ هر بازی، حسی، کاهش‌جنبش |
| ماشین حالت | `engine/machine.js` | ۶,۴۳۸ | ۱۴ حالت + جدول گذار + دسته‌بندی لمس |
| زمان‌بندی | `engine/timing.js` | ۵,۶۷۶ | rAF/afterPaint، پایش فریم، ساعت RT مکث‌پذیر، sleeper |
| پاسخ | `engine/response.js` | ۳,۹۹۰ | pointerdown کپچر، گارد تپ مضاعف |
| آزمون گو/نوگو | `engine/trials.js` | ۷,۴۰۵ | اجرای کامل یک آزمون touch_report با مُهر پینت |
| ارکستراسیون | `engine/session.js` | ۵۲,۲۹۶ | گردش ۵فازی + شاخهٔ نمایش هر نوع‌بازی |
| آینهٔ نمره | `engine/scoring.js` | ۳,۶۳۱ | median/CV/خلاصه (نیمه‌فعال — §۶ ممیزی فنی) |
| ماژول‌های نوع | `kinds/{gonogo,numline,scan,stroop,flanker,trail}.js` | ۷۰,۷۴۷ | فقط نمایش — صفر کلید، صفر شبکه |

### ۴.۲ ماشین ۱۴-حالته

`IDLE → INSTRUCTION → (DEMONSTRATION | PRACTICE | READY) → FIXATION → STIMULUS → RESPONSE_WINDOW → INTER_TRIAL_INTERVAL → READY/PRACTICE/BREAK → COMPLETED` + `PAUSED / INTERRUPTED / INVALID` (ترمینال: COMPLETED/INVALID). گذار با جدول بسته (گذار غیرمجاز = استثنا) و تاریخ‌دار (`performance.now()-t0`). مکث برگه از `visibilitychange`: FIXATION/STIMULUS/RESPONSE_WINDOW/ITI/PRACTICE/READY → `PAUSED{from}` با انجماد sleeper + ساعت RT + تایمرهای موج، و برگشت با `resumeTo`.

### ۴.۳ شش نوع‌بازی فعال

| نوع | حس بازی | ارجاع متن‌باز (همگی MIT، فقط الهام/اقتباس منطق) |
| --- | --- | --- |
| `gonogo` | ماهی=GO / خرچنگ=NO-GO + تمرین تعاملی «تا موفقیت» | `@jspsych-timelines/go-nogo` v0.5.0 (۱.۲۵.۳۴) |
| `numline` | جادهٔ عددها | تمرین حس عدد (۱.۲۵.۲۸) |
| `scan` | حملهٔ جاسوس‌ها (الگوی d2) | go-nogo + escape-run (۱.۲۵.۳۰) |
| `stroop` | حقه‌باز رنگ‌ها | `jspsych-timelines/stroop-task` (۱.۲۵.۳۲) |
| `flanker` | گلهٔ فریبکار | `@jspsych-contrib/plugin-flanker` (۱.۲۵.۳۲) |
| `trail` | رد پای دزد (TMT A/B) | `@jspsych-contrib/plugin-trail-making` (۱.۲۵.۳۲) |

قرارداد ماژول نوع: صادرات `stimSvg` + `previewSteps` + هوک‌های اختیاری (`practiceInteractive`, `debriefMarkup`, `*Markup`, `*RevealTruth`, `*ResponsePoint`)؛ شنیده‌شدن خودکار با پسوند. **هیچ چرخهٔ عمر mount/start وجود ندارد** — کل listener/زمان‌بندی/ارسال با موتور است.

### ۴.۴ جریان جلسه

صفحهٔ کودک `/m/:token` (CSP سختگیرانهٔ `default-src 'none'`، noindex) → شش حالت صفحه (والد/کودک/گیت والد/پایان). شبکه با تک‌نقطهٔ `requestJson`: `state` · `start` · `next-item` (هر آزمون) · `attempts` (هر پاسخ) · `finish` · `parent-gate` · `confirm`. خطای شبکه = یک retry ۱۲۰۰ms → پنل آرام. جلسهٔ کسری با «آخرین فعالیت ۶ ساعت» جمع می‌شود و لینک تازه همان جلسه را ادامه می‌دهد.

## ۵. سمت سرور — دامنهٔ بازی‌ها

### ۵.۱ ماژول‌ها (`src/domain/games/`, ۱۶ فایل)

`service.ts` (۱,۶۵۷ خط — تک‌هاب DB) · `pure.ts` (نمرهٔ خالص + کف RT + حذف کلید) · `stages.ts` (۵ مرحله × ۶ نوع × ۲ باند سنی) · `types.ts` · `routes.ts` · `stimulus.ts` (توالی قطعی mulberry32+FNV-1a) · `scoring.ts` (خلاصهٔ جلسه) · `protocol.ts` (پروتکل نسخه‌دار ۱.۰.۰، دو حالت، دو باند) · `page.ts` · `adaptive.ts` · `evidence.ts` v1.0.0 · `quality.ts` (۹ قاعده) · `report.ts` · `registry-extra.ts`.

### ۵.۲ مدل داده (۰۰۸۷–۰۰۹۷)

- `game_metrics` / `game_goals` — رجیستری سنجه/هدف (۰۰۸۷)
- `game_packages` — PK `(id, version)`؛ نسخهٔ منتشرشده تغییرناپذیر؛ retire فقط تجویز جدید را می‌بندد
- `game_prescriptions` / `game_missions` — تجویز امضاشدهٔ درمانگر + مأموریت روزانه با سقف دوز
- `game_sessions` — `state` شش‌حالته، `validity`، `purpose(training|assessment)`، `sequence_json`، `summary_json`، `adaptive_json`، `quality_json`، `stage_id`
- `game_attempts` — append-only: `item_id, phase(train|probe), response_json (خام کامل), correct, rt_ms, rt_valid, idem_key UNIQUE` + ۸ ستون شواهد نمایش (۰۰۹۱: presented_at_ms, frame_drops, max_frame_delta_ms, touch_count, premature/multiple/out_of_surface_count, window_ms) + یکتایی `(session_id,item_id)` (۰۰۹۷)
- `game_links` — `token_hash` (SHA-256؛ secret ۲۵۶-bit)، jti، انقضای پایان-روز تهران/۱۲ساعت، revoke
- `game_preview_tokens` — پرسنلی ۳۰دقیقه‌ای (۰۰۹۵)؛ `game_adherence` — تأیید دوگانهٔ والد

### ۵.۳ نمره‌دهی و سنجه‌ها

`scoreAttempt` روی آیتم authored و **کف RT بر اساس نوع**: touch_report 150 · numline 0 · choice 200 · scan 150 · stroop/flanker 200 · trail 150 (بازنویسی با `mission.rt_floor_ms`). فرمول‌های رجیستری: accuracy, median_rt, commission, omission, correct_go/nogo_pct, numline_error, scan_fa/miss, congruent/incongruent_acc, interference_ms, trail_prefix — همگی با **قاعدهٔ دامنهٔ صفر** (صورت صفر → null، نه صفر قلابی). سنجه‌ها فقط از آزمون‌های **probe** معتبر جلسهٔ valid محاسبه و در `metrics_json` می‌نشینند.

### ۵.۴ پروتکل، مرحله‌ها، تطبیقی، کیفیت، شواهد

- **پروتکل** (`protocol.ts`, نسخهٔ ۱.۰.۰): ۱۳ پارامتر × دو باند سنی ۴–۶ / ۷–۱۲ × دو حالت training/assessment؛ هر پارامتر `{value, rationale, status}` با وضعیت صادقانهٔ **proposed**. ارزیابی: بی‌بازخورد، بی‌سبد ستاره، بی‌مرحله (قاعدهٔ C1)، فقط probe.
- **مرحله‌ها** (`stages.ts`, نسخهٔ قواعد ۱.۳.۰): پنج مرحلهٔ فقط-تمرین با اهرم دشواری نوع‌آگاه (پنجرهٔ گو/نوگو، گسترهٔ جاده، اندازهٔ موج، باند تداخل، شمار گرگ قلابی، گسترهٔ گره) — محرک authored هرگز بازنویسی نمی‌شود؛ ستاره بهترین-همیشگی؛ گذار فقط از جلسهٔ valid. آستانه‌ها: گو/نوگو ۷۰/۶۰ · ۸۰/۷۵ · ۹۰/۸۵؛ بقیه دقت ۶۵/۷۸/۸۸ — همگی proposed تا پیلوت مرکز.
- **تطبیقی** (`adaptive.ts`): فقط-تمرین، فقط پنجرهٔ پاسخ گو؛ ≥۲ جلسهٔ valid متوالی؛ سخت‌تر −۱۰۰ms / آسان‌تر +۱۵۰ms؛ کلمپ ۸۰۰–۳۰۰۰ms؛ هر تصمیم با همهٔ ورودی‌ها در `adaptive_json`.
- **کیفیت** (`quality.ts` v1.0.0): ۹ قاعدهٔ نام‌دار (base_validity/completion/pause_total/idle_gap/out_of_surface/premature_ratio/device_frame/evidence_coverage/rt_floor) → حکم سه‌تایی `explainable|needs_caution|incomplete_or_invalid`.
- **شواهد** (`evidence.ts` v1.0.0): ۵ نشانهٔ کمی (rt_cv، drift دقت، premature_pct، window_miss_pct، coverage) + ۴ پرچم (خستگی/ناپایداری/تکانش/بی‌تفاوتی) + توصیهٔ غیر-بالینی promote/hold/review.

### ۵.۵ سطح API

پرسنلی (پشت authMiddleware): metrics/goals/packages (CRUD+publish+retire) · prescriptions (CRUD+status) · missions (schedule+list+link) · revoke · sessions detail · preview token · **گزارش کودک** `GET /api/games/children/:childId/report` (JSON | `?format=html` چاپی RTL | `?format=csv`) با لاگ ممیزی هر export.
عمومی (توکن-محور، پیش از authMiddleware): `/m/:token` · `/play/preview/:token` · `state/start/next-item/attempts/finish/parent-gate/confirm` · preview `item/:n` و `feedback`.

### ۵.۶ گزارش درمانگر

`ChildGameReport` با تفکیک صریح **computed** (خلاصهٔ scoring + سنجه‌های رجیستری + حکم کیفیت) و **raw** (هر پاسخ با شواهد نمایش + دنبالهٔ seed برای بازتولید) + سری مقایسهٔ هر سنجه بین جلسه‌ها + `disclaimer: 'no_clinical_conclusion'`. کلید پاسخ در هیچ لایه‌ای خارج نمی‌شود (گیت‌دار).

## ۶. دارایی‌های دیداری، فونت، صدا

- **رویکرد «صفر دارایی خارجی»**: همهٔ محرک‌ها SVG درون‌کد با الگوی دو-لایهٔ `{d, ink}` (ماهی/خرچنگ/گل/پروانه/بادکنک/ابر/موشک/بشقاب‌پرنده/ستاره/مربع/ربات/گرگ/پنجه/…)؛ پس‌زمینه‌ها گرادیان CSS (شِمال اصلی، شب عدی، غار استروپ، آسمان فلانکر)؛ صفر فایل تصویر بازی (فقط ۷ آیکون PWA = ۷۱,۲۲۴B).
- **فونت**: صفحهٔ کودک = زیرمجموعهٔ استاتیک Vazirmatn (regular ۲۷,۸۵۶B + bold ۲۸,۲۴۸B، `font-display:swap`)؛ SPA = variable ۱۱۱,۱۵۲B؛ جمع `fonts_raw` = ۱۶۷,۲۵۶ از سقف ۱۷۰,۰۰۰. لایسنس SIL OFL 1.1.
- **صدا**: صفر — هیچ Audio در کل مسیر بازی (گیت‌دار). قاعدهٔ سکوتِ سند محتوایی؛ واریانت شنیداری مسدود تا بازبینی بالینی.
- **جنبش**: فقط از `fx.js` با WAAPI و گارد کاهش‌جنبش fail-closed؛ صفر `@keyframes` در play.css (گیت‌دار)؛ ورود محرک بدون fade تا نخستین فریم کامل مرئی بماند (RT پاک).
- **لطمهٔ لمسی**: pointerdown با `touch-action: manipulation`؛ اهداف لمسی ۶۴–۹۲px (گزینه‌ها ۸۴–۹۲ · کاشی اسکن ۷۶ · گره رد ۷۶×۷۶ · جاده ۷۸)؛ هر دو جهت عمودی/افقی اجرای واقعی‌اند (۱.۲۵.۴۵ — قفل جهت حذف شد).

## ۷. کارایی

| سنجش | سقف | اندازه‌گیری فعلی |
| --- | --- | --- |
| `boot_js_gz` | ۵۰,۰۰۰ | **۴۴,۴۳۴** (۸۸٪ سقف) |
| `eager_modules` | ۵ | ۵ |
| `critical_css_gz` | ۶۶,۲۰۰ | **۶۵,۷۸۴** (۹۹٪ سقف — تازه‌ترین ratchet) |
| `fonts_raw` | ۱۷۰,۰۰۰ | ۱۶۷,۲۵۶ |

dist کلاینت: ۴۳ فایل JS، ۹۶۸,۱۴۹B خام → ۳۱۵,۱۳۰B gzip (بیرون از بوت: مسیر play ۳۳KB gzip برای ۷ بازی). SW: `/assets/dist/*` **شبکه-اول** با پشتیبان کش (رفع رگبار 404 در ۱.۲۵.۲۷)، img/fonts کش-اول immutable. bundle-smoke: ۱۱ پروب رفتاری روی MockD1 کامل (برچسب CHANGELOG «۱۰/۱۰» قدیمی است).

## ۸. امنیت

CSP دولایه (پوستهٔ `default-src 'self'` با هش inline تثبیت‌شده · صفحهٔ کودک `default-src 'none'`) · کلید پاسخ هرگز کلاینت نمی‌بیند (`stripAnswerKeys` بازگشتی + گیت تست) · توکن‌ها فقط-hash با jti/revoke/انقضا · نمره‌دهی صرفاً سرور · idempotency دولایه + یکتایی DB · throttle ورود DB-محور · noindex صفحات کودک · ممیزی export گزارش · زنجیرهٔ عمومی پیش از authMiddleware با توکن-به-عنوان-احراز.

## ۹. مستندات موجود مرتبط

`docs/research/gonogo-jspsych-integration.md` (گزارش ۷بخشی ادغام jsPsych) · `docs/research/oss-cognitive-games-review.md` (۷ مخزن بازبینی‌شده + قاعدهٔ «بی‌لایسنس = فقط ایده») · `docs/research/cognitive-games-roadmap.md` (صف ارائه: nback/stopsignal/corsi/simon/taskswitch/numcompare/pa_discrim) · `docs/clinical/gonogo-redesign-phase0-audit.md` (۱۲ شکاف علمی C1–C12 + حکم اکوسیستم) · `docs/clinical/gonogo-redesign-phase9-variants.md` (واریانت‌ها ساخته نمی‌شوند؛ PixiJS شرطی) · `docs/clinical/games-ui-redesign-phase1.md` (فاز ۱ بازطراحی UI درمانگر — ۱۳ قابلیت ممنوع‌الحذف).

## ۱۰. عملیات

دیپلوی ۵گام با بکاپ خودکار D1 + تأیید /health؛ ۴ کرون (دایجست/بکاپ شبانه/دیسپچ/چرخهٔ اعلان) — **کرون اختصاصی بازی‌ها نداریم** (انقضای مأموریت‌ها lazy) · self-host دوگانه (Docker+GHCR) · نسخه در ۴ نقطهٔ هم‌گام (package.json/version.ts/index.html/sw.js) با بامپ شش‌نقطه‌ای + CHANGELOG فارسی-جلالی. آهنگ انتشار بسیار بالا: ۳۴ نسخهٔ ۱.۲۵.x در ~۶ روز.

## ۱۱. ابهامات باقی‌مانده (بی‌اثر بر معماری)

شمار دقیق اجرای زندهٔ vitest (مستند ۱۹۴۰؛ شمار ایستا ۱۹۳۹–۱۹۵۶ به‌دلیل تست‌های پارامتری) · تاریخچهٔ این‌که آیا R2 روزی بایند بوده (اکنون قطعاً نه) · آرتیفکت‌های build محلی (`dist/`+`index.html` هش ناموافق) — بی‌اهمیت چون هر دیپلوی build-client را از نو می‌سازد.
