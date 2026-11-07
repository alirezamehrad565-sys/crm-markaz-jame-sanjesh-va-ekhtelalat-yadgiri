# UI_COMPONENTS — اجزای رابط پخش‌کنندهٔ کودک (M2)

> **FISH & CRAB · Milestone M2** — ۱.۲۵.۳۶ · مکمل `ART_DIRECTION.md`
> مرز قرارداد: هیچ جزئی در این فهرست کلید پاسخ، پنجرهٔ آزمون یا سنجه نمی‌داند؛
> جزء تازه = «ماژول نمایش + CSS ایستا + جنبش از fx» و بس.

## ۱. اجزای صحنه (تازهٔ M2)

| کلاس / جزء | ساختار | قواعد |
| --- | --- | --- |
| `.play-scene` | wrapper مطلق سه لایه + حباب‌ها + قهرمان؛ `aria-hidden` · `pointer-events:none` | `z-index:0` زیر محتوا؛ `overflow:hidden`؛ `border-radius:inherit` |
| `.play-scene__far / __mid / __near` | سه SVG لایهٔ عمق | شفافیت پلکانی ۰٫۵/۰٫۶/۰٫۹۵ — عمق ایستا، بدون واکنش ورودی |
| `.play-scene__bubble--0/1/2` | سه حباب span/SVG | جنبش آرام فقط از `fx.sceneAmbient` |
| `.play-scene__hero` | قهرمان صحنه (ماهی + خرچنگ اختیاری) | گوشه‌نشین (`right:8%`)؛ هرگز وسط توجه در آزمون |
| `.play-scene__weed--a/b` | جلبک نزدیک برای تاب | `transform-origin:50% 100%` |

**قاعدهٔ نصب:** صحنه همیشه **نخستین فرزند** صحنهٔ صحنه تزریق می‌شود (`insertAdjacentHTML('afterbegin')`) تا زیر محتوا بنشیند؛ محتوای شِمال‌های تشریفاتی با `.play-stage--teach/end > *` یک لایه بالا (`z-index:1`).

## ۲. کمربند‌وبند اندازه‌گیری

- `.play-stage--main .play-scene { display: none; }` — حتی نشست باقی‌مانده هم در اجرای اصلی صحنه نمی‌بیند.
- گیت ایستا (`front-play-art.test.ts`): شاخه‌های آزمون + مسیر `runTrial` صفر ردپای صحنه؛ `@keyframes` و `animation:` در بلوک صحنه ممنوع.
- گیت‌های قدیمی دست‌نخورده: بی‌صدا/بدون Audio، بدون `<img`، بدون URL بیرونی، هدف لمسی ≥۶۴px، کاهش‌جنبش، فونت Vazirmatn خودی.

## ۳. اجزای موجود — نقشهٔ مرجع (پیش از M2، برای ورود سریع)

| جزء | کلاس | یادداشت |
| --- | --- | --- |
| نوار پیشرفت | `.play-progress` (+`__bar`) | ارزیابی: `visibility:hidden` |
| صحنهٔ صحنه | `.play-stage` (+`--teach/--main/--quiet/--scan/--end`) | اجرای اصلی خنثی با هالهٔ گرم ایستا |
| محرک | `.play-svg` | مقیاس سن‌محور `--stim-scale` از پروتکل |
| گزینه‌ها | `.play-option` | هدف لمسی ≥۶۴px |
| جادهٔ عددها | `.play-numline__*` | هدف لمسی ≥۷۸px |
| موج اسکن | `.play-scan__tile` (+`--catch`) | خانهٔ ≥۷۶px |
| رد پای دزد | `.play-trail__node` (+`--step`) | |
| حباب بازخورد | `.play-bubble` (+`--ok/--calm`) | شناور بالای صحنه؛ متن ثابت برای QA |
| پیل استریک | `.play-pill` | عنصر یگانه |
| سبد ستاره | `.play-basket` (+`__star`, `#play-basket-count`) | فقط تمرین |
| کارت مرحله | `.play-step-badge` + `.play-stars` | فقط تمرین؛ فراداده از سرور |
| خلاصهٔ پایان | `.play-debrief` (+`__line/__muted`) | فقط تمرین؛ قاعدهٔ دامنهٔ صفر |
| گیت جهت | `.play-rotate` | فقط لمسیِ عمودی |

## ۴. قرارداد افزودن جزء تازه (برای G3+)

1. markup ایستا از ماژول نمایش (`scene.js`/`kinds/*`/`session.js`) — بدون listener.
2. استایل در بلوک نام‌دار `play.css` با کامنت نسخه — بدون قالب کلیدی، بدون انیمیشن CSS.
3. جنبش فقط با تابع تازهٔ `fx.*` با گارد `motionOk`.
4. گیت تازه در `front-play-art.test.ts` یا `front-play-gates.test.ts` — «گیت خودش را بیفزاید، قدیمی را خاموش نکند».
5. هیچ متن روبه‌کودک بدون لینت واژهٔ ممنوع (`FORBIDDEN_TEXT_PATTERNS`) و بدون لحن §۲.
