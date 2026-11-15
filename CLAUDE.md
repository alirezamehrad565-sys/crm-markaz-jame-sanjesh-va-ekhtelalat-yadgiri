# قوانین کاری — مخزن CRM/نود (gh-work)

## قانون صفر — همگام‌سازی اجباری مخزن در ابتدای هر درخواست
پیش از هر تغییری، در ابتدای هر درخواست جدید:
1. `git fetch origin` و سپس `git status -b --porcelain` و `git rev-list --left-right --count main...origin/main`
2. اگر مخزن محلی عقب است: `git pull --ff-only origin main`. هرگونه دانگرید (checkout کامیت قدیمی‌تر، ریست به عقب) ممنوع است.
3. اگر واگرایی (هم‌زمان ahead/behind) یا تغییرات نیمه‌کاره وجود دارد: ابتدا گزارش و همگام‌سازی؛ هیچ کاری روی نسخهٔ کهنه شروع نشود.
4. نسخهٔ `src/core/version.ts` باید با آخرین ردیف CHANGELOG یکی باشد؛ ناهمخوانی = مخزن ناسالم، اول اصلاح.
5. این قانون برای هر دو مخزن جفت یکسان است (gh-work و cp-repo).

## نگاشت محیط سندباکس
- `/home/z/my-project/gh-work` → مخزن CRM/نود (`crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri`)
- `/home/z/my-project/cp-repo` → مخزن پنل مرکزی CP (`network-control-plane`)
- `/home/z/my-project/scripts/.docs-secrets.env` → کلیدهای کلادفلر/R2 — هرگز چاپ، کامیت یا ارسال نشود.
- توکن گیت‌هاب داخل remote URL هر دو مخزن است — هرگز چاپ نشود؛ برای پوش از همان remote استفاده کن.

## قوانین معماری پایدار
- **مسیر هشدار فقط-CP**: هر هشدار خودکار (سلامت درگاه‌ها، رانش مُهر، KPI) فقط و فقط سمت CP ساخته و نمایش داده می‌شود؛ هرگز به سمت نود (CRM) ارسال یا در UI نود نشان داده نمی‌شود.
- نود هرگز مستقیماً به DB نود دیگر یا CP دسترسی ندارد؛ تبادل داده فقط از مسیر درگاه‌های اعلام‌شده (ingest/sync) است.
- CP دادهٔ مراکز را فقط غیرمستقیم (از درگاه‌ها) جمع می‌کند؛ دسته‌بندی‌های CP مرکز-به-مرکز است.

## گیت‌های انتشار (بدون استثنا)
`npx tsc --noEmit` صفر ← `npx vitest run` کامل سبز ← `npm run build:client` ← باندل ورکر (`scripts/build-worker-bundle.mjs` + `node --check`) ← `scripts/perf-budget.mjs` ← bundle-smoke ← بامپ شش‌نقطه‌ای نسخه + CHANGELOG ← دیپلوی env-only + سه دروازهٔ سلامت.
