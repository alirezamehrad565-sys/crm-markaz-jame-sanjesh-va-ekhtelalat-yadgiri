/**
 * نمای غربالگری
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// views/screening.js — سنجش روزانه (غربال نوآموزان بدو ورود به دبستان)
// اصل طراحی: بدون پروفایل — یک باکس «نام + #برچسب» با هدف ثبت < ۱۰ ثانیه.
// تب ۱ «ثبت روزانه» (منشی/مدیر) • تب ۲ «گزارش و KPI» (مدیر + فیلتر بازه/برچسب)
// پارس ورودی همتای pure سمت سرور است (resolve هشتگ کوتاه به برچسب ثابت).

import { api, qs } from '../api.js';
import {
  fa,
  tehranTodayYmd,
  addDaysYmd,
  formatJalaliShort,
  formatJalaliFull,
  iranianWeekdayOfYmd,
  WEEKDAY_NAMES
} from '../format.js';
import {
  el,
  icon,
  toast,
  toastError,
  confirmModal,
  dataTable,
  emptyState,
  skeletonState,
  errorState,
  tabs
} from '../ui.js';
import { jalaliDateInput } from '../jalali-picker.js';
import { session } from '../state.js';

// ─── قرارداد یکسان با @domain/screening ───

const PREDEFINED = [
  { label: 'ارجاع تخصصی بینایی', kind: 'referral', badge: 'badge--error' },
  { label: 'ارجاع تخصصی شنوایی', kind: 'referral', badge: 'badge--error' },
  { label: 'ارجاع هوش', kind: 'referral', badge: 'badge--error' },
  { label: 'ارجاع جسمی حرکتی', kind: 'referral', badge: 'badge--error' },
  { label: 'عدم همکاری', kind: 'status', badge: 'badge--warning' },
  { label: 'نداشتن ثبت‌نام', kind: 'status', badge: 'badge--neutral' }
];
const REFERRALS = PREDEFINED.filter((t) => t.kind === 'referral').map((t) => t.label);
const BADGE_BY_LABEL = new Map(PREDEFINED.map((t) => [t.label, t.badge]));
const KIND_BY_LABEL = new Map(PREDEFINED.map((t) => [t.label, t.kind]));

const QUICKS = [
  { id: 'today', label: 'امروز' },
  { id: '7', label: '۷ روز اخیر' },
  { id: '30', label: '۳۰ روز اخیر' },
  { id: 'all', label: 'همه' },
  { id: 'custom', label: 'دلخواه' }
];

// وضعیت ماژول — بین رندرها حفظ می‌شود
let state = {
  tab: 'daily',
  quick: '30',
  customFrom: '',
  customTo: '',
  search: '',
  tagFilter: [],
  editingId: null
};

// ─── پارس ورودی (همتای pure) ───

function normalizeTagToken(token) {
  return token.replace(/[_\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function parseEntryInput(raw) {
  const hashTags = [];
  const name = String(raw ?? '')
    .replace(/[#＃]([\p{L}\p{N}][\p{L}\p{N}_\-–]*)/gu, (_m, t) => {
      const label = normalizeTagToken(t);
      if (label && !hashTags.includes(label)) hashTags.push(label);
      return '';
    })
    .replace(/\s+/g, ' ')
    .trim();
  return { name, hashTags };
}

function resolveHashTag(label) {
  const pre = PREDEFINED.find((t) => t.label === label);
  if (pre) return pre.label;
  const partial = PREDEFINED.find((t) => label.length >= 3 && t.label.includes(label));
  return partial ? partial.label : label;
}

function tagBadgeClass(label) {
  return BADGE_BY_LABEL.get(label) ?? 'badge--primary';
}

/** آیا برچسب ثابت (ارجاع/وضعیت) دارد؟ — برچسب #کارمند/مهدکودک او را از «عادی» خارج نمی‌کند */
function hasPreTag(tags) {
  return tags.some((t) => KIND_BY_LABEL.has(t));
}

