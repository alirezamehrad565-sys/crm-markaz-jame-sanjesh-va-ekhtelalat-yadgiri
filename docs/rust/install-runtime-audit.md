# گزارش ممیزی جریان نصب و راه‌اندازی Runtime — مرکز جامع (نسخهٔ میز، v1.27.04)

**وضعیت:** فقط تحلیل — هیچ فایل/تنظیم/بیلدی تغییر نکرده است.
**دامنهٔ بررسی:** `worker/`، `scripts/build-*.mjs`، `scripts/desktop/*`، `scripts/engine/*`، `desktop/src-tauri/*` (lib.rs، engine.rs، tauri.conf.json)، `.github/workflows/desktop-build.yml`، قالب رسمی NSIS تائوری (tauri-bundler).
**تاریخ:** ۱۴۰۴/۰۸/۲۳ — بر پایهٔ commit `e25c411` (v1.27.04 منتشرشده)

---

## ۰. خلاصهٔ مدیریتی

خطای v1.27.04 **علت قطعی و اثبات‌شده در سورس** دارد: **ناسازگاری مسیر باندل‌ها بین اسکریپت مونتاژ و Launcher در شاخهٔ نصابِ `lib.rs`**. مونتاژ باندل‌های موتور را در `resources/engine/bundles/` می‌نویسد، ولی `boot_engine` در حالت نصاب دنبال `resources/engine/central/worker.js` و `central/games.js` می‌گردد — مسیرهایی که هرگز تولید نمی‌شوند (پوشهٔ `central/` میراث v1.26.0 است و فقط `central-worker.js` (ورکر کلود — منبعی کاملاً دیگر) و `schema.sql` را دارد).

این خطا **عیناً پیام پیش‌بازرسی تازهٔ v1.27.04 است** — مکانیزم تشخیص‌پذیریِ اضافه‌شده در همین نسخه درست کار کرده: قبل از spawn فایل‌های غایب را نام‌وبنام گزارش می‌کند و چون spawn رخ نداده، `engine.log` خالی است (رفتار طراحی‌شده، نه خرابی).

نکتهٔ تاریخی مهم: **در v1.27.03 همین نقص مسیر وجود داشت**، ولی preflight آن نسخه فقط `engine-server.js` را وارسی می‌کرد؛ spawn انجام می‌شد و نود پیش از رسیدن به کد ما به‌دلیل خرابی argv در لایهٔ میانی ویندوز (EISDIR `lstat 'C:'`) می‌مرد — یعنی دو شکست روی‌هم بودند. v1.27.04 لایهٔ اول (argv) را ساختاری بست و لایهٔ دوم (مسیر باندل‌ها) را با پیش‌بازرسی سطح آورد.

یادداشت برای سؤالات فرم ممیزی: این پروژه **Electron نیست** — Tauri v2 + NSIS است؛ مفاهیم Electron Builder/ASAR موضوعیت ندارند (§۳-ب).

---

## ۱. علت قطعی خطای v1.27.04

### ۱-۱. زنجیرهٔ شواهد (هر سه سمت، از سورس)

| سمت | فایل:خط | محتوا |
| --- | --- | --- |
| مونتاژ (تولید) | `scripts/desktop/build-installer-runtime.mjs:183-187` | `mainBundle = bundles/worker.js` ← کپی از `worker/bundle.js`؛ `gamesBundle = bundles/games.js` ← کپی از `worker/games-bundle.js` |
| محتوای واقعی mount | `ls resources/engine/central/` | فقط `central-worker.js` (980,782B) و `schema.sql` (574,245B) — **بدون worker.js/games.js** |
| Launcher (مصرف) | `desktop/src-tauri/src/lib.rs:120-124` (شاخهٔ نصاب) | `engine_res.join("central/worker.js")` و `engine_res.join("central/games.js")` |
| Launcher (توسعه) | `desktop/src-tauri/src/lib.rs:101-107` (شاخهٔ dev) | `worker/bundle.js` و `worker/games-bundle.js` — **درست** |

