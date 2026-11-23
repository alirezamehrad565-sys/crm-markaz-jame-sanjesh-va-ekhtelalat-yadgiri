/* ۱.۲۷.۶۲ — موج ۱ بازطراحی «کارگاه درمان» (برنامهٔ بازطراحی پروفایل — docs/PROFILE-REDESIGN-PROGRAM.md):
   حالت شمارشی هر ایستگاه به‌صورت تابع خالص. نوار ابزار فقط بج/عنوان را از همین می‌خواند و
   آزمون گیت روی همین تابع می‌دود — تا بج نوار ابزار با پنل ایستگاه دو حرف نزنند
   (درس نقص‌های ۳ تا ۸ نقد پرونده). خالص و بدون وابستگی؛ اعداد خام برمی‌گردد و
   فارسی‌سازی با fa() در لایهٔ نما انجام می‌شود. */

export function stationBadge(key, {
  appointments = [],
  reportedApptIds = [], /* noteApptIdSet + رویدادهای قطعی — همان قرارداد computeDeskState */
  openFollowups = [],
  nowMs = Date.now()
} = {}) {
  const scheduled = (appointments ?? []).filter((a) => a && a.status === 'scheduled');

  if (key === 'hold') {
    const n = scheduled
      .filter((a) => Date.parse(a.startAt) <= nowMs && a.myAttendance === 'pending')
      .length;
    return { n, tone: n > 0 ? 'warning' : 'success', line: n > 0 ? `${n} حضور ثبت‌نشده` : 'حضور جلسات به‌روز است' };
  }

  if (key === 'log') {
    const n = scheduled
      .filter((a) => Date.parse(a.startAt) <= nowMs
        && (a.myAttendance === 'present' || a.myAttendance === 'late')
        && !reportedApptIds.includes(a.appointmentId))
      .length;
    return { n, tone: n > 0 ? 'error' : 'success', line: n > 0 ? `${n} جلسهٔ بی‌گزارش` : 'گزارش جلسات به‌روز است' };
  }

  if (key === 'follow') {
    const fus = (openFollowups ?? []).filter(Boolean);
    const overdue = fus.filter((f) => f.dueAt && Date.parse(f.dueAt) < nowMs).length;
    if (overdue > 0) return { n: overdue, tone: 'error', line: `${overdue} پیگیری عقب‌افتاده` };
    if (fus.length > 0) return { n: fus.length, tone: 'warning', line: `${fus.length} پیگیری باز` };
    return { n: 0, tone: 'success', line: 'پیگیری باز نیست — پیگیری را از «اقدامات» بسازید' };
  }

  /* آماده‌سازی: بج شمارشی ندارد — خط مانده‌اش («موضوع جلسهٔ قبل در فرم گزارش می‌آید») از نما می‌آید */
  return null;
}
