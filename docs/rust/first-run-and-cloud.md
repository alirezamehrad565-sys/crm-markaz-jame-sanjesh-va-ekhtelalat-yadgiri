# طراحی — راه‌اندازی نخست، ماژول کلادفلر و هماهنگ‌ساز سینک (v1.26.0)

> وضعیت: تصمیم‌گرفته‌شده برای نسخهٔ 1.26.0 · پیش‌نیاز خوانش: docs/rust/design.md و docs/rust/node-sync.md
> انگیزه: گزارش کاربر واقعی — «نصب کردم؛ نه سروری ران شد، نه صفحهٔ ورود آمد» + نیاز جریان کامل راه‌اندازی نخست و ساخت سرور مرکزی با توکن کلادفلر.

## ۰) تشخیص عیب «هیچ سروری ران نمی‌کند»

سه علت ریشه‌ای که در v1.25.75 با هم معجون شده بودند:

1. **مسیر نصب یونیکد**: `productName` فارسی بود → نصب در `%LOCALAPPDATA%\Programs\مرکز جامع — نسخهٔ میز\` → مسیر `public` داخل قالب capnp و مسیرهای داخلی workerd با کاراکتر غیرASCII → workerd روی ویندوز در خواندن کانفیگ/دارایی‌ها می‌میرد. خطای آن فقط در `workerd.log` می‌نشیند و هیچ‌کس آن را نمی‌بیند.
2. **شکست بی‌صدا در پوسته**: در `start_engine_in_background` هر دو مسیر خطا (spawn و wait_healthy) فقط `eprintln` می‌کردند؛ پنجره روی صفحهٔ اولیه می‌ماند.
3. **صفحهٔ اولیهٔ خراب**: `frontendDist = ../../public` کل سایت استاتیک را داخل exe جاسازی می‌کرد؛ پنجره ابتدا همان را با پروتکل tauri:// باز می‌کرد که هیچ APIای ندارد → صفحهٔ ناقص/خالی بدون پیام.

**تصمیم‌ها:**
- `productName` فقط ASCII: `Markaz-Jame-Desktop` (عنوان پنجره فارسی می‌ماند). مسیر نصب و سایدکار همیشه امن.
- `frontendDist = boot-dist` — یک صفحهٔ بوت تک‌فایلی فارسی به‌جای کل سایت استاتیک داخل exe (سایت واقعی از `resources/engine/public` سرو می‌شود که از قبل هست).
- سه وضعیت موتور صریح: `booting / ready / failed{message, log_tail}` + سه فرمان: `desktop_status`، `engine_retry`، `open_data_dir`. صفحهٔ بوت هر ۷۰۰ms وضعیت را می‌پرسد؛ در حالت failed سه کنش دارد: تلاش دوباره / باز کردن پوشهٔ داده / **پیام به سازنده** (mailto با نسخه، خطا و دم لاگ).

## ۱) نقشهٔ کلی قطعات

```
پوسته دسکتاپ (Rust)
 ├─ boot-dist/index.html          ← صفحهٔ بوت/خطا/پیام به سازنده (تک‌فایل، آفلاین)
 ├─ lib.rs                        ← وضعیت موتور + فرمان‌های status/retry/open_data_dir
 ├─ cf_deploy.rs (جدید)           ← ماژول کلادفلر: توکن → D1 + مایگریشن + ورکر + راز + دامنه
 └─ secure_store.rs               ← Credential Manager (node_key, cf_token) — دست‌نخورده

سایت (SPA + موتور workerd)
 ├─ src/application/setup/ (جدید) ← GET /api/setup/status + POST /api/setup/complete (بستن حساب نمایشی)
 ├─ src/application/staff/ (جدید) ← CRUD کارکنان (گیت manager + audit)
 ├─ src/cloud-setup/wizard.ts     ← ویزار ۶ اسلایدی: لندینگ → اتصال → توکن CF → ساخت سرور → کارکنان → پایان
 ├─ src/node-sync-runner/         ← runner (موجود) + coordinator.ts (جدید: backoff/breaker/gate)
 ├─ login.js                      ← راهنمای «manager / 1234» فقط وقتی نصب اولیه است
 └─ api-routing/index.ts          ← سوارکردن مسیرهای جدید (status عمومی؛ بقیه گیت‌دار)

