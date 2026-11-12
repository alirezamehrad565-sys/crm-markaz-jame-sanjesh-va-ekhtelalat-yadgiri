# سینک ترکیبی نودهای دسکتاپ با ورکر Cloudflare (rust-f4)

> مکمل `docs/rust/design.md` §۵ و `docs/rust/phases.md` فاز ۴. دسکتاپ میز، یک «نود» در
> شبکه است با هویت `node_code = DESKTOP:<install-id>` + `node_key` — همان اعتماد پیوند
> دستی CP↔نود، این‌بار بین میز و اپ ابری. مالک کد: `src/node-sync/` (ورکر) و
> `src/node-sync-client/` (کلاینت خالص). مایگریشن: `0109_node_sync.sql`.

## ۱. قاعدهٔ بنیادین — فهرست سفید در کد، نه فقط سند

ممنوعیت مطلق انتقال دادهٔ بالینی (مراجعان/جلسات/تجویزها/فعالیت بازی فردی) در **کد دو سمت**
اعمال می‌شود؛ دامنهٔ بیرون فهرست = رد صریح `403` با کد آزمون‌پذیر `NODE_DOMAIN_FORBIDDEN`:

| جهت | دامنه‌های مجاز | چرا |
|---|---|---|
| pull (نود از ابر) | `announcements` · `packages` · `library` | اعلان‌های مرکز، بسته‌های بازی **منتشرشده** (`game_packages.status='published'`)، کتابخانهٔ شبکه (برگزیده‌های CP در `network_content` با `origin='cp' AND active=1`) — همه محتوای عمومی |
| push (نود به ابر) | `usage_summary` · `client_errors` · `health_ping` | فقط تله‌متری تجمیعی/بی‌نام؛ `usage_summary` فقط-عددی است (قانون طلایی «تجمیع در نود، فقط عدد در ابر») و `client_errors` هم‌شکل لولهٔ خطای مرورگر خود سامانه با سقف‌های سخت |

فهرست سمت کلاینت (`NODE_PULL_DOMAINS`/`NODE_PUSH_DOMAINS` در `src/node-sync-client`) **آینهٔ**
فهرست سمت ورکر است (دفاع در عمق؛ سرور مرجع). رشد فهرست فقط با ویرایش آگاهانهٔ هر دو سمت +
سند، مثل قاعدهٔ «رأی دوطرفه» قرارداد NODE_DB.

## ۲. جدول قراردادها

هدرهای احراز نود (هم‌قرارداد cp-sync/cp-report/cp-content): `X-CP-Node-Code` +
`Authorization: Bearer <node_key>` (+ `X-CP-Node-Version` اختیاری).

| Endpoint | متد | ورودی | خروجی موفق | کدهای خطا |
|---|---|---|---|---|
| `/node/pull` | GET | `?domains=` (کاما؛ غایب = هر سه) · `?cursor=` (base64url کلیدset) · `?limit=1..100` (پیش‌فرض ۵۰) | `{data:{items:[{id,domain,updated_at,payload}], next_cursor, server_time}}` | ۴۰۱ `NODE_AUTH_FAILED` · ۴۰۳ `NODE_DOMAIN_FORBIDDEN` · ۴۰۰ `NODE_CURSOR_INVALID` |
| `/node/push` | POST | `{items:[{id(4..120), domain, at?, payload}]}` — حداکثر ۱۰۰ آیتم / ۲۵۶KB | `{data:{accepted, duplicates, throttled, retry_after_s?}}` | ۴۰۱ · ۴۰۳ `NODE_DOMAIN_FORBIDDEN` · ۴۰۰ `NODE_BODY_TOO_LARGE`/`VALIDATION_ERROR`/`INVALID_JSON` |
| `/node/register` | POST | سشن **فقط-مدیر**؛ `{node_code, label?}` — شکل `DESKTOP:<install-id>` | `201 {data:{node_code,label,key_fingerprint,created_at,node_key}}` — plaintext فقط همین یک‌بار | ۴۰۱/۴۰۳/۴۰۰/۴۰۹ `CONFLICT` (کد تکراری) |
| `/node/rotate-key` | POST | سشن فقط-مدیر؛ `{node_code}` | `{data:{node_code,key_fingerprint,rotated_at,node_key}}` — کلید کهنه **بی‌درنگ** باطل (سیاست CP-6) | ۴۰۱/۴۰۳/۴۰۰/۴۰۴ |
| `/node/revoke` | POST | سشن فقط-مدیر؛ `{node_code}` | `{data:{node_code,active:0}}` — نود باطل در نخستین درخواست ۴۰۱ می‌گیرد | ۴۰۱/۴۰۳/۴۰۴ |
| `/node/nodes` | GET | سشن فقط-مدیر | `{data:{nodes:[{node_code,label,active,key_fingerprint,key_rotated_at,last_pull_at,last_push_ok_at,created_at}]}}` — بدون هش/کلید | ۴۰۱/۴۰۳ |

