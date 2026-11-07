-- m269 — ارتقای سمت سرور ۱.۲۵.۲۵: اعتبار سطح DB برای جمع‌آوری دادهٔ بازی
-- شکاف ممیزی‌شده (G1/G6): submitAttempt با idem_key تازه برای «همان آیتم پاسخ‌داده‌شده»
-- ردیف دوم می‌نوشت — خلاصه/سنجه/ستاره/سازگاری آیتم را دوبرابر می‌شمردند.
-- سد سروری در سرویس افزوده شد؛ این مایگریشن همان قاعده را در خود DB تضمین می‌کند
-- تا حتی با مسابقهٔ درخواست هم ردیف تکراری ممکن نباشد.
--
-- استثنای حساب‌شده بر اصل «append-only» (m251-ب): ردیف‌های حذف‌شده فقط «تکرارهای
-- دیرهنگامِ همان آیتم»اند — نخستین پاسخ هر آیتم نگه داشته می‌شود و هیچ پاسخ
-- نخستینی حذف نمی‌گردد. ردیف یتیم/سالم دست‌نخورده است.

-- ۱) پاک‌سازی تکرارهای موجود (پاسخ نگه‌داشته‌شده = قدیمی‌ترین ردیف هر آیتم در جلسه)
DELETE FROM game_attempts
 WHERE rowid NOT IN (
   SELECT MIN(rowid) FROM game_attempts GROUP BY session_id, item_id
 );

-- ۲) یگانگی عملیاتی: هر آیتم در هر جلسه حداکثر یک پاسخ
CREATE UNIQUE INDEX IF NOT EXISTS idx_game_attempts_session_item
  ON game_attempts(session_id, item_id);

-- ۳) سوییپ جلسهٔ رهاشده (G3) — یافتن سریع child_activeهای بی‌فعالیت
CREATE INDEX IF NOT EXISTS idx_game_sessions_state_activity
  ON game_sessions(state, last_activity_at);