function tagBadge(label, onRemove) {
  const isPre = KIND_BY_LABEL.has(label);
  return el(
    'span',
    { class: `badge ${tagBadgeClass(label)}`, style: { display: 'inline-flex', alignItems: 'center', gap: '4px' } },
    isPre ? null : el('span', { style: { opacity: 0.6, fontWeight: 700 } }, '#'),
    label,
    onRemove
      ? el('button', {
          type: 'button',
          'aria-label': `حذف برچسب ${label}`,
          style: { border: 'none', background: 'transparent', padding: '0 2px', cursor: 'pointer', color: 'inherit', display: 'inline-flex' },
          onclick: onRemove
        }, icon('x', 12))
      : null
  );
}

function normalBadge() {
  return el('span', { class: 'badge badge--success' }, '✓ عادی');
}

// ─────────────── تب ۱: ثبت روزانه ───────────────

async function renderDailyTab(box, container) {
  box.replaceChildren(skeletonState('table', 5));
  const today = tehranTodayYmd();

  let result, tagSummary;
  try {
    const [r, t] = await Promise.all([
      api.get(`/api/screening${qs({ from: today, to: today })}`),
      api.get('/api/screening/tags')
    ]);
    result = r.data;
    tagSummary = t.data;
  } catch (err) {
    box.replaceChildren(errorState(err, () => renderDailyTab(box, container)));
    return;
  }

  const entries = result.entries;
  const canEdit = session.user && ['manager', 'secretary'].includes(session.user.role);
  const normalCount = entries.filter((e) => !hasPreTag(e.tags)).length;

  // ─── وضعیت composer (بین رندرها با state.editingId سازگار می‌ماند) ───
  const composer = { raw: '', toggles: new Set(), custom: new Set() };
  if (state.editingId) {
    const cur = entries.find((e) => e.id === state.editingId);
    if (cur) {
      composer.raw = cur.name;
      for (const t of cur.tags) {
        if (KIND_BY_LABEL.has(t)) composer.toggles.add(t);
        else composer.custom.add(t);
      }
    } else {
      state.editingId = null;
    }
  }

  // ─── باکس واحد ───
  // ورودی درشت‌تر (input--xl): قهرمان صفحه، ورود سریع با خوانایی بالا
  const input = el('input', {
    class: 'input input--xl',
    placeholder: state.editingId ? 'نام و فامیل…' : 'نام و فامیل دانش‌آموز… مثلاً: آوا محمدی #مهدکودک_ستاره',
    value: composer.raw,
    'aria-label': 'نام و فامیل دانش‌آموز و برچسب‌های هشتگ‌دار'
  });

  const preview = el('div', { class: 'sanj-preview', style: { display: 'none' } });

  const drawPreview = () => {
    const parsed = parseEntryInput(input.value);
    const finalTags = mergeFinalTags(parsed, composer);
    if (!parsed.name && finalTags.length === 0) {
      preview.style.display = 'none';
      preview.replaceChildren();
      return;
    }
    preview.style.display = '';
    preview.replaceChildren(
      el('span', { class: 'sanj-hint' }, 'پیش‌نمایش:'),
      parsed.name ? el('b', {}, parsed.name) : null,
      ...finalTags.map((t) => tagBadge(t, () => {
        if (composer.toggles.has(t)) composer.toggles.delete(t);
        else if (composer.custom.has(t)) composer.custom.delete(t);
        else {
          // حذف «#توکن» از متن
          const flexible = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '[_\\-–\\s]*');
          input.value = input.value.replace(new RegExp(`[#＃]\\s*${flexible}`, 'u'), ' ').replace(/\s{2,}/g, ' ').trim();
        }
        drawPreview();
        drawChips();
      }))
    );
  };

  input.addEventListener('input', drawPreview);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  });

  // ─── چیپ‌های برچسب ثابت ───
  const preChips = el('div', { class: 'sanj-chips' });
  const drawChips = () => {
    preChips.replaceChildren(
      ...PREDEFINED.map((t) =>
        el('button', {
          type: 'button',
          class: `chip${composer.toggles.has(t.label) ? ' is-active' : ''}`,
          'aria-pressed': composer.toggles.has(t.label) ? 'true' : 'false',
          onclick: () => {
            composer.toggles.has(t.label) ? composer.toggles.delete(t.label) : composer.toggles.add(t.label);
            drawChips();
            drawPreview();
          }
        }, t.label)
      )
    );
  };
  drawChips();

  // ─── برچسب‌های اخیر سفارشی (کارمند، مهدکودک و…) ───
  const recentCustom = tagSummary.filter((t) => !KIND_BY_LABEL.has(t.label)).slice(0, 8);
  const recentChips = recentCustom.length === 0 ? null : el('div', {},
    el('div', { class: 'sanj-hint', style: { marginBottom: '6px' } }, '# برچسب‌های اخیر (کارمند، مهدکودک و…)'),
    el('div', { class: 'sanj-chips' },
      ...recentCustom.map((t) =>
        el('button', {
          type: 'button',
          class: `chip${composer.custom.has(t.label) ? ' is-active' : ''}`,
          'aria-pressed': composer.custom.has(t.label) ? 'true' : 'false',
          onclick: () => {
            composer.custom.add(t.label);
            drawChips();
            drawPreview();
          }
        }, '# ', t.label, composer.custom.has(t.label) ? icon('check', 13) : null)
      )
    )
  );

  const mergeFinalTags = (parsed, comp) => {
    const out = [];
    for (const t of parsed.hashTags) {
      const resolved = resolveHashTag(t);
      if (!out.includes(resolved)) out.push(resolved);
    }
    for (const t of [...comp.toggles, ...comp.custom]) {
      if (!out.includes(t)) out.push(t);
    }
    return out.slice(0, 12);
  };

  const submitBtn = el('button', {
    class: 'btn btn--primary btn--lg',
    type: 'button',
    style: { width: '100%' },
    onclick: () => submit()
  }, icon(state.editingId ? 'check' : 'plus', 16), state.editingId ? 'ذخیرهٔ تغییرات' : 'ثبت در روز سنجش');

  const headTitle = el('div', { class: 'card__title' },
    state.editingId ? `ویرایش: ${(entries.find((e) => e.id === state.editingId) || {}).name ?? ''}` : 'ثبت سریع روز سنجش');

  const cancelBtn = state.editingId
    ? el('button', {
        class: 'btn btn--ghost btn--sm',
        onclick: () => { state.editingId = null; renderDailyTab(box, container); }
      }, 'انصراف')
    : null;

  const submit = async () => {
    if (!canEdit) return;
    const parsed = parseEntryInput(input.value);
    const tags = mergeFinalTags(parsed, composer);
    if (!parsed.name) {
      toast('نام و فامیل را در باکس بنویسید', 'warning');
      input.focus();
      return;
    }
    try {
      if (state.editingId) {
        await api.patch(`/api/screening/${state.editingId}`, { name: parsed.name, tags });
        toast('تغییرات ذخیره شد', 'success');
        state.editingId = null;
        renderDailyTab(box, container);
        return;
      }
      // جلوگیری از ثبت تکراری همان نام در همان روز
      if (entries.some((e) => e.name === parsed.name)) {
        toast(`«${parsed.name}» امروز قبلاً ثبت شده — برای تغییر برچسب‌ها از ویرایش استفاده کنید`, 'warning');
        return;
      }
      await api.post('/api/screening', { name: parsed.name, tags, day: today });
      toast(
        tags.filter((t) => KIND_BY_LABEL.has(t)).length > 0
          ? `${parsed.name} با برچسب ثبت شد`
          : `${parsed.name} به‌عنوان «عادی» ثبت شد`,
        'success'
      );
      renderDailyTab(box, container);
    } catch (err) {
      toastError(err);
    }
  };

  // ─── لیست امروز ───
  const listCard = el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'لیست روز سنجش امروز'),
      el('span', { class: 'cell-sub' },
        `${fa(normalCount)} عادی • ${fa(entries.length - normalCount)} ارجاع/خاص — جمع ${fa(entries.length)}`
      )
    ),
    el('div', { class: 'card__body' },
      entries.length === 0
        ? emptyState({
            iconName: 'student',
            title: 'امروز هنوز کسی ثبت نشده است',
            hint: 'نام و فامیل را در باکس بالا بنویسید و برچسب بزنید — تمام.'
          })
        : el('div', { class: 'sanj-rows' },
            ...entries.map((e) =>
              // ردیف دومنظوره: نام و زمان | برچسب‌ها | عملیات
              el('div', { class: 'sanj-row' },
                el('div', { class: 'sanj-row__main' },
                  el('span', { class: 'cell-main' }, e.name),
                  el('span', { class: 'cell-sub' },
                    `${e.creatorName ?? '—'} • ${fa((e.createdAt || '').slice(11, 16))}`
                  )
                ),
                el('div', { class: 'sanj-row__tags' },
                  hasPreTag(e.tags)
                    ? e.tags.map((t) => tagBadge(t))
                    : [normalBadge(), ...e.tags.filter((t) => !KIND_BY_LABEL.has(t)).map((t) => tagBadge(t))]
                ),
                el('div', { class: 'sanj-row__actions' },
                  el('button', {
                    class: 'btn btn--ghost btn--icon',
                    'aria-label': `ویرایش ${e.name}`,
                    onclick: () => { state.editingId = e.id; renderDailyTab(box, container); }
                  }, icon('edit', 16)),
                  el('button', {
                    class: 'btn btn--ghost btn--icon',
                    'aria-label': `حذف ${e.name}`,
                    onclick: async () => {
                      const ok = await confirmModal({
                        title: 'حذف سنجش',
                        message: `«${e.name}» از لیست امروز حذف شود؟`,
                        danger: true,
                        confirmLabel: 'حذف'
                      });
                      if (!ok) return;
                      try {
                        await api.del(`/api/screening/${e.id}`);
                        toast('حذف شد', 'success');
                        if (state.editingId === e.id) state.editingId = null;
                        renderDailyTab(box, container);
                      } catch (err) {
                        toastError(err);
                      }
                    }
                  }, icon('trash', 16))
                )
              )
            )
          )
    )
  );

  const composerCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' }, headTitle, cancelBtn),
    el('div', { class: 'card__body sanj-composer' },
      input,
      preview,
      el('div', {},
        el('div', { class: 'sanj-hint', style: { marginBottom: '6px' } }, 'برچسب وضعیت (لمس کنید تا روشن شود)'),
        preChips
      ),
      recentChips,
      submitBtn,
      el('p', { class: 'sanj-hint', style: { textAlign: 'center', margin: 0 } },
        'هر چیزی که با ', el('b', {}, '#'), ' بنویسید برچسب می‌شود؛ مثل نام کارمند سنجش‌گر ',
        el('b', { dir: 'ltr' }, '#مرضیه_احمدی'), ' یا مهدکودک مبدأ ', el('b', { dir: 'ltr' }, '#مهدکودک_ستاره')
      )
    )
  );

  // فلوی دوستونهٔ دسکتاپ: کامپوزر چسبان + لیست زنده کنار آن
  composerCard.classList.add('sanj-daily__composer');
  box.replaceChildren(el('div', { class: 'sanj-daily' }, composerCard, listCard));
}

