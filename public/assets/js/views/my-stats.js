import { api } from '../api.js';
import { el, icon, emptyState, errorState, progressRing, skeletonState } from '../ui.js';
import { fa, formatJalaliNumeric, tehranTimeOfIso, tehranYmdOfIso } from '../format.js';

/* «آمار من» — دید آماری شخصی درمانگر از GET /api/dashboard/me (خودِ سرور این مسیر را برای
   کاربر لاگین‌شده برمی‌گرداند). ممیزی UX: درمانگر هیچ نمای آماری خودش را نداشت — #/reports
   فقط دفتری بود و درمانگر به «روز کاری» بونس می‌شد. الگوها از views/dashboard.js قرض گرفته
   شده‌اند (hero-score / score-tile / spark / alert) چون آن ماژول با بودجهٔ eager سازگار نیست
   و helperهایش export نمی‌شوند — نسخه‌های کوچک محلی، فقط el() و بدون رشتهٔ HTML.
   شکست کل دریافت → errorState با «تلاش مجدد» (الگوی داشبورد)؛ نقصِ یک بخش از پاسخ →
   «—» + چیپ تلاش مجدد در همان بخش؛ نبودِ دادهٔ واقعی (نوبت آینده ندارید) → حذف یا emptyState. */

export async function renderMyStats(container) {
  container.replaceChildren(skeletonState('cards', 4));
  let stats = null;
  try {
    stats = (await api.get('/api/dashboard/me'))?.data ?? null;
  } catch {
    stats = null;
  }
  if (!stats) {
    container.replaceChildren(errorState(new Error('بارگذاری آمار ناموفق بود'), () => renderMyStats(container)));
    return;
  }
  const retry = () => renderMyStats(container);
  container.replaceChildren(
    pageHead(retry),
    heroCard(stats),
    missingNotesCard(stats, retry),
    nextAppointmentCard(stats),
    scoreTilesRow(stats),
    historyCard(stats, retry)
  );
}

function pageHead(onRefresh) {
  return el(
    'div',
    { class: 'page-head' },
    el('div', { class: 'page-head__title' }, 'آمار من'),
    el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: onRefresh }, icon('refresh', 16), 'به‌روزرسانی')
  );
}

/* حلقهٔ امتیاز — سقف صادقانه «بهترین ماهِ خودِ کاربر» است (داشبورد صدرِ همکاران را سقف می‌گیرد؛
   اینجا تابلوی همکاران در دسترس نیست، پس مقایسه با رکورد خود کاربر کمی‌کنت‌گذاری نمی‌شود). */
function heroCard(stats) {
  const histScores = Array.isArray(stats.history) ? stats.history.map((h) => h.score) : [];
  const best = Math.max(1, stats.score, ...histScores);
  const diff = stats.score - stats.scorePrev;
  return el(
    'div',
    { class: 'hero-score', style: { marginBottom: 'var(--sp-4)' } },
    el(
      'div',
      { class: 'hero-score__ring' },
      progressRing(stats.score, best, { size: 96, stroke: 9 }),
      el('div', { class: 'ring-center' }, el('b', {}, fa(stats.score)), el('span', {}, 'امتیاز'))
    ),
    el(
      'div',
      { class: 'hero-score__main' },
      el('div', { class: 'hero-score__label' }, 'امتیاز کل شما'),
      stats.from && stats.to
        ? el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-1)' } }, `${formatJalaliNumeric(stats.from)} تا ${formatJalaliNumeric(stats.to)}`)
        : null,
      el(
        'div',
        { class: `score-tile__prev${diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''}`, style: { marginTop: 'var(--sp-1)' } },
        `ماه قبل: ${fa(stats.scorePrev)}`,
        diff !== 0 ? el('span', {}, diff > 0 ? ` (+${fa(diff)})` : ` (−${fa(Math.abs(diff))})`) : null
      )
    ),
    rankChipEl(stats)
  );
}