همهٔ پاسخ‌ها: `X-Request-Id` + `Cache-Control: no-store`؛ ۴۰۱ نود یک‌شکل و کم‌دست است
(وجود/عدم‌وجود کد، کلید غلط و نود باطل از هم تفکیک نمی‌شوند — ضدکاوش). ۴۰۴ زیر `/node/*`
کم‌دست است: `{error:'NOT_FOUND'}` بدون جزئیات مسیر.

## ۳. تصمیم‌های بازاستفاده (از خط m1.5/cp — بدون نوآوری پروتکلی)

| تصمیم | انتخاب | گزینهٔ ردشده / دلیل |
|---|---|---|
| احراز کلید نود | همان مکانیزم cp-link: هش **SHA-256** سمت سرور (`hashApiKey` موجود)، مقایسهٔ زمان‌ثابت (`timingSafeHexEqual` محض)، محاسبهٔ هش حتی برای کد ناموجود (ضدکاوش — هم‌الگوی `verifyNodeKey` سمت CP) | جدول `api_keys` کارمندان — نقش‌محور و مالک‌دار است؛ نود موجودیت جدا است؛ پیشوند کلید `nk_live_` جداست تا با `ck_live_` کارمندان اشتباه نشود (`looksLikeApiKey` آن را نمی‌پذیرد) |
| هدرها | عین جفت هدر m1.2/m1.5 (`X-CP-Node-Code` + Bearer) | هدر تازه — پروتکل دوقلو نمی‌خواهیم؛ کلاینت دسکتاپ با همان قرارداد آزمون‌خورده کار می‌کند |
| مُهر تلاش push | مُهر **قبل از کار** + گات ۱۵دقیقه‌ای (`shouldAttemptNodePush` — هم‌قرارداد `shouldAttemptCpSync`) روی ردیف خود نود (`sync_nodes.last_push_attempt_at`) | مُهر در `settings` — وضعیت per-node است، ستون ردیف صادقانه‌تر و ارزان‌تر است |
| زیر گات | پاسخ صامت `200 {throttled:true, retry_after_s}` — **بدون** لاگ/audit/نوشتن (نویز-سپر) | ۴۲۹/۴۲۰ — نود خوش‌رفتار هرگز نبیند؛ نود بدرفتار هیچ خوراکی نگیرد |
| idempotency push | جفت `(node_code, id)` با `ON CONFLICT DO NOTHING`؛ دوباره‌ها در `duplicates` شمرده می‌شوند | UPSERT — رویداد هرگز بازنویسی نمی‌شود |
| cursor پایدار | کلیدset: `base64url(JSON {d,t,i})` روی `(updated_at, id, domain)` — همهٔ مقایسه‌ها در SQL؛ `updated_at` با `strftime` نرمال ISO می‌شود (فرمت‌های دوگانهٔ ستون‌های جدول‌ها) | offset/صفحهٔ عددی — درج هم‌زمان skip/dup می‌دهد |
| ثبت نود | endpoint فقط-مدیر درون زیراپ با همان `authMiddleware()+requireRole('manager')` + `audit_log` (`node.register/rotate_key/revoke`) | جریان پیوند دستی CP در این مخزن env-محور است و بازاستفاده‌پذیر نبود؛ plaintext کلید فقط یک‌بار در پاسخ (قرارداد rotate-key CP) و هرگز در لاگ/audit — فقط fingerprint |
| جای ثبت | زیراپ Hono مستقل `createNodeSyncApp` با زنجیرهٔ عمومی خودش (request-id، محدودساز نوشتنی per-IP، no-store، ۴۰۴ کم‌دست) که «پیش از» گیت auth در `createApp` سوار می‌شود — `app.route('/node', ...)` | تزریق در api-routing سراسری — زیراپ باید در فاز ۲ همان‌طور در موتور محلی workerd میزبانی شود |

