# COGNITIVE_SPEC.md — مشخصات موتور وظیفهٔ شناختی (M1)

> **FISH & CRAB · Milestone M1** — ۱۴۰۵/۰۸/۱۷ · مکمل `GAME_DESIGN.md` · مبنای ممیزی: `TECHNICAL_AUDIT.md` (M0)
> نقش نویسنده: Cognitive Science Specialist. قرارداد این سند با `src/domain/games/protocol.ts` (نسخهٔ ۱.۰.۰) و `stages.ts` (قواعد ۱.۳.۰) هم‌شماره است.
> **هر تغییر عددی در این سند باید با بامپ نسخهٔ پروتکل/قواعد در کد هم‌زمان شود** — سند و کد یک قراردادند، نه دو سند.

---

## ۱. هویت علمی و خط‌های قرمز

این پلتفرم **ابزار تمرین و ثبت رفتاری** است؛ آزمون تشخیصی نیست:

1. **هیچ آستانهٔ تشخیصی تعریف نمی‌شود** و هیچ خروجی‌ای «نرمال/غیرنرمال» نمی‌نامد. گزارش کودک با `disclaimer: 'no_clinical_conclusion'` صادر می‌شود.
2. **هیچ ادعای اثربخشی/درمانی** در هیچ لایه‌ای مجاز نیست — نه متن، نه UI، نه مستندات.
3. هر پارامتر `{value, rationale, status}` است؛ `status` صادقانه: `validated` (با پیلوت خود مرکز) / `pilot` (در پیلوت) / `proposed` (پیشنهاد کارشناس). **امروز هیچ پارامتری `validated` نیست** — تبدیل فقط با پیلوت مرکز (G6) و بامپ نسخه.
4. «مبنای متعارف آزمون» برای rationale کافی است؛ **ادعای علمی بدون منبع ممنوع** (کامنت قانون protocol.ts).
5. ادبیات مرجع فقط مرجع منطق است (jsPsych-timelines و افزونه‌ها، MIT؛ قاعدهٔ «بی‌لایسنس = فقط ایده» — `docs/research/oss-cognitive-games-review.md`).

## ۲. دو حالت مستقل — Training / Assessment

| رفتار | training | assessment |
| --- | --- | --- |
| بازخورد فوری در اجرای اصلی (`feedback_in_main`) | ✅ | ❌ هرگز (خنثی‌سازی واکنش) |
| سبد ستاره و تشویق (`star_basket`) | ✅ فقط روی `train` نمره‌خورده | ❌ |
| سازگاری خودکار (`adaptive`) | ✅ قواعد §۷ | ❌ ممنوع مطلق (C1) |
| نوار پیشرفت (`progress_visible`) | ✅ | ❌ |
| سبک آموزش (`instruction_style`) | `playful` — تعاملی تا موفقیت | `standard` — دستورالعمل ثابت کوتاه |
| مرحله/ستاره/دنیای دیداری | ✅ نظام `stages.ts` | ❌ پروتکل ثابت، بدون امضای مرحله |
| آزمون‌های سنجه | فقط `probe` معتبر جلسهٔ valid | فقط `probe` معتبر جلسهٔ valid (هر دو حالت) |

پایهٔ فازبندی: توالی تولیدیِ `train/probe` سمت سرور در `sequence_json` منجمد می‌شود؛ سنجه‌ها هرگز از آزمون‌های `train` محاسبه نمی‌شوند (ستاره/بازخورد فقط train).

## ۳. پروتکل نسخه‌دار ۱.۰.۰ — جدول کامل پارامترها

`PROTOCOL_VERSION = '1.0.0'` · `PROTOCOL_ID = 'gonogo-standard'` · ۱۳ پارامتر × دو باند × دو حالت.
سن بیرون باند (زیر ۴ / بالای ۱۲) به نزدیک‌ترین باند با پرچم `age_clamped` می‌نشیند — هرگز بی‌صدا نیست.

### ۳.۱ پارامترهای زمان‌بندی و ساخت — training