function rankChipEl(stats) {
  const rank = stats.rank ?? null;
  const isGold = rank?.position === 1 && stats.score > 0;
  return el(
    'div',
    { class: `hero-score__rank${isGold ? ' hero-score__rank--gold' : ''}` },
    icon(isGold ? 'trophy' : 'users', 18),
    el(
      'div',
      { class: 'hero-score__rank-text' },
      rank ? el('b', {}, isGold ? 'صدرنشین تابلوی پیشرفت' : `رتبهٔ ${fa(rank.position)}`) : el('b', {}, '—'),
      rank
        ? el('span', {}, isGold ? `با ${fa(stats.score)} امتیاز` : `از ${fa(rank.of)} همکار`)
        : el('span', {}, 'هنوز رتبه‌ای در تابلوی پیشرفت ثبت نشده')
    )
  );
}

/* گزارش جلسه‌های بدون ثبت — n>0: همان آلرت داشبورد با متن/کنش هم‌عبارت؛ n===0: کارت تأیید؛
   شمارندهٔ نایافته از پاسخ: «—» + چیپ تلاش مجدد (شکست نرم همان بخش). */
function missingNotesCard(stats, retry) {
  const n = typeof stats.missingNotes === 'number' ? stats.missingNotes : null;
  if (n === null) {
    return el(
      'div',
      { class: 'alert alert--warning', style: { marginBottom: 'var(--sp-4)' } },
      icon('edit', 18),
      el(
        'div',
        { class: 'alert__body' },
        el('span', {}, 'شمار جلسه‌های بدون گزارش دریافت نشد — '),
        retryChipEl(retry)
      )
    );
  }
  if (n === 0) {
    return el(
      'div',
      { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('edit', 16), 'گزارش جلسه‌ها'), el('span', { class: 'badge badge--success' }, 'کامل')),
      el(
        'div',
        { class: 'card__body', style: { paddingTop: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' } },
        el('div', { class: 'cell-sub' }, 'همهٔ جلسه‌های برگزارشدهٔ این ماه گزارش دارند — گزارشِ نوشته‌شده هم امتیاز رقابت است، هم سند بالینی.')
      )
    );
  }
  return el(
    'div',
    { class: 'alert alert--warning', style: { marginBottom: 'var(--sp-4)' } },
    icon('edit', 18),
    el(
      'div',
      { class: 'alert__body' },
      el('span', {}, `${fa(n)} جلسهٔ برگزارشدهٔ این ماه هنوز گزارش جلسه ندارند — گزارشِ نوشته‌شده هم امتیاز رقابت است، هم سند بالینی.`),
      el(
        'div',
        { class: 'alert__actions' },
        el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => { location.hash = '#/working-day'; } }, icon('edit', 14), 'ثبت گزارش جلسه‌ها')
      )
    )
  );
}

function nextAppointmentCard(stats) {
  const nx = stats.nextAppointment;
  if (!nx) {
    // داده سالم است ولی نوبت آینده‌ای نیست — حالت خالی رسمی (emptyState از ui.js)
    return el(
      'div',
      { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('clock', 16), 'نوبت بعدی')),
      el('div', { class: 'card__body' }, emptyState({ iconName: 'clock', title: 'نوبت آینده‌ای ثبت نشده است', hint: 'وقتی نوبت جدیدی برای شما ثبت شود، همین‌جا با روز و ساعت دیده می‌شود.' }))
    );
  }
  const when = nx.startAt ? `${formatJalaliNumeric(tehranYmdOfIso(nx.startAt))} — ساعت ${fa(tehranTimeOfIso(nx.startAt))}` : '—';
  const names = Array.isArray(nx.studentNames) && nx.studentNames.length ? ` — ${nx.studentNames.join('، ')}` : '';
  return el(
    'div',
    { class: 'alert alert--info', style: { marginBottom: 'var(--sp-4)', cursor: 'pointer' }, title: 'مشاهده در تقویم نوبت‌ها', onclick: () => { location.hash = '#/appointments'; } },
    icon('clock', 18),
    el('span', {}, `نوبت بعدی: ${when}${names}`)
  );
}

/* چهار شمارندهٔ ماه جاری با مقایسهٔ ماه قبل — همان مارک‌آپ score-tile داشبورد؛ حفرها
   فقط به مقصدهایی می‌روند که در دسترسِ درمانگر است (رویداد/گزارش در «روز کاری»). */