## ۴. چرخهٔ عملیاتی (هم‌ریتم design §۵)

- **حالت‌ها**: آفلاین (بدون env سینک — همه‌چیز محلی) · ترکیبی (pull فرصت‌طلب پس از ورود +
  push شبانه؛ گات‌های ۱۵دقیقه هر دو سمت) · فقط-ابری (رفتار امروز — بدون تغییر).
- **تعارض**: pull فقط-خواندنی محلی؛ دادهٔ محلی هرگز از ابر بازنویسی نمی‌شود — تعارض ساختاری منتفی.
- **کلید چرخیده (پنجرهٔ چرخش)**: نود فقط خطای نرم `auth_error` می‌بیند، فقط warn می‌کند و
  دورهٔ بعد تلاش می‌کند (حکم م۲۱۰ و ماتریس §۳-۵ سند CP-6) — هیچ مسیری نمی‌شکند.
- **drill قطع/وصل (§۳-۱۱)**: کلید غایب = `unconfigured` بدون هیچ fetch؛ قطع شبکه =
  `network_error` نرم؛ ۴۰۱ = `auth_error` نرم — ماژول کلاینت هرگز throw نمی‌کند.

## ۵. محدودیت‌ها و پیوست‌های آینده

1. **نگه‌داری `node_push_events`**: پاکسازی خودکار ندارد (کرون تازه‌ای اضافه نشد — تغییری در
   کرون‌های موجود ممنوع بود)؛ رشد از مسیر گزارش رشد جدول‌ها (`0107`) قابل پایش است. برای
   health_pingِ ۱۵دقیقه‌ای سقف عملی با گات ۱۵دقیقه‌ای ≈ ۹۶ ردیف/روز/نود. پیشنهاد آینده:
   الحاق به چرخهٔ پاکسازی شبانهٔ digest (هم‌الگوی client_errors/rum).
2. **payloadهای فهرست‌باز**: `health_ping` (به‌جز `counters` عددی) و `client_errors` سقف
   بایت/طول دارند اما شکل‌شان باز است؛ `usage_summary` سفت فقط-عددی است.
3. **ساعت نود**: `at` آیتم‌ها قابل‌اعتماد نیست؛ ترتیب رسمی با `received_at` سرور است.
4. **سقف صفحهٔ pull = ۱۰۰**: هم‌ریتم سقف قراردادی CP؛ برگه‌های بزرگ‌تر با cursor طی می‌شود.
5. **صفحهٔ پنل مدیر**: فعلاً `/node/nodes` JSON فقط-مدیر است؛ UI اختصاصی در پنل از فازهای
   بعدی خط rust (این فاز فقط لولهٔ داده است — پذیرش «گزارش نود در پنل ابر» با همین endpoint
   + `node_push_events` برآورده می‌شود).
6. **دو-کلید گذار**: چرخش تک‌هش است (ابطال بی‌درنگ — مسیر امروز CP-6)؛ مسیر صفر-وقفهٔ دو
   هشه وقتی CP به آن رفت، همین‌جا هم قابل افزودن است (`key_hash_prev`).

## ۶. گیت‌ها

`npx tsc --noEmit` صفر + `npx vitest run` کامل سبز (۲۲۸۳ + تازه‌ها). آزمون‌های تازه:
`src/node-sync/__tests__/node-sync.test.ts` (۲۵) و
`src/node-sync-client/__tests__/node-sync-client.test.ts` (۱۲) — پوشش: احراز درست/رد کلید بد،
سفید-فهرستی (patients → رد صریح)، idempotency، صفحه‌بندی cursor و پایداری آن، مُهر تلاش
(پاسخ صامت/بدون رشد لاگ — e2e و با ساعت تزریقی)، drill کلید غایب/شبکهٔ قطع = خطای نرم،
۴۰۱ تمیز و ۴۰۴ کم‌دست، ثبت فقط-مدیر با audit بدون کلید.