| پارامتر | ۴–۶ سال | ۷–۱۲ سال | وضعیت | مبنا (خلاصهٔ ثبت‌شده در کد) |
| --- | --- | --- | --- | --- |
| `response_window_go_ms` | 2000 | 1500 | pilot | پنجرهٔ متعارف کودک‌محور/مدرسه؛ زیر کف RT جداگانه فیلتر می‌شود |
| `response_window_nogo_ms` | 2000 | 1500 | proposed | هم‌طول گو برای خوانایی مقایسهٔ کمیسیون |
| `isi_min_ms` | 1000 | 800 | proposed | کف محافظه‌کارانه؛ ISI کوتاه‌تر نرخ اُمیشن تصادفی می‌سازد |
| `isi_max_ms` | 1500 | 1200 | pilot (۴–۶) / proposed (۷–۱۲) | بازهٔ سند محتوایی بستهٔ ۳ / شکستن انتظار زمانی ثابت |
| `fixation_ms` | 400 | 400 | proposed | مکث خنثی بی‌فلاش — جداکنندهٔ ISI از لحظهٔ محرک |
| `go_ratio` | 0.75 | 0.75 | pilot | نسبت ~۳:۱ متعارف ادبیات گو/نوگو کودکان |
| `max_consecutive_same` | 3 | 3 | proposed | بیش از سه پیاپی «حفظ‌کردن» می‌سازد نه بازداری |
| `block_size` | 20 | 24 | pilot (۴–۶) / proposed (۷–۱۲) | بازهٔ توجه فعال هر باند؛ خستگی انتهای جلسه را می‌شکند |
| `break_min_ms` | 4000 | 3500 | proposed | استراحت لمسی کوتاه — تنظیم بدون گسستن جریان |
| `assessment_blocks` (training) | 2 | 3 | proposed | تمرین کوتاه‌تر از ارزیابی |
| `stimulus_scale_vmin` | 38 | 30 | pilot | محرک درشت/کوچک‌تر — پاسخ بازخورد میدانی «آیکون بزرگ»، سن‌محور |
| `feedback_ms` | 1400 | 1200 | proposed | بازخورد کوتاه؛ فاصلهٔ بلند کودک بی‌حوصله را خفه می‌کند (C12) |
| `preview_step_ms` | 2200 | 2000 | proposed | گام آموزش دوثانیه‌ای |

### ۳.۲ تفاوت‌های assessment

- ۴–۶: فقط `assessment_blocks: 2` (۲×۲۰ = **۴۰ آزمون**)؛ پنجرهٔ گو همان 2000 تا مقایسهٔ روند.
- ۷–۱۲: فقط `assessment_blocks: 3` (۳×۲۴ = **۷۲ آزمون** استاندارد)؛ پنجرهٔ گو همان 1500؛ سازگاری ممنوع.
- بقیهٔ پارامترها عیناً مال training باند خود — تغییر هر عدد یعنی پروتکل جدید و بامپ نسخه.
- `response_window_nogo_ms` ورودیِ موتور نیست (نرمال می‌شود، خوانده نمی‌شود — عمدی، P3-2: باید در M3 خارج از کامنت مستند شود).

## ۴. آناتومی آزمون touch_report (مسیر طلایی)

`trials.js` + `machine.js` — ۱۴ حالت با جدول گذار بسته (گذار نامجاز = استثنا؛ تاریخچهٔ گذارها ثبت است):

```
FIXATION (پروتکل؛ مکث خنثی بی‌فلاش)
  → تزریق محرک → دو تیک rAF → مُهر stimulus_presented روی پینتِ تأییدشده  ← مبدأ RT
  → پاپ محرک (بی‌fade — نخستین فریم کامل مرئی می‌ماند)
  → ساعت RT مکث‌پذیر از performance.now (انباشته)
  → RESPONSE_WINDOW (پنجرهٔ پروتکل)
  → برداشت ITI (~۱۶۰ms — همیشه پیش از FIXATION بعدی تمام می‌شود)
  → ISI تصادفی از بازهٔ پروتکل → آزمون بعد
```

