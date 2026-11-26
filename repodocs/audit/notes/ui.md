# یادداشت ممیزی UI — run_id: aud-20261124-8ca4227

ممیزی فقط-کد فرانت (`public/assets/css` + `public/assets/js`)، بدون اجرای مرورگر.
پوستهٔ کلاسیک قفل است (خواست کارفرما)؛ همهٔ توصیه‌ها درون پوسته.

## خلاصه یافته‌ها

| id | شدت | خلاصه | شاهد |
| --- | --- | --- | --- |
| ui-001 | high (pending) | `tag-chip__x` در مد لمسی ۲۲px — زیر کف ۲۴px گواه WCAG 2.5.8 AA که بلوک خودش ادعایش را دارد | components.css:759 مقابل 754؛ کف داخلی اپ 42px در 124 |
| ui-002 | medium | در `pointer:coarse` هشت کنترل ۲۶–۳۸px زیر کف ۴۲px خود اپ | components.css:755-762 مقابل 124 |
| ui-003 | medium | ~۱۲ اندازهٔ فونت px خام ≥۱۲px خارج از مقیاس توکن؛ گوت font-floor فقط <۱۲px را می‌بیند | base.css:879، components.css:206/1739، views.css:1489/1496/1503/1582/2145/2418؛ گوت src/__tests__/front-font-floor.test.ts:45 |
| ui-004 | low | فوکوس اولیهٔ openModal visibility را چک نمی‌کند (می‌تواند روی hiddenInput کامبو بیفتد)؛ تلهٔ فوکوس خودش سالم است | ui.js:426 مقابل فیلتر 397-399 |
| ui-005 | medium | server-pill بدون aria/role (تغییر وضعیت اعلام نمی‌شود)؛ نماهای client-errors/cloud-setup/outbox هم صفر aria | server-pill.js:24+؛ الگوی درست در reports.js:145 (aria-busy) |
| ui-006 | medium | `color:#fff` روی `--danger` در تم تیره: کنتراست ۲٫۸۲ زیر ۳٫۰ (روشن ۵٫۴۸ سالم)؛ گوت کنتراست فقط جفت توکنی می‌بیند | views.css:1813؛ توکن تیره base.css (بلوک data-theme=dark)؛ scripts/contrast-check.mjs:17 |

محاسبهٔ کنتراست ui-006 با WCAG نسبی درخشندگی: `#fff/#B8403A = 5.48`، `#fff/#E97971 = 2.82`.

## مواضع بازرسی‌شده که سالم بودند (مستندسازی منفی)

- **تلهٔ فوکوس مودال/⌘K**: `openModal` (ui.js:369-430) الگوی کامل دارد — `role=dialog` + `aria-modal` + `aria-labelledby` یکتا (392)، چرخش Tab/Shift+Tab با فیلتر عناصر رندرشده (397-414)، ESC روی مودالِ رویِ پشته (401-402)، بازگرداندن فوکوس به فراخوان (370/380)، قفل اسکرول بدنه و رهاسازی با آخرین بستن (381/424). `global-search` از همان `openModal` استفاده می‌کند (global-search.js:289) پس ⌘K همان تله را می‌گیرد.
- **تب‌ها**: roving tabindex + کلیدهای جهت با آگاهی RTL (چپ = بعدی) + Home/End (ui.js:211-238).
- **کامبو**: ArrowDown/Up + Enter + Escape + `aria-activedescendant` + `aria-expanded/controls/autocomplete` (ui.js:529-600).
- **row-menu**: ESC + کلیک بیرون + بسته‌شدن با اسکرول، آیتم‌ها button (ui.js:1001-1003).
- **toast**: stack با `role=status aria-live=polite`، خطا `role=alert`، بستن با aria-label (ui.js:258-271). `lockBtn` با aria-busy (ui.js:298-313).
- **دراور/سایدبار**: ESC (app.js:210) + backdrop با aria-label «بستن منو» (app.js:612).
- **RTL آیکون‌ها**: مکانیزم `.ico--flip` با `RTL_FLIP={undo,send}` (ui.js:136، components.css:13). کاربردهای `chevR/chevL` توسط فراخوان جهت انتخاب می‌شود؛ نمونهٔ نقض مشخص پیدا نشد — در ui-007 لازم نیست.
- **اعداد**: الگوی واحد `fa(Number(n).toLocaleString('en-US'))` (backup.js:35، finance.js:32) — رقم فارسی با جداکنندهٔ گروه لاتین؛ یکدست است و یافته محسوب نمی‌شود (فقط نکته: جداکنندهٔ `,` لاتین در بافت RTL، در صورت دلخواهی کارفرما قابل تبدیل به `٬`).
- **تم تیره**: توکن‌های رنگی تیره کامل و کارت‌ها توکنی‌اند؛ فقط ui-006 رنگ هاردکد زیر threshold رفت. بلاک 4035+ views.css چاپ است (بیرون تم).

## سازگاری با گوت‌های موجود (⑥)

- `front-font-floor.test.ts`: قواعدش با یافته‌ها نمی‌شکند؛ مواضع ui-003 همه ≥۱۲px یعنی در کور-اسپات گوت‌اند — گوت دامنهٔ ≥۱۲px را هم می‌پوشاند اگر مقادیر به توکن مهاجرت کنند.
- `scripts/contrast-check.mjs`: فقط جفت‌های توکن-به-توکن؛ ui-006 جفت هاردکد×توکن را پیشنهاد می‌کنیم به `src/__tests__/front-contrast.test.ts` پین شود (نمونهٔ موجود: login__error).
- `scripts/ui-voice-check.mjs`: با توصیه‌های سازگار است — رشتهٔ جدیدی لازم ندارد؛ labelهای پیشنهادی فارسی ui هستند.
- **گوت غایب**: هیچ گوت خودکاری برای «کف هدف لمسی» نیست (الگوی S دستی است)؛ ui-001/ui-002 را می‌شود مثل font-floor استاتیکی گیت کرد (پویش width/height در بلوک coarse).

## پوشش‌نیافته‌ها و محدودیت‌ها

- `public/assets/play` (موتور بازی‌ها + skins) بازرسی نشد — سطح تعاملی جدا با گوت‌های خودش (front-play-*).
- بقیهٔ نماها (۳۲ فایل) فقط با پویش الگویی (aria/role/Escape/px/hex) پوشش شدند؛ خوانش عمیق فقط ui.js، app.js، global-search.js، server-pill.js، reports.js، سه css اصلی.
- HTML پوستهٔ اپ (index.html تولیدی build، بیرون public/assets) در دسترس پویش نبود؛ نقش‌های landmark سراسری (main/nav/banner) از این ممیزی قابل قطعیت نیست — app.js فقط با `getElementById` به آن‌ها وصله.
- بدون اجرای مرورگر: ابعاد لمسی/کنتراست/فوکوس از روی کد و محاسبه سنجیده شد، نه رندر واقعی.
