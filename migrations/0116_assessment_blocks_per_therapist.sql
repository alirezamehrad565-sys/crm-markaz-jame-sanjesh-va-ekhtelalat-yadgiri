-- 0116 — تفکیک ردیف‌های چنددرمانگرهٔ بلوک سنجش به کارتِ مستقلِ هر درمانگر (خواست کارفرمای ۱.۲۷.۱۵):
-- فلوی تازه «کارت گرد درگ‌پذیر به‌ازای هر درمانگر» هر درمانگرِ درگیر را ردیف/کارت مستقل می‌خواهد
-- (درگ/دراپ و حذفِ جدا برای هر نفر). ردیف‌های قدیمی که therapist_ids چندعنصری داشتند به
-- ردیف‌های تک‌درمانگره شکسته می‌شوند؛ ردیفِ بدون درمانگر (سد زمانی کل بازه — سایهٔ راه‌راه)
-- و ردیف‌های حذف‌نرم‌شده دست‌نخورده می‌مانند. Idempotent: پس از اجرا هیچ ردیف زنده‌ای
-- طولِ آرایهٔ درمانگرش > 1 نیست. ساختار جدول تغییری نمی‌کند (فقط-داده، بدون CHECK — الگوی D7).
INSERT INTO assessment_blocks (id, block_date, start_minute, end_minute, therapist_ids, note, version, created_by, created_at, updated_at)
SELECT lower(
         hex(randomblob(4)) || '-' || hex(randomblob(2)) || '-4' || substr(hex(randomblob(2)), 2) ||
         '-' || substr('89ab', abs(random()) % 4 + 1, 1) || substr(hex(randomblob(2)), 2) ||
         '-' || hex(randomblob(6))
       ),
       ab.block_date, ab.start_minute, ab.end_minute, json_array(je.value), ab.note, ab.version,
       ab.created_by, ab.created_at, ab.updated_at
  FROM assessment_blocks ab, json_each(ab.therapist_ids) je
 WHERE json_array_length(ab.therapist_ids) > 1
   AND ab.deleted_at IS NULL;

DELETE FROM assessment_blocks
 WHERE json_array_length(therapist_ids) > 1
   AND deleted_at IS NULL;
