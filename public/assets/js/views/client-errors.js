// نمای «خطاهای مرورگر» (۱.۲۵.۶۷ — ف۱ طرح ارتقا، آیتم P1-8): خواندن فقط‌مدیر از GET /api/client-errors
// گروه‌بندی بر اساس پیام + فیلتر بازه و نسخه — داده از لولهٔ POST /public/client-errors (۱.۲۵.۶۶) می‌آید
import { api } from '../api.js';
import { el, icon, emptyState, skeletonState } from '../ui.js';
import { fa, formatJalaliDateTime } from '../format.js';

const WINDOWS = [
  { days: 1, label: '۲۴ ساعت' },
  { days: 7, label: '۷ روز' },
  { days: 30, label: '۳۰ روز' },
  { days: 90, label: '۹۰ روز' }
];

/** فاصلهٔ زمانی خوانا از مُهر occurred_at (فرمت datetime سرور) */
function ageLabel(iso) {
  const t = Date.parse(String(iso ?? '').replace(' ', 'T') + 'Z');
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (sec < 3600) return `${fa(Math.max(1, Math.round(sec / 60)))} دقیقه پیش`;
  if (sec < 86400) return `${fa(Math.round(sec / 3600))} ساعت پیش`;
  return `${fa(Math.round(sec / 86400))} روز پیش`;
}

function versionChip(v, active, onclick) {
  return el('button', {
    class: `chip${active ? ' is-active' : ''}`,
    type: 'button',
    onclick
  }, v || 'بی‌نسخه');
}

function occurrenceRow(e) {
  const meta = [ageLabel(e.occurred_at), formatJalaliDateTime(e.occurred_at)];
  if (e.app_version) meta.push(`نسخهٔ ${e.app_version}`);
  const loc = e.source ? `${String(e.source).split('/').pop()}${e.line != null ? `:${e.line}${e.col != null ? ':' + e.col : ''}` : ''}` : null;
  if (loc) meta.push(loc);
  return el('div', { class: 'bug-row' },
    el('div', { class: 'bug-row__head' },
      el('span', { class: 'badge badge--neutral' }, fa(String(e.occurred_at).slice(11, 19))),
      el('span', { class: 'hint-text' }, meta.filter(Boolean).join(' · '))
    ),
    e.url ? el('div', { class: 'hint-text', style: { direction: 'ltr', textAlign: 'left' } }, String(e.url).slice(0, 120)) : null,
    e.stack
      ? el('pre', { class: 'hint-text', style: { direction: 'ltr', textAlign: 'left', whiteSpace: 'pre-wrap', margin: '4px 0 0', maxHeight: '120px', overflow: 'auto' } }, String(e.stack).slice(0, 600))
      : null
  );
}

export async function renderClientErrors(outlet) {
  outlet.replaceChildren(skeletonState('list', 5));

  const root = el('div', {});
  outlet.replaceChildren(root);
  let state = { days: 7, version: '' };

  async function reload() {
    let data;
    try {
      data = (await api.get(`/api/client-errors?days=${state.days}&limit=300`)).data;
    } catch (err) {
      root.replaceChildren(emptyState({
        iconName: 'alert',
        title: 'بارگذاری خطاهای مرورگر ناموفق بود',
        hint: err?.message ?? 'خطای نامشخص'
      }));
      return;
    }

    const errors = Array.isArray(data?.errors) ? data.errors : [];
    const versions = [...new Set(errors.map((e) => e.app_version || ''))];
    const filtered = state.version ? errors.filter((e) => (e.app_version || '') === state.version) : errors;

    // گروه‌بندی بر اساس پیام — خطای تکراری یک ردیف با شمارنده است
    const groups = new Map();
    for (const e of filtered) {
      const key = e.message || '(پیام خالی)';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(e);
    }
    const sortedGroups = [...groups.entries()].sort((a, b) =>
      String(b[1][0]?.occurred_at ?? '').localeCompare(String(a[1][0]?.occurred_at ?? ''))
    );

    const windowBtns = el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
      WINDOWS.map((w) => el('button', {
        class: `btn btn--sm${state.days === w.days ? ' btn--primary' : ' btn--soft'}`,
        type: 'button',
        onclick: (e) => { state.days = w.days; state.version = ''; reload(); }
      }, w.label))
    );

    const totalBadge = el('span', { class: 'badge badge--neutral' },
      `${fa(filtered.length)} رخداد · ${fa(groups.size)} پیام یکتا`);

    const versionChips = versions.length > 1
      ? el('div', { style: { display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap', marginTop: 'var(--sp-2)' } },
          el('span', { class: 'hint-text', style: { alignSelf: 'center' } }, 'نسخه:'),
          versions.map((v) => versionChip(v, state.version === v, () => { state.version = state.version === v ? '' : v; reload(); })))
      : null;

    const groupCards = sortedGroups.map(([message, occurrences]) =>
      el('div', { class: 'card', style: { marginBottom: 'var(--sp-3)' } },
        el('div', { class: 'card__head' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' } },
            el('h3', { style: { margin: 0, wordBreak: 'break-word', direction: 'ltr', textAlign: 'left', flex: '1 1 auto', fontSize: '0.92rem' } }, message),
            el('span', { class: 'badge badge--warning' }, `${fa(occurrences.length)} بار`)
          )
        ),
        el('div', { class: 'card__body' }, occurrences.slice(0, 5).map(occurrenceRow),
          occurrences.length > 5
            ? el('p', { class: 'hint-text', style: { margin: '8px 0 0' } }, `… و ${fa(occurrences.length - 5)} رخداد دیگر همین پیام`)
            : null)
      ));

    root.replaceChildren(
      el('div', { class: 'page-head' },
        el('h2', {}, 'خطاهای مرورگر'),
        el('p', { class: 'hint-text' }, 'خطاهای گزارش‌شده از مرورگر کاربران — لولهٔ بی‌نام POST /public/client-errors؛ نگه‌داری ۹۰ روزه در کرون شبانه.')
      ),
      el('div', { class: 'card' },
        el('div', { class: 'card__body' },
          el('div', { style: { display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', flexWrap: 'wrap' } },
            windowBtns,
            el('span', { style: { marginInlineStart: 'auto' } }, totalBadge),
            el('button', {
              class: 'btn btn--soft btn--sm',
              type: 'button',
              onclick: (e) => { e.currentTarget.disabled = true; reload().finally(() => {}); }
            }, icon('refresh', 15), 'بازخوانی')
          ),
          versionChips
        )
      ),
      sortedGroups.length === 0
        ? emptyState({ iconName: 'check', title: 'خطای گزارش‌شده‌ای در این بازه نیست', hint: 'سامانهٔ مرورگر کاربران پاکیزه است — یا بازه را بزرگ‌تر کنید.' })
        : el('div', {}, groupCards)
    );
  }

  await reload();
}