**اثبات اندازه:** `bundles/worker.js` = 3,950,615 بایت = دقیقاً `worker/bundle.js` (3,950,615B). یعنی باندل‌ها در نصاب هستند، فقط در پوشهٔ دیگری از چیزی که `lib.rs` انتظار دارد.

**اثبات از خود پیام خطا:** مسیرهای گزارش‌شده توسط کارفرما (`resources/engine/central/worker.js`, `central/games.js`) عیناً رشته‌های `lib.rs:120-124` هستند — و غیبتِ پیام برای `engine-server.js` و `public/index.html` ثابت می‌کند آن دو فایل در نصب واقعی موجودند؛ فقط دو باندل غایب‌اند.

**نقش manifest:** `engine-runtime-manifest.json` مسیر و هش درست باندل‌ها را ثبت می‌کند (`m.bundles.main`، `m.bundles.mainSha256` — خط 139 مونتاژ)؛ حقیقت در manifest هست ولی `lib.rs` آن را نمی‌خواند و مسیرها را hardcode کرده است.

### ۱-۲. چرا همهٔ آزمون‌ها سبز بودند ولی نصب واقعی سرخ؟

- `engine-smoke.mjs` (حالت adapter) و شبیه‌سازی نصب، مسیرها را از **شاخهٔ توسعه** یا دستی (`bundles/worker.js`) می‌دهند — نه از تیپل `lib.rs`.
- CI (`desktop-build.yml`) مونتاژ + `--check` را اجرا می‌کند ولی **هیچ گیتِ تطبیق «مسیرهای مورد انتظار lib.rs ↔ خروجی مونتاژ» وجود ندارد**؛ `desktop-check` فقط حضور گام مونتاژ در workflow را می‌سنجد.
- نتیجه: کلاس خطای «قرارداد مسیر بین دو سمت» هیچ نگهبانی ندارد — این مهم‌ترین حفرهٔ فرایندی است.

### ۱-۳. بازسازی دقیق رویداد در ماشین کارفرما

1. نصب v1.27.04 → NSIS همهٔ فایل‌ها را می‌ریزد: `node.exe` (ریشه) + `resources\engine\{engine-server.js, bundles\{worker,games}.js, central\{central-worker.js, schema.sql}, public\*, d1-seed\*}`.
2. کاربر برنامه را باز می‌کند → `boot_engine` → تیپل نصاب → `central/worker.js` وجود ندارد.
3. **پیش‌بازرسی v1.27.04** (`engine.rs::start`) هر دو باندل را غایب می‌بیند → پیام فارسی نام‌وبنام → **بدون spawn** → `engine.log` خالی → وضعیت `EnginePhase::Failed` در UI.

---

## ۲. ردیابی کامل زنجیرهٔ Build (پاسخ تفصیلی بخش اول مأموریت)

### ۲-۱. سورس → خروجی

| # | محصول | سورس | ابزار | خروجی نهایی در مخزن |
| --- | --- | --- | --- | --- |
| 1 | ورکر اصلی (Hono + D1) | `worker/src-entry.mjs` + ماژول‌های `src/*` | esbuild (`scripts/build-worker-bundle.mjs`) | `worker/bundle.js` (3.95MB + بنر نسخهٔ 1.27.4) |
| 2 | ورکر بازی‌ها | `src/games-worker.ts` | esbuild (`scripts/build-worker-games.mjs`) | `worker/games-bundle.js` (1.22MB) |
| 3 | سرور موتور محلی | `scripts/engine/engine.mjs` (+entry) | `npm run build:engine-server` | `scripts/engine/engine-server.js` |
| 4 | پوستهٔ کلاینت | `src/*` | `npm run build:client` | `public/` (+ مُهر `?v=` در `public/index.html` — **دستی bump می‌شود**) |
| 5 | ورکر مرکزی کلود (میراث) | `worker/central-bundle.js` (commit‌شده؛ بازسازی با `scripts/build-central-bundle.mjs`) | — | فقط برای دارایی‌های نصاب `central/` |

### ۲-۲. انتقال به `resources/engine` (چه کسی، کجا)

