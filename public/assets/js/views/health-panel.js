// نمای «پنل سلامت» (۱.۲۵.۶۷ — ف۱ طرح ارتقا، CP-2/CP-3): وضعیت سامانه + شش درگاه لینک CP
// همهٔ داده از GET /api/health/panel (فقط‌مدیر) — مُهرهای settings و COUNTهای واقعی، بدون زیرساخت تازه
// ف۴ — بخش «گزارش رشد جدول‌ها» افزوده شد: GET /api/growth/report فقط‌مدیر — شمارش شبانهٔ کرون + سیاست نگه‌داری
// ف۵ — بخش «هشدارهای فعال» افزوده شد: رانش مُهر تلاش/موفقیت + جهش خطاهای مرورگر (P0-3 حداقلی)
import { api } from '../api.js';
import { el, icon, emptyState, skeletonState } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

/** فاصلهٔ خوانا به فارسی — از ثانیه */
function ageHuman(sec) {
  if (sec == null) return '—';
  if (sec < 90) return 'لحظه‌ها پیش';
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه پیش`;
  if (sec < 86400) return `${fa(Math.round(sec / 3600))} ساعت پیش`;
  return `${fa(Math.round(sec / 86400))} روز پیش`;
}

/** آستانهٔ ok درگاه به فارسی */
function thresholdHuman(sec) {
  if (sec < 3600) return `${fa(Math.round(sec / 60))} دقیقه`;
  if (sec < 86400) return `${fa(Math.round(sec / 3600))} ساعت`;
  return `${fa(Math.round(sec / 86400))} روز`;
}

/** عدد با علامت — مثبت «+۲۰»، منفی «−۵»، صفر «۰»، نبود «—» (جهت عددی ltr در سلول) */
function signedNum(n) {
  if (n == null) return '—';
  if (n === 0) return fa(0);
  return `${n > 0 ? '+' : '−'}${fa(Math.abs(n))}`;
}

/** میانگین روزانه با یک رقم اعشار فارسی */
function avgNum(n) {
  if (n == null) return '—';
  return fa(String(n)).replace('.', '٫');
}

/** سلول عددی جدول رشد — جهت ltr تا علامت و رقم جابه‌جا نشوند */
function numCell(value) {
  return el('td', { style: { direction: 'ltr', textAlign: 'center', whiteSpace: 'nowrap' } }, value);
}

const STATE_META = {
  ok: { cls: 'badge badge--success', label: 'سالم' },
  stale: { cls: 'badge badge--warning', label: 'کهنه‌شده' },
  never: { cls: 'badge badge--neutral', label: 'بی‌موفقیت' }
};

function infoRow(label, valueEl) {
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, label),
      el('div', { class: 'cell-sub' }, valueEl)
    )
  );
}

function channelRow(ch) {
  const meta = STATE_META[ch.state] ?? STATE_META.never;
  const side = [];
  if (ch.success_at) {
    side.push(`آخرین موفقیت: ${ageHuman(ch.age_s)} (${formatJalaliDateTime(ch.success_at)})`);
  } else {
    side.push('هنوز هیچ موفقیتی ثبت نشده');
  }
  if (ch.attempt_at) side.push(`آخرین تلاش: ${formatJalaliDateTime(ch.attempt_at)}`);
  side.push(`آستانهٔ هشدار: ${thresholdHuman(ch.threshold_s)}`);
  return el('div', { class: 'ob-row' },
    el('div', { class: 'ob-row__main' },
      el('div', { class: 'cell-main' }, ch.label),
      el('div', { class: 'cell-sub' }, side.join(' · '))
    ),
    el('div', { class: 'ob-row__side' },
      el('span', { class: meta.cls }, meta.label),
      el('span', { class: 'badge badge--neutral' }, ch.direction === 'pull' ? 'CP→نود' : 'نود→CP')
    )
  );
}

/* ── ف۴ — گزارش رشد جدول‌ها ───────────────────────────────────────────────
   شمارش ردیف‌ها هر شب در کرون دایجست انجام می‌شود (جدول table_growth_snapshots — مایگریشن 0107)؛
   این بخش فقط خواندن snapshotهاست. جدول‌های «بی‌سیاست» بالای فهرست می‌آیند — کارکرد اصلی گزارش
   لو دادن جدول‌های بدون خط‌مشی نگه‌داری است (طرح §۵-۳). */

const POLICY_BADGE = {
  'بی‌سیاست': 'badge--error',
  'فقط-افزودنی': 'badge--success',
  'پاکسازی دوره‌ای': 'badge--success',
  '۱۸۰ روز': 'badge--neutral',
  '۹۰ روز': 'badge--neutral',
  'بازنویسی روزانه (خودپایش)': 'badge--neutral'
};

function growthRow(t) {
  const countMain = t.latest_count != null ? fa(t.latest_count) : '—';
  const countSub = [
    t.latest_date ? `شمارش ${formatJalaliDateTime(t.latest_date)}` : null,
    t.live_count != null && t.latest_count != null && t.live_count !== t.latest_count ? `زندهٔ همین لحظه: ${fa(t.live_count)}` : null
  ].filter(Boolean).join(' · ');
  const badgeCls = POLICY_BADGE[t.policy] ?? 'badge--neutral';
  return el('tr', {},
    el('td', { style: { fontWeight: 500 } }, t.table_name),
    el('td', { style: { direction: 'ltr', textAlign: 'center', whiteSpace: 'nowrap' } },
      el('div', {}, countMain),
      countSub ? el('div', { class: 'hint-text', style: { fontSize: '0.72rem', whiteSpace: 'normal' } }, countSub) : null
    ),
    numCell(signedNum(t.delta_7d)),
    numCell(signedNum(t.delta_30d)),
    numCell(avgNum(t.avg_daily)),
    el('td', { style: { textAlign: 'center', whiteSpace: 'nowrap' } },
      el('span', { class: `badge ${badgeCls}` }, t.policy)
    )
  );
}

/* ── ف۵ (P0-3 حداقلی) — هشدارهای فعال ─────────────────────────────────────────
   همان دادهٔ پنل، با حکم: رانش مُهر تلاش/موفقیت درگاه‌های CP نسبت به آستانهٔ §۳-۱۱ و جهش
   خطاهای مرورگر در ۲۴ ساعت. زنگ‌زنِ خودکار هر شب در کرون دایجست همین حکم را می‌گیرد و اگر
   بات تنظیم باشد پیام فارسی برای مدیر(ها) می‌فرستد؛ مُهر آخرین ارزیابی از settings می‌آید. */

const SEVERITY_META = {
  error: { cls: 'badge--error', label: 'فوری' },
  warning: { cls: 'badge--warning', label: 'هشدار' }
};

function alertsSection(alerts, lastEvaluatedAt) {
  const count = (alerts ?? []).length;
  const headBadge = count === 0
    ? el('span', { class: 'badge badge--success' }, 'هیچ هشدار فعالی نیست')
    : el('span', { class: 'badge badge--error' }, `${fa(count)} هشدار فعال`);
  const stamp = lastEvaluatedAt
    ? `آخرین ارزیابی خودکار: ${formatJalaliDateTime(lastEvaluatedAt)}`
    : 'هنوز ارزیابی خودکار شبانه‌ای انجام نشده — با نخستین کرون دایجست مُهر می‌خورد';
  return el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'ob-section__head' },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
        el('h3', { style: { margin: 0 } }, 'هشدارهای فعال'),
        headBadge
      ),
      el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
        `${stamp} — ارزیابی هر شب در کرون دایجست انجام می‌شود و وقتی هشدار باشد، پیام فارسی برای مدیر روی همان کانال بات می‌آید؛ این بخش همان حکم را زنده نشان می‌دهد. دو قاعدهٔ هشدار: رانش مُهرِ تلاش/موفقیت درگاه‌های CP (داده ممکن است بی‌صدا گم شده باشد) و جهش خطاهای مرورگر در ۲۴ ساعت.`)
    ),
    count === 0
      ? el('div', {}, el('div', { class: 'ob-row' },
          el('div', { class: 'ob-row__main' },
            el('div', { class: 'cell-main' }, 'همهٔ درگاه‌ها و شمارنده‌ها زیر آستانه‌اند'),
            el('div', { class: 'cell-sub' }, 'اگر مشکلی پیش بیاید، همین‌جا و کانال بات خودش را نشان می‌دهد')))
        )
      : el('div', {}, (alerts ?? []).map((alert) => {
          const meta = SEVERITY_META[alert.severity] ?? SEVERITY_META.warning;
          return el('div', { class: 'ob-row' },
            el('div', { class: 'ob-row__main' },
              el('div', { class: 'cell-main' }, alert.message)),
            el('div', { class: 'ob-row__side' },
              el('span', { class: `badge ${meta.cls}` }, meta.label),
              el('span', { class: 'badge badge--neutral' }, alert.code))
          );
        }))
  );
}

function growthSection(growth, growthError) {
  const headBadge = growth
    ? el('span', { class: 'badge badge--neutral' },
        growth.snapshot_days > 0
          ? `تاریخچهٔ ${fa(growth.snapshot_days)} روز شمارش`
          : 'هنوز شمارشی ثبت نشده — با اولین کرون شبانه پُر می‌شود')
    : null;
  const stamp = growth?.last_snapshot_at
    ? `آخرین شمارش شبانه: ${formatJalaliDateTime(growth.last_snapshot_at)}`
    : 'هنوز هیچ شمارش شبانه‌ای انجام نشده است';
  return el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('h3', { style: { margin: 0 } }, 'گزارش رشد جدول‌ها'),
      headBadge
    ),
    el('div', { class: 'card__body--flush' },
      growthError
        ? el('div', { class: 'card__body' },
            el('p', { class: 'hint-text' }, `خواندن گزارش رشد ناموفق بود: ${growthError?.message ?? 'خطای نامشخص'} — بقیهٔ پنل سالم است.`))
        : [
            el('p', { class: 'hint-text', style: { padding: '0 var(--sp-4)', margin: 'var(--sp-3) 0 0' } },
              `${stamp} — شمارش ردیف‌ها هر شب در کرون دایجست انجام می‌شود (هرگز در مسیر درخواست). ستون «سیاست» خط‌مشی نگه‌داری هر جدول است؛ «بی‌سیاست» یعنی هیچ سقف حذف/پاکسازی‌ای ندارد و بدون تصمیم، بی‌کران رشد می‌کند — این جدول‌ها عمداً بالای فهرست می‌آیند.`),
            el('div', { class: 'table-wrap' },
              el('table', { class: 'table' },
                el('thead', {}, el('tr', {},
                  el('th', { scope: 'col' }, 'نام جدول'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'ردیف‌ها'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'رشد ۷روز'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'رشد ۳۰روز'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'میانگین روزانه'),
                  el('th', { scope: 'col', style: { textAlign: 'center' } }, 'سیاست')
                )),
                el('tbody', {}, (growth?.tables ?? []).map(growthRow))
              )
            )
          ]
    )
  );
}

export async function renderHealthPanel(outlet) {
  const root = el('div', {});
  outlet.replaceChildren(root);

  let timer = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  async function reload() {
    // ف۴ — پنل سلامت و گزارش رشد هم‌زمان گرفته می‌شوند؛ خرابیِ رشد فقط بخش خودش را degraded می‌کند
    const [healthOut, growthOut] = await Promise.allSettled([
      api.get('/api/health/panel'),
      api.get('/api/growth/report')
    ]);
    if (healthOut.status === 'rejected') {
      const err = healthOut.reason;
      stopTimer();
      root.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری پنل سلامت ناموفق بود',
        hint: err?.message ?? 'خطای نامشخص'
      }));
      return;
    }
    const data = healthOut.value.data;
    const growth = growthOut.status === 'fulfilled' ? growthOut.value.data : null;
    const growthError = growthOut.status === 'rejected' ? growthOut.reason : null;

    const dbOk = data?.db?.ok;
    const counts = data?.counts ?? {};
    const cp = data?.cp_link ?? { configured: false, channels: [] };
    const okCount = cp.channels.filter((c) => c.state === 'ok').length;
    const linkBadge = !cp.configured
      ? el('span', { class: 'badge badge--neutral' }, 'خاموش (کلید نود تنظیم نشده)')
      : okCount === cp.channels.length
        ? el('span', { class: 'badge badge--success' }, `هر ${fa(cp.channels.length)} درگاه سالم`)
        : el('span', { class: 'badge badge--warning' }, `${fa(okCount)} از ${fa(cp.channels.length)} درگاه سالم`);

    root.replaceChildren(
      el('div', { class: 'page-head' },
        el('h2', {}, 'پنل سلامت'),
        el('p', { class: 'hint-text' }, 'وضعیت زندهٔ سامانه و لینک کنترل‌پلین — از زمانِ واقعی آخرین همگام‌سازی و شمارنده‌های جدول‌ها؛ هر ۶۰ ثانیه خودکار بازخوانی می‌شود.')
      ),

      el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'card__head' },
          el('h3', { style: { margin: 0 } }, 'سامانه'),
          el('span', { class: dbOk ? 'badge badge--success' : 'badge badge--error' }, dbOk ? 'D1 متصل' : 'D1 قطع')
        ),
        el('div', { class: 'card__body--flush' },
          infoRow('نسخهٔ سامانه', el('span', {}, `${data?.version ?? '—'}${data?.env ? ` · محیط ${data.env}` : ''}`)),
          infoRow('مایگریشن‌های اعمال‌شده', data?.migrations?.applied != null ? fa(data.migrations.applied) : '—'),
          infoRow('تأخیر D1', data?.db?.latency_ms != null ? `${fa(data.db.latency_ms)} میلی‌ثانیه` : '—'),
          infoRow('خطاهای مرورگر (۲۴ ساعت)', counts.client_errors_24h != null ? fa(counts.client_errors_24h) : '—'),
          infoRow('تله‌متری RUM (۲۴ ساعت)', counts.rum_events_24h != null ? fa(counts.rum_events_24h) : '—'),
          infoRow('گزارش باگ باز', counts.bug_reports_open != null ? fa(counts.bug_reports_open) : '—')
        )
      ),

      el('div', { class: 'card card__body--flush', style: { marginBottom: 'var(--sp-4)' } },
        el('div', { class: 'ob-section__head' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('h3', { style: { margin: 0 } }, 'لینک کنترل‌پلین — شش درگاه'),
            linkBadge
          ),
          el('p', { class: 'hint-text', style: { margin: '4px 0 0' } },
            'هر درگاه «آخرین موفقیت» خودش را از زمانِ ثبت‌شدهٔ همگام‌سازی می‌خواند؛ کهنه‌شدن یعنی CP پاسخ نمی‌دهد یا ترافیک زنده برای چرخهٔ فرصت‌طلب نبوده — هیچ مسیر محلی به‌خاطر آن نمی‌شکند.')
        ),
        el('div', {}, cp.channels.map(channelRow))
      ),

      alertsSection(data?.alerts, data?.alerts_last_evaluated_at), // ف۵ (P0-3) — هشدارهای فعال زنده

      growthSection(growth, growthError),

      el('p', { class: 'hint-text' },
        `آخرین بازخوانی: ${formatJalaliDateTime(data?.now)} — مرجع طراحی: طرح ارتقای بک‌اند §۳-۹ (CP-2/CP-3) و §۵-۳ (ف۴ بهداشت داده).`)
    );
  }

  // بازخوانی خودکار ۶۰ثانیه‌ای — وقتی نما از DOM بیرون رفت، تایمر خودش را می‌بندد
  await reload();
  stopTimer();
  timer = setInterval(() => {
    if (!root.isConnected) { stopTimer(); return; }
    reload();
  }, 60_000);
}
