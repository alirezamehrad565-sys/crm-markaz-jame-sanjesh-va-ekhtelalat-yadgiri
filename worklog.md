
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
- پیوست (همان جلسه): هنگام push مشخص شد ریموت جلوتر است (m178–m182 سشن موازی، 1.00.57) → rebase روی 6fe9975 (تنها کانفلیکت: worklog — هر دو سمت حفظ شد؛ شمارهٔ تسک من ۱۲ شد) → روی حالت ادغام‌شده: ۱۳۵۲/۱۳۵۲ test ✓ · tsc src/server 0 ✓ · rebuild سلف‌هاست + دودآزمایی مجدد ✓ (از جمله /api/backup/status = 200 روی لایهٔ Node — ماژول پشتیبان m179+ با درایور node-d1 سازگار است) → push نهایی bc02193 ✓

---
Task ID: 13 (ghcr-publish + sync-audit)
Agent: main (Z.ai)
Task: «میخوام اخرین ورژن یعنی 1.00.59 داکر بشه و تو گیت هاب باشه همزمان اون راه پیاده سازی رو کلاد فلر هم روی گیت ها باشه همه اخرین ورژن ریپو + یک GitHub Action برای build و publish خودکار ایمیج داکر به GHCR تا کاربرها بدون build مستقیم docker pull کنند»

Work Log:
- **کشف مهم — واگرایی مخزن و پروداکشن**: /health پروداکشن = «1.00.59/m184» ولی سر خط main = «1.00.57/m182 + سلف‌هاست» (origin == local، 0/0). یعنی m183 (1.00.58) و m184 (1.00.59) در سشن‌های موازی مستقر شده‌اند ولی سورس‌شان هرگز commit/push نشده است
- راستی‌آزمایی دامنهٔ گم‌شده: هر ۷۸ فایل public/ پروداکشن آینه شد (scripts/mirror-prod-assets.mjs) → ۷۵ فایل بایت‌به‌بایت identical با مخزن؛ تنها تفاوت = sw.js (VERSION v1.00.59) و index.html سروِ «/» (فقط ?v=1.00.59 پس از نرمال‌سازی identical) → **تمام تغییرات m183/m184 سمت Worker/بک‌اند است**
- بازیابی بک‌اند ممکن نشد: توکن CF API در سشن/فایل/کش wrangler موجود نیست (دانلود ورکر مستقر نیازمند API است)؛ upload/worker-v4.1.1.js مربوط به دورهٔ m88 است؛ checkout دیگری روی فایل‌سیستم نیست → سورس m183/m184 فقط در فضای کاری سشن مستقرکننده یا با توکن CF قابل بازگشت است
- تصمیم ایمنی: bump جعلی نسخه به 1.00.59 انجام نشد (دیپلوی مخزن با برچسب دروغ، رگرسیون m183/m184 را روی پروداکشن برمی‌گرداند) — مخزن صادقانه روی پایهٔ 1.00.57/m182 + سلف‌هاست ماند و شکاف مستند شد
- **`.github/workflows/docker-publish.yml` ساخته شد**: trigger = push main (path-filtered: src/server/public/migrations/scripts/package/Dockerfile) + تگ v* + workflow_dispatch · permissions packages:write · buildx چندمعماری amd64+arm64 · metadata-action (latest برای main، semver برای v*، sha-کوتاه، branch) · کش type=gha · خلاصهٔ استپ با دستور docker pull
- docker-compose.yml: image → `${CENTER_IMAGE:-center-system:latest}` تا مسیر pull-only بدون ویرایش فایل کار کند
- README: بج GHCR + بخش «docker pull» دو خطی؛ DOCKERIZE.md: وضعیت انتشار خودکار ایمیج؛ SELF-HOST.fa.md: زیربخش «راه دوم — ایمیج آمارهٔ GHCR» (docker run مستقل + CENTER_IMAGE در compose + تگ‌ها + بوت‌استرپ با docker exec)
- وریفای: YAML هر دو workflow معتبر · tsc src 0 · tsc server 0 · build:selfhost ✓ · دودآزمایی زندهٔ dist/server.js (پایهٔ ایمیج GHCR): مهاجرت‌های خودکار ✓ /health 200 با نسخهٔ درست ✓ / 200 html ✓ پاریتی خطای API ✓ · npm test = 1352/1352 ✓ (بج README به ۱۳۵۲ اصلاح شد؛ ci.yml سالم بود — «branches: ain]» خروجی بول‌شدهٔ ترمینال بود نه محتوای فایل)
- تگ v1.00.57 روی همین کامیت زده شد تا GHCR تگ نسخه‌دار (1.00.57) هم بگیرد؛ پس از بازگشت سورس m183/m184 به مخزن، تگ v1.00.59 و ایمیج متناظر خودکار می‌آید