// ─────────────── تب ۲: گزارش و KPI (مدیر) ───────────────

function quickRange(quick, from, to) {
  const today = tehranTodayYmd();
  switch (quick) {
    case 'today': return { from: today, to: today };
    case '7': return { from: addDaysYmd(today, -6), to: today };
    case '30': return { from: addDaysYmd(today, -29), to: today };
    case 'all': return { from: '', to: '' };
    default: return { from, to };
  }
}

async function renderManagerTab(box, container) {
  box.replaceChildren(skeletonState('table', 6));

  const range = quickRange(state.quick, state.customFrom, state.customTo);
  let result, tagSummary;
  try {
    const [r, t] = await Promise.all([
      api.get(`/api/screening${qs({
        from: range.from || undefined,
        to: range.to || undefined,
        q: state.search || undefined,
        tag: state.tagFilter.length ? state.tagFilter.join(',') : undefined
      })}`),
      api.get('/api/screening/tags')
    ]);
    result = r.data;
    tagSummary = t.data;
  } catch (err) {
    box.replaceChildren(errorState(err, () => renderManagerTab(box, container)));
    return;
  }

  const { entries, stats } = result;

  // ─── فیلترها ───
  const quickChips = el('div', { class: 'sanj-chips' },
    ...QUICKS.map((q) =>
      el('button', {
        type: 'button',
        class: `chip${state.quick === q.id ? ' is-active' : ''}`,
        onclick: () => { state.quick = q.id; renderManagerTab(box, container); }
      }, q.label)
    )
  );

  let customDates = null;
  if (state.quick === 'custom') {
    const fromInput = jalaliDateInput({ value: state.customFrom, onChange: (v) => { state.customFrom = v || ''; } });
    const toInput = jalaliDateInput({ value: state.customTo, onChange: (v) => { state.customTo = v || ''; } });
    customDates = el('div', { class: 'toolbar', style: { marginTop: 'var(--sp-3)', alignItems: 'flex-end' } },
      el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'از تاریخ'), fromInput.root),
      el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'تا تاریخ'), toInput.root),
      el('button', { class: 'btn btn--primary btn--sm', onclick: () => renderManagerTab(box, container) }, icon('check', 15), 'اعمال')
    );
  }

  const searchInput = el('input', {
    class: 'input',
    placeholder: 'جستجوی نام دانش‌آموز…',
    value: state.search,
    style: { maxWidth: '260px' }
  });
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      renderManagerTab(box, container);
    }, 350);
  });

  const customTags = tagSummary.filter((t) => !KIND_BY_LABEL.has(t.label)).slice(0, 12);
  const tagFilterChips = el('div', { class: 'sanj-chips' },
    el('button', {
      type: 'button',
      class: 'chip',
      style: state.tagFilter.length > 0 ? {} : { opacity: 0.55 },
      onclick: () => { state.tagFilter = [...REFERRALS]; renderManagerTab(box, container); }
    }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('alert', 13), 'نیازمند پیگیری (همهٔ ارجاع‌ها)')),
    ...PREDEFINED.map((t) =>
      el('button', {
        type: 'button',
        class: `chip${state.tagFilter.includes(t.label) ? ' is-active' : ''}`,
        'aria-pressed': state.tagFilter.includes(t.label) ? 'true' : 'false',
        onclick: () => {
          state.tagFilter.includes(t.label)
            ? state.tagFilter = state.tagFilter.filter((x) => x !== t.label)
            : state.tagFilter.push(t.label);
          renderManagerTab(box, container);
        }
      }, t.label)
    ),
    ...customTags.map((t) =>
      el('button', {
        type: 'button',
        class: `chip${state.tagFilter.includes(t.label) ? ' is-active' : ''}`,
        onclick: () => {
          state.tagFilter.includes(t.label)
            ? state.tagFilter = state.tagFilter.filter((x) => x !== t.label)
            : state.tagFilter.push(t.label);
          renderManagerTab(box, container);
        }
      }, '# ', t.label)
    ),
    state.tagFilter.length > 0
      ? el('button', {
          type: 'button',
          class: 'chip',
          onclick: () => { state.tagFilter = []; renderManagerTab(box, container); }
        }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('x', 12), 'پاک‌کردن فیلتر برچسب‌ها'))
      : null
  );

  const filterCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'فیلتر گزارش'),
      range.from ? el('span', { class: 'cell-sub', title: formatJalaliFull(range.from) }, `${formatJalaliShort(range.from)} تا ${formatJalaliShort(range.to)}`) : el('span', { class: 'cell-sub' }, 'همهٔ روزها')
    ),
    el('div', { class: 'card__body sanj-composer' },
      quickChips,
      customDates,
      searchInput,
      el('div', {},
        el('div', { class: 'sanj-hint', style: { marginBottom: '6px' } }, 'فیلتر برچسب (پیش‌فرض: بدون فیلتر)'),
        tagFilterChips
      )
    )
  );

  // ─── KPI ───
  // تعریف «عادی» (قرارداد محصول): بدون برچسب ارجاع تخصصی و بدون موارد خاص؛
  // برچسب‌های آزاد کارمند سنجش‌گر / مهدکودک مبدأ «عادی» را تغییر نمی‌دهند.
  const kpis = el('div', { style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'kpi-grid' },
    sanjKpi('کل سنجش‌های بازه', fa(stats.total), stats.total ? `عادی ${fa(stats.normal)} از کل` : 'بدون داده', 'primary'),
    sanjKpi('عادی (بدون ارجاع و خاص)', fa(stats.normal), stats.total ? `٪${fa(Math.round((stats.normal / stats.total) * 100))} از کل` : '—', 'success'),
    sanjKpi('ارجاع تخصصی', fa(stats.referrals), stats.total ? `نرخ ارجاع ٪${fa(stats.referralRate)}` : '—', stats.referrals > 0 ? 'error' : 'neutral'),
    sanjKpi('موارد خاص', fa(stats.noCoop + stats.noReg), `عدم همکاری ${fa(stats.noCoop)} • بی‌ثبت‌نام ${fa(stats.noReg)}`, 'accent')
    ),
    el('p', { class: 'sanj-hint', style: { margin: '8px 4px 0', lineHeight: '1.9' } },
      'تعریف «عادی»: بدون برچسب ارجاع تخصصی (بینایی، شنوایی، هوش، جسمی‌حرکتی) و بدون موارد خاص (عدم همکاری، نداشتن ثبت‌نام) — برچسب کارمند سنجش‌گر و مهدکودک مبدأ «عادی» را تغییر نمی‌دهد.'
    )
  );

  // ─── روند روزانه (حداکثر ۱۴ روز اخیر بازه) ───
  const chartCard = buildChartCard(stats.byDay);

  // ─── تفکیک برچسب‌ها ───
  const breakdownCard = stats.perTag.length === 0 ? null : el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'تفکیک برچسب‌ها'),
      el('span', { class: 'cell-sub' }, 'کارمند سنجش‌گر، مهدکودک مبدأ و وضعیت‌ها')
    ),
    el('div', { class: 'card__body', style: { display: 'grid', gap: '8px' } },
      ...stats.perTag.slice(0, 12).map((t) => {
        const max = Math.max(...stats.perTag.map((x) => x.count));
        const color = t.kind === 'referral' ? 'var(--error)' : t.kind === 'status' ? 'var(--accent)' : 'var(--primary)';
        return el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' } },
          el('span', { class: 'cell-main', style: { width: '150px', flexShrink: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
            t.kind === 'custom' ? '# ' : '', t.label
          ),
          el('div', { class: 'sanj-bar' },
            el('span', { style: { width: `${Math.max(6, (t.count / max) * 100)}%`, background: color } })
          ),
          el('b', { style: { width: '28px', textAlign: 'left', fontSize: 'var(--fs-sm)' } }, fa(t.count))
        );
      })
    )
  );

  // ─── نیازمند پیگیری ───
  const followUps = entries.filter((e) => e.tags.some((t) => REFERRALS.includes(t)));
  const followCard = el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'نیازمند پیگیری (ارجاع تخصصی)'),
      el('span', { class: `badge ${followUps.length > 0 ? 'badge--error' : 'badge--success'}` }, fa(followUps.length))
    ),
    el('div', { class: 'card__body' },
      followUps.length === 0
        ? emptyState({ iconName: 'check', title: 'در این بازه مورد ارجاعی وجود ندارد', hint: 'موارد ارجاع‌شده به متخصص برای تماس با خانواده اینجا فهرست می‌شوند.' })
        : el('div', { class: 'sanj-rows' },
            ...followUps.map((e) =>
              // همان ردیف دومنظورهٔ تب ثبت
              el('div', { class: 'sanj-row' },
                el('div', { class: 'sanj-row__main' },
                  el('span', { class: 'cell-main' }, e.name),
                  el('span', { class: 'cell-sub' }, formatJalaliShort(e.day))
                ),
                el('div', { class: 'sanj-row__tags' },
                  e.tags.filter((t) => REFERRALS.includes(t)).map((t) => tagBadge(t))
                ),
                // پل سنجش → لیست انتظار: ادامهٔ چرخه با یک لمس (نام پیش‌پُر می‌شود)
                el('div', { class: 'sanj-row__actions' },
                  el('button', {
                    class: 'btn btn--soft btn--sm',
                    title: 'ثبت این نوآموز در لیست انتظار مرکز (نام پیش‌پُر می‌شود)',
                    onclick: () => { location.hash = `#/waitlist?prefill=${encodeURIComponent(e.name)}`; } // — ماژول مستقل
                  }, icon('plus', 13), 'ثبت در لیست انتظار')
                )
              )
            )
          )
    )
  );

  // ─── لیست بازه ───
  const listCard = el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'سنجش‌های بازه'),
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        el('span', { class: 'badge badge--neutral' }, `${fa(entries.length)} ردیف`),
        el('button', {
          class: 'btn btn--soft btn--sm',
          disabled: entries.length === 0 ? true : null,
          onclick: () => exportCsv(entries, range)
        }, icon('download', 15), 'خروجی CSV')
      )
    ),
    el('div', { class: 'card__body card__body--flush', style: { overflowX: 'auto' } },
      entries.length === 0
        ? el('div', { style: { padding: 'var(--sp-4)' } }, emptyState({ iconName: 'clip', title: 'برای این فیلترها موردی نیست' }))
        : buildEntriesTable(entries)
    )
  );

  box.replaceChildren(filterCard, kpis, chartCard, breakdownCard, followCard, listCard);
}

