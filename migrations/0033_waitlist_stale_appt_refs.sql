-- مایگریشن اسکیما D1 — اصلاح ارجاع‌های نوبتِ لیست انتظار
-- سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
-- 0033 — (0.49.2): پاک‌سازی ارجاع‌های کهنهٔ نوبت در لیست انتظار
-- باگ: ورودی‌هایی که از وضعیت «scheduled» خارج شده‌اند (بازگشت به صف، نیامد، انصراف، رد)
-- ارجاع scheduled_appointment_id را نگه می‌داشتند و FK روی همان ستون (NO ACTION)
-- حذفِ نوبتِ متصل را با «FOREIGN KEY constraint failed» می‌بست (500).
-- این مایگریشن ارجاع‌های کهنهٔ همهٔ ورودی‌های غیر-scheduled را خنثی می‌کند؛
-- ورودی‌های scheduled سالم می‌مانند (نوبت واقعاً در جریان است).
UPDATE waitlist
   SET scheduled_appointment_id = NULL,
       updated_at = datetime('now')
 WHERE status != 'scheduled'
   AND scheduled_appointment_id IS NOT NULL;