Stage Summary:
- اکشن GHCR فعال شد: از این پس هر پوش روی main ایمیج سلف‌هاست را به ghcr.io/alirezamehrad565-sys/crm-markaz-jame-sanjesh-va-ekhtelalat-yadgiri منتشر می‌کند (latest + sha + main)؛ مسیر «docker pull» در README/SELF-HOST.fa.md/compose سیم‌کشی شد
- **شکاف باز — سورس m183/m184 (1.00.58–1.00.59) در گیت نیست**: دامنهٔ تغییر = فقط بک‌اند؛ استاتیک پروداکشن identical است. دو راه بازگشت: (۱) در سشن مبدأ commit+push، یا (۲) دادن CLOUDFLARE_API_TOKEN در سشن برای دانلود باندل مستقر (GET accounts/{id}/workers/scripts) و بازسازی
- مسیر Cloudflare دست‌نخورده ماند (wrangler.prod.toml/ورکر/مهاجرت‌ها بدون تغییر)؛ npm test 1352/1352 ✓

---
Task ID: 13-b (ci-red → green)
Agent: main (Z.ai)
Task: رفع قرمزی همیشگی CI — «Golden engine tests (node --test)»

Work Log:
- بررسی ران‌های Actions پس از پوش: CI روی main از قبل قرمز بود (۳ ران شکست پیش از کامیت‌های این سشن)؛ استپ شکسته = فقط «Golden engine tests» — typecheck/۱۳۵۲ تست/node --check همگی سبز
- ریشه‌یابی: آزمون طلایی، برابری src/domain/case-formulation/engine.js با برشِ باندل را ادعا می‌کرد؛ رفرنس‌ها آخرین بار در m170 تولید شده بودند و در m179 (بازسازی esbuild باندل از src) منطق بازسازی باندل عوض شد
- کشف ساختاری: موتور صورت‌بندی از m179 به‌بعد **اصلاً در باندل سرور نیست** — هیچ ماژولی در src/server آن را import نمی‌کند (esbuild tree-shake کرده)؛ مصرف‌کنندهٔ واقعی فقط فرانت‌اند است (public/assets/js/case-formulation.js + clinical-insights.js). مولد رفرنس (generate-bundle-ref.mjs) هم با انکرهای قدیمی روی باندل جدید کرش می‌کند (anchor not found: var CONSTRUCT_KEYS)
- یعنی فرضِ آزمون («src ≡ باندل سرور») از m179 بی‌معنا بود و استپ همیشه‌قرمز بود؛ پاریتی رفتار سرور از همان م179 با bundle-smoke.mjs + تست‌های مسیر پوشش داده شده است
- اقدام: حذف tests/golden + حذف استپ از ci.yml (با کامنت توضیحی) + افزودن استپ «Self-host build & smoke» به CI (بیلد dist/server.js + boot + /health + /) تا مسیر ایمیج GHCR هم در CI پوشیده شود
- src/domain/case-formulation/engine.js دست‌نخورده ماند (یافته برای تصمیم بعدی: کپی مرده کنار نسخهٔ فعال فرانت‌اند — کاندیدای پاک‌سازی یا اتصال مجدد سمت سرور؛ نیازمند تأیید کاربر)

Stage Summary:
- CI اکنون: tsc + ۱۳۵۲ تست + node --check + دودآزمایی سلف‌هاست — بدون استپ همیشه‌قرمز

---
Task ID: 13-c (cleanup-only-1.00.59)
Agent: main (Z.ai)
Task: «تنها نسخهٔ ریپو چه عادی چه داکر فقط 1.00.59 باشد + پوش این نسخه + پاک کردن ریلیزهای قبلی»

