-- 0115 — بلوک نوبت سنجش (خواست کارفرمای ۱.۲۷.۱۴): بازهٔ «از ساعت — تا ساعت» که مدیر برای
-- سنجش رزرو می‌کند و درمانگران درگیر را ثبت می‌کند؛ در این بازه ثبت/جابه‌جایی/تغییر مدتِ
-- نوبتِ درمانگر و منشی سد سخت می‌خورد (assertNoAssessmentBlockInRange در appointment-core؛
-- مدیر/ناظر معاف‌اند تا خودشان جلسهٔ سنجش را نوبت‌گذاری کنند).
-- قرارداد مایگریشن‌ها: فقط-افزودنی، بدون CHECK (الگوی D7 — اعتبارسنجی در Zod)، حذف نرم
-- با deleted_at، idempotent با IF NOT EXISTS. زمان‌ها «دقیقه از نیمه‌شب تهران» هستند
-- (هم‌واژگان مرکز ساعات کاری — آفست ثابت +3:30 در src/core/shared/time.ts).
CREATE TABLE IF NOT EXISTS assessment_blocks (
  id TEXT PRIMARY KEY,
  block_date TEXT NOT NULL,                -- ymd میلادی تهران (YYYY-MM-DD)
  start_minute INTEGER NOT NULL,           -- دقیقه از نیمه‌شب تهران (0..1440)
  end_minute INTEGER NOT NULL,             -- دقیقه از نیمه‌شب تهران (1..1440)
  therapist_ids TEXT NOT NULL DEFAULT '[]',-- JSON آرایهٔ staff_id درمانگران درگیر (فقط ثبت/نمایش)
  note TEXT,                               -- جزئیات آزاد مدیر (مثلاً «وژومتر» یا نام ارزیاب)
  version INTEGER NOT NULL DEFAULT 1,
  deleted_at TEXT,
  created_by TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_assessment_blocks_date ON assessment_blocks(block_date);
