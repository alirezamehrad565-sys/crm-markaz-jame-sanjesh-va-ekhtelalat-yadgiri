
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

---
Task ID: 7 (m178)
Agent: main (Z.ai)
Task: «فارسی ساده‌تر و محاوره‌ای‌تر» — بازنویسی همهٔ متن‌های تعامل درمانگر/خانواده از شرح‌حال تا پشتوانهٔ علمی

Work Log:
- inventory: TOOL_GUIDES (۳۳ راهنما/۱۳۹ بند)، متاهای بالینی clinical-content.js، توضیح ۲۸ ابزار فعال DB، ۴۴ فیلد شرح‌حال (برچسب‌ها خودشان محاوره‌ای بودند — دست نخورد)
- فرم‌های SLD (m175) از قبل محاوره‌ای — حفظ شد؛ گویه‌های استاندارد SNAP/SDQ/SCARED/DCDQ دست‌نخورده
- بازنویسی ۳۳ راهنما به لحن دوستانه (این فرم چیه؟ / چرا مهمه؟ / چطور استفاده کنید / به چه دردی می‌خوره؟ / این فرم چی نیست؟) + REHAB_FX_GUIDE
- پاس سبک روی ۲۳ رشتهٔ STAGE2_META/CONTEXT_META/SYNTHESIS_META/PLAN_META/GATE_GLOSS (حذف «ثبت می‌گردد/پیمایش/سیگنال شک» و جملات کتابی)
- migration 0068: توضیح ۲۵ ابزار (لحن گرم + حذف نشت «موتور بالینی/سیگنال بسازد/کلیدهای ساخت‌یافتهٔ موتور» از شرح‌حال و «موتور در تفسیر» از odd) — سقف ۱۲۰۰ نویسه رعایت شد
- scripts/m178-plain.py + m178-plain2.py (exact-match + assert)؛ توضیح ۳ فرم SLD عمداً حفظ شد
- 1305 test ✓ · tsc 0 ✓ · node --check ✓ · import ماژول: ۳۳ راهنما همگی items دارند
- bump چهارگانه → 1.00.53/m178؛ migration روی D1 پروداکشن (۲۶ فرمان ✅)؛ deploy (Version 064e2654)
- وریفای زنده: /health = 1.00.53/m178 ✓؛ نشت واژگان فنی در توضیح‌های زنده = ۰ ✓؛ ۳۱ سرگشتۀ محاوره‌ای زنده ✓؛ «این فرم چیست» قدیمی = ۰ ✓
- سند checklists-full.md با توضیح‌های جدید بازتولید شد (۱۶۰۴ خط)؛ ce-desc-parsed.json سینک (۲۸ ردیف)

Stage Summary:
- تولید: 1.00.53 / m178 — کل زنجیرهٔ متن‌ها (شرح‌حال → توضیح ابزارها → راهنمای پشتوانهٔ علمی → متاهای داشبورد) لحن دوستانه و ساده دارد
- ثابت ماند: کلیدها، گویه‌های استاندارد، نمره‌دهی، باندهای m176

---
Task ID: 8 (m179)
Agent: main (Z.ai)
Task: مکانیک پشتیبان‌گیری و بازیابی داده‌ها — داخل خود سامانه (درخواست کاربر: «سیستم پشتیبان‌گیری از سایت و بارگذاری پشتیبان تو دیتابیس»)