Work Log:
- پاک‌سازی انجام‌شده: تگ‌های v1.00.2 و v1.00.3 و v1.00.57 از ریموت و لوکال حذف شدند (remote بدون تگ)؛ یک Release پیش‌نویس قدیمی («نسخهٔ ۱.۰۰.۲») از GitHub Releases حذف شد (الان: ۰ ریلیز)؛ ۱۳ نسخهٔ بی‌تگِ ایمیج GHCR حذف شد (الان: فقط ۲ نسخهٔ سالم — latest/1.00.57/1.00/sha-5f12855 و main/sha-e9d448c — تا docker pull تا رسیدن ۱.۰۰.۵۹ زنده بماند)
- **پوش ۱.۰۰.۵۹ همچنان مسدود است**: git fetch دوباره انجام شد — هیچ کامیت m183/m184 به origin نیامده است؛ /health پروداکشن = 1.00.59/m184؛ سورس بک‌اند 1.00.58–1.00.59 فقط روی ورکر مستقرِ Cloudflare وجود دارد و دانلود آن بدون CLOUDFLARE_API_TOKEN ممکن نیست (هیچ توکنی در سشن/فایل/کش نیست)
- تصمیم: bump جعلی نسخه انجام نشد — مخزنی که باندلش رفتار m182 دارد ولی برچسب 1.00.59 بخورد، دقیقاً «مشکل آپدیت» می‌سازد (دیپلوی آینده از ریپو، فیکس‌های m183/m184 پروداکشن را بی‌صدا برمی‌گرداند)
- مسیر بازگشت مستند شد: (الف) توکن CF در سشن → دانلود اسکریپت مستقر (GET accounts/{id}/workers/scripts/center-system) → استخراج دلتای src → bump چهارگانه → ۱۳۵۲ تست → تگ v1.00.59 → بیلد خودکار GHCR → حذف دو نسخهٔ قدیمی ایمیج؛ یا (ب) push از سشن مبدأ m183/m184 و سپس همین ادامهٔ کار

Stage Summary:
- ریپو تمیز شد: بدون تگ، بدون ریلیز، GHCR فقط ۲ نسخهٔ کارا؛ اکشن GHCR سبز و فعال
- تنها کار باقی‌مانده برای «فقط 1.00.59»: بازگشت سورس m183/m184 (توکن CF یا push از سشن مبدأ)

---
Task ID: 14 (recover-m184-only-1.00.59)
Agent: main (Z.ai)
Task: «تنها نسخهٔ ریپو چه عادی چه داکر فقط 1.00.59 باشد + پوش این نسخه + پاک کردن ریلیزهای قبلی» — ادامهٔ 13-c با توکن Cloudflare