`scripts/desktop/build-installer-runtime.mjs` (اجرا در CI قبل از `tauri build` و در محیط توسعه):
- ① دانلود سایدکار node نسخهٔ pinned از nodejs.org → `binaries/node-<target>` (+هش در manifest)
- ② `public/` → `resources/engine/public/`
- ③ مایگریشن‌های رسمی + seed نمایشی → checkpoint → `resources/engine/d1-seed/` (فایل sqlite تکی در چیدمان miniflare)
- ④ `engine-server.js` → ریشهٔ `resources/engine/`؛ باندل‌ها → **`resources/engine/bundles/`** (خطوط 180-187)
- ⑤ `central-worker.js` + `schema.sql` → **`resources/engine/central/`** (خطوط 194-205 — دارایی v1.26.0 برای «ساخت سرور مرکزی»، ربطی به موتور محلی ندارد)
- ⑥ هش‌ها → `desktop/src-tauri/engine-runtime-manifest.json`
- `--check` همهٔ خروجی‌ها و هش‌ها را دوباره وارسی می‌کند (در CI اجرا می‌شود).

### ۲-۳. پاسخ پرسش‌های فرم

5. **مسیرهای خروجی Build با انتظار Launcher یکسان هستند؟** — **خیر؛ همین علت خطاست** (bundles/ در برابر central/ در شاخهٔ نصاب؛ شاخهٔ dev هم‌خوان است).
6. **آیا ابزار Packaging فایل‌ها را حذف می‌کند؟** — خیر. Electron Builder نداریم؛ قالب NSIS تائوری (بررسی‌شده از سورس `tauri-bundler`) فایل‌ها را عیناً کپی می‌کند (`File /a "/oname=..."`) و سایدکار را با نام لخت در ریشهٔ نصب می‌گذارد. چیزی حذف نمی‌شود؛ فایل‌ها از اول در `central/` نبوده‌اند.
7. **ASAR؟** — موضوعیت ندارد: Tauri آرشیو ASAR ندارد؛ resources فایل‌های لخت کنار exe هستند (خارج از هر آرشیو).

---

## ۳. ردیابی Launcher (بخش دوم مأموریت)

### ۳-۱. قرارداد spawn فعلی (v1.27.04) — از `engine.rs`

| مورد | مقدار واقعی |
| --- | --- |
| Node Executable | `CENTER_NODE_BIN` (env، اگر فایل بود) → `<exe_dir>\node.exe` → `<exe_dir>\binaries\node.exe` → `<exe_dir>\binaries\node-*` (read_dir) → در توسعه: `node` روی PATH (فقط وقتی `CENTER_ENGINE_REPO` ست است) → در نصاب: خطای صریح «سایدکار node.exe کنار برنامه یافت نشد» |
| Engine Server | نصاب: `<resource_dir>\resources\engine\engine-server.js` — توسعه: `<repo>\scripts\engine\engine-server.js` |
| Main Worker | نصاب: `<engine_res>\central\worker.js` (**نادرست — باید `bundles\worker.js` باشد**) — توسعه: `<repo>\worker\bundle.js` |
| Games Worker | نصاب: `<engine_res>\central\games.js` (**نادرست — باید `bundles\games.js`**) — توسعه: `<repo>\worker\games-bundle.js` |
| آرگومان‌ها | `node engine-server.js --engine adapter --data-dir <abs> --port 8787 --games-port 8788 --main-bundle <abs> --games-bundle <abs> --public-dir <abs>` |
| Working Directory | `cwd = پوشهٔ والد engine-server.js` (v1.27.04 — main **نسبی** پاس می‌شود؛ ضد-EISDIR) |
| Environment | هیچ env اضافه‌ای ست نمی‌شود (ارث از والد)؛ در ویندوز `CREATE_NO_WINDOW (0x08000000)`؛ stdout=null؛ stderr→`<dataDir>\engine.log` (append)؛ **پیش از spawn خط فرمان کامل در engine.log نوشته می‌شود** |
| منطق Adapter/Workerd | workerd از v1.27.03 کاملاً حذف شده؛ فقط `--engine adapter` (اجرای درون‌پروسه‌ای باندل‌ها روی سایدکار node با shim کامل D1 روی `node:sqlite`) |
| پورت‌ها | درخواست اولیه: 8787/8788 یا گذرا (`free_port`)؛ **نهایی از `dataDir\engine-config.json`** خوانده می‌شود (`wait_engine_config` تا ۳۰ ثانیه) |
| نگهبان | `supervise`: خروج غیرعمد کودک → respawn با همان plan؛ پرچم `stop` برای خاموشی عمدی؛ شمارندهٔ generation برای ابطال رویدادهای کهنه |

