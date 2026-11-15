-- m264 — بازطراحی گو/نوگو فاز ۵ (۱.۲۵.۱۵): لایهٔ محاسبه‌شدهٔ جلسه
-- دفترچهٔ وظیفه §۸: «خام در برابر محاسبه‌شده جدا» — خام در game_attempts می‌ماند؛
-- خلاصهٔ محاسبه‌شده (scoring.ts) در summary_json جلسه ثبت می‌شود.
-- metrics_json (سنجه‌های رجیستری) دست‌نخورده می‌ماند — این افزوده است.

ALTER TABLE game_sessions ADD COLUMN summary_json TEXT;