- **مُهر پینت، مبدأ واحد RT** است — نه لحظهٔ فرمان DOM، نه لحظهٔ JS. بِرَندِر حذف از RT.
- `stimulus_duration_ms` اختیاری (نگاشت jsPsych؛ سقف امن ۱۵۰ms…window−۵۰ms؛ پیش‌فرض null) — فقط مسیر touch_report؛ رویداد `stimulus_hidden` در شواهد.
- **مکث برگه** (`visibilitychange`): FIXATION/STIMULUS/RESPONSE_WINDOW/ITI/PRACTICE/READY → `PAUSED{from}` با انجماد sleeper + ساعت RT + تایمرهای موج؛ برگشت با `resumeTo`. `pause_count/pause_total_ms` به finish می‌رود و در قاعدهٔ کیفیت `pause_total` (>۹۰s) می‌نشیند.
- FIXATION تصادفی ۱۰۰–۲۰۰۰ms در نسخهٔ تمرین تعاملی گونوگو (اقتباس jsPsych) — در مسیر استاندارد از پروتکل می‌آید.

## ۵. گردانندهٔ پاسخ و دسته‌بندی لمس

- تنها ورودی: `pointerdown` با دو شنوندهٔ کپچر (صحنه + document)؛ گارد تپ مضاعف (فلگ `answered` + تخریب شنونده) — یک لمس فیزیکی حداکثر یک پاسخ.
- **دسته‌بندی `classifyTouch`** — سه‌گانهٔ اخیر فقط ثبت می‌شوند و آزمون را حل نمی‌کنند (پاکی RT):
  - `primary` — در STIMULUS/RESPONSE_WINDOW روی صحنه
  - `premature` — پیش از محرک
  - `multiple` — پس از پاسخ
  - `out_of_surface` — بیرون صحنه (P3-9: نوار پیشرفت/بدنه هم می‌شمارند — فقط پرچم)
- **کف RT سمت سرور بر اساس نوع** (`scoreAttempt`، بازنویسی‌پذیر با `mission.rt_floor_ms`): touch_report/gonogo 150 · numline 0 · choice 200 · scan 150 · stroop/flanker 200 · trail 150 → ستون `rt_valid`.
- **شناخته‌شده و برنامهٔ رفع** (M0): ساعت مکث‌پذیر در ۵ شاخهٔ غیر-touch_report تفاضلی است (P1-1) و شاخه‌های خاص شواهد هاردکد صفر می‌گذارند (P1-2) — رفع در G1 پیش از هر گسترش.

## ۶. تولید توالی و نسخه‌بندی

- **کاملاً سرور-محور**: `stimulus.ts` با seed=UUID جلسه → mulberry32 قطعی + FNV-1a؛ سهمیهٔ گوِ دقیق با گارد امکان‌پذیری (سقف تکرار هم‌نوع = `max_consecutive_same`)؛ در `start` داخل `sequence_json` منجمد → بازتولیدپذیری کامل برای ممیزی.
- **پروتکل‌های نسخه‌دار**: هویت نسخه در چهار لایه — `package_version` (تجویز قفل‌نسخه) · `purpose`/`sequence_json`/`summary_json.stage.rules_version` (جلسه) · `PROTOCOL_VERSION` در اسنپ‌شات کلاینت · `STAGE_RULES_VERSION` در قواعد مرحله. مقایسهٔ جلسه بین پروتکل‌های ناهم‌نسخه ممنوع است.
- **شکاف ثبت‌شده P2-4**: توالی seed فعلاً فقط برای touch_report است؛ بسته‌های ارزیابی سایر نوع‌ها به‌ترتیب authored اجرا می‌شوند — «ارزیابی = پروتکل ثابت» فقط در خانوادهٔ گو/نوگو کامل است. رفع در G1.

## ۷. سازگاری خودکار — فقط training (`adaptive.ts`)

| قاعده | مقدار |
| --- | --- |
| حداقل جلسهٔ معتبر پیاپی برای هر تصمیم (`ADAPTIVE_MIN_SESSIONS`) | ۲ — «هرگز بر یک خطا/یک جلسه» |
| سخت‌ترشدن | دو جلسهٔ پیاپی: بازداری ≥۸۵٪ و کمیسیون ≤۱۰٪ و گوِ درست ≥۸۰٪ **و** RT پایدار (Δمیانه ≤۱۵۰ms) |
| آسان‌ترشدن | دو جلسهٔ پیاپی: کمیسیون ≥۲۵٪ **یا** بازداری <۵۰٪ |
| گام تغییر | سخت‌تر −۱۰۰ms · آسان‌تر +۱۵۰ms — فقط و فقط `response_window_go_ms` |
| کران پنجره | ۸۰۰–۳۰۰۰ms (`WINDOW_MIN/MAX`) — بیرون این بازه «بازی دیگری است» |
| ثبت | هر تصمیم با همهٔ ورودی‌ها + قواعد در `adaptive_json`؛ کلید خاموشی درمانگر هم ثبت می‌شود |
| کرانی‌شدن بدون تغییر | نیاز به تغییر اما پنجره در کران → `hold` با پیام «بازنگری بالینی لازم» |