Work Log:
- توکن CF API + اعتبار R2 از کاربر دریافت شد؛ /workers/scripts فقط یک اسکریپت دارد: center-system (آخرین استقرار 2026-10-23)
- باندل مستقر با GET scripts/center-system?include_modules=true دانلود شد (multipart → entry.js ۲.۱۴MB، بدون minify با keep-names)
- بازتولید شکل استقرار: wrangler deploy --dry-run باندل m182 را با همان پالی‌فیل‌های unenv ساخت؛ لیست سکشن‌ها یکسان شد
- دیفرنسیال prod↔local: ۱۰۶ هانک واقعی داخل worker/bundle.js (بعد از نرمال‌سازی @__PURE__ نویز نسخهٔ esbuild) — نویز پالی‌فیل صفر
- نگاشت هانک→سورس با زنجیرهٔ دو sourcemap (wrangler map → bundle.js → esbuild map از src) + گزارش حاشیه‌نویسی‌شدهٔ ADD/DEL
- D1 مستقر با REST چک شد: آخرین مهاجرت 0068_m178 = مخزن → m183/m184 مهاجرت DB نداشتند
- پورت به سورس (۱۵ فایل): templates.ts (حذف ۲۲ case + افزودن ۹ case قطع اتصال/فایل، حذف ۵ تابع render*، بازنویسی help‌ها)، webhook.ts (BotCommand جدید: unlink_*/pfile_get/exb_file/flow_cancel؛ حذف stu_*/tl_*/wl_intake_*)، service.ts (کیبورد m184، clfBot جایگزین tlBot، handleUnlinkCommand/handleClassActivityCommand/handlePublicFilesCommand نقش‌محور/handleParentFileGet، حذف ۱۱ هندلر)، repository.ts (+۵ unlink)، exercise-bank (service: attachQueue+fileSender؛ routes: sendBaleDocument منتقل‌شده؛ bot: sendFile+دکمه‌های فایل)، api-routing (exerciseFileSender)، constants/types/index‌ها
- حذف کامل: waitlist-intake-bot.ts (۲۶۶ خط) و student-actions-bot.ts (۶۸۸ خط)
- کشف مکانیک esbuild: کامنت‌ها در باندل غیر-minify حفظ می‌شوند؛ renameهای log3/raw2/rows2 آرتیفکت wrangler بودند (سورس نام اصلی دارد)؛ باگ نمایش «[h» در ترمینال جلسه فریب‌مانداد ولی باندل سالم بود
- bump چهارگانه → 1.00.59/m184 (version.ts، index.html ?v=، sw.js VERSION، باندل esbuild)
- وریفای نهایی: باندل بازسازی‌شده ≡ باندل مستقر (بعد از نرمال‌سازی @__PURE__) = IDENTICAL — یعنی سورس دقیقاً همان چیزی است که روی پروداکشن می‌چرخد
- تست‌ها: ۴۶ شکست فلوهای حذف‌شده → حذف/بازنویسی (۳ فایل کامل حذف: screening-goal + sections از waitlist/teacher-intake/roles/capabilities/v2/crm/exb-bot؛ ثبت چک‌لیست و تکلیف به مسیر پنل API منتقل شد) → 1285/1285 ✓
- tsc src/server 0 ✓ bundle-smoke ✓ vocab-gate ✓ build:selfhost ✓
- پوش main (36dc163): CI ✓ + Docker (GHCR) ✓؛ تگ v1.00.59 → build تگ‌محور ✓
- پاک‌سازی GHCR: دو نسخهٔ قدیمی (sha-5f12855/1.00.57 و sha-e9d448c) حذف شد (HTTP 204) — باقی‌مانده فقط مانیفست‌های امروز
- پول ناشناس 1.00.59 با API رجیستری وریفای شد: OCI index amd64+arm64، لِیبل version=1.00.59، revision=36dc163

Stage Summary:
- مخزن (کلادفلر + داکر + GHCR) اکنون تک‌نسخه‌ای است: فقط 1.00.59/m184 — بدون تگ/ریلیز دیگر، بدون ایمیج قدیمی
- شکاف تاریخی سورس m183/m184 بسته شد: هر تغییر پروداکشن اکنون در src با تست بازسازی شده است
- نکته برای آینده: هیچ دیپلوی جدیدی از مخزن لازم نبود — پروداکشن از قبل 1.00.59 بود و مخزن به آن رسید

---
Task ID: 15 (wechsler-clinical-tab-fix)
Agent: main (Z.ai)
Task: «وکسلری که برای دانش‌آموزان وارد می‌کنم در تب تاریخچه می‌نشیند ولی در تب تفسیر بالینی نشان داده نمی‌شود» — تشخیص ریشه در پروداکشن واقعی + بازسازی + دیپلوی

Work Log:
- تشخیص با دادهٔ واقعی D1 پروداکشن: رویدادهای وکسلر ۲۰/۲۱ اکتبر engine_output دارند، رویداد ۲۴ اکتبر ندارد → رگرسیون زمانی
- ریشهٔ تاریخی: باندل اصلی (m98-era) هوک applyWechslerHook روی ثبت/ویرایش/نهایی‌سازی فرم WISC-۴ و wechslerSummaryOf/computeSuspicion در computeGates داشت؛ هنگام بازسازی باندل از src (m179/1.00.54) هر دو از سرویس‌های TS جا افتاد و تا امروز کشیده شد
- بازسازی در case-events/service.ts: studentBirthDate + summarySafePayload + applyWechslerHook (خطای موتور → ValidationError با پیام فارسی) در سه مسیر create/update/finalize
- بازسازی در ot-engine/service.ts + types: loadStageEvents + wechslerSummaryOf (نیم‌رخ کامل: fsiq/vci/pri/wmi/psi/gai/scatter/cls/percentile/weakDomains/flagsFa/monitoringInterval/ageLine/profile/psychometrics/event.date + مسیر دستی) + computeSuspicion (برش‌های SNAP-IV والد/معلم، SDQ، SCARED + هم‌گرایی چندمنبعی) → suspicion و wechslerSummary در /clinical-gates
- مایگریشن ۰۰۶۹: seed نوع ce-clinical-suspicion-v1 (در پروداکشن بود ولی در مایگریشن‌های مخزن نبود — نصب تازهٔ داکر آن را نداشت)
- ۶ تست رگرسیون جدید e2e-wechsler-restoration.test.ts؛ مجموع 1291/1291 ✓ tsc ✓ bundle-smoke ✓ vocab-gate ✓ build:selfhost ✓
- دیپلوی پروداکشن: مایگریشن ۰۰۶۹ ریموت ✓ → wrangler deploy → /health = 1.00.60/m185 ✓
- بک‌فیل رویداد امروز (f6ecaf1e) با همان موتور مخزن (engineVersion m98): FSIQ 75، صدک ۵، نیم‌رخ کامل در payload نوشته شد (تغییر ۱ ردیف، به‌همراه بازسازی summary)
- مخزن تک‌نسخه‌ای ماند: تگ v1.00.59 حذف، main + تگ v1.00.60 پوش شد (CI ✓، Docker در جریان)

Stage Summary:
- تب تفسیر بالینی اکنون نیم‌رخ وکسلر را هم برای رویدادهای قدیمی (با engine_output) و هم رویدادهای تازه (هوک دوباره فعال) نشان می‌دهد؛ سیگنال‌های شک بالینی مرحلهٔ رفتاری هم برگشت
- رفتار دوباره با باندل اصلی m98 برابر است + امتیاز اضافه: خلاصهٔ رویداد دیگر JSON موتور را لو نمی‌دهد

---
Task ID: 16 (drop-composite-forms-plan-flow)
Agent: main (Z.ai)
Task: حذف «فرم جامع معلم/خانواده» (طرح ناکام) + فلو تازهٔ «فرم‌های لازم بعد از وکسلر» — تیک چندتایی و ارسال گروهی به خانواده/معلم

Work Log:
- راستی‌آزمایی D1 پروداکشن: صفر رویداد با نوع‌های ce-comp-family-v2/ce-comp-teacher-v2 → حذف قطعی امن
- باتری: سه ابزار واقعی باتری کامپوزیت (sdq-p → screening، id-adapt + sld-class-t → specific) منتقل و battery-composite.json حذف شد؛ instruments.ts سه‌منبعی شد (۲۱ ابزار)
- بک‌اند: pure.ts (COMPOSITE_*/packageComponentsOf/شاخهٔ اعتبارسنجی پکیج)، service.ts (fillPackageFlow/isPackage/listPackageComponentTypes)، routes.ts (packageModelOf + شاخهٔ GET پکیج)، public-form.ts (renderPackageFormPage ~۲۹۵ خط)، convergence.ts، types.ts، index.ts، case-events-bot.ts (شاخهٔ isPackage بات)، قالب bot_teacher_package_link → bot_teacher_checklist_link
- پیشنهادگر (recommender.ts): PLAN_TOOL_KEYS بدون compFamily؛ مسیر BIF حالا سنجهٔ انطباق روزمرهٔ تکی + باتری رفتاری SDQ والد/معلم (r0 با دامنهٔ behavior) را پیشنهاد می‌کند — planType = دامنه‌های ≥۲؛ مسیر ID/انطباق‌نامعلوم → idAdapt تکی
- فرانت: کارت پلن زیر نتیجهٔ وکسلر حالا تیک انتخابی دارد (همه از پیش علامت‌خورده) + دکمهٔ «ارسال فرم‌های انتخابی با بله (N)» → مودال ارسال گروهی openChecklistBatchSendModal: فهرست تیک‌دار با نشان گیرنده، انتخاب معلم مشترک برای فرم‌های مدرسه، یادداشت مشترک، ساخت+ارسال ترتیبی هر فرم (fallback صدور لینک معلم وقتی چت کلاس قطع است) + خلاصهٔ نتیجه با کپی لینک؛ «انتخاب دستی از کتابخانه» باقی است
- پاک‌سازی فرانت: fillTargetOf/فیلتر suggest/isTeacherFlow بدون کلیدهای comp؛ COMPOSITE_KEYS و راهنماهای جامع از clinical-content حذف؛ feedback-sheet بدون برچسب جامع
- مایگریشن ۰۰۷۰: حذف دو نوع جامع (پروداکشن اعمال شد — ۰ باقی‌مانده)
- تست‌ها: ۷ فایل به‌روز (battery/pure/public-form/clinical-engine-v2/recommender/e2e-plan/e2e-forms/e2e-teacher) — ۲ تست پکیجی حذف و به‌جای آن قرارداد حذف + فرم تکی معلم/خانواده بازنویسی شد — 1282/1282 ✓ tsc ✓ بیلد سلف‌هاست ✓ (بوت + /health + ۷۲ مایگریشن لوکال)
- bump چهارگانه → 1.00.61/m186 + build-worker-bundle (بدون هیچ رفرنس comp) + دیپلوی wrangler پروداکشن + مایگریشن ریموت ۰۰۷۰
- وریفای زنده: /health = 1.00.61/m186؛ سه فایل فرانت نو (batch modal present، بدون COMPOSITE_KEYS)؛ DB پروداکشن بدون نوع جامع

Stage Summary:
- «فرم جامع معلم/خانواده» به‌کلی حذف شد (کد، باتری، DB، مستندات)؛ فلو تازه زیر نتیجهٔ وکسلر: انتخاب تکیِ فرم‌های لازم و ارسال گروهی به خانواده/معلم
- پروداکشن روی 1.00.61/m186؛ CI/داکر با پوش main + تگ v1.00.61 (تگ v1.00.60 طبق سیاست تک‌نسخه حذف می‌شود)

---
Task ID: 17 (m187)
Agent: main (Z.ai)
Task: «بخش مدیریت قالب ها باگ خورده اونو درست کن» — بازگردانی بک‌اند قالب‌های مسیر و پروتکل جلسه‌به‌جلسه

Work Log:
- ریشهٔ باگ: فرانت (views/templates.js + clinical-insights.js) به /api/pathway-templates و /api/clinical-paths/:id/sessions درخواست می‌زد ولی هیچ روت/سرویسی در src و باندل مستقر نبود — همان الگوی مفقودِ بازسازی m179 (مثل هوک وکسلر در m185)؛ اثبات: باندل قدیم m178 سه روت pathway-templates داشت، باندل m179 به بعد صفر
- بازگردانی پاریسی از باندل m178 (تاریخچهٔ گیت) به src: types (PathSessionRecord/PathwayTemplateSummary/وضعیت‌ها/انواع آیتم + templateKey/templateTitle/sessions در رکورد مسیر)، service (ثابت‌های PATHWAY_*، sanitize سه‌گانه، listPathTemplates/upsertPathTemplate با 409/404، listPathSessions/add/update/delete، شاخهٔ template_key در createPath با seed جلسات)، routes (سه روت قالب + سه روت جلسات + ClinicalPathCreateSchema با template_key و superRefine «هدف یا قالب»)
- تست: e2e-pathway-templates.test.ts — ۹ رگرسیون (CRUD + RBAC + ۴۰۹ کلید تکراری + ساخت مسیر از قالب با seed جلسات + جلسات CRUD + مسیر بستهٔ ۴۰۹ + audit)
- ۱۲۹۱/۱۲۹۱ ✓ · tsc ۰ ✓ · server-tsc ✓ · vocab-gate ✓ — bump چهارگانه 1.00.62/m187 + build-worker-bundle (۳ رفرنس pathway-templates ≡ باندل m178)
- دیپلوی: مایگریشن ریموت (بدون مایگریشن جدید — جداول از 0051) → wrangler deploy ✓
- وریفای زنده: /health = 1.00.62/m187 ✓ · GET /api/pathway-templates = 401 (قبلاً 404) ✓ · جدول pathway_templates پروداکشن فعلاً خالی (این بخش هرگز کار نکرده بود؛ اولین قالب با «قالب جدید» ساخته می‌شود)

Stage Summary:
- صفحهٔ «مدیریت قالب‌ها» و فلو «ساخت مسیر از قالب» و بلوک جلسات مسیر در تب تفسیر بالینی دوباره زنده است؛ رفتار ۱:۱ با باندل اصلی m98
- پروداکشن روی 1.00.62/m187؛ main + تگ v1.00.62 پوش شد (تگ قبلی طبق سیاست تک‌نسخه حذف می‌شود)

---
Task ID: m188
Agent: main (Z.ai)
Task: ماژول «کلر بوک مرکز» — خط زمانی یکپارچهٔ برنامه و شواهد (طراحی تعاملی با کاربر: ترکیب تقویم اجرایی و آلبوم فعالیت‌ها روی یک خط زمانی؛ فازها خاکستری/کم‌رنگ تا وقتی مدرک ندارند)

Work Log:
- طراحی: دو خروجی چاپ (آلبوم فعالیت‌ها با جلد/عکس/کپشن + جدول رسمی تقویم اجرایی افقی برای اداره)؛ فازهای برنامه روی همان خط زمانی رویدادها با «ثبت فعالیت برای این برنامه» (پیش‌پر کردن تاریخ/برچسب/اتصال فاز)؛ دسترسی فقط مدیر+منشی (منو + RBAC هر دو لایه)
- مایگریشن 0071: clearbook_plans (بازه از/تا، اقدامات اداری/مرکز، وضعیت planned|active|done، برچسب، sort_order)، clearbook_entries (event_date جدا از ثبت، plan_id اختیاری ON DELETE SET NULL)، clearbook_entry_tags (برچسب آزاد، PK ترکیبی)، clearbook_attachments (kind image|doc، کپشن اختیاری)
- بک‌اند src/domain/clearbook (types/pure/service/routes/index): CRUD رویداد با برچسب یکدست‌شده، آپلود multipart + تکه‌ای (کلید clearbook/{entryId}/{attId} روی همان ObjectStore پیوست‌ها، بدون ویدیو — تصویر+سند)، کپشن PATCH، CRUD فاز + reorder + seed-template ۱۲ فازه از سند «تقویم اجرایی مرکز» (ماه‌های ۷..۱۲ سال شروع، ۱..۶ سال بعد) + copy-year با جابه‌جایی شمسی (سال تحصیلی: ماه≥۷ → همان سال، وگرنه سال−۱) + tags/years
- نکتهٔ موتور تست: node:sqlite ستون qualified «جدول‌های هم‌نام» را نمی‌پذیرد — کوئری بندانگشتی با alias صریح (a.id AS file_id, a2.id AS entry_id) بازنویسی شد
- فرانت views/clearbook.js (~۱۲۰۰ خط): خط زمانی ماه‌بندی‌شده، کارت فاز خاکستری با نشان «اکنون» و بندانگشتی شواهد، کارت رویداد با گالری/سند/برچسب، ویرایشگر برچسب با datalist، فشرده‌سازی عکس در مرورگر (۱۶۰۰px/JPEG ۰٫۸۲)، آپلود همیشه تکه‌ای (کپشن با fileId تمیز وصل می‌شود)، مدیریت تقویم اجرایی (مرتب‌سازی/درج قالب/کپی سال)، چاپ: تزریق @page افقی فقط برای چاپ تقویم + خالی‌سازی ریشهٔ چاپ بعد از afterprint
- CSS: بلوک cb-* (خط زمانی، کارت‌ها، وضعیت‌ها، چاپ cbp-*) در views.css؛ منو در group «مرکز»؛ bump چهارگانه 1.00.63/m188
- تست: e2e-clearbook.test.ts — ۱۶ رگرسیون (RBAC 403/401، CRUD، قالب ۱۲ فازه + تعارض 409، کپی سال + تعارض، بازه/برچسب/جستجو/فاز، multipart + inline/attachment، کپشن، mime نامجاز، تکه‌ای ۲.۵MB + ناقص 409، حذف آبشاری قطعه‌ها، شواهد+thumbs، audit) — ۱۳۰۷/۱۳۰۷ ✓ tsc ✓ vocab-gate ✓ باندل بازسازی شد (۱۱۳ ارجاع clearbook)

Stage Summary:
- کلر بوک مرکز آماده است: برنامه (خاکستری) → ثبت فعالیت → زنده شدن کارت با شواهد؛ دو خروجی چاپ جدا با فیلتر بازه/برچسب
- نسخهٔ 1.00.63/m188 — مایگریشن ریموت 0071 + deploy پروداکشن در ادامهٔ همین فاز انجام می‌شود

---
Task ID: 2 (کلر بوک — m189)
Agent: main (Z.ai)
Task: بازطراحی کامل UI/UX کلر بوک پس از بازخورد کاربر («فاجعه و بهم‌ریخته») + نمایش تاریخ و خط عمودی حتی در حالت خالی

Work Log:
- بازبینی زنده با wrangler dev + مرورگر (اسکرین‌شات قبل/بعد) — ریشه‌یابی: ۱) CSS خودمان display:grid/flex می‌داد و صفت hidden را بی‌اثر می‌کرد (پاپ‌آپ چاپ همیشه باز، جزئیات همهٔ فازها همیشه باز) ۲) هندسهٔ خط/نقطه‌ها با هک‌های [dir=rtl] هیچ‌وقت دقیق نمی‌شد ۳) filter: grayscale کارت‌ها را مثل بلوک غیرفعال نشان می‌داد ۴) حالت خالی = صفحهٔ مرده بدون خط و تاریخ
- views.css — بازنویسی بلوک m188: قانون ریشه‌ای `.cb-root [hidden]{display:none!important}`؛ هندسهٔ واحد خط زمانی (خط ۳px در 13–16px، مرکز همهٔ نقاط ۱۴٫۵px) بدون هیچ هک RTL؛ پنل فیلتر دسته‌بندی‌شده (سال تحصیلی/برچسب‌ها/بازهٔ تاریخ/جستجو با برچسب)؛ زبان بصری تازهٔ فازها (planned خط‌چین، active حاشیهٔ accent، done سبز) به‌جای خاکستری‌کردن همه‌چیز؛ ماه‌ها به‌صورت قرص و نقطهٔ رنگی؛ جای‌خالی ماه بی‌فعالیت (cb-empty-slot) و بنر راهنمای حالت خالی (cb-empty-hint)؛ رفع سرریز عنوان در مدیریت تقویم
- clearbook.js — drawTimeline بازنویسی شد: اسکلت ماه‌های بازه (تا ۱۴ ماه) همیشه رسم می‌شود حتی بدون هیچ فعالیتی (درخواست صریح کاربر)؛ ماه جاری با is-now برجسته؛ buildToolbar: شنیده‌های سطح سند با AbortController جمع می‌شوند (رفع نشت) + بستن پاپ‌آپ با Escape؛ دکمه‌های ویرایش/حذف/جزئیات آیکونی با aria-label؛ برچسب شمارش فاز از «مدرک» به «فعالیت ثبت‌شده» اصلاح شد (بک‌اند رویدادهای متصل را می‌شمارد نه پیوست‌ها)
- نسخهٔ چهارگانه → 1.00.64/m189 + باندل ورکر بازسازی (2.21MB، ۱۱۳ ارجاع clearbook) + bundle-smoke ✓
- گیت: ۱۳۰۷ تست/۱۱۰ فایل ✓ tsc ✓ vocab-gate ✓ — دیپلوی پروداکشن (ورژن ورکر 222f0d19) + /health = 1.00.64/m189 + RBAC 401 ✓ + CSS نو زنده ✓

Stage Summary:
- کلر بوک اکنون: پاپ‌آپ چاپ فقط با کلیک، جزئیات فاز با دکمهٔ چشم، فیلترها پنل مرتب، خط زمانی دقیق‌تراز، کارت فاز تمیز، و در حالت خالی خط عمودی + برچسب ۱۲ ماه + جای‌خالی هر ماه دیده می‌شود
- بدون مایگریشن جدید — فقط فرانت‌اند و باندل؛ پروداکشن و مخزن هم‌تراز 1.00.64/m189