Work Log:
- طراحی سه‌لایه: (۱) درون‌سامانه‌ای JSON gh-backup برای مدیر، (۲) CLI SQL عملیات (backup:remote موجود + بازیابی دستی wrangler)، (۳) Time Travel خود D1 (۳۰ روز)
- ماژول src/application/backup/: service (status/export استریمی/inspect/restore) + routes (requireRole('manager')) + README
- قالب gh-backup v1: پاکت (نسخه/زمان/include_files/excluded_tables) + tables{rows,row_count}؛ schema_migrations فقط اطلاعاتی؛ BLOB→base64
- مکانیک بازیابی: اعتبارسنجی + برابری مجموعه جداول → ترتیب توپولوژیک از PRAGMA foreign_key_list (Kahn؛ چرخه=یک batch) → هر جدول DELETE+INSERT در یک batch اتمیک با PRAGMA defer_foreign_keys=ON → chunking تطبیقی (۳۰ دستور/۲MB؛ درج تک‌ردیفی زیر سقف ۱۰۰ پارامتر D1؛ self-ref=یک batch) → پروجکشن ستونی + هشدار → گزارش + audit_log
- امنیت: فقط manager؛ supervisor با supervisorGate مسدود؛ سقف ۶۰MB؛ inspect بدون نوشتن؛ UI دو گارد (فایل اطمینان اجباری + تایپ «بازیابی»)
- صفحهٔ #/backup (فقط مدیر) با ۴ کارت؛ api.downloadBlob جدید؛ NAV+register
- DbClient.prepare اضافه شد (برای batch)؛ /health سورس با باندل هم‌راستا شد (db:up/503 — m138)
- ⭐ پایان ویرایش جراحی باندل: worker/src-entry.mjs + scripts/build-worker-bundle.mjs (esbuild از src) + scripts/bundle-smoke.mjs (برابری رفتاری دو باندل روی ۱۱ مسیر) — برابری m178↔بازسازی‌شده تأیید شد؛ فقط نسخه تفاوت دارد
- 1317 test ✓ (۱۲ تست جدید پشتیبان: رفت‌وبرگشت کامل/RBAC/چرخهٔ FK/بازیابی سبک/پروجکشن) · tsc 0 ✓ · node --check ✓
- گیت واژگان m179 (scripts/m179-vocab-gate.py، خام+escaped) ✓ — بدون موتور/کالیبراسیون/سیگنال
- bump چهارگانه → 1.00.54/m179 (index.html، sw.js، version.ts، باندل بازسازی‌شده)
- آزمون مسیرهای پشتیبان روی خود باندل (scripts/m179-bundle-backup-check.mjs): status/export(56 جدول)/inspect/restore رفت‌وبرگشت/گارد تأیید — همه سبز

Stage Summary:
- تولید: 1.00.54 / m179 — مدیر مرکز بدون ابزار بیرونی پشتیبان JSON می‌گیرد و فایل پشتیبان را داخل خود اپ به دیتابیس برمی‌گرداند؛ CLI SQL و Time Travel لایه‌های پشتیبان‌اند
- فایل پشتیبان = gh-backup v1؛ سند عملیات: docs/BACKUP.md؛ جزئیات مکانیک: src/application/backup/README.md
- باندل از این پس همیشه از src بازسازی می‌شود (سند در README ماژول)

---
Task ID: 10 (m181)
Agent: main (Z.ai)
Task: «ماژول پشتیبان‌گیری هنوز کار نمی‌کند و باگ دارد — دیباگش کن» — دیباگ روی دادهٔ واقعی پروداکشن و رفع