ورکر مرکزی مستقل (برای حساب کلادفلر کاربر)
 ├─ worker/src-entry-node.mjs     ← node-sync subapp + /admin/setup یک‌بارمصرف + اعلان‌ها + /healthz
 ├─ scripts/build-central-bundle.mjs ← باندل esbuild → worker/central-bundle.js
 └─ resources/engine/central/     ← central-worker.js + schema.sql (تجمیع ۱۱۵ مایگریشن) در زمان ساخت نصاب
```

## ۲) جریان راه‌اندازی نخست (قرارداد نهایی)

1. اجرای برنامه → صفحهٔ بوت: «در حال راه‌اندازی موتور محلی…» → آماده شد → ناوبری به `http://127.0.0.1:<port>/` با تزریق `__DESKTOP_SHELL__` و `__DESKTOP_FEATURES__={tutorial:true, setup:true}` (هم‌قرارداد قبلی).
2. SPA: صفحهٔ ورود. `login.js` یک‌بار `GET /api/setup/status` می‌زند؛ اگر `initialized=false` کارت راهنمای نصب اولیه با `manager / 1234` نشان می‌دهد (در وب هم بی‌ضرر است چون بعد از نخستین راه‌اندازی خاموش می‌شود).
3. پس از ورود manager: `maybeRunSetup` ویزار را باز می‌کند (گات‌های موجود flags.ts حفظ شده).
4. **اسلاید لندینگ** — سه مسیر + رد کردن:
   - «اتصال به سرور مرکزی موجود» → اسلاید اتصال (کد/کلید نود — قرارداد قبلی).
   - «ساخت سرور مرکزی با توکن کلادفلر» → اسلاید ساخت.
   - «پیام به سازنده» → دکمهٔ mailto با گزارش نسخه/خطاها (هم‌ساز صفحهٔ بوت).
5. **اسلاید کارکنان**: افزودن کارکنان واقعی (نام/نام‌کاربری/نقش/رمز) با `POST /api/staff`.
6. **پایان**: «بستن حساب‌های نمایشی و پایان» → `POST /api/setup/complete {close_demo:true}` — سه حساب seed (`manager/secretary/therapist` با idهای ثابت seed-demo) غیرفعال و رمزشان به هش تصادفی می‌رود؛ `settings.setup_completed=1`؛ رویداد audit برای هر حساب. از این‌جا `setup/status` = initialized و راهنمای لاگین دیگر ظاهر نمی‌شود.

قرارداد رد کردن حفظ می‌شود: skip هیچ قفلی ایجاد نمی‌کند و ویزار از تنظیمات دوباره باز می‌شود.

## ۳) ماژول کلادفلر (cf_deploy.rs) — توکن → ورکر + رمز

ورودی ویزار: توکن API کلادفلر (حداقل مجوزها: `Workers Scripts:Edit`، `D1:Edit`، `Account Settings:Read`) + نام حساب/شناسه اختیاری. توکن فقط به `api.cloudflare.com` می‌رود و پس از پایان در Credential Manager ذخیره می‌شود (`cf_token` — کلید از قبل مجاز است).

گام‌های فرمان `cloudflare_deploy` (هر گام در خروجی ساختاریافته لاگ می‌شود):

| گام | فراخوانی CF API | جزئیات |
|---|---|---|
| ۱. اعتبارسنجی توکن | `POST /client/v4/user/tokens/verify` | خطا → پیام فارسی با جزئیات CF |
| ۲. حساب | `GET /client/v4/accounts` | تک‌حساب خودکار؛ چند‌حساب با account_id اختیاری |
| ۳. پایگاه D1 | `GET/POST /accounts/{a}/d1/database` | نام `markaz-central`؛ موجود = استفاده |
| ۴. اسکیما | `POST .../d1/database/{db}/query` | schema.sql قطعه‌قطعه (~۶۴KB هر قطعه در مرز `;`)؛ نتیجه هر قطعه لاگ |
| ۵. ورکر | `PUT /accounts/{a}/workers/scripts/markaz-central` | multipart: ماژول central-worker.js + bindings: `DB`(D1)، `AUTH_SECRET`(تصادفی ۳۲بایت)، `NODE_SETUP_TOKEN`(تصادفی) |
| ۶. دامنه | `GET .../workers/subdomain` + `POST .../scripts/{name}/subdomain` | `https://markaz-central.<sub>.workers.dev` |
| ۷. سلامت | `GET {url}/healthz` تا ۶۰s | موفق → خروجی |