### ۳-۲. سلامت
- Rust فقط `/health` ورکر **اصلی** را می‌پرسد (`health_once`، تایم‌اوت ۲ثانیه). بازی‌ها فقط به‌واسطهٔ binding `gamesHealthUrl` (آینهٔ `sys_games_health` داخل ورکر اصلی) دیده می‌شوند — **پروب مستقل Rust برای Games Worker وجود ندارد** (حفره، در طراحی §۴-ب بسته می‌شود).
- رویدادها: `engine:restarting / engine:restored / engine:down` + وضعیت‌ها `EnginePhase::{Booting, Ready{port}, Failed{message, log_tail}}` — فعلاً ۳ وضعیت، نه FSM کامل.

### ۳-۳. انتقال مسیر ویندوزی (Drive Letter / Backslash / `:`)
- Rust `std::process::Command` در ویندوز مستقیماً `CreateProcessW` می‌سازد — **بدون shell و بدون هیچ تجزیهٔ `:`**؛ هر آرگومان یک رشتهٔ مستقل argv است و بک‌اسلش/درایو دست‌نخورده می‌رسد.
- سمت نود: `path.win32` درایو را native می‌فهمد؛ کانفیگ JSON (serde) مسیرهای مطلق ویندوزی را سالم جابه‌جا می‌کند.
- تنها حادثهٔ تاریخیِ مرتبط با `:`، EISDIR v1.27.03 بود (main که بعد از resolve به ریشهٔ درایو می‌رسید → `lstat 'C:'`) — ریشه‌یابی و رفع ساختاری (main نسبی + cwd صریح) در همین نسخه انجام شد و در گیت ⑦ پین شده است.

---

## ۴. نمودار جریان فعلی (Build → Install → Runtime)

```text
[Build]
worker/src-entry.mjs ──esbuild──▶ worker/bundle.js (3.95MB)
src/games-worker.ts  ──esbuild──▶ worker/games-bundle.js (1.22MB)
scripts/engine/engine.mjs ──build:engine-server──▶ scripts/engine/engine-server.js
src/* ──build:client──▶ public/  (index.html: ?v= دستی)

[CI desktop-build]
build-installer-runtime.mjs --target x86_64-pc-windows-msvc
  ├─ دانلود node v22.23.5 ──▶ binaries/node-<target>          (هش → manifest)
  ├─ public/ ──────────────▶ resources/engine/public/
  ├─ migrations+seed ──────▶ resources/engine/d1-seed/
  ├─ engine-server.js ─────▶ resources/engine/engine-server.js
  ├─ worker/bundle.js ─────▶ resources/engine/bundles/worker.js   ◀── تولید می‌شود
  ├─ worker/games-bundle.js▶ resources/engine/bundles/games.js    ◀── تولید می‌شود
  ├─ worker/central-bundle.js▶ resources/engine/central/central-worker.js (میراث v1.26)
  └─ schema.sql ───────────▶ resources/engine/central/schema.sql
  └─ manifest: src-tauri/engine-runtime-manifest.json  (خارج از resources → شحنمی‌رود!)
--check (هش‌ها) ──▶ npx @tauri-apps/cli@2 build ──▶ NSIS

[NSIS install — $INSTDIR = %LOCALAPPDATA%\Markaz-Jame-Desktop]
Markaz-Jame-Desktop.exe ، node.exe (سایدکار لخت)، resources\engine\... (فایل لخت، بدون آرشیو)

[Runtime boot — lib.rs::boot_engine]
تیپل نصاب:  server=resources\engine\engine-server.js ✓
            main  =resources\engine\central\worker.js ✗ (هرگز تولید نشده) ◀◀◀ خطای فعلی
            games =resources\engine\central\games.js  ✗
            public=resources\engine\public ✓   data=%APPDATA%\ir.sdt144.center.desktop
پیش‌بازرسی v1.27.04 ──▶ FAIL (دو باندل) ──▶ بدون spawn ──▶ engine.log خالی ──▶ UI: Failed
```

