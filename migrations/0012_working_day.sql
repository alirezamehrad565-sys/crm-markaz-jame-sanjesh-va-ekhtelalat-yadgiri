-- مایگریشن اسکیما D1 — روز کاری
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- ─────────────────────────────────────────────────────────────
--: مدیریت روز کاری (Working Day at a Glance)
-- ۱) توضیحات روز کاری — لاگ روزانه منشی/مدیر برای هر تاریخ
-- ۲) پایه تحصیلی دانش‌آموز — هاردکد (آموزش‌وپرورش ایران: تا ششم ابتدایی)
-- مقادیر نوشتاری قدیمی به لیبل استاندارد نگاشت و مابقی NULL می‌شوند
-- ─────────────────────────────────────────────────────────────

-- ۱) توضیحات روز کاری — append-only (هر ثبت: نویسنده + زمان)
CREATE TABLE IF NOT EXISTS day_notes (
  id         TEXT PRIMARY KEY,
  date       TEXT NOT NULL,
  body       TEXT NOT NULL,
  created_by TEXT NOT NULL REFERENCES staff(id),
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_day_notes_date ON day_notes(date);

-- ۲) نرمال‌سازی پایه‌های تحصیلی موجود → لیبل‌های ثابت
-- ترتیب مهم است: نگاشت‌ها اول، سپس پاک‌سازی هر چیز خارج لیست
UPDATE students SET grade = 'پیش‌دبستانی' WHERE grade IS NOT NULL AND grade LIKE '%پیش%';
UPDATE students SET grade = 'اول'     WHERE grade IS NOT NULL AND (grade LIKE '%اول%'   OR TRIM(grade) IN ('یک', '1', '۱', 'grade-1', 'grade1', 'grade-01', 'grade- 1'));
UPDATE students SET grade = 'دوم'     WHERE grade IS NOT NULL AND (grade LIKE '%دوم%'   OR TRIM(grade) IN ('2', '۲', 'grade-2', 'grade2'));
UPDATE students SET grade = 'سوم'     WHERE grade IS NOT NULL AND (grade LIKE '%سوم%'   OR TRIM(grade) IN ('3', '۳', 'grade-3', 'grade3'));
UPDATE students SET grade = 'چهارم'   WHERE grade IS NOT NULL AND (grade LIKE '%چهارم%' OR TRIM(grade) IN ('4', '۴', 'grade-4', 'grade4'));
UPDATE students SET grade = 'پنجم'    WHERE grade IS NOT NULL AND (grade LIKE '%پنجم%'  OR TRIM(grade) IN ('5', '۵', 'grade-5', 'grade5'));
UPDATE students SET grade = 'ششم'     WHERE grade IS NOT NULL AND (grade LIKE '%ششم%'   OR TRIM(grade) IN ('6', '۶', 'grade-6', 'grade6'));

-- هر مقدار خارج از لیست ثابت هفت‌گانه → NULL
UPDATE students SET grade = NULL
 WHERE grade IS NOT NULL
   AND TRIM(grade) NOT IN ('پیش‌دبستانی', 'اول', 'دوم', 'سوم', 'چهارم', 'پنجم', 'ششم');
