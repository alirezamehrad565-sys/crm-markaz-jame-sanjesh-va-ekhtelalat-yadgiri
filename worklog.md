
---
Task ID: m170+m171
Agent: main (Z.ai)
Task: ساختن «پشتوانهٔ علمی / نحوهٔ استفاده» برای بقیهٔ ابزارها (تعمیم الگوی m169 به کل کتابخانه)

Work Log:
- TOOL_GUIDES در clinical-content.js: ابتدا ۲۵ کلید، بعد از مقایسه با API (۳۳ نوع فعال) تکمیل به ۳۳ کلید — پوشش ۱۰۰٪
- scienceNote() عمومی در ui.js (details تاشو science-guide) + CSS مشترک با rehab-fx-guide
- چهار نقطهٔ اتصال: openDynamicForm (همهٔ فرم‌های کتابخانه)، openChecklistSendModal (راهنمای زنده با تغییر قالب)، openProbeModal، openRehabFxModal
- راستی‌آزمایی مرورگری زنده روی تولید: مودال پروب (۵ بند ✓)، مودال ارسال چک‌لیست (به‌روزرسانی زنده هنگام تغییر قالب ✓)، مودال گزارش جلسهٔ OT از ۸ کلید جدید (✓)
- درس: اولین eval بعد از کلیک ممکن است قبل از باز شدن مودال (فراخوانی‌های API) اجرا شود — نتیجهٔ 'NO GUIDE' گمراه‌کننده بود
- دو نسخه: 1.00.46/m170 (۲۵ کلید) و 1.00.47/m171 (۳۳ کلید — هفت‌کلیدِ کشف‌شده از API: home_behavior، quick-multi-v1، ce-sdq-p-v1، ce-id-adapt-v1، ce-sld-class-t-v1، ce-needs-v1، intervention، ce-ot-session-v1)

Stage Summary:
- تولید: 1.00.47 / m171 — /health ✓، ۳۳ کلید در asset زنده ✓
- فرانت‌اند محض (بدون تغییر bundle/backend) — 1298 test ✓، tsc ✓
- باقی‌مانده (مایلستون بعدی): نمایش راهنما در صفحهٔ وب عمومی خانواده/معلم (لینک بله) — نیاز به دادهٔ سمت سرور و تغییر public-form.ts + bundle

---
Task ID: m173
Agent: main (Z.ai)
Task: حذف جای‌نگهدار مردهٔ «اقدام بعدی ثبت نشده» در پروفایل دانش‌آموز + هم‌اندازه‌سازی UX/UI نوار اکشن‌ها + طرح داکرایز کردن

Work Log:
- کشف از git history: مکانیک پیگیری در m166 حذف شده بود اما جای‌نگهدار «اقدام بعدی ثبت نشده / با ثبت نوبت آینده یا پیگیری باز…» مانده بود
- buildNextActionBlock(null) → null (اقدام واقعی: نوبت آینده/پیگیری باز، همچنان نمایش داده می‌شود)
- نوار اکشن‌ها: class جدید profile-actions (+__row) در views.css، ارتفاع یکنواخت ۳۴px دکمه‌ها و سلکت (لمسی ۳۸px)
- مودیفایر select--sm در components.css (padding-block 5px، fs-sm — هم‌قوارهٔ btn--sm) + تنظیم pointer:coarse
- آیکون متمایز: ارسال چک‌لیست → checklist، ارسال تمرین → file (قبلاً هر دو zap)
- سلکت مسئول پرونده: width auto + flex انعطاف‌پذیر (210–300px)، برچسب بدون شکستن خط
- bump چهارگانه: index.html ?v=، sw.js VERSION، version.ts، bundle.js — 1.00.49 / m173
- 1300 test ✓ · tsc 0 ✓ — deploy موفق (نسخهٔ اول APIError گذرا، تلاش دوم ✓)
- /health: {"ok":true,"db":"up","version":"1.00.49","milestone":"m173"} — assetها تأیید شد (جمله حذف شده، profile-actions و select--sm در CSS زنده)
- ممیزی کامل وابستگی‌های Cloudflare برای طرح داکر: D1 فقط از createDb + چند env.DB.prepare در auth؛ Hono 4.6؛ بدون WS/DO/KV/R2/Queues؛ secrets در D1؛ ASSETS لایهٔ config است
- کشف کلیدی: src/test/mock-d1.ts هم‌اکنون D1Database روی node:sqlite (Node≥22.5) را پیاده می‌کند و ۱۳۰۰ تست روی آن سبز است → درایور پروداکشن داکر از همین الگو
- سند docs/DOCKERIZE.md: ممیزی + معماری هدف (Caddy→node:22-alpine، @hono/node-server، node:sqlite WAL، node-cron) + Dockerfile/compose آماده + انتقال داده با d1 export + چک‌لیست سوئیچ (شامل setWebhook تلگرام) + مسیر جایگزین miniflare — تخمین کل ~۳–۴ روز کاری