Work Log:
- کشف واگرایی فضای کار: مخزن محلی روی m176 بود؛ origin/main تا m180 جلوتر بود (m179 مکانیک پشتیبان + m180 ارسال به بله) → fast-forward به f95ed78
- راستی‌آزمایی زنده: /health = 1.00.55/m180 ✓؛ secret BALE_BOT_TOKEN ست است ✓؛ assets زنده ✓؛ نقش کاربر = manager ✓
- دیباگ داده‌محور: دامپ کامل پروداکشن (۱۳۴MB، ۵۹ جدول، ۳٬۴۶۸ ردیف) با wrangler d1 export گرفته شد و در node:sqlite بارگذاری شد؛ کل چرخهٔ پشتیبان با سرویس واقعی روی این کپی اجرا شد (اسکریپت موقت dbg-prod.test.ts)
- **باگ ۱ (بحرانی)**: بازیابی روی دادهٔ واقعی ۱۰۰٪ شکست می‌خورد: «بازیابی جدول «case_event_types» ناموفق بود: FOREIGN KEY constraint failed» — ریشه: DELETE+INSERT جداگانهٔ هر جدول؛ وقتی والد بیش از ۳۰ ردیف دارد (chunking)، فرزندان قدیمیِ هنوز-حذف‌نشده به ردیف‌های چانک بعدیِ والد ارجاع می‌دهند و commit چانک اول شکست می‌خورد. تست‌های قبلی سبز بودند چون در seed، نوع‌های ارجاع‌شده داخل چانک اول افتاده بودند
- **باگ ۲ (بالا)**: خروجی «همراه فایل‌ها» روی پروداکشن ~۱۰۴MB و ردیف‌های exercise_file_chunks تا ۲MB → SELECT صفحهٔ ۴۰۰تایی = یک کوئری ~۱۲۰MB + پمپ‌کردن کل استریم در start() = خطر OOM (سقف ۱۲۸MB ایزولهٔ Worker) و شکست دانلود
- **باگ ۳**: d1_migrations در SKIP_RESTORE_TABLES نبود — بازیابیِ پشتیبان کهنه، تاریخچهٔ مهاجرت D1 را عقب می‌برد و d1 migrations apply بعدی را می‌شکست
- **باگ ۴ (UX)**: آیدی بله با ارقام فارسی رد می‌شد (BACKUP_CHAT_ID_RE فقط لاتین) — رسوب‌یابی audit پروداکشن نشان داد کاربر حتی یک ردیف backup.* ندارد → مسیرش در «ذخیرهٔ مقصد» قطع شده بود
- **رفع‌ها (همه در src/application/backup/service.ts + views/backup.js):**
  - بازنویسی بازیابی به دو فاز: (۱) خالی‌کردن همهٔ جدول‌های هدف در یک batch واحد با defer_foreign_keys، (۲) درج توپولوژیک والد→فرزند (Kahn موجود) — chunking حالا بی‌خطر است
  - استریم خروجی pull-based (async generator + ReadableStream.pull) + صفحهٔ ۴تایی برای جدول فایل‌ها (قبلاً ۴۰۰)
  - SKIP_RESTORE_TABLES += d1_migrations
  - normalizeDigits ارقام فارسی/عربی در sanitizeDestinations (سرور) + listener ورودی آیدی (فرانت)
  - encodeValue دفاعی: ArrayBuffer/Array-of-bytes هم به base64
  - پیش‌اعتبارسنجی NOT NULL بدون پیش‌فرض در buildSummary → فایل ناقص قبل از هر نوشتنی با پیام روشن رد می‌شود
  - UI: هشدار سقف ۴۸MB بله کنار هر دو تیک «فایل‌های پیوستی» (ارسال فوری + خودکار)
- راستی‌آزمایی روی کپی پروداکشن بعد از رفع: status ✓ export سبک ۱٫۳۸MB ✓ inspect ✓ **restore 200 — ۳٬۳۱۷ ردیف** ✓ export با فایل‌ها ۱۰۴MB ✓ delivery PUT/GET ✓ بازیابی پس از جهش داده = جایگزینی دقیق (ردیف جهشی حذف، audit_log/settings به لحظهٔ فایل برمی‌گردند) ✓
- تست‌های رگرسیون جدید (۴): والد چندچانکه+فرزندِ چانک-بعدی، حفظ d1_migrations، ارقام فارسی، رد فایل ناقص قبل از نوشتن — 1332/1332 ✓ · tsc 0 ✓ · bundle-smoke ✓ · vocab-gate ✓ · node --check ✓
- bump چهارگانه → 1.00.56/m181؛ باندل با esbuild از src بازسازی شد (2.10MB)
- اسناد: docs/BACKUP.md + src/application/backup/README.md (بخش مکانیک بازیابی بازنویسی شد)

Stage Summary:
- تولید: 1.00.56 / m181 — بازیابی پشتیبان روی دادهٔ واقعی از «همیشه شکست» به «سبز کامل» رسید؛ خروجی سنگین memory-safe شد؛ مسیر ذخیرهٔ مقصد بله با ارقام فارسی باز شد
- نکته: بازیابی «با فایل‌های پیوستی» بالای ۶۰MB با محدودیت ساختاری JSON-body در Worker روبه‌روست (سقف فعلی عمدی است) — مسیر جایگزین: پشتیبان سبک داخل اپ + SQL کامل با CLI (لایهٔ ۲)

