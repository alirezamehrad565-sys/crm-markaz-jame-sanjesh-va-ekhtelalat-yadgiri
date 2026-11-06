-- m262 — بازطراحی گو/نوگو فاز ۳ (۱.۲۵.۱۳): دو حالت مستقل + دنبالهٔ seed-دار جلسه
-- دفترچهٔ وظیفه §۱: «دنبالهٔ محرک قابل‌ذخیره و بازتولید» — seed جلسه با پارامترهای
-- پروتکل در sequence_json می‌ماند؛ بازتولید عین دنباله برای ممیزی ممکن است.
-- purpose: تفکیک صریح جلسهٔ تمرین از ارزیابی — گزارش و دوز هرگز مخلوط نمی‌شوند.
-- هر دو ستون افزوده‌اند؛ دادهٔ موجود = تمرین بی‌دنباله (سازگاری کامل).

ALTER TABLE game_sessions ADD COLUMN purpose TEXT NOT NULL DEFAULT 'training'
  CHECK (purpose IN ('training','assessment'));

ALTER TABLE game_sessions ADD COLUMN sequence_json TEXT;