---

## ۵. نمودار معماری پیشنهادی

```text
[Installer — استیج‌ینگ/اعتبارسنجی/انتقال اتمیک]
Setup.exe
  ├─ استخراج به %TEMP%\markaz-stage-<rand>          (۱)
  ├─ وارسی فایل‌های ضروری (فهرست ثابت)              (۲)
  ├─ SHA-256 همهٔ فایل‌ها ↔ manifest شحنده          (۳)  ← manifest باید داخل resources شحنده شود
  ├─ وارسی نسخه/هش سایدکار node                     (۴،۵)
  ├─ انتقال اتمیک: rename سطری از stage → $INSTDIR  (۶)  (خرابی = پاک‌سازی stage + پیام؛ نصب ناقص هرگز «موفق» ثبت نمی‌شود)
  ├─ ثبت install-manifest.json در dataDir           (۷)  (نسخه/هش‌ها/زمان/نتیجه)
  ├─ ساخت dataDir کاربر (اگر نیست)                  (۸)
  ├─ تست اولیه بوت: node.exe --version + preflight فایل‌ها (۹)
  └─ ثبت نتیجه نصب (لاگ نصاب)                       (۱۰)

[Runtime Manager — FSM با سلامت مستقل دو ورکر]
PRECHECK ─▶ VALIDATING ─▶ PREPARING ─▶ STARTING ─▶ HEALTH_CHECK ─▶ READY
    │            │             │            │              │            │
    └── هر گام: خطای صریح فارسی + log_tail ──▶ FAILED ◀─────┘            │
                                                              DEGRADED ◀─┘ (یکی از دو ورکر ناسالم)
READY ⇄ DEGRADED / FAILED ──(نگهبان respawn)──▶ STARTING
READY/DEGRADED ──خروج عمدی──▶ STOPPING ──▶ STOPPED
پروب‌ها: main /health روی mainPort و games /health روی gamesPort — مستقل، هرکدام با مهلت و سیاست خودش
```

---

## ۶. جدول اختلاف وضعیت فعلی و مطلوب

| # | موضوع | وضعیت فعلی | وضعیت مطلوب | فاز |
| --- | --- | --- | --- | --- |
| 1 | مسیر باندل‌ها در شاخهٔ نصاب | `central/worker.js`، `central/games.js` — نادرست | `bundles/worker.js`، `bundles/games.js` (+هم‌خوانی با manifest) | **P0** |
| 2 | گیت قرارداد مسیر lib.rs ↔ مونتاژ | ندارد | گیت اختصاصی: مسیرهای استخراج‌شده از lib.rs باید در خروجی مونتاژ/manifest باشند | **P0** |
| 3 | شبیه‌سازی نصب با تیپل واقعی lib.rs | شبیه‌ساز مسیرها را دستی می‌دهد | شبیه‌ساز تیپل lib.rs را مصرف کند (نه مسیر دستی) | **P0** |
| 4 | manifest رانتایم | در `src-tauri/` ریشه — شحنمی‌رود | داخل `resources/engine/` تا با اپ نصب شود | **P1** |
| 5 | وارسی هش هنگام بوت (PRECHECK) | فقط `is_file` | تطبیق SHA-256 فایل‌ها با manifest شحنده | **P1** |
| 6 | وارسی نسخهٔ node | فقط وجود فایل | اجرای `node --version` و تطبیق با pinned در PRECHECK/STARTING | **P1** |
| 7 | سلامت Games Worker | فقط آینهٔ داخلی ورکر اصلی | پروب مستقل `/health` روی gamesPort در نگهبان Rust | **P1** |
| 8 | FSM وضعیت‌ها | ۳ وضعیت (Booting/Ready/Failed) | ۱۰ وضعیت با شرط ورود/خروج/مهلت (§۷) | **P1** |
| 9 | کپی d1-seed در بوت نخست | کپی بازگشتی ساده (اگر وسطش قطع شود، کپی ناقص می‌ماند) | کپی به `dataDir\d1.tmp` + rename اتمیک | **P1** |
| 10 | Repair | ندارد (فقط «نصاب را دوباره اجرا کنید» در متن خطا) | جریان Repair مستند + preflight دقیقاً نام فایل غایب را بدهد (هست)؛ هیچ‌گاه dataDir را لمس نکند | **P2** |
| 11 | ثبت نتیجهٔ نصب | لاگ NSIS عمومی | `install-manifest.json` در dataDir + لاگ نصاب | **P2** |
| 12 | تکی‌نمونه و چرخش لاگ Rust | باز (ریسک‌های ۹ و ۱۰ سند ریسک) | قفل تکی‌نمونه + چرخش engine.log سمت Rust | **P2** |