function sanjKpi(label, value, hint, tone) {
  return el('div', { class: 'kpi' },
    el('div', { class: 'kpi__value', 'data-tone': tone }, value),
    el('div', { class: 'kpi__label' }, label),
    el('div', { class: 'kpi__hint' }, hint)
  );
}

function buildChartCard(byDay) {
  if (!byDay || byDay.length === 0) return null;
  const last = byDay[byDay.length - 1].day;
  const first = byDay[0].day > addDaysYmd(last, -13) ? byDay[0].day : addDaysYmd(last, -13);
  const map = new Map(byDay.map((d) => [d.day, d.count]));
  const cols = [];
  for (let d = first; d <= last; d = addDaysYmd(d, 1)) {
    cols.push({ day: d, count: map.get(d) ?? 0 });
  }
  const max = Math.max(1, ...cols.map((c) => c.count));
  return el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'روند روزانهٔ سنجش'),
      el('span', { class: 'cell-sub' }, '۱۴ روز اخیر بازه')
    ),
    el('div', { class: 'card__body' },
      el('div', { class: 'sanj-chart' },
        ...cols.map((c) =>
          el('div', { class: 'sanj-chart__col', title: `${formatJalaliFull(c.day)} — ${fa(c.count)} سنجش` },
            el('span', { class: 'sanj-chart__label' }, c.count > 0 ? fa(c.count) : ''),
            el('div', { class: 'sanj-chart__bar', style: { height: `${Math.max(3, (c.count / max) * 72)}px` } }),
            el('span', { class: 'sanj-chart__label' }, fa(Number(c.day.slice(8, 10))))
          )
        )
      )
    )
  );
}

