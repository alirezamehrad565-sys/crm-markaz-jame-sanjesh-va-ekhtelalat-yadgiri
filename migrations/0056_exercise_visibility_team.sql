-- مایگریشن اسکیما D1 — دید تمرین + تمرین تیمی
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- — بانک تمرین: visibility ('public' | 'private') + team_created (امتیاز نصف در تابلوی پیشرفت)
-- کاربر: «تمرین خصوصی که فقط خودم و مدیر ببینیم + تمرین تیمی نصف امتیاز»
-- فقط اضافه‌ای — جدول‌ها و دادهٔ قبلی دست‌نخورده؛ قرارداد D7: enum در کد، بدون CHECK در SQL
-- * visibility: پیش‌فرض 'public' = رفتار فعلی همهٔ تمرین‌های موجود حفظ می‌شود
-- * team_created: ۰/۱ — پیش‌فرض ۰ = امتیاز کامل؛ تمرین تیمی ۰.۵ وزن در scoring

ALTER TABLE exercises ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE exercises ADD COLUMN team_created INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_exercises_visibility ON exercises(visibility);