---

## ۷. طراحی Runtime Manager — FSM ده‌وضعیتی

| وضعیت | شرط ورود | شرط خروج | مهلت | رفتار خطا |
| --- | --- | --- | --- | --- |
| PRECHECK | شروع بوت | همهٔ فایل‌های لازم موجود (node، engine-server، دو باندل، public/index.html، d1-seed) | ≤ ۲ث | هر فایل غایب → FAILED با نام دقیق فایل + پیشنهاد Repair (بدون spawn) |
| VALIDATING | PRECHECK سبز | SHA-256 فایل‌ها ↔ manifest + `node --version` = pinned | ≤ ۵ث | عدم تطبیق → FAILED («فایل ناقص/دستکاری‌شده؛ Repair») |
| PREPARING | VALIDATING سبز | dataDir آماده؛ d1-seed فقط اگر `dataDir\d1` نیست (کپی اتمیک tmp+rename) | ≤ ۱۰ث | خطای دیسک/دسترسی → FAILED |
| STARTING | PREPARING سبز | spawn موفق؛ خط فرمان در engine.log | spawn فوری است؛ خطا → FAILED («spawn ناموفق») |
| HEALTH_CHECK | STARTING موفق | ورود engine-config.json + پاسخ `/health` **هر دو ورکر** | ۳۰ث (موجود) | تایم‌اوت → FAILED با log_tail؛ تلاش دوباره دستی = engine_retry (نسل جدید) |
| READY | سلامت هر دو | خروج عمدی → STOPPING | — | نگهبان فعال؛ افت بعدی → DEGRADED |
| DEGRADED | یکی از دو ورکر ناسالم (۳ بار پروب ناموفق) | بازگشت سلامت → READY؛ یا خروج کودک → STARTING/FAILED | پروب هر ۵ث | رویداد `engine:degraded` به UI؛ respawn فقط برای سمت خراب در صورت امکان |
| FAILED | هر خطای صریح | فقط engine_retry (دستی) یا بستن اپ | — | پیام فارسی + log_tail؛ بدون respawn خودکار بی‌نهایت |
| STOPPING | خاموشی عمدی | پرچم stop + kill درست کودک | ≤ ۵ث به خروج تمیز، بعد kill | — |
| STOPPED | کودک با پرچم stop خارج شد | — | — | هیچ نگهبانی restart نمی‌کند |

**سلامت مستقل:** پروب اصلی: `GET 127.0.0.1:<mainPort>/health`؛ بازی‌ها: `GET 127.0.0.1:<gamesPort>/health` (endpoint از قبل در games-worker هست — مصرفش مستقل می‌شود). نتیجهٔ هر دو در وضعیت READY/DEGRADED لحاظ می‌شود.

---

## ۸. حفاظت از اطلاعات (بخش پنجم مأموریت)