## ۸. سنجه‌ها، کیفیت و شواهد

- **فرمول‌های رجیستری** (`pure.ts` + `registry-extra.ts`): accuracy, median_rt, commission_pct, omission_pct, correct_go_pct, correct_nogo_pct, numline_error, scan_fa/miss, congruent_acc, incongruent_acc, interference_ms, trail_prefix — همگی با **قاعدهٔ دامنهٔ صفر** (صورت صفر → null، نه صفر قلابی). سنجه فقط از probe معتبر جلسهٔ valid، در `metrics_json`.
- **کیفیت** (`quality.ts` v1.0.0) — ۹ قاعدهٔ نام‌دار با حکم سه‌تایی `explainable | needs_caution | incomplete_or_invalid`: base_validity · completion · pause_total (>۹۰s) · idle_gap · out_of_surface (>۱۰) · premature_ratio · device_frame · evidence_coverage · rt_floor.
- **شواهد** (`evidence.ts` v1.0.0) — ۵ نشانهٔ کمی (rt_cv، drift دقت، premature_pct، window_miss_pct، coverage) + ۴ پرچم رفتاری (خستگی/ناپایداری/تکانش/بی‌تفاوتی) + توصیهٔ **غیر-بالینی** promote/hold/review. توصیه هرگز مرحله/ستاره/بازخورد نمی‌بیند و به کودک نمایش داده نمی‌شود.
- **ثبت خام**: هر پاسخ = `response_json` کامل (همهٔ رویدادها: fixation_start, stimulus_presented, response_window_open, touch_*, iti_start, stimulus_hidden) + ۸ ستون شواهد نمایش در `game_attempts` (presented_at_ms, frame_drops, max_frame_delta_ms, touch_count, premature/multiple/out_of_surface_count, window_ms) — «دادهٔ خام هرگز دور ریخته نمی‌شود» گیت‌دار. idempotency سه‌لایه (idem_key UNIQUE + گیت سرور + یکتایی `(session_id,item_id)`).

## ۹. گزارش و مرز تفسیر

گزارش کودک (`ChildGameReport`): بخش **computed** (خلاصهٔ scoring + سنجه‌های رجیستری + حکم کیفیت) و بخش **raw** (هر پاسخ با شواهد + دنبالهٔ seed برای بازتولید) + سری مقایسهٔ سنجه‌ها بین جلسه‌ها + `disclaimer: 'no_clinical_conclusion'`. تفسیر روند فقط وظیفهٔ درمانگر انسانی است؛ سامانه فقط «ثبت‌شده» می‌گوید. کلید پاسخ در هیچ لایه‌ای خارج نمی‌شود (`toItemView` + `stripAnswerKeys` بازگشتی، گیت‌دار).

## ۱۰. برنامهٔ اعتبارسنجی (مسیر proposed → validated)

1. **G1 (پیش‌نیاز علمی)** — رفع P1-1/P1-2/P2-4 تا شواهد همهٔ نوع‌ها حقیقت‌گو شود؛ بدون این، هر پیلوت دادهٔ معیوب جمع می‌کند.
2. **پیلوت مرکز (G6)** — پروتکل + مرحله‌ها روی نمونهٔ مرکز؛ پروتکل، معیار پذیرش و نتایج مستند در سند پیلوت.
3. تبدیل وضعیت: فقط با بامپ نسخه (`PROTOCOL_VERSION`/`STAGE_RULES_VERSION`) و ردپای کامل در CHANGELOG — هیچ تغییر بی‌صدای عدد.
4. هر گام از این سند فقط با `pilot/validated` گزارش می‌شود؛ تا آن زمان همهٔ آستانه‌ها `proposed` می‌مانند.