function buildEntriesTable(entries) {
  return dataTable({
    columns: [
      {
        key: 'name',
        label: 'دانش‌آموز',
        render: (e) => el('div', { class: 'cell-main' }, e.name)
      },
      {
        key: 'day',
        label: 'روز سنجش',
        render: (e) =>
          el(
            'div',
            {},
            el('div', { class: 'cell-main' }, formatJalaliShort(e.day)),
            el('div', { class: 'cell-sub', title: formatJalaliFull(e.day) }, e.day)
          )
      },
      {
        key: 'tags',
        label: 'برچسب‌ها',
        render: (e) =>
          el(
            'div',
            { style: { display: 'flex', flexWrap: 'wrap', gap: '4px' } },
            hasPreTag(e.tags)
              ? e.tags.map((t) => tagBadge(t))
              : [normalBadge(), ...e.tags.filter((t) => !KIND_BY_LABEL.has(t)).map((t) => tagBadge(t))]
          )
      },
      {
        key: 'creator',
        label: 'ثبت‌کننده',
        render: (e) => el('span', { class: 'cell-sub' }, e.creatorName ?? '—')
      }
    ],
    rows: entries,
    empty: { iconName: 'clip', title: 'برای این فیلترها موردی نیست' }
  });
}

function exportCsv(entries, range) {
  const header = ['نام و فامیل', 'روز سنجش (میلادی)', 'روز سنجش (شمسی)', 'برچسب‌ها', 'ثبت‌کننده'];
  const rows = entries.map((e) => [
    e.name,
    e.day,
    formatJalaliShort(e.day),
    e.tags.join(' | '),
    e.creatorName ?? ''
  ]);
  const csv = '\uFEFF' + [header, ...rows]
    .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `sanjesh-${range.from || 'all'}-${range.to || tehranTodayYmd()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  toast('فایل CSV دانلود شد', 'success');
}

// ─────────────── رندر اصلی نما ───────────────

export async function renderScreening(container) {
  const head = el('div', { class: 'page-head' },
    el('div', { class: 'page-head__title' }, 'سنجش روزانه'),
    el('span', { class: 'badge badge--neutral', title: 'غربال نوآموزان بدو ورود به دبستان' },
      'بینایی • شنوایی • هوش • جسمی‌حرکتی — ', WEEKDAY_NAMES[iranianWeekdayOfYmd(tehranTodayYmd())]
    )
  );

  const body = el('div', {});
  const tabbar = tabs(
    [
      { key: 'daily', label: 'ثبت روزانه (منشی و مدیر)', onSelect: (k) => { state.tab = k; draw(k); } },
      { key: 'manager', label: 'گزارش و KPI (مدیر)', onSelect: (k) => { state.tab = k; draw(k); } }
    ],
    state.tab
  );

  function draw(key) {
    tabbar.setActive(key);
    if (key === 'daily') void renderDailyTab(body, container);
    else void renderManagerTab(body, container);
  }

  container.replaceChildren(head, tabbar.root, el('div', { style: { marginTop: 'var(--sp-4)' } }, body));
  draw(state.tab);
}

// ─────────────── ویجت «سنجش‌های این روز» برای ماژول روز کاری ───────────────
// فقط مشاهده — فراخوانی سبک /api/screening برای همان روزِ انتخاب‌شده در بورد؛
// خطاها ویجت را می‌شکنند نه بورد را (همراه با catch در import سمت working-day).

export async function renderScreeningDayWidget(box, ymd) {
  const body = el('div', { class: 'card__body' }, skeletonState('list', 3));
  const headCount = el('span', { class: 'badge badge--neutral' }, '…');
  const card = el('div', { class: 'card sanj-widget' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title', title: 'فهرست غربال نوآموزانِ همین روز — از ماژول سنجش روزانه' },
        icon('board', 16), 'سنجش‌های این روز'),
      headCount
    ),
    body
  );
  box.appendChild(card);

  let entries;
  try {
    entries = (await api.get(`/api/screening${qs({ from: ymd, to: ymd })}`)).data.entries;
  } catch {
    body.replaceChildren(el('div', { class: 'cell-sub' }, 'بارگیری فهرست سنجش ناموفق بود'));
    return;
  }

  const normal = entries.filter((e) => !hasPreTag(e.tags)).length;
  headCount.className = `badge ${entries.length === 0 ? 'badge--neutral' : 'badge--primary'}`;
  headCount.textContent = `${fa(entries.length)} ثبت`;

  if (entries.length === 0) {
    body.replaceChildren(
      el('div', { class: 'sanj-widget__empty' },
        icon('student', 20),
        el('span', {}, 'این روز سنجشی ثبت نشده است'))
    );
    return;
  }

  const canWrite = ['manager', 'secretary'].includes(session.user?.role);

  body.replaceChildren(
    el('div', { class: 'sanj-widget__rows' },
      ...entries.slice(0, 12).map((e) =>
        el('div', { class: 'sanj-widget__row' },
          el('div', { class: 'sanj-widget__name' },
            el('b', {}, e.name),
            el('span', { class: 'cell-sub' }, `${e.creatorName ?? '—'} • ${fa((e.createdAt || '').slice(11, 16))}`)
          ),
          el('div', { class: 'sanj-widget__tags' },
            hasPreTag(e.tags)
              ? e.tags.slice(0, 2).map((t) => tagBadge(t))
              : [normalBadge()]
          )
        )
      ),
      entries.length > 12
        ? el('div', { class: 'cell-sub', style: { textAlign: 'center' } }, `و ${fa(entries.length - 12)} مورد دیگر…`)
        : null
    ),
    el('div', { class: 'sanj-widget__foot' },
      el('span', { class: 'cell-sub' }, `${fa(normal)} عادی • ${fa(entries.length - normal)} ارجاع/خاص`),
      canWrite
        ? el('button', {
            class: 'btn btn--soft btn--sm',
            title: 'رفتن به ماژول سنجش روزانه',
            onclick: () => { location.hash = '#/screening'; }
          }, icon('plus', 14), 'ثبت / مدیریت')
        : null
    )
  );
}