| بررسی | وضعیت | شواهد |
| --- | --- | --- |
| دیتابیس مستقل از resources | ✅ بله | DB = `%APPDATA%\ir.sdt144.center.desktop\d1\miniflare-D1DatabaseObject\<hash>.sqlite`؛ resources فقط خواندنی برنامه است |
| نصب نسخهٔ جدید داده را حفظ می‌کند؟ | ✅ بله | NSIS فقط `$INSTDIR` را بازنویسی می‌کند؛ dataDir دست‌نخورده؛ `boot_engine` فقط اگر `dataDir\d1` نباشد seed کپی می‌کند (`lib.rs` — گارد `if !data_dir.join("d1").exists()`) |
| Repair فقط فایل‌های ثابت برنامه؟ | ⚠️ طراحی لازم | امروز Repair «نصب مجدد» است (فقط $INSTDIR) — درست، ولی باید مستند و از UI هدایت شود؛ هیچ‌گاه dataDir را لمس نکند |
| بازیابی فقط با تأیید سلامت بکاپ | ⚠️ ناقص | فعلاً هنگام بوت یک audit ردیف `db.backup_file` ثبت می‌شود (`engine.mjs:257`) ولی جریان بازیابی با وارسی سلامت بکاپ تعریف نشده — به P1/P2 (وارسی `PRAGMA quick_check` روی بکاپ پیش از جایگزینی) |
| کپی d1-seed اتمیک | ⚠️ | کپی بازگشتی ساده؛ وسط کپی اگر اپ قطع شود کپی ناقص می‌ماند → tmp+rename (P1) |

---

## ۹. فهرست تغییرات لازم با اولویت (فایل‌های پیاده‌سازی آینده)

### P0 — رفع خطای فعلی (پیش‌نیاز انتشار 1.27.05)
1. `desktop/src-tauri/src/lib.rs` — تیپل نصاب: `central/worker.js` → `bundles/worker.js` و `central/games.js` → `bundles/games.js` (دو خط).
2. `scripts/desktop-check.mjs` — گیت تازهٔ «قرارداد رانتایم»: از `lib.rs` مسیرهای مورد انتظار استخراج و با رشته‌های `build-installer-runtime.mjs`/manifest تطبیق شود (پین `bundles/worker.js` در هر دو سمت).
3. `scripts/desktop/installer-sim.mjs` (یا همین شبیه‌سازی درون desktop-check) — شبیه‌سازی بوت با **تیپل واقعی lib.rs** (نه مسیر دستی) تا این کلاس خطا دائماً پوشیده شود.

### P1 — استحکام رانتایم (بعد از تأیید 1.27.05 روی ماشین کارفرما)
4. `scripts/desktop/build-installer-runtime.mjs` + `scripts/desktop/config.mjs` — انتقال manifest به `resources/engine/` تا شحنده شود؛ مصرف آن در `--check`.
5. `desktop/src-tauri/src/engine.rs` — PRECHECK/VALIDATING: تطبیق SHA-256 با manifest + `node --version`؛ FSM کامل §۷ با مهلت‌های جدا؛ DEGRADED.
6. `desktop/src-tauri/src/lib.rs` + `engine.rs` — پروب مستقل games `/health`؛ رویداد `engine:degraded`؛ کپی اتمیک d1-seed.
7. `scripts/engine/engine-smoke.mjs` — افزودن بررسی سلامت مستقل بازی‌ها.

### P2 — بهداشت و Repair
8. جریان Repair مستند (`docs/ADMIN-GUIDE.fa.md` + متن خطا) — فقط بازنویسی `$INSTDIR`، هرگز dataDir.
9. `install-manifest.json` در dataDir + لاگ نتیجهٔ نصب.
10. تکی‌نمونه + چرخش engine.log سمت Rust؛ بازیابی دیتابیس فقط با `PRAGMA quick_check` روی بکاپ.

---

## ۱۰. طرح تست ویندوز (پیش از انتشار هر نسخهٔ میز)

