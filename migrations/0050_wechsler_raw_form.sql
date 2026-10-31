INSERT INTO case_event_types (id, key, title, category, icon, family_fillable, fields, bands, active, created_by, is_system, audience, description)
SELECT 'seed-w4-raw-v1', 'ce-wechsler-w4-v1',
       'وکسلر ۴ (WISC-IV) — ثبت نمرهٔ خام', 'assessment', NULL, 0,
       '[{"key":"raw_subtests","label":"نمرهٔ خام زیرآزمون‌ها","type":"heading"}]',
       NULL, 1, 'system', 1, 'therapist', 'ثبت نمرهٔ خام زیرآزمون‌های WISC-IV — محاسبهٔ نمرهٔ استاندارد و پروفایل با موتور سامانه'
WHERE NOT EXISTS (SELECT 1 FROM case_event_types WHERE key = 'ce-wechsler-w4-v1');

UPDATE case_event_types
   SET title = 'وکسلر ۴ (WISC-IV) — ثبت نمرهٔ خام',
       description = 'ثبت نمرهٔ خام زیرآزمون‌های WISC-IV — محاسبهٔ نمرهٔ استاندارد و پروفایل با موتور سامانه',
       is_system = 1, active = 1
 WHERE key = 'ce-wechsler-w4-v1';
