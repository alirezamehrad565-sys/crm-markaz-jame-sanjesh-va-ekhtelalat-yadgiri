import { api, qs } from '../api.js';
import { fa, formatJalaliNumeric } from '../format.js';
import { el, icon, toastError, emptyState, errorState, loadingState, kpi, KPI_ALERT_RATE } from '../ui.js';

// ─── شاخص‌های مرکز (۱.۲۵.۴۶ — محور اول غنی‌سازی شبکه) ───
// تابلوی فقط-خواندنی از تجمیع‌های سمت سرور (GET /api/kpi/summary):
//  · نوبت‌ها و حضور: پر بودن ظرفیت، جا نیفتادن‌ها، لغوها، تأخیر ثبت حضور
//  · کیفیت مداخله: جلسات طرح درمان، وفاداری اجرا، اعتبار جلسات بازی، تکالیف
//  · ثبت پرونده و بازخورد خانواده: پوشش ثبت، گزارش جلسه، فرم‌های خانواده و نمره‌ها
// همهٔ نرخ‌ها از سرور با گرد ۴ اعشار می‌آیند؛ نمایش درصد با یک اعشار فارسی.

const WINDOWS = [
  { days: 7, label: '۷ روز اخیر' },
  { days: 30, label: '۳۰ روز اخیر' },
  { days: 90, label: '۹۰ روز اخیر' }
];

function pct(v) {
  if (v === null || v === undefined) return '—';
  return `${fa(Math.round(v * 1000) / 10)}٪`;
}

function num(v) {
  return v === null || v === undefined ? '—' : fa(v);
}

/** کارت نرخ با رنگ آستانه‌دار — هم‌قانون KPI_ALERT_RATE داشبورد (۲۰٪) */
function rateKpi(label, value, sub) {
  const tone = value === null || value === undefined ? 'neutral' : value >= KPI_ALERT_RATE ? 'error' : 'success';
  return kpi(label, pct(value), sub, tone);
}

function sectionTitle(iconName, text) {
  return el('div', { class: 'card__head', style: { marginTop: 'var(--sp-5)' } },
    el('div', { class: 'card__title' }, icon(iconName, 16), text));
}

