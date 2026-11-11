// نمای «پنل سلامت» (۱.۲۵.۶۷ — ف۱ طرح ارتقا، CP-2/CP-3): وضعیت سامانه + شش درگاه لینک CP
// همهٔ داده از GET /api/health/panel (فقط‌مدیر) — مُهرهای settings و COUNTهای واقعی، بدون زیرساخت تازه
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

export async function renderHealthPanel(outlet) {
  const root = el('div', {});
  outlet.replaceChildren(root);

  let timer = null;
  const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };

  async function reload() {
    let data;
    try {
      data = (await api.get('/api/health/panel')).data;
    } catch (err) {
      stopTimer();
      root.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری پنل سلامت ناموفق بود',
        hint: err?.message ?? 'خطای نامشخص'
      }));
      return;
    }

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
        el('p', { class: 'hint-text' }, 'وضعیت زندهٔ سامانه و لینک کنترل‌پلین — از مُهرهای واقعی سینک و شمارنده‌های جدول‌ها؛ هر ۶۰ ثانیه خودکار بازخوانی می‌شود.')
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
            'هر درگاه «آخرین موفقیت» خودش را از مُهرهای سینک می‌خواند؛ کهنه‌شدن یعنی CP پاسخ نمی‌دهد یا ترافیک زنده برای چرخهٔ فرصت‌طلب نبوده — هیچ مسیر محلی به‌خاطر آن نمی‌شکند.')
        ),
        el('div', {}, cp.channels.map(channelRow))
      ),

      el('p', { class: 'hint-text' },
        `آخرین بازخوانی: ${formatJalaliDateTime(data?.now)} — مرجع طراحی: طرح ارتقای بک‌اند §۳-۹ (CP-2/CP-3).`)
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