خروجی: `{ok, worker_url, admin_setup_token, auth_secret, steps[]}`. `AUTH_SECRET` و `NODE_SETUP_TOKEN` **یک‌بار** در پاسخ می‌آیند و فقط در ویزار مصرف/نمایش می‌شوند (در فایل ذخیره نمی‌شوند).

### ورکر مرکزی مستقل (حساب کاربر)

- ماژول‌ها: زیراپ `node-sync` کامل (pull/push/register/rotate/revoke/nodes — همه با همان گیت‌های موجود) + `registerAuthRoutes` (ورود) + مسیرهای ادمین جدید.
- `POST /admin/setup` با هدر `X-Setup-Token: <NODE_SETUP_TOKEN>` — یک‌بارمصرف (پرچم `central_setup_done` در settings): ساخت حساب مدیر واقعی روی مرکز.
- `POST /admin/announcements` + `GET /admin/announcements` با سشن manager: انتشار اعلان/کتابخانه برای نودها (INSERT INTO announcements با created_by خودِ مدیر مرکز).
- `GET /healthz` عمومی.
- نتیجه: پس از deploy، ویزار خودش «ساخت مدیر مرکز → ثبت نود این میز → آزمون اتصال» را با همان مسیرهای رسمی انجام می‌دهد و کد/کلید نود در مخزن امن می‌نشیند. قرارداد سینک (هدرها، فهرست سفید، idempotency) **هیچ تغییری** نمی‌کند.

## ۴) هماهنگ‌ساز سینک — ماتریس کامل خرابی‌ها

`coordinator.ts` دور runner موجود می‌نشیند (runner و client.ts و ورکر دست‌نخورده می‌مانند — همهٔ قراردادهای نرم حفظ است):

| # | سناریو | تشخیص | واکنش هماهنگ‌ساز | چیزی که کاربر می‌بیند |
|---|---|---|---|---|
| ۱ | اینترنت قطع | `network_error` (status 0) | backoff نمایی ۳۰s→۶h با لرزش ±۲۰٪؛ try بعدی خودکار | «قطع موقت — تلاش بعدی در …» |
| ۲ | ابر 5xx/429 | `http_error` 5xx یا `throttled` | همان backoff؛ 429 با Retry-After | «سرور مرکزی شلوغ/موقتاً از دسترس» |
| ۳ | کلید ابطال‌شده | `auth_error` (401/403) | **قرنطینه**: تلاش خودکار متوقف؛ فقط با تغییر اعتبار یا دکمهٔ دستی خارج می‌شود | «کلید نود پذیرفته نشد — اتصال را ویرایش کنید» |
| ۴ | ویرایش/ذخیرهٔ اعتبار جدید | `setCredentials()` | خروج از قرنطینه + صفرکردن backoff + تلاش فوری | — |
| ۵ | قطع وسط pull | cursor فقط با پاسخ کامل ok جلو می‌رود (موجود) | همان صفحه دوباره — idempotent | هیچ (شفاف) |
| ۶ | قطع وسط push | watermark فقط با ok جلو می‌رود (موجود) | آیتم‌ها در دورهٔ بعد دوباره؛ ابر duplicate را می‌شمارد | هیچ |
| ۷ | ناسازگاری نسخه | پاسخ 426 یا هدر `X-Node-Min-Version` بالاتر از APP_VERSION | **paused_version**: توقف کامل تا آپدیت برنامه | «برای سینک، برنامه را به‌روز کنید» |
| ۸ | آیتم مسموم در outbox | پارس دفاعی موجود در runner | عضو خراب دور ریخته می‌شود، بقیه می‌روند (موجود) | هیچ |
| ۹ | ingest موتور محلی خطا | `ingest_error` | بدون پیشروی cursor؛ دورهٔ بعد بعد از backoff کوتاه (۶۰s) | «استقرار محلی ناموفق — دورهٔ بعد» |
| ۱۰ | unconfigured | اعتبار ناقص | بدون هیچ fetch (موجود)؛ پنل «تنظیم نشده» | «اتصال ابر تنظیم نشده» |
| ۱۱ | ساعت سیستم جابجا | `server_time` pull | نمایش اختلاف؛ منطق بر مهر سرور است | — |
| ۱۲ | رد شدن دامنه | `rejected_domains` | fail-closed موجود — هیچ بایت بالینی بیرون نمی‌رود | پیام دامنه‌ها در پنل |

