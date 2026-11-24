# احکام تأییدکنندهٔ رقیب مستقل — گروه testing/ui (run_id: aud-20261124-8ca4227)

> تأییدکنندهٔ کور مستقل، فقط‌خواندنی، revision 8ca4227.

| id | حکم | شاهد کلیدی | توضیح |
|---|---|---|---|
| testing-001 | confirmed | jwt.ts:41؛ middleware.ts:97-101؛ e2e-auth.test.ts:31-99 | verifyAccessToken فقط تعریف (jwt.ts:41) و یک فراخوانی (middleware.ts:101)؛ grep بی‌حساسیت روی همهٔ *.test.ts صفر ارجاع؛ هیچ تستی هدر Cf-Access-Jwt-Assertion نمی‌فرستد و mock برای /cdn-cgi/access/certs هم نیست؛ ۴۰۱ِ «بدون توکن» قبل از شاخهٔ CF throw می‌شود. اصلاح استنادی جزئی: هارنس CF_ACCESS_TEAM_DOMAIN را در خطوط 125/149 می‌گذارد نه 173. |
| testing-002 | confirmed (با تصحیح عددی) | vitest.config.ts:14؛ package.json:59-68؛ front-profile-registry.test.ts:15 | ۵۶ فایل front-*، ۵۱ readFileSync ✓؛ environment node بدون jsdom ✓؛ بدون playwright/cypress ✓؛ هیچ import/eval ماژول فرانت جز یک مورد ✓. شمارش دقیق: ۱۰ ماژول واقعاً import و اجرا می‌شوند (profile/registry.js هم هست که ممیز از قلم انداخته بود) → ۷۴ از ۸۴ ماژول فرانت هرگز اجرا نمی‌شوند (≈۸۸٪) — جوهر یافته پابرجا. FakeDocument دست‌ساز فقط src/tutorial را اجرا می‌کند. |
| ui-001 | confirmed — شدیدتر از ادعا | components.css:759,754,806,827؛ tagging.js:36-44,114 | قاعدهٔ پایهٔ .tag-chip__x (width/height 15px، padding:0) در خط 806 بعد از بلاک coarse با specificity برابر می‌آید و ترتیب منبع مغلوبش می‌کند → اندازهٔ مؤثر واقعی در مد لمسی 15px است نه 22px؛ قاعدهٔ 759 عملاً کد مرده است. استثناهای WCAG 2.5.8 رد شدند: چیپ والد کلیک‌پذیر نیست، gap چیپ‌ها 4px، border-box سراسری. تخفیف جزئی: .tag-del با 24px (758) استثنای هدف هم‌ارز در رابط ویرایشگر تگ — ولی در نمایش چیپِ حذف‌پذیر تنها مسیر حذف همان × 15px است. اصلاح استنادی: خط 124 min-height:42px فقط search-row است نه کف کلی. |
