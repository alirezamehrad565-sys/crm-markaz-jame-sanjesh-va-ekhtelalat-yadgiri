# یادداشت‌های ممیز معماری — run_id: aud-20261124-8ca4227

- مخزن: /home/z/my-project/gh-rust · شاخه: rust · revision: 8ca4227 · نسخهٔ اپ 1.27.74 · درخت تمیز · تاریخ: 2026-11-24
- روش: فقط‌خواندنی؛ بدون اجرای کد/بیلد، بدون شبکه، بدون jCodeMunch (طبق تصمیم مجری ران). همهٔ شواهد با خواندن مستقیم و grep گرفته و نقل‌قول‌ها عیناً از سورس‌اند. باندل‌های تولیدشده باز نشدند.
- خروجی رسمی: repodocs/audit/findings/architecture.json (۱۰ یافته: ۲ high، ۶ medium، ۲ low).

## نقشهٔ مسئولیت و شکل اجرا

- شکل کلی: اپ وب + ورکر Cloudflare (src/index.ts: fetch + scheduled روی ۴ کرون wrangler.toml) با دو میزبان دیگر — سلف‌هاست Node (server/node-main.ts که همان worker.fetch/scheduled را صدا می‌زند؛ parity حفظ شده — نکتهٔ مثبت) و ورکر مستقل بازی‌ها (src/games-worker.ts + wrangler.games.toml).
- سه‌لایهٔ اعلامی: src/core (زیرساخت مشترک: db/audit/logger/auth/errors/storage/notify/shared) ← src/domain (۳۰+ ماژول ویژگی) ← src/application (۳۲ ماژول + api-routing). جهت عمومی وابستگی‌ها درست است: core→هیچ، domain→core، application→domain/core.
- فرانت (public/assets/js): لایه‌بندی منسجم و هم‌الگو — shell (app.js: NAV + ثبت مسیرها + lazyView با import پویا) / router.js (روتر هش با AbortController) / state.js (نشست) / api.js (لایهٔ داده: dedup GET + کش SWR) / ui.js،format.js / ۳۴ نما در views/ + ~۴۰ ماژول ویژگی. نماهای views/ هیچ‌وقت views/ دیگر را import نمی‌کنند و api.js در ۶۳ فایل مصرف می‌شود. یافتهٔ معماری ندارد؛ فقط جزئیات: waitlist.js (ماژول ویژگی) views/referral-inbox.js را import می‌کند (ترکیب نما، بی‌ضرر) و ۱۶ نما به window دسترسی دارند (عمدتاً location/Tauri).

## یافته‌ها (خلاصه)