---
Task ID: 11 (m182)
Agent: main (Z.ai)
Task: «بازم منوی پشتیبان‌گیری باز نمیشه» — دیباگ نهایی ماژول پشتیبان روی پروداکشن واقعی

Work Log:
- راستی‌آزمایی‌های محلی همه سبز بودند (باندل m181، assets زنده = محلی، روتر/منو/ویو سالم، مرورگر واقعی + کپی دیتای پروداکشن ۵۹ جدول/۳٬۴۶۸ ردیف = پنل کامل بدون خطا) → باگ فقط روی پروداکشن بود
- بازتولید واقعی: حساب QA موقت (manager) روی پروداکشن ساخته شد → ورود واقعی از مرورگر → کلیک پشتیبان‌گیری → «تلاش مجدد / خطای داخلی سرور»؛ فراخوانی مستقیم /api/backup/status = HTTP 500
- تشخیص با wrangler tail: «D1_ERROR: not authorized: SQLITE_AUTH» روی /api/backup/status
- ریشه‌یابی با ورکر آزمایشی d1-auth-probe (deploy موقت روی همان D1): همهٔ دستورات (sqlite_master، PRAGMA table_info، foreign_key_list، defer_foreign_keys، COUNT) از داخل ورکر مجازند به‌جز کوئری روی جدول داخلی خودِ D1 یعنی _cf_KV → دقیقاً همان SQLITE_AUTH
- چرا محلی سبز بود: D1 محلی/کپی دامپ جدول _cf_KV ندارد (d1 export آن را نمی‌دهد) — پروداکشن ۶۰ جدول دارد (۵۹ + _cf_KV) و listTables فقط sqlite_% را فیلتر می‌کرد → rowCount("_cf_KV") → 500
- دامنهٔ آسیب (هر سه از یک ریشه): status=500 (پنل باز نمی‌شد)، export=کرش وسط استریم (دانلود هم می‌شکست)، inspect/restore=_cf_KV در «جدول‌های غایب در فایل» → schemaCompatible=false (بازیابی همیشه رد می‌شد)
- رفع در src/application/backup/service.ts: (۱) listTables اکنون `NOT LIKE 'sqlite_%' AND NOT LIKE '_cf_%'`، (۲) حلقهٔ شمارش status با try/catch جدولِ ناخوانا را با warn جا می‌اندازد (دفاع دوم؛ پنل هرگز ۵۰۰ نمی‌دهد)
- ۴ رگرسیون جدید (m182): حضور _cf_KV در دیتابیس → status ۲۰۰ بدون _cf_KV، خروجی بدون _cf_KV، inspect سازگار، چرخهٔ رفت‌وبرگشت سالم و _cf_KV دست‌نخورده
- 1336/1336 test ✓ · tsc 0 ✓ · bundle-smoke (تنها تفاوت: نسخه) ✓ · vocab-gate ✓ · node --check ✓
- bump چهارگانه → 1.00.57/m182؛ deploy نسخهٔ c79b5b7c
- وریفای زندهٔ واقعی: /health = 1.00.57/m182 ✓؛ پنل #/backup روی پروداکشن کامل باز شد (وضعیت: ۵۹ جدول/۳٬۴۷۵ ردیف) ✓؛ /api/backup/status = HTTP 200 ✓؛ /api/backup/export = HTTP 200، ۱٫۳۸MB، ۵۸ جدول، بدون _cf_KV ✓
- پاک‌سازی: حساب QA و ردیف‌های audit آن حذف شد (0/0)، ورکر آزمایشی d1-auth-probe حذف شد (404)، سشن مرورگر پاک شد

Stage Summary:
- تولید: 1.00.57 / m182 — ریشهٔ اصلی «پنل پشتیبان باز نمی‌شود» جدول داخلی _cf_KV خودِ D1 بود؛ status/export/inspect/restore همه از فیلتر سیستمی عبور می‌کنند و پنل روی پروداکشن واقعی سبز است
- درس: آزمون ماژول‌های D1 باید یا روی binding واقعی ورکر باشد یا جدول‌های داخلی D1 (_cf_%) را شبیه‌سازی کند؛ محیط محلی (node:sqlite/miniflare) این محافظت را ندارد

