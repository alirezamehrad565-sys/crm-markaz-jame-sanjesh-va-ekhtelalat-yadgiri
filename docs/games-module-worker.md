# ماژول مستقل بازی‌های درمانی — ورکر + ورک‌تری (۱.۲۵.۷۵)

## هدف

ماژول بازی‌ها از این نسخه **بسته‌بندی مستقل** دارد: همان بک‌اند `src/domain/games` هم داخل اپ کامل CRM سوار است (بدون هیچ تغییری در قرارداد) و هم به‌صورت یک **ورکر مستقل** قابل ساخت/اجرا/استقرار است. این کار دو مصرف دارد:

1. **امروز:** امکان استقرار جداگانهٔ بازی‌ها (اگر روزی بار یا عمر جداسازی بخواهد) بدون شکستن اپ اصلی.
2. **مسیر rust:** واحد بسته‌بندی بازی‌ها برای میزبان محلی Tauri/Rust — `worker/games-bundle.js` یک فایل خودکفاست که با D1 محلی (داخل Tauri/sidecar) همان رفتار تولید را می‌دهد.

## اجزای جدید

| فایل | نقش |
| --- | --- |
| `src/application/games-standalone/index.ts` | `createGamesApp(deps)` — اپ Hono فقط-بازی با همان قراردادهای اپ اصلی (زنجیرهٔ عمومی §۵ قبل از گیت auth، request-id، محدودساز نوشتنی، هدرهای امنیتی، ورود/خروج مستقل) |
| `src/games-worker.ts` | ورودی ورکر (fetch) — deps را از env می‌سازد؛ بدون کرون و بدون CP |
| `worker/games-entry.js` | شیم ورودی wrangler روی باندل — هم‌الگوی `worker/entry.js` |
| `scripts/build-worker-games.mjs` | ساخت `worker/games-bundle.js` از منبع با esbuild + سربرگ |
| `scripts/games-bundle-smoke.mjs` | دود باندل مستقل روی D1 شبیه‌سازی‌شده (سلامت/گیت/API) |
| `wrangler.games.toml` | کانفیگ «آمادهٔ استقرار» — same D1، same assets؛ **بدون routes فعال و بدون دیپلوی** تا تصمیم کارفرما |
| `src/test/harness.ts → createTestGamesApp` | هارنس e2e بستهٔ مستقل روی همان MockD1 |

## اصل وابستگی یک‌طرفه

`games-standalone` فقط از `@domain/games` و هستهٔ مشترک (@core/auth، @app/auth، @app/http) استفاده می‌کند — **اپ اصلی به games-standalone وابسته نیست** و بازی‌ها در اپ کامل همان مسیر قبلی را می‌روند (`registerGamesPublicRoutes` + `registerGamesRoutes` در api-routing). یعنی دو بسته از **یک منبع** ساخته می‌شوند و هیچ منطقی کپی نشده است.

دو تفاوت آگاهانه با اپ کامل:

- `injectPathProbe` (تزریق پروب به مسیر مداخلهٔ بالینی) در بستهٔ مستقل خالی می‌ماند — سرویس بازی‌ها بدون آن هم درست است (اختیاری از بدو طراحی)؛ تجویزِ پیوندشده با مسیر مداخله فقط در اپ کامل معنا دارد.
- کرون/CP/داشبورد در بستهٔ مستقل نیستند — بازی‌ها هیچ چرخهٔ زمانی ندارند و هیچ درگاه CP ندارند.

## کار با ورک‌تری

توسعهٔ ماژول در شاخهٔ `games-module` با ورک‌تری مجزا انجام می‌شود:

```bash
git worktree add ../gh-work-games games-module   # یک‌بار — ساخته شده است
cd ../gh-work-games && npm ci
# تغییرها + گیت‌ها، بعد: merge به main (الگوی فعلی: fast-forward)
```

## توالی توسعه (همه در مخزن، نه بیرون)

```bash
npm run build:games-worker   # باندل مستقل
node --check worker/games-bundle.js
npm run smoke:games          # دود باندل
npx vitest run src/application/__tests__/e2e-games-standalone.test.ts
```

## استقرار مستقل (وقتی کارفرما تصمیم گرفت)

1. دامنه/مسیر ورکر بازی را در `wrangler.games.toml` از کامنت خارج کنید.
2. `wrangler secret put AUTH_SECRET -c wrangler.games.toml` — همان مقدار اپ اصلی تا توکن‌ها بین دو بسته معتبر بمانند (همان مکانیک runtime-secret).
3. `PUBLIC_BASE_URL` در vars را ریشهٔ خود ورکر بازی کنید (مبنای لینک `/m/:token`).
4. دیپلوی: `wrangler deploy -c wrangler.games.toml` — همان D1، همان assets. مایگریشن تازه‌ای لازم نیست (جدول‌ها از قبل در `center-system-db`اند).

## رد نسخه‌های rust

بعد از این نسخه، شاخهٔ `rust` از نقطه‌ای شروع می‌شود که بستهٔ مستقل بازی‌ها جزو کد است؛ پورت Rust فقط جایگزین میزبان (workerd → میزبان محلی) می‌شود، نه مرز ماژول.