1. **architecture-001 (high, god-module)** — src/application/api-routing/index.ts (۹۵۶ خط): createServices با ۳۴۷ خط ساخت ۴۵ سرویس + نصب ۸ ناظر؛ createApp میان‌افزار + ۵۷ ثبت مسیر + روت‌های درون‌خطی؛ سرویس‌های assessment-blocks/form-builder/dashboard دو-ناقله درون createApp ساخته می‌شوند (۷۷۲/۷۸۴/۸۷۷)؛ هندلر /api/dashboard/kpis با ~۵۵ خط منطق نقش‌محور درون مسیر؛ قلاب تستی __services در پروداکشن (۵۵۳).
2. **architecture-002 (medium, inconsistent-conventions)** — حلقهٔ اعلان سه‌گانه در createServices: caseEvents.setSendObserver (۳۶۶-۳۸۳) و exerciseBank.setSendObserver (۴۲۳-۴۴۰) با diff مقایسه شد — ۱۷ خط بایت‌به‌بایت یکسان، فقط نام گیرنده فرق دارد؛ caseEvents.setFillObserver (۳۸۶-۴۲۱) سومین نسخه. عبارت انتخاب کانال `getChannel('bale') ? 'bale' : 'internal'` ۱۸ بار در ۸ فایل (حتی domain/document-requests/service.ts:240). سیاست enqueue+dispatchPending(50) در senders.ts×۵ و exercise-submission-bot.ts هم تکرار است.
3. **architecture-003 (medium, boundary-violation)** — وابستگی معکوس domain→application: document-requests/service.ts:9 و types.ts:6 (`import type { SettingsService } from '@app/settings'`)، student-profile/routes.ts:6 (`import { pageParams } from '@app/http'` — مقدار). کل grep @app در domain همین ۳ مورد است.
4. **architecture-004 (high, boundary-violation — pending)** — HTTP در domain: ۲۸ فایل routes.ts با ~۳۳۱ ثبت مسیر `app.*` (از کل ۴۴۱+۷)، مصرف AppHono در ۲۹ فایل domain، getAuthContext/requireRole از @core/auth، تعریف AppHono در core/shared/app.ts:1 (نوع hono در core). رجیستری مرکزی مسیر نیست؛ ترتیب ثبت عمومی/محافظت‌شده به ترتیب دستی خطوط createApp گره خورده. ظرافت: قرارداد فعلی یکدست است و domain hono را مستقیم import نمی‌کند — تصمیم پذیرش‌شکل‌فعلی یا انتقال با Decide.
5. **architecture-005 (medium, inconsistent-conventions)** — قرارداد مستند «نه وابستگی ماژولی domain→domain» فقط با تزریق تابع برای ۴ جفت اجرا شده؛ در عوض ۱۷ یال import (۸ مقدار) هست: appointment-core→assessment-blocks، ot-engine→clinical-engine/instruments (مقدار، در برابر type-only معکوس = چرخهٔ سطح امضا)، clinical-engine→case-formulation (مقدار)، finance/clearbook/docs/knowledge→exercise-bank. وصلهٔ چرخهٔ appointments↔conflict-engine با setter و کامنت «حل circular dependency» (api-routing:205).
6. **architecture-006 (medium, boundary-violation)** — سه import از '../../../worker/scoring.js' در application (api-routing:94، settings/service.ts:19، reports/service.ts:11) و فراخوانی scoring با بازسازی Request به /api/scoring/board (api-routing:910) — دوخت واحد استقرار worker/ به src و شبیه‌سازی HTTP برای فراخوانی درونی.
7. **architecture-007 (medium, inconsistent-conventions)** — پنج پوشهٔ سینک بیرون از سه‌لایه: node-sync (۱۰۱۷+۶۴۸)، node-sync-runner (۱۴۶۶+…)، node-sync-client، internal-sync، cloud-setup + ششمین پشته @app/instance-sync. api-routing با مسیر نسبی مصرف‌شان می‌کند (۱۱۶-۱۱۹)؛ node-sync/app.ts به @app/http وصل است؛ node-sync-runner/panel.ts:8→cloud-setup/dom-build؛ runner.ts:43 سبک '../core/version.js'.
8. **architecture-008 (medium, inconsistent-conventions)** — زنجیرهٔ عمومی (request-id → محدودساز نوشتنی → no-store → 404) سه‌بار دستی کپی شده: api-routing، games-standalone، node-sync/app — کامنت‌های خود کد «هم‌الگوی اپ اصلی» را تأیید می‌کنند.
9. **architecture-009 (low)** — src/index.ts: ۴ probe هم‌شکل با متغیر مُهر ماژول‌سطح + ۴ wrapper کرون هم‌شکل؛ dispatch با if زنجیره‌ای روی event.cron.
10. **architecture-010 (low)** — هستهٔ مشترک دفن‌شده: sanitizeFilename/validateExerciseFileBytes/parseMultipartStream در @domain/exercise-bank که finance/clearbook/docs/knowledge مصرف‌شان می‌کنند.

## نقاط مثبت مشاهده‌شده (برای Decide)

- server/node-main.ts همان worker.fetch/scheduled را با NodeD1 مصرف می‌کند — parity سه میزبان بدون کپی‌کردن منطق.
- قرارداد تزریق تابع برای جلوگیری از domain→domain در ۴ نقطه واقعاً رعایت شده (formulationOt، injectPathProbe، exerciseIdsExist، buildReport، setMonitorFocusProvider).
- میدل‌ور request-id + زمینهٔ AsyncLocalStorage در @core/audit طراحی تمیزی دارد.
- فرانت الگوی لایه‌بندی روشن و رعایت‌شده دارد (بند «نقشه»).

## پوشش‌نیافته / محدودیت‌ها

- worker/bundle.js، central-bundle.js، games-bundle.js (تولیدشده — خارج از محدوده مصوب)؛ worker/scoring.js و scoring.d.ts خوانده شدند.
- سمت Rust دسکتاپ (desktop/src-tauri)، scripts/، migrations/، docs/، موتور بازی public/assets/play، vendor/css/img/fonts — ساختاری فقط فهرست شدند.
- تست‌ها فقط به‌عنوان شاهد مصرف/import دیدیده شدند (ممیز testing جدا دارد).
- شمارش مسیرها با grep الگوی `app.(get|post|put|patch|delete)(` = ۴۴۱ + ۷ درون‌خطی ≈ ۴۴۸؛ ادعای ~۴۴۷ رانجر تأیید می‌شود. تفکیک type-only از مقدار به‌صورت دستی انجام شد.