Task ID: 12 (dockerize-selfhost)
Agent: main (Z.ai)
Task: «تو گیت ها یه نسخه داکرایز شده اماده ران روی لوکال یا سرور شخصی بزارم برای کسایی که نمیخوان از کلاد فلر استفاده کنن + دستورالعمل راه‌اندازی»

Work Log:
- نقطهٔ شروع: طرح m173 (docs/DOCKERIZE.md) — فاز ۱ و ۲ همان طرح اجرا شد (اجرای نیتیو Node، نه مسیر موقت miniflare)
- src/core/db/node-d1.ts — درایور D1-سازگار روی node:sqlite (WAL + foreign_keys + busy_timeout؛ پاریتی کامل قرارداد MockD1 که ۱۳۰۵ تست روی آن سبز است؛ بایند Uint8Array→BLOB parity با D1 واقعی)
- src/core/db/selfhost-migrate.ts — runner مهاجرت با جدول _selfhost_migrations + حالت هوشمند «dump کامل D1 موجود → ثبت بدون اجرا» (جلوگیری از ALTER تکراری پس از d1 export/import)
- server/ — node-main.ts (serve@hono/node-server → استاتیک → worker.fetch با env سازگار Workers)، static.ts (پارسر واقعی public/_headers + ETag/304 + ضد traversal)، crons.ts (۴ عبارت پروداکشن از REMINDER_CRONS/BATCH_CRON/DIGEST_CRON با UTC پاریتی + تریگر دستی CRON_MANUAL)، cli.ts (migrate/sql/status برای bootstrap و بازیابی dump)، env.ts
- scripts/build-selfhost.mjs — esbuild bundle → dist/server.js (2.1MB خودکفا بدون node_modules) + dist/cli.js
- دودآزمایی زنده: ۶۹ مهاجرت خودکار ✓، /health ✓، کش پوسته/JS/SW دقیقاً مطابق _headers ✓، 304 ✓، 404 JSON پاریتی worker ✓، bootstrap→login manager/1234→JWT→/api/me ✓، zod validation روی POST ✓، کرون دستی ✓، cli status (۵۷ جدول) ✓، خاموشی نرم + WAL ✓
- داکر: Dockerfile (دو مرحله‌ای node:24-bookworm-slim، کاربر غیر-root، HEALTHCHECK بدون curl) + docker-compose.yml (پورت فقط localhost، volume appdata) + اورلی docker-compose.caddy.yml + Caddyfile (TLS خودکار) + .env.selfhost.example + .dockerignore
- راهنما: docs/SELF-HOST.fa.md (۱۳ بخش: شروع سریع، روز صفر، انتقال d1 export، بات بله/setWebhook، پشتیبان‌گیری VACUUM INTO، آپدیت، اجرای بدون Docker، عیب‌یابی) + بخش سلف‌هاست در README + نوار وضعیت پیاده‌سازی در DOCKERIZE.md
- تست: +۱۶ تست جدید (node-d1/selfhost-migrate ۶، static ۷، crons ۳) — مجموع ۱۳۲۱/۱۳۲۱ ✓ · tsc src 0 ✓ · tsc server 0 ✓ (tsconfig.node-server.json + script typecheck:server)
- وابستگی‌ها: @hono/node-server (dep)، esbuild (devDep) — wrangler/workerd در ایمیج ران‌تایم وجود ندارد
- تغییرات از پیش موجود دست‌نخورده ماند: worklog (جلسهٔ m177) و تغییر صفر-بایتی 0067 — کامیت نشدند با این کار

Stage Summary:
- نسخهٔ سلف‌هاست آمادهٔ ران: git clone → cp .env.selfhost.example .env → docker compose up -d --build → localhost:3000 (۴ دستور)
- پاریتی با پروداکشن: همان src/index.ts (fetch+scheduled)، همان _headers، همان ۴ کرون، همان مهاجرت‌ها؛ ۱۳۲۱ تست سبز
- commit اضافه شد و به origin/main پوش شد؛ نسخهٔ اپ تغییر نکرد (بدون bump چهارگانه — کد اپ دست نخورده)
