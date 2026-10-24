-- m186 — حذف دو «فرم جامع» (طرح اولیه‌ای که درست اجرا نشد)
-- منطق جدید: بعد از وکسلر، فرم‌های لازم به‌صورت تکی (رفتاری/DSM/توجه…) انتخاب و
-- برای خانواده/معلم ارسال می‌شوند — نیازی به بستهٔ چندبخشی نیست.
-- در پروداکشن هیچ رویدادی با این دو نوع ثبت نشده است؛ حذف قطعی امن است.
DELETE FROM case_events
 WHERE event_type_id IN (SELECT id FROM case_event_types WHERE key IN ('ce-comp-family-v2', 'ce-comp-teacher-v2'));

DELETE FROM case_event_types
 WHERE key IN ('ce-comp-family-v2', 'ce-comp-teacher-v2');