Stage Summary:
- تولید: 1.00.49 / m173 — پروفایل دانش‌آموز تمیز شد (جای‌نگهدار مرده حذف، اکشن‌ها هم‌اندازه ۳۴/۳۸px)
- طرح داکرایز مستند شد؛ دو فایل کلیدی شروع (node-d1.ts، node-main.ts) در سند مشخص‌اند

---
Task ID: m174-doc
Agent: main (Z.ai)
Task: نقشهٔ کامل باتری تشخیصی و پرسش‌نامه‌ها برای بازبینی روانشناس (تحویل .md + آپلود)

Work Log:
- استخراج ground truth از D1 پروداکشن: ۳۹ نوع ابزار (۳۲ فعال) با fields/bands کامل
- استخراج تعاریف ۴ باتری موتور بالینی: screening(6)/specific(7)/clinical(5)/composite(5) با رجوع‌های علمی (Goodman 1997، Swanson 2001، Birmaher 1999، Wilson DCDQ'07، NRP 2000، Gough & Tunmer 1986)
- سند docs/clinical/diagnostic-battery-map.md: منطق طراحی، چرخهٔ بالینی، مسیرها/پروتکل‌ها، ۱۱ بخش، جدول جامع ۳۹ ابزار، یادداشت علمی (نقاط قوت/محدودیت) و ۷ پرسش مشخص از بازبین
- نکات کلیدی سند: برش SCARED=۲۵، برش SDQ والد هم‌سان معلم (تصمیم T5/m150)، برش‌های صدک ۹۵ SNAP در موتور، هنجارهای داخلی پروب‌ها، نسخهٔ قدیمی sdq-parent فعال
- آپلود: litterbox 72h (لینک اصلی) + temp.sh + tmpfiles — MD5 راستی‌آزمایی شد (b70dc9a9...)

Stage Summary:
- تحویل: download/diagnostic-battery-map.md (۲۹۳ خط) + نسخهٔ repo در docs/clinical/
- لینک دانلود کاربر: https://litter.catbox.moe/l19irn.md (۷۲ ساعت)

---
Task ID: 2
Agent: main (Z.ai)
Task: «خود چک لیست ها رو هم میخوام» — سند متن کامل گویه‌های همهٔ چک‌لیست‌ها/پرسش‌نامه‌ها + آپلود فایل .md

Work Log:
- استخراج تعاریف واقعی از پروداکشن D1: ۳۹ سطر case_event_types (fields/subscales/bands/description/audience) به scripts/ce-*.json
- استخراج ثابت‌های کد: REHAB-FX (۶ تکلیف + ملاک‌ها + سطح راهنما)، چیپ حسی (۳ مجرا)، هنجار صدک ۵۰ پروب‌ها (instruments.ts)، باندهای زیرمقیاسی SNAP-IV از battery JSON
- تأیید برنامه‌ای: گویه‌های SNAP-IV والد==معلم (۲۶)؛ SDQ والد/معلم: ۵ گویهٔ متفاوت متن
- ساخت scripts/gen-checklists-doc.py → docs/clinical/checklists-full.md (۱۵۹۱ خط، ۶۳هزار نویسه): لنگرها + متن کامل گویه‌ها به تفکیک زیرمقیاس + باند کل/زیرمقیاس + آیتم بحرانی ⚠️ + هنجار پروب + پیوست غیرفعال‌ها (کانرز/آخنباخ/مشاهدهٔ کلاس)
- QA: هر ۳۹ کلید موجود؛ ۳۲۸ ردیف گویه = دقیقاً همهٔ آیتم‌های نمره‌دار DB (SNAP-IV-T به‌عنوان نسخهٔ یکسان حذف شد)
- Commit a380bc1 → push main
- آپلود: catbox/0x0/transfer.sh/file.io ناموفق یا کوتاه‌مدت؛ litterbox 72h موفق → https://litter.catbox.moe/qxor8i.md (MD5 تطبیق)

Stage Summary:
- سند «متن کامل چک‌لیست‌ها» تولید/کامیت/پابلیش شد — لینک دانلود: https://litter.catbox.moe/qxor8i.md (۷۲ ساعت اعتبار)
- نکته: آیتم بحرانی فقط achenbach a13 و speech «بررسی شنوایی» (خارج از نمرهٔ کل)

---
Task ID: 3
Agent: main (Z.ai)
Task: «این ویرایش‌ها رو انجام بده» — اعمال بستهٔ کاربردی اختلال یادگیری (متن سادهٔ ۴ فرم SLD) از فایل آپلودی کاربر

Work Log:
- استخراج متن‌های ساده از فایل آپلودی؛ نگاشت ۱:۱ به کلیدهای فعلی (rA1..rD1 / wA1..wD1 / cA1..cD1 / r01..m04) — ثابت: کلید/ترتیب/نمره‌دهی/زیرمقیاس/آستانه‌ها
- scripts/m175-build.py: ساخت fields جدید (label+scaleLabels+hint+teacherLabel/teacherHint) + مهاجرت 0066 + سینک battery-specific/composite.json + سینک جراحی bundle.js (۶۲ جایگزینی با assert)
- کشف‌های bundle: faNum→faNum4، فرمت تک‌خطی battery-specific (hex uppercase) در برابر چندخطی composite (lowercase hex)، drift optsCls در fill renderer — همه با الگوی واقعی bundle هندل شد
- src: types.ts (سه پراپ اختیاری)، pure.ts (FIELD_LABEL_MAX 240، TYPE_DESCRIPTION_MAX 1200، zod)، public-form.ts (qLabel/qHint + CSS .hint + notice «این فرم تشخیص نیست» در هر دو رندرکننده + isTeacherForm با teacherLabel)، routes.ts (پاس‌ترو در دو builder)
- تست جدید public-form.test.ts (۴ کیس) + به‌روزرسانی دو assert متن قدیمی در e2e-teacher-package.test.ts
- 1304 test ✓ · tsc 0 ✓ · migration 0066 روی پروداکشن ✓ · deploy ✓ · /health = 1.00.50/m175 ✓
- وریفای پروداکشن: read (10 hint، 6 teacherLabel)، wri (5، 1)، calc (4، 0)، class-t (12، 0) — دقیقاً مطابق سند کاربر

Stage Summary:
- نسخهٔ 1.00.50/m175 پابلیش شد؛ متن‌های ساده + مثال‌ها + لنگرهای جدید زنده است
- تصمیم‌های باز §۹ سند کاربر (تفکیک نمرهٔ نشانه‌ها، نمایش جدا گویه ۱۰، هشدار سن، کارت جدا/ذخیرهٔ خودکار موبایل) عمداً اعمال نشد — منتظر نظر روانشناس/کاربر

---
Task ID: 4 (read-v2-plan)
Agent: main (Z.ai)
Task: «اینو بخون» — خواندن و ممیزی سند بیرونی «طرح یکپارچه نسخهٔ ۲ (ساعت)» + تطبیق با کد فعلی

Work Log:
- سند آپلودی ۱۹۷ سطر خوانده شد؛ تطبیق با diagnostic-battery-map.md، checklists-full.md، rules.ts، battery-*.json، migrations 0042/0045
- راستی‌آزمایی وب: SNAP-IV (Bussing 2008/Swanson: والد ODD=1.88 ✓، معلم HI=1.78 ✓)، SCARED (AACAP: اجتماعی ۷ گویه/برش ۸ ✓، مدرسه ۴ گویه/برش ۳ ✓)، DCDQ'07 (دستورالعمل Wilson: برش ۴۶/۵۵/۵۷ سنی ✓)
- مکان‌یابی در کد: SCARED_SCHOOL_CUTOFF=1 (rules.ts:17)، باند soc ۶+ و باند مرزی همه‌سنی ۳۱–۴۱ DCDQ (battery JSON)، گویه‌های «هوش طبیعی» rD1/wD1/cD1 (0042/0045)، تایپوی «۶ گویهٔ بعدی بی‌قراری» (checklists-full.md:174 — DB صحیح است ۹+۹+۸=۲۶)
- کشف خطای خودِ سند: حداکثر زیرمقیاس‌های DCDQ جابه‌جا نوشته شده (رسمی: کنترل ۳۰، ظریف ۲۵، عمومی ۲۰) — نقد «۶/۵/۴ نخواند» با اعداد صحیح منتفی است
- کشف نقص سند: بخش‌های ۶+ (کیفیت داده/منابع که جدول چرخ‌ها به بخش ۷ ارجاع می‌دهد) در فایل آپلودی غایب است

Stage Summary:
- تحلیل آماده شد: سند در ۵ محور (SDQ چهارباندی والد، SNAP برش ۱٫۸۸، SCARED چیدمان/برش زیرمقیاس، DCDQ باند همه‌سنی، منطق ملاک B) با کد ما می‌خواند و اصلاح می‌خواهد؛ ۱ نقدش مردود (DCDQ حداکثرها)؛ بستهٔ الف/ب/ج پیشنهادی تنظیم شد — اجرا منتظر تأیید کاربر/روانشناس

---
Task ID: 5 (m176)
Agent: main (Z.ai)
Task: «تغییرات رو انجام بده» — بستهٔ الف بازبینی بیرونی + پاک‌سازی واژگان فنی از تعامل درمانگر + دکمهٔ پشتوانهٔ علمی زیر کارت چک‌لیست

Work Log:
- build scripts: scripts/m176-build.py (JSON+migration+bump) → m176-bundle.py (سینک ساختاری bundle با لنگر ASCII + استخراج رشته‌های TS از سورس/git HEAD + دروازهٔ واژگان) → m176-src.py (هم‌راستاسازی سورس) — چند دور اشکال‌زدایی (کدپوینت ZWNJ، فراروی JSON در باندل، render بدون نقل‌قول، jregion رو‌به‌عقب برای soc)
- اعداد: SNAP-IV والد ODD 1.47→1.88 (باند ۱۵/۱۹/۲۰+)، معلم HI 1.80→1.78 (مرز ثابت)، SCARED soc 6→8 / sch 1→3 (rules.ts)، DCDQ 31/42/60 + راهنمای سنی، SDQ چهارباندی والد 13/16/19/20+ و معلم 11/15/18/19+، sdq-parent هم‌سان
- migration 0067_informant_bands_m176.sql (۶ UPDATE) — پاریسی با JSON نهایی
- دروازهٔ واژگان باندل (بدون source/fields/کامنت + استثنای گویهٔ SNAP): موتور/صدک/کالیبراسیون/m86/بالای برش = ۰ ✓ — ۸ رشتهٔ drift فقط-باندل نیز پاک شد
- سورس TS: rules (شامل SCARED_SCHOOL_CUTOFF=3)، targets، recommender، types (پیشنهاد سامانه)، service، pure (نُرم پروب «هنجار داخلی مرکز»)، narrative، wechsler-engine، ot-engine
- فرانت‌اند: case-events، case-formulation، clinical-content، clinical-insights، wechsler-profile، views/case-event-types
- UI: scienceNote زیر کارت‌ها در openTypePicker (typegrid__cell) + typeCard کتابخانه + CSS (:has با سقوط امن)
- تست‌ها: battery.test (SDQ تفکیک گزارش‌دهنده + m176 block) + e2e-probe (هنجار داخلی) — 1305 ✓ · tsc 0 ✓ · t4 42/0 ✓ · node --check ✓
- اسناد: diagnostic-battery-map.md §۲/§۱۰ (m176)؛ checklists-full.md بازتولید (۱۶۰۱ خط — تایپوی «۶ گویه» → ۹، برش‌های جدید)؛ gen-checklists-doc.py + ce-subscales.json سینک
- bump چهارگانه: index.html/sw.js/version.ts/bundle → 1.00.51/m176
- commit 8a680d6 → push main ✓ — upload: litterbox 404 (سرویس پایین)؛ tmpfiles موقت + GitHub کانال اصلی

Stage Summary:
- تولید آمادهٔ deploy: 1.00.51/m176 — منتظر CLOUDFLARE_API_TOKEN معتبر (توکن dbq.sh منقضی: Authentication error 10000)
- گام‌های deploy پس از توکن: `npx wrangler d1 migrations apply center-system-db --remote --config wrangler.prod.toml` سپس `npx wrangler deploy --config wrangler.prod.toml` و وریفای /health + باندهای زنده
- تصمیم‌های باز (بستهٔ ب) دست‌نخورده: مکمل اثر SDQ، هم‌ترازسازی چیدمان SCARED، حذف گویه‌های «هوش طبیعی»، شرح‌حال v4، دروازهٔ سنی، آزمون استاندارد ملاک B

---
Task ID: 6 (m176-deploy + m177)
Agent: main (Z.ai)
Task: deploy با توکن جدید کاربر + تکمیل پاک‌سازی واژگان (۶ رشتهٔ فرار escaped سورس + ۴ رشتهٔ مرئی فرانت‌اند)

Work Log:
- توکن Cloudflare جدید کاربر راستی‌آزمایی شد؛ migration 0067 روی D1 پروداکشن اعمال شد (۷ فرمان ✅)
- deploy m176 → /health = 1.00.51/m176 ✓؛ باندهای زنده هر ۶ ابزار با کوئری D1 تأیید شد (SNAP odd warn=19، SDQ-t 15، SDQ-p/legacy 16، DCDQ 42، SCARED ساختار sch)
- اسکن زندهٔ واژگان فرانت‌اند: دروازهٔ m176 فقط باندل سرور را پوشش می‌داد — ۴ رشتهٔ مرئی فرانت‌اند («جزئیات موتور تشخیصی»، «موتور پیشنهاد مسیر»، «خروجی موتور»، «عدد فنی موتور») + ۶ رشتهٔ unicode-escaped سورس (فرار از گیت خام m176) کشف شد
- کشف واگرایی سورس↔باندل: باندل از قبل («پیشنهاد سامانه»، «تحلیل خودکار وکسلر ۴ (JSON)»، «محاسبهٔ خودکار»، «تحلیل وکسلر…») اصلاح شده بود ولی سورس قدیم مانده بود
- m177: ۴ رشتهٔ فرانت‌اند اصلاح شد (جزئیات تفسیر / پیشنهاد مسیر ارزیابی / تفسیر نتیجه / عدد راهنما) + scripts/m177-vocab-src-fix.py برای ۶ خط سورس با جایگزینی توکن escaped (موتور→خودکار/تحلیل/حذف) — اکنون سورس==باندل
- استثناهای مستند: گویهٔ رسمی DSM «انگار موتور روشنی دارد» (s14)، متادیتای source باتری‌ها، رجکس داخلی برچسب‌گذاری exercises، کامنت‌ها، فیکسچرهای تست (شبیه‌سازی ردیف‌های قدیمی DB)
- DB پروداکشن تمیز: title/description/subscales/fields/bands = ۰ مورد ✓؛ صدک در گزارش وکسلر عمداً حفظ شد (واژگان استاندارد حرفه‌ای)
- bump چهارگانه → 1.00.52/m177؛ 1305 test ✓ · tsc 0 ✓ · node --check ✓
- commit 61b9399 → push main ✓ → deploy ✓ (Version 94f24436)
- وریفای زنده: /health = 1.00.52/m177 ✓؛ ۴ رشتهٔ اصلاحی زنده ✓؛ موتور=۰ در همهٔ فایل‌های تعامل درمانگر ✓؛ دکمهٔ پشتوانهٔ علمی سر جایش ✓

Stage Summary:
- تولید: 1.00.52 / m177 — بستهٔ الف (اعداد رسمی) + پاک‌سازی کامل واژگان + دکمهٔ پشتوانهٔ علمی، همه زنده است
- نکتهٔ عملیاتی: توکن cfat_... کاربر در هیچ فایلی ذخیره نشد (فقط env لحظه‌ای)؛ اعتبارنامه‌های R2 S3 استفاده نشد — باندل پروداکشن R2 ندارد (ممیزی m173)
- باقی‌مانده (بستهٔ ب): مکمل اثر SDQ، هم‌ترازسازی چیدمان SCARED، حذف گویه‌های «هوش طبیعی»، شرح‌حال v4، دروازهٔ سنی، آزمون استاندارد ملاک B — منتظر تصمیم روانشناس/کاربر
