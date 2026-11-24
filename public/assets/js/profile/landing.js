/* ۱.۲۷.۶۳ — موج ۲ «کارگاه درمان»: تابع خالص فرود پوستهٔ کارگاه.
   هر دیپ‌لینک قدیمی (?tab=/?filter=/?station=/?section=) و فرود بی‌پارامتر به یک جای مشخص
   در پوستهٔ تازه می‌رسد — هاب درمان (تفسیر بالینی قهرمان) یا کشوی مرجع.
   خالص و بدون وابستگی؛ آزمون گیت front-12763-landing.test.ts روی همین تابع می‌دود. */

const STATIONS = ['ready', 'hold', 'log', 'follow'];
/* ۱.۲۷.۶۶ — «پیگیری‌ها» خانهٔ ریل شد و «اطلاعات پایه» به نوار بالا رفت؛ info برای سازگاری
   دیپ‌لینک‌های قدیمی (?section=info/?tab=info) در فهرست می‌ماند — نما آن را به پنل کامل نوار می‌فرستد. */
const RAIL_KEYS = ['timeline', 'clinical', 'followups', 'narrative', 'snapshot', 'sessions', 'exercises', 'games', 'comms', 'info'];

/* نگاشت تب‌های قدیمی به خانهٔ تازه — قرارداد ۱.۲۷.۵۸ حفظ شد:
   clinical → هاب (قهرمان)؛ sessions → ایستگاه «ثبت گزارش» (رفتار کلاسیک)؛ بقیه → کشوی مرجع. */
const TAB_LANDING = {
  info: 'drawer',
  timeline: 'drawer',
  clinical: 'hub',
  narrative: 'drawer',
  snapshot: 'drawer',
  sessions: 'station',
  exercises: 'drawer',
  games: 'drawer',
  comms: 'drawer'
};

export function resolveWorkshopLanding({
  canSeeClinical = false,
  canSeeGames = false,
  query = {}
} = {}) {
  const rawTab = typeof query.tab === 'string' && query.tab ? query.tab : null;
  const tab = rawTab === 'followups' ? 'timeline' : rawTab; // ?tab=followups → تاریخچه با فیلتر پیگیری (قرارداد قدیمی)
  const section = typeof query.section === 'string' && query.section ? query.section : null;
  const stationParam = STATIONS.includes(query.station) ? query.station : null;
  const hub = canSeeClinical ? 'clinical' : 'today';

  if (tab && Object.prototype.hasOwnProperty.call(TAB_LANDING, tab)) {
    const where = TAB_LANDING[tab];
    if (where === 'hub') return { hub: canSeeClinical ? 'clinical' : 'today', drawer: null, station: stationParam };
    if (where === 'station') return { hub, drawer: null, station: stationParam ?? 'log' };
    /* کشوی مرجع — تب بدون صلاحیت (بالینی برای بی‌نقش، بازی‌ها برای منشی) به هاب برمی‌گردد، نه کشو */
    if (tab === 'narrative' && !canSeeClinical) return { hub, drawer: null, station: stationParam };
    if (tab === 'games' && !canSeeGames) return { hub, drawer: null, station: stationParam };
    return { hub, drawer: tab, station: stationParam };
  }

  if (section && RAIL_KEYS.includes(section)) {
    /* ?section= مستقیم؛ بالینی در پوستهٔ کارگاه همیشه در هاب است — کشو برایش باز نمی‌شود */
    if (section === 'clinical') return { hub: canSeeClinical ? 'clinical' : 'today', drawer: null, station: stationParam };
    if (section === 'narrative' && !canSeeClinical) return { hub, drawer: null, station: stationParam };
    if (section === 'games' && !canSeeGames) return { hub, drawer: null, station: stationParam };
    return { hub, drawer: section, station: stationParam };
  }

  /* فرود بی‌پارامتر: هاب درمان (بالینی) یا هاب امروز؛ ایستگاه از قاعدهٔ وضعیت میز در نما می‌آید */
  return { hub, drawer: null, station: stationParam };
}