| # | سناریو | گام‌ها | معیار قبولی |
| --- | --- | --- | --- |
| T1 | نصب تازه (VM ویندوز ۱۰/۱۱ تمیز) | نصب → بازکردن اپ | بوت ≤ ۳۰ث؛ `/health` هر دو پورت 200؛ ورود manager/1234؛ `engine-config.json` و `install-manifest.json` درست |
| T2 | ارتقا از 1.27.02/03/04 با دیتای موجود | نصب روی نسخهٔ قبل | داده‌های کاربر سرجایش؛ d1-seed دوباره کپی نشده؛ نسخه در UI درست |
| T3 | Repair | حذف دستی `resources\engine\bundles\worker.js` → بازکردن اپ | پیام فارسی **نام همان فایل** + engine.log خالی (بدون spawn) → نصب مجدد → سبز، دیتا سالم |
| T4 | اجرای مجدد نصاب | دو بار نصب پشت‌سرهم | بدون خطا؛ layout یکسان؛ دیتا حفظ |
| T5 | لایهٔ میانی/AV (ریسک #۴) | نصب با Defender فعال + روی build 26300 | بوت سبز؛ اگر شکست: engine.log **خط فرمان کامل spawn** را دارد (گزارش خودتوضیح) |
| T6 | اشغال پورت‌ها | اشغال 8787/8788 پیش از بازکردن اپ | موتور پورت آزاد می‌گیرد و نهایی را در engine-config.json می‌نویسد؛ Rust همان را مصرف می‌کند |
| T7 | کاربر یونیکد (`C:\Users\علی…`) | نصب با کاربر فارسی | بوت و مسیرها سالم |
| T8 | آفلاین پس از نصب | قطع اینترنت → بازکردن اپ | همه‌چیز محلی سبز (هیچ وابستگی شبکه‌ای در بوت) |
| T9 | حذف و نصب مجدد | uninstall → install | dataDir حذف نشود؛ دیتا باقی |
| T10 | گیت‌های CI | desktop-check + smoke دوهاته + گیت قرارداد تازه | همه سبز؛ آرتیفکت: `central/` فقط central-worker.js+schema.sql و `bundles/` هر دو باندل |

---

## ۱۱. برنامهٔ اجرایی مرحله‌ای (هر مرحله مستقل/قابل‌تست/قابل‌بازگشت)

| مرحله | محتوا | تست قبولی | بازگشت |
| --- | --- | --- | --- |
| **M1 (P0)** | دو خط lib.rs + گیت قرارداد + شبیه‌ساز با تیپل lib.rs | همهٔ گیت‌ها + شبیه‌سازی سبز | یک commit — `git revert` تکی |
| **M2 (P0)** | انتشار 1.27.05 (بامپ + CHANGELOG + ریلیز) | T1، T2 روی ماشین کارفرما | حذف ریلیز قبلی مطابق روال |
| **M3 (P1)** | شحنمودن manifest + PRECHECK/VALIDATING (هش + نسخهٔ node) | T3 + گیت تازه | commit مستقل، revert مستقل |
| **M4 (P1)** | FSM کامل + پروب مستقل بازی‌ها + DEGRADED | T1/T6 + smoke تازه | commit مستقل |
| **M5 (P1)** | کپی اتمیک d1-seed | T2 (ارتقا) + تست قطع وسط کپی | commit مستقل |
| **M6 (P2)** | Repair مستند + install-manifest + تکی‌نمونه + چرخش لاگ | T4، T9 | commit مستقل |

**قانون سراسری:** هیچ مرحله‌ای به dataDir کاربر دست نمی‌زند؛ هر مرحله با گیت‌های موجود (tsc، vitest، smoke دوهاته، فروزن/CSP/perf/migdoc/D1، desktop-check) سبز باید push شود؛ هر مرحله یک commit مستقل با پیام فارسی — بازگشت = revert همان commit.

---

## ۱۲. یادداشت صادقانه دربارهٔ v1.27.03 (EISDIR)

علت v1.27.04 (ناسازگاری مسیر) کاملاً اثبات‌شده است. علت EISDIR در v1.27.03 (خرابی argv در لایهٔ میانی ویندوز) بر پایهٔ سورس node/tauri-bundler **استنتاج قوی** است اما از راه دور قابل اثبات قطعی نبود؛ رفع ساختاری آن (main نسبی + cwd صریح + لاگ خط فرمان) معتبر است و از این پس هر تکرار، خودش را در `engine.log` توضیح می‌دهد. دو شکست روی‌هم بودند و v1.27.04 فقط لایهٔ اول را می‌بست و لایهٔ دوم را آشکار کرد — این دقیقاً رفتار درستِ تشخیص‌پذیری است، نه رگرسیون.

*پایان گزارش — بدون هیچ تغییر کدی؛ اجرای M1 پس از تأیید شما.*
