-- 0054_wechsler_w4_fields_retire_legacy.sql
-- فاز صفر نقشهٔ راه بهبود هستهٔ بالینی (سند §۱۰.۱ — اقدام «تکمیل فیلدهای فرم وکسلر» و «پاک‌سازی مرده‌ها»)
-- الف) seed 0050 فرم وکسلر ۴ را فقط با «یک سربرگ» بازسازی کرده بود؛ در محیط تازه ثبت نمرهٔ خام
--      عملاً ناممکن می‌شد (فیلدهای raw_* فقط در RAW_FIELD_MAP باندل شناخته بودند). این migration
--      همان JSON واقعی پروداکشن را بازتولید می‌کند تا محیط تازه و پروداکشن هم‌ارز باشند.
-- ب) فرم قدیمی وکسلر (کلید wechsler — پروفایل WISC-V، میراث 0030/0042) منقضی می‌شود تا ثبت با آن
--      دادهٔ ناسازگار به موتور جدید وارد نکند (حتی یک رویداد ثبت‌شده هم با آن وجود ندارد؛
--      رویدادهای تاریخی همچنان رندر می‌شوند چون EVENT_SELECT join بدون فیلتر liveness است).

-- ─── الف) تکمیل فیلدهای فرم وکسلر ۴ (هم‌ارز JSON واقعی پروداکشن) ───
UPDATE case_event_types
   SET fields = '[{"key":"test_date","label":"تاریخ اجرا (شمسی)","type":"text","required":true,"placeholder":"مثلاً ۱۴۰۴/۰۷/۱۲ — تاریخ تولد خودکار از پروفایل دانش‌آموز خوانده می‌شود"},{"key":"grp_core","label":"نمرهٔ خام — خرده‌آزمون‌های اصلی","type":"heading"},{"key":"raw_bd","label":"طراحی مکعب‌ها (BD)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_si","label":"تشابهات (SI)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_ds","label":"فراخنای ارقام (DS)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_pcn","label":"مفاهیم تصویری (PCn)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_cd","label":"رمزگذاری (CD)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_vc","label":"واژگان (VC)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_ln","label":"توالی حرف-عدد (LN)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_mr","label":"استدلال ماتریسی (MR)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_co","label":"درک مطلب (CO)","type":"number","placeholder":"نمرهٔ خام"},{"key":"raw_ss","label":"جستجوی نماد (SS)","type":"number","placeholder":"نمرهٔ خام"},{"key":"grp_sub","label":"خرده‌آزمون‌های جانشین (اختیاری)","type":"heading"},{"key":"raw_pcm","label":"تکمیل تصاویر (PCm)","type":"number","placeholder":"فقط اگر جایگزین شده"},{"key":"raw_ca","label":"خط‌زنی (CA)","type":"number","placeholder":"فقط اگر جایگزین شده"},{"key":"raw_in","label":"اطلاعات (IN)","type":"number","placeholder":"فقط اگر جایگزین شده"},{"key":"raw_ar","label":"حساب (AR)","type":"number","placeholder":"فقط اگر جایگزین شده"},{"key":"raw_wr","label":"استدلال کلمه (WR)","type":"number","placeholder":"فقط اگر جایگزین شده"},{"key":"grp_note","label":"یادداشت درمانگر (اختیاری)","type":"heading"},{"key":"interpretation","label":"تفسیر بالینی درمانگر","type":"longtext"},{"key":"recommendation","label":"توصیه‌ها","type":"longtext"},{"key":"next_action","label":"اقدام بعدی","type":"select","options":["هیچ","پیگیری","نوبت بعدی","تماس با خانواده","ارجاع"]}]',
       audience = 'staff',
       updated_at = '2026-10-20T00:00:00.000Z'
 WHERE key = 'ce-wechsler-w4-v1' AND deleted_at IS NULL;

-- ─── ب) بازنشستگی فرم قدیمی وکسلر (hidden از انتخابگر: active=0 + deleted_at) ───
UPDATE case_event_types
   SET deleted_at = '2026-10-20T00:00:00.000Z',
       active = 0,
       updated_at = '2026-10-20T00:00:00.000Z'
 WHERE key = 'wechsler' AND deleted_at IS NULL;