## استقرار سمت میز (rust-f9) — بستن حلقهٔ pull

چرخهٔ اجرا: **زمان‌بند فرانت‌اند** (`src/node-sync-runner/runner.ts` — چانک فقط-دسکتاپ) پس از باز شدن بخش «اتصال ابر» و با دکمهٔ «همگام‌سازی اکنون» اجرا می‌شود:

1. `pull` صفحه‌به‌صفحه با کلاینت واقعی (`node-sync-client`) — اعتبار از همان اتصال ابر (record + مخزن امن)، cursor/مُهر در انبار پیشرفت؛ سقف ۲۰ صفحه در هر دوره.
2. هر صفحه بلافاصله با `POST /api/internal/sync/ingest` (توکن سشن کارمند) به **موتور محلی** استقرار می‌یابد.
3. وضعیت «آخرین همگامی» (موفق/خطا/شمارش دامنه‌ها) در انبار پیشرفت و در پنل تنظیمات نمایش داده می‌شود.

مسیر استقرار (فقط-موتور محلی): بایند `CENTER_DESKTOP_ENGINE=1` فقط در کانفیگ capnp موتور (`config.mjs`) هست؛ در تولید وب این binding وجود ندارد → ۴۰۴ کم‌دست. باندل دو سمت یکسان می‌ماند — گیت زمان‌اجراست، نه بیلد.

**صندوق ورودی** (`node_sync_inbox` — مایگریشن 0110): payload سمت ابر projection کاهش‌یافته است نه ردیف کامل جدول؛ بنابراین استقرار مستقیم در جدول‌های اصلی ممنوع است — نگاشت بعدی به `announcements/...` تصمیم جدا دارد. idempotency با `(domain,id)`؛ فهرست سفید اکنون **سه‌لایه** است: ابر (pull) ← کلاینت (client.ts) ← سرور میز (internal-sync؛ کد `NODE_DOMAIN_FORBIDDEN`).

**پوش سمت نود هنوز سیم نشده** (usage_summary/client_errors/health_ping) — مایلستون بعدی؛ کلاینت و قرارداد آن آماده و در drill اثبات شده است.

## push نود (rust-f11) — سیم‌کشی سمت میز

حلقهٔ push هم بسته شد (مایلستون ادامهٔ فاز ۶):

1. **outbox موتور محلی**: `GET /api/internal/sync/outbox?since=<ISO>` (فقط-موتور با همان گیت `CENTER_DESKTOP_ENGINE` + سشن) — منابع: `client_errors` (جدول 0057/0106؛ نگاشت به `ClientErrorPayloadSchema`؛ ستون `user_agent` هرگز خوانده نمی‌شود — قانون PII) و `health_ping` (دقیقاً یک آیتم ساعت‌بکت با `APP_VERSION` و شمارش تجمیعی بی‌نام خطاهای ۲۴ ساعت). `usage_summary` فعلاً skip مستند — منبع محلی سیم نشده. سقف ۲۰۰ آیتم، مرتب ASC، ردیف ناسازگار با اسکیما فقط حذف می‌شود (حکم م۲۱۰).
2. **pushNow زمان‌بند** (`src/node-sync-runner/runner.ts`): watermark `nodesync:push-watermark-v1` → outbox → `client.push({items})` (گات ۱۵دقیقه‌ای داخل کلاینت — skipped یعنی watermark دست‌نخورده، دورهٔ بعد). هر ۸ وضعیت client.push به نتیجهٔ نرم نگاشت می‌شود؛ هیچ مسیری throw نمی‌کند. فیلدهای `last_push_ok_at`/`last_push_error` به وضعیت اضافه شد (سازگار رو به جلو).
3. **پنل**: دکمهٔ «همگام‌سازی اکنون» حالا pull + استقرار + پوش را در یک دوره انجام می‌دهد و خط وضعیت نتیجهٔ پوش را هم می‌گوید؛ ردیف «آخرین پوش به ابر» اضافه شد.

idempotency نهایی سمت ابر با `(node_code, id)` برقرار است؛ فهرست سفید push (usage_summary/client_errors/health_ping) دست‌نخورده — دادهٔ بالینی هرگز.