export async function renderCenterKpi(container) {
  container.replaceChildren(loadingState('در حال محاسبهٔ شاخص‌ها…'));

  let days = 30;
  let data = null;

  const windowSel = el('select', {
    class: 'select',
    'aria-label': 'بازهٔ شاخص‌ها',
    onchange: () => { days = Number(windowSel.value) || 30; load(); }
  }, WINDOWS.map((w) => el('option', { value: String(w.days) }, w.label)));

  async function load() {
    container.replaceChildren(
      el('div', { class: 'toolbar' },
        windowSel,
        el('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, 'بازهٔ تهران‌محور'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => window.print() }, icon('printer', 15), 'چاپ')
      ),
      loadingState('در حال محاسبهٔ شاخص‌ها…')
    );
    try {
      const res = await api.get(`/api/kpi/summary${qs({ days: String(days) })}`);
      data = res.data;
      draw();
    } catch (err) {
      container.replaceChildren(errorState(err, () => load()));
    }
  }

  function draw() {
    if (!data) return;
    const a = data.appointments ?? {};
    const iv = data.intervention ?? {};
    const dc = data.documentation ?? {};
    const win = data.window ?? {};

    const range = win.from_ymd && win.to_ymd
      ? `${formatJalaliNumeric(win.from_ymd)} تا ${formatJalaliNumeric(win.to_ymd)}`
      : '';

    container.replaceChildren(
      el('div', { class: 'toolbar' },
        windowSel,
        el('span', { class: 'muted', style: { fontSize: 'var(--fs-sm)' } }, range || 'بازهٔ تهران‌محور'),
        el('div', { class: 'spacer' }),
        el('button', { class: 'btn btn--soft btn--sm', type: 'button', onclick: () => window.print() }, icon('printer', 15), 'چاپ')
      ),

      // ─── نوبت‌ها و حضور: خالی نبودن نوبت‌ها و جا نیفتادن‌ها ───
      sectionTitle('calendar', 'نوبت‌ها و حضور'),
      el('div', { class: 'kpi-grid' },
        kpi('نوبت‌های پنجره', num(a.total), `برنامه‌ریزی‌شده ${num(a.scheduled)} · لغوشده ${num(a.cancelled)}`, 'primary'),
        rateKpi('نرخ لغو', a.cancel_rate, 'لغوشده از کل نوبت‌های پنجره'),
        rateKpi('نرخ جا نیفتادن', a.absent_rate, 'غیبت از حاضری قطعی‌شده'),
        kpi('تأخیر ثبت حضور', num(a.pending_overdue), 'نوبت‌های گذشته بدون وضعیت', (a.pending_overdue ?? 0) > 0 ? 'accent' : 'neutral'),
        rateKpi('پُر بودن ظرفیت', a.fill_rate, `نوبت‌بستهٔ ${num(a.booked_minutes)} دقیقه از ظرفیت ${num(a.capacity_minutes)} دقیقه`),
        kpi('دانش‌آموز تحت خدمت', num(a.students_served), 'یکتا در پنجره', 'accent')
      ),

      // ─── کیفیت مداخله ───
      sectionTitle('clipboard', 'کیفیت مداخله'),
      el('div', { class: 'kpi-grid' },
        kpi('جلسات انجام‌شدهٔ طرح درمان', num(iv.pathway_sessions_done), `رهاشده ${num(iv.pathway_sessions_skipped)}`, 'primary'),
        rateKpi('نرخ تکمیل جلسات', iv.session_completion_rate, 'انجام‌شده از انجام‌شده + رهاشده'),
        kpi('وفاداری اجرا', num(iv.fidelity_full) + '/' + num(iv.fidelity_checked), 'چک‌لیست سه‌گانهٔ کامل از پرشده‌ها', (iv.fidelity_checked ?? 0) > 0 && (iv.fidelity_full ?? 0) / (iv.fidelity_checked ?? 1) >= 0.5 ? 'success' : 'accent'),
        rateKpi('اعتبار جلسات بازی', iv.game_valid_rate, `معتبر ${num(iv.game_valid)} · نیمه‌معتبر ${num(iv.game_partial)} · نامعتبر ${num(iv.game_invalid)}`),
        rateKpi('پاسخ درست بازی', iv.game_correct_rate, `${num(iv.game_correct)} پاسخ درست از ${num(iv.game_attempts_scored)} نمره‌دار`),
        rateKpi('انجام تکالیف ارجاعی', iv.assignment_done_rate, `انجام‌شده ${num(iv.assignments_done)} · رهاشده ${num(iv.assignments_cancelled)}`)
      ),

      // ─── ثبت پرونده و بازخورد خانواده ───
      sectionTitle('file', 'ثبت پرونده و بازخورد خانواده'),
      el('div', { class: 'kpi-grid' },
        kpi('رویدادهای پرونده', num(dc.case_events_total), `گزارش جلسهٔ مداخله ${num(dc.session_notes)}`, 'primary'),
        rateKpi('پوشش ثبت پرونده', dc.documentation_coverage, `دانش‌آموز مستند از ${num(dc.students_active)} فعال`),
        kpi('ارزیابی‌های ثبت‌شده', num(dc.assessments_recorded), 'غیرحذف‌شده در پنجره', 'accent'),
        kpi('فرم‌های خانواده', num(dc.family_filled) + '/' + num(dc.family_requests), 'پاسخ‌داده‌شده از ارسالی', 'primary'),
        rateKpi('پاسخ‌دهی خانواده', dc.family_response_rate, 'دربارهٔ نتایج و طرح درمان'),
        kpi('میانگین نمرهٔ خانواده', dc.family_avg_score === null || dc.family_avg_score === undefined ? '—' : fa(Math.round(dc.family_avg_score * 10) / 10), 'از چک‌لیست‌های پرشدهٔ پنجره', dc.family_avg_score === null || dc.family_avg_score === undefined ? 'neutral' : 'accent')
      ),

      el('div', { class: 'wgrid__hint', style: { marginTop: 'var(--sp-4)' } },
        icon('info', 14),
        'این اعداد تجمیعِ فقط-عددی از دادهٔ خود مرکز است و همان دسته‌های شاخص شبکه (کیفیت مداخله، ثبت پرونده، بازخورد خانواده و عملکرد نوبت‌ها) را نشان می‌دهد — بدون هیچ دادهٔ خام دانش‌آموز.'
      )
    );
  }

  await load();
}
