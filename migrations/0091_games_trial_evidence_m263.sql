-- m263 — بازطراحی گو/نوگو فاز ۴ (۱.۲۵.۱۴): شواهد نمایش واقعی روی game_attempts
-- دفترچهٔ وظیفه §۴: «مُهر زمانِ نمایش واقعی، تأخیر، افت فریم، لمس‌های چندگانه» —
-- هر ستون افزوده و nullable است؛ دادهٔ موجود = بی‌شواهد (سازگاری کامل).
-- تصمیم طراحی: ستون‌های رخداد روی game_attempts به‌جای جدول game_trial_events —
-- گزارش درمانگر (فاز ۸) مستقیم و بدون join می‌خواند؛ رخدادهای ریز در response_json خام می‌مانند.

ALTER TABLE game_attempts ADD COLUMN presented_at_ms INTEGER;   -- مُهر نمایش واقعی (جریان کودک، performance.now)
ALTER TABLE game_attempts ADD COLUMN frame_drops INTEGER;       -- فریم‌های بلندتر از ۳۴ms حین نمایش
ALTER TABLE game_attempts ADD COLUMN max_frame_delta_ms INTEGER;
ALTER TABLE game_attempts ADD COLUMN touch_count INTEGER;       -- کل لمس‌های آزمون
ALTER TABLE game_attempts ADD COLUMN premature_count INTEGER;   -- پاسخ زودتر از محرک (C4)
ALTER TABLE game_attempts ADD COLUMN multiple_count INTEGER;    -- لمس‌های چندگانه در پنجره (C5)
ALTER TABLE game_attempts ADD COLUMN out_of_surface_count INTEGER; -- لمس بیرون سطح صحنه
ALTER TABLE game_attempts ADD COLUMN window_ms INTEGER;         -- پنجرهٔ پاسخ عملیاتی آن آزمون
