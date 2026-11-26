# یادداشت ممیزی security — run_id: aud-20261124-8ca4227

> این یادداشت توسط عامل اصلی از خلاصهٔ ممیز بازنوشته شد (ممیز پیش از نوشتن فایل به سقف گام رسید؛ JSON یافته‌ها مستقیم توسط خود ممیز نوشته و valid شده است).

## محدوده و ابزارها

- revision: 8ca4227 (شاخه rust، نسخهٔ اپ 1.27.74، درخت تمیز) — تحلیل صرفاً استاتیک، بدون اجرای کد و بدون شبکه.
- jCodeMunch در دسترس نبود؛ sinkها و گیت‌های نقش با grep چندشکلی + خواندن مستقیم تأیید شدند.
- ریسک وابستگی‌ها (بدون منبع advisory/شبکه)، migrations/، desktop/، server/، scripts/، Caddyfile/Dockerfile و باندل‌های worker اسکن نشدند.
- مقدار هیچ secretای خوانده/نقل نشد؛ فقط محل تعریف ثبت شد. فایل‌های خطاب‌به-AI (CLAUDE.md، docs/AGENTS.md) فقط دادهٔ غیرقابل‌اعتماد خوانده شدند — هیچ agent-directed-text یافت نشد.

## یافته‌ها (۹)

1. **security-001 · critical · pending** — `src/domain/games/page.ts:88`: توکن URL در `/m/:token` بدون escape (فقط JSON.stringify خام) داخل `<script>` درون‌خطی رندر می‌شود، حتی وقتی توکن نامعتبر است (routes.ts:294 catch→render)؛ CSP همان صفحه `script-src 'unsafe-inline'` است (`src/domain/games/routes.ts:307`) → XSS بازتابی عمومی بدون احراز؛ برخلاف preview-form.ts:172-173 که `<>` را escape می‌کند.
2. **security-002 · high · pending** — `src/core/auth/middleware.ts:21`: جعل هویت کامل پرسنل با هدر `X-Dev-Staff-Id` فقط gated بر `env.ENV === 'development'`؛ ENV یک var سادهٔ committed در wrangler.toml:22 است و کلاینت همیشه این هدر را می‌فرستد (api.js:72) → یک خطای پیکربندی استقرار = پارگی کامل مرز احراز.
3. **security-003 · high · pending** — `src/core/auth/runtime-secret.ts:3`: راز dev هاردکد fallback راز نشست تولید (وقتی AUTH_SECRET غایب/کوتاه) و همچنین credentials هدر Bearer سینک نمونه‌ها (instance-sync/routes.ts:103)؛ در تولید بدون secret، راز در جدول settings همان D1 plaintext می‌نشیند (runtime-secret.ts:42).
4. **security-004 · high · pending** — `src/domain/appointment-core/routes.ts:40`: نمونه‌گیری روت‌های نوشتنی (appointments CRUD، working-hours، students create/patch/activate، attendance، tags، followups، setup/complete، conflicts) همگی فقط `getAuthContext` بدون `requireRole`؛ گیت نقش به لایهٔ سرویس نامعیّن واگذار شده (از ۴۴۱ روت: ۲۲۴ گیت inline).
5. **security-005 · medium** — `src/application/api-routing/index.ts:637`: لاگگر سراسری path خام می‌نویسد؛ توکن بازی `/m/:token` و سکرت وب‌هوک `/webhook/bale/:secret` در observability (فعال در wrangler.toml:28) و تاریخچهٔ مرورگر می‌مانند؛ Referrer-Policy نشت cross-origin را می‌بندد ولی same-origin/لاگ را نه.
6. **security-006 · low** — `src/domain/waitlist/referral-page.ts:189`: هر ۴ نسخهٔ esc() تک‌کوتیشن را escape نمی‌کنند (`&<>`)؛ امروز همهٔ فراخوانی‌ها در متن یا attribute دابل‌کوتیشن‌اند — ریسک نهفته، نه فعال (فرم‌های عمومی نام کودک/معرف را تأمین می‌کنند).
7. **security-007 · medium** — `src/domain/games/routes.ts:307`: CSP صفحات عمومی با `unsafe-inline` لایهٔ دوم ضد-XSS را خنثی می‌کند و SPA احرازشده اصلاً CSP ندارد (api-routing:614 فقط ۶ هدر دیگر) در حالی که ~۲۴ sink اول‌طرف innerHTML/document.write وجود دارد.
8. **security-008 · medium** — `src/application/http/rate-limit.ts:1`: لیمینگ سراسری per-isolate درون‌حافظه، فقط متدهای نوشتنی، خاموش‌شدنی با `API_RATE_LIMIT_PER_MIN=0`؛ endpointهای عمومی خواندنی `/api/m/:token/state|next-item` بی‌دروازه‌اند (فقط entropy توکن)؛ throttle لاگین D1-backed مستقل و پایدار است.
9. **security-009 · medium** — `public/assets/js/api.js:13`: توکن نشست ۳۰روزه (session-jwt.ts:12) + staffId در localStorage؛ هر XSS هم‌مبدأ → سرقت اعتبار ۳۰روزه. فهرست کامل sinkها (بدون vendor/dist): referral-page ۱۷، form-page ۵، preview-form ۱ innerHTML + document.write:284، feedback-sheet.js:187 و progress-report.js:603 document.write (esc‌شده)، ui.js:251، login.js:9، illustrations.js:6، charts.js:44، موتور play با esc() برای دادهٔ سروری — منابع داده عمدتاً input کاربر فرم عمومی، پاسخ API یا ثابت کد.

## سالم‌های تأییدشده

- احراز پایه سالم: PBKDF2-SHA256 + ارتقای هش legacy، throttle ورود D1-backed (۵/۱۵د)، JWT نشست با sid + ابطال سمت‌سرور در authMiddleware، RBAC با requireRole/supervisorGate روی بخش بزرگ روت‌ها، هدرهای امنیتی کامل (api-routing:617-625) + HSTS، گیت هش CSP در CI.
