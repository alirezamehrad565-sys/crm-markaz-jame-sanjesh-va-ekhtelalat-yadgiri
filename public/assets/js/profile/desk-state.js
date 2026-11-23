/* ۱.۲۷.۶۰ — جدول ۵ نقد پرونده: قاعدهٔ واحد «وضعیت میز» (از بالا به پایین؛ نخستین حالت منطبق برنده است).
   خالص و بدون وابستگی — پوسته و آزمون رگرسیون هر دو از همین یک منبع می‌خوانند تا نوار فلو، فرودگاه
   و «اقدام بعدی» دیگر هرکدام با قاعدهٔ جدا تصمیم نگیرند (ریشهٔ مشترک نقص‌های ۳ تا ۶ و ۸ سند نقد). */
export function computeDeskState({ appointments = [], openFollowups = [], reportApptIds = [], nowMs = Date.now() } = {}) {
  const scheduled = (appointments ?? []).filter((a) => a && a.status === 'scheduled');
  const byOldest = (x, y) => (x.startAt < y.startAt ? -1 : 1);

  // ۱) جلسهٔ گذشته با حضور ثبت‌نشده → برگزاری — «ثبت حضور همان جلسه»
  const pastPending = scheduled
    .filter((a) => Date.parse(a.startAt) <= nowMs && a.myAttendance === 'pending')
    .sort(byOldest)[0] ?? null;
  if (pastPending) return { station: 'hold', target: pastPending, action: 'ثبت حضور همان جلسه' };

  // ۲) جلسهٔ برگزارشده با حضور، بدون گزارش → ثبت گزارش — «فرم گزارش همان جلسه» (قدیمی‌ترین اول)
  const noReport = scheduled
    .filter((a) => Date.parse(a.startAt) <= nowMs
      && (a.myAttendance === 'present' || a.myAttendance === 'late')
      && !reportApptIds.includes(a.appointmentId))
    .sort(byOldest)[0] ?? null;
  if (noReport) return { station: 'log', target: noReport, action: 'فرم گزارش همان جلسه' };

  // ۳) پیگیریِ عقب‌افتاده → پیگیری — «فهرست پیگیری‌ها با سررسید؛ نخستین عقب‌افتاده»
  const overdue = (openFollowups ?? [])
    .filter((f) => f && f.dueAt && Date.parse(f.dueAt) < nowMs)
    .sort((x, y) => ((x.dueAt ?? '') < (y.dueAt ?? '') ? -1 : 1))[0] ?? null;
  if (overdue) return { station: 'follow', target: overdue, action: 'فهرست پیگیری‌ها — نخستین عقب‌افتاده' };

  // ۴) جلسهٔ پیش‌رو در ۴۸ ساعت آینده → آماده‌سازی — «موضوع جلسه و مدارک»
  const upcoming = scheduled
    .filter((a) => Date.parse(a.startAt) > nowMs && Date.parse(a.startAt) - nowMs <= 48 * 3600 * 1000)
    .sort(byOldest)[0] ?? null;
  if (upcoming) return { station: 'ready', target: upcoming, action: 'موضوع جلسه و مدارک' };

  // ۵) هیچ‌کدام (پروندهٔ تازه یا به‌روز) → آماده‌سازی — بدون «ادامه از جلسهٔ قبل»
  return { station: 'ready', target: null, action: 'مدارک و مسیر مداخله' };
}