function scoreTilesRow(stats) {
  const tile = (label, value, prev, route) => {
    const diff = value - prev;
    return el(
      'button',
      { class: 'score-tile', type: 'button', onclick: route ? () => { location.hash = route; } : undefined },
      el('div', { class: 'score-tile__label' }, label),
      el('div', { class: 'score-tile__value' }, fa(value)),
      el(
        'div',
        { class: `score-tile__prev${diff > 0 ? ' is-up' : diff < 0 ? ' is-down' : ''}` },
        `ماه قبل: ${fa(prev)}`,
        diff !== 0 ? el('span', {}, diff > 0 ? ` (+${fa(diff)})` : ` (−${fa(Math.abs(diff))})`) : null
      )
    );
  };
  return el(
    'div',
    { class: 'score-tiles', style: { marginBottom: 'var(--sp-4)' } },
    tile('جلسات برگزارشده', stats.sessions, stats.sessionsPrev, '#/working-day'),
    tile('تمرین افزوده به بانک', stats.exercises, stats.exercisesPrev, '#/exercises'),
    tile('رویداد پروندهٔ ثبت‌شده', stats.events, stats.eventsPrev, '#/working-day'),
    tile('پیگیری انجام‌شده', stats.followups, stats.followupsPrev, null)
  );
}

/* روند ۶ ماه اخیر — همان زبان spark داشبورد (ستون/عدد/میله/برچسب ماه)؛ صفر واقعی =
   نقطهٔ پایهٔ کم‌رنگ نه میلهٔ ۴px (الگوی C13 داشبورد). پاسخ بدون history → «—» + تلاش مجدد. */
function historyCard(stats, retry) {
  const hist = Array.isArray(stats.history) ? stats.history : [];
  const head = el(
    'div',
    { class: 'card__head' },
    el('div', { class: 'card__title' }, icon('trendingUp', 16), 'روند ۶ ماه اخیر'),
    el('span', { class: 'badge badge--neutral' }, `ماه جاری: ${stats.jalaliLabel ?? '—'}`),
    el('p', { class: 'hint-text', style: { flexBasis: '100%', margin: '0' } }, 'برای درمانگر، در پایان ماه: تلاشِ کدام ماه‌ها بیشتر بوده تا برنامهٔ ماه بعد روی داده گذاشته شود.')
  );
  if (hist.length === 0) {
    return el(
      'div',
      { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
      head,
      el(
        'div',
        { class: 'card__body', style: { paddingTop: 'var(--sp-2)', paddingBottom: 'var(--sp-2)' } },
        el(
          'div',
          { style: { display: 'flex', gap: 'var(--sp-2)', alignItems: 'center', flexWrap: 'wrap' } },
          el('span', { class: 'cell-sub' }, '—'),
          retryChipEl(retry)
        )
      )
    );
  }
  const maxScore = Math.max(1, ...hist.map((h) => h.score));
  return el(
    'div',
    { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    head,
    el(
      'div',
      { class: 'card__body' },
      el(
        'div',
        { class: 'spark' },
        hist.map((h) =>
          el(
            'div',
            { class: 'spark__col', role: 'img', 'aria-label': `${h.label} — ${fa(h.score)} امتیاز`, title: `${h.label} — ${fa(h.score)} امتیاز` },
            el('div', { class: 'spark__num' }, fa(h.score)),
            h.score === 0
              ? el('div', { class: 'spark__bar spark__bar--zero', style: { height: '4px', opacity: '.35' } })
              : el('div', { class: 'spark__bar', style: { height: `${Math.max(4, Math.round((h.score / maxScore) * 72))}px` } }),
            el('div', { class: 'spark__day' }, String(h.label ?? '—').split(' ')[0])
          )
        )
      ),
      el('div', { class: 'cell-sub', style: { paddingTop: 'var(--sp-2)' } }, 'وزن امتیاز: جلسه ۲ · تمرین ۳ · رویداد ۱ · پیگیری ۱ — امتیاز ماهِ جاری تا امروز است.')
    )
  );
}

function retryChipEl(retry) {
  return el('button', { class: 'btn btn--ghost btn--sm', type: 'button', onclick: retry }, icon('refresh', 14), 'تلاش مجدد');
}