وضعیت جدید `SyncStatusV2` (سازگار با v1 — فیلدهای v1 حفظ): `mode: auto|quarantined|paused_version`، `consecutive_failures`، `next_attempt_at`، `last_error_kind`. پنل تنظیمات سه ردیف تازه می‌گیرد و دکمهٔ «همگام‌سازی الان» در قرنطینه هم کار می‌کند (تلاش دستی همیشه مجاز است).

## ۵) تغییر قراردادهای گیت (desktop-check.mjs)

- `frontendDist` باید `boot-dist` باشد + `boot-dist/index.html` موجود + حاوی `desktop_status`.
- `productName` باید ASCII باشد (assert جدید: `/^[\x20-\x7E]+$/`).
- بقیهٔ برسی‌ها (توکن‌ها، d1-seed، externalBin، resources) سر جایشان.

## ۶) امنیت — خلاصهٔ تصمیم‌ها

- کلید نود و توکن CF فقط در Credential Manager (secure_store.rs — دست‌نخورده).
- توکن CF فقط به api.cloudflare.com؛ لاگ deploy هرگز توکن را شامل نمی‌شود.
- `NODE_SETUP_TOKEN` یک‌بارمصرف است و پس از setup مدیر روی مرکز بی‌اثر می‌شود (پرچم settings).
- `AUTH_SECRET` مرکز تصادفی ۳۲بایتی per-deploy؛ در پاسخ deploy یک‌بار برمی‌گردد.
- بستن حساب نمایشی: `active=0` + هش تصادفی (ورود دوباره با 1234 ناممکن) + audit.
- فهرست سفید سه‌لایهٔ سینک هیچ تغییری نمی‌کند — دادهٔ بالینی هرگز از میز خارج نمی‌شود.

## ۷) نقشهٔ فایل‌های تغییر (v1.26.0)

| فایل | نوع | خلاصه |
|---|---|---|
| desktop/src-tauri/boot-dist/index.html | جدید | صفحهٔ بوت/خطا/پیام به سازنده |
| desktop/src-tauri/src/lib.rs | بازنویسی | وضعیت موتور + ۳ فرمان + diag mailto |
| desktop/src-tauri/src/cf_deploy.rs | جدید | deploy کامل با reqwest |
| desktop/src-tauri/Cargo.toml · tauri.conf.json | ویرایش | نسخه 1.26.0 · productName ASCII · frontendDist boot-dist · reqwest |
| worker/src-entry-node.mjs · scripts/build-central-bundle.mjs | جدید | ورکر مرکزی مستقل + باندل‌ساز |
| scripts/desktop/build-installer-runtime.mjs | ویرایش | گام central/ (باندل + schema.sql) + مانیفست |
| src/application/setup/* · src/application/staff/* | جدید | APIهای راه‌اندازی و کارکنان |
| src/application/api-routing/index.ts | ویرایش | سوارکردن مسیرهای جدید |
| src/cloud-setup/wizard.ts · src/cloud-setup/state.ts | ویرایش | لندینگ/ساخت سرور/کارکنان در ویزار |
| src/node-sync-runner/coordinator.ts · panel.ts | جدید/ویرایش | هماهنگ‌ساز + پنل وضعیت |
| public/assets/js/login.js | ویرایش | راهنمای نصب اولیه |
| scripts/desktop-check.mjs | ویرایش | قراردادهای جدید گیت |
| src/core/version.ts | ویرایش | 1.26.0 |
| src/__tests__/{setup-routes,coordinator}.test.ts | جدید | آزمون‌های گلوگاهی |
