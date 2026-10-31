-- m224 — پیوند نیم‌رخ به مداخله: هدف اندازه‌پذیر (SMART) + اسنپ‌شات مبنا روی مسیر.
-- فقط دو ستون افزونه و nullable؛ بدون تغییر مایگریشن‌های اعمال‌شده.
ALTER TABLE intervention_paths ADD COLUMN goal TEXT;        -- متن هدف SMART (سقف ۳۰۰ — در کد)
ALTER TABLE intervention_paths ADD COLUMN goal_basis TEXT;  -- JSON اسنپ‌شات قواعد اگر-آنگاهِ فعالِ همان هدف
