import { api } from '../api.js';
import { fa, formatJalaliDateTime } from '../format.js';
import { el, icon, openModal, formModal, confirmModal, toast, toastError, emptyState, errorState, skeletonState, scienceNote } from '../ui.js';
import { TOOL_GUIDES } from '../clinical-content.js';
import { session } from '../state.js';
import { openChecklistSendModal, fillTargetOf } from '../case-events.js';
import { CATEGORY_ICONS, TYPE_ICON_CHOICES, typeIconNode } from '../case-event-icons.js';

const CATEGORY_LABELS = { session: 'جلسه', checklist: 'چک‌لیست', note: 'یادداشت' };
const AUDIENCE_LABELS = { family: 'خانواده', teacher: 'معلم کلاس', both: 'خانواده و معلم' };
const FIELD_TYPE_LABELS = {
  text: 'متن کوتاه',
  longtext: 'متن بلند',
  number: 'عدد',
  select: 'گزینه‌ای (بدون نمره)',
  scale: 'نمره‌ای (۰ تا سقف)',
  single: 'گزینه‌ای نمره‌دار'
};
const BAND_COLOR_LABELS = { ok: 'مطلوب (سبز)', warn: 'مرزی/هشدار (زرد)', danger: 'قابل توجه (قرمز)' };
const BAND_TONES = { ok: 'success', warn: 'warning', danger: 'error' };
const SUBSCALE_DOT_COLORS = ['#2AABEE', '#7C5CFC', '#F59E0B', '#10B981', '#EF4444', '#06B6D4', '#EC4899', '#84CC16'];
const SCALE_MAX_LIMIT = 10;
const FIELD_OPTIONS_MAX = 12;
const SUBSCALES_MAX = 8;

function canUse() {
  return Boolean(session.user && ['manager', 'secretary', 'therapist'].includes(session.user.role));
}
function isManager() {
  return Boolean(session.user && session.user.role === 'manager');
}

function itemMax(f) {
  if (f.type === 'single') {
    const opts = f.scoredOptions ?? [];
    return opts.length ? Math.max(...opts.map((o) => Number(o.score) || 0)) : 0;
  }
  return f.scaleMax ?? 3;
}
function subscaleMax(fields, subscaleId) {
  return fields.filter((f) => f.subscaleId === subscaleId).reduce((s, f) => s + itemMax(f), 0);
}
function totalMax(fields, subscales) {
  const excluded = new Set((subscales ?? []).filter((s) => s.excludeFromTotal).map((s) => s.id));
  return fields.filter((f) => !(f.subscaleId && excluded.has(f.subscaleId))).reduce((s, f) => s + itemMax(f), 0);
}

export async function renderCaseEventTypes(container) {
  if (!canUse()) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'دسترسی مجاز نیست', hint: 'این بخش برای همکاران مرکز فعال است.' }));
    return;
  }
  container.replaceChildren(skeletonState('table', 5));

  let types, tags, pending;
  try {
    [types, tags, pending] = await Promise.all([
      api.get('/api/case-events/types').then((r) => r.data ?? []),
      api.get('/api/tags?category=disorder').then((r) => r.data ?? []).catch(() => []),
      api.get('/api/case-events/pending').then((r) => r.data ?? [])
    ]);
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderCaseEventTypes(container)));
    return;
  }
  const tagName = new Map((tags ?? []).map((t) => [t.id, t.name]));
  const state = { tab: 'library', cat: 'all', aud: 'all', types, pending, tagName };

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'رویدادساز — استودیوی سنجش'),
      el('div', { class: 'page-head__desc' },
        'فرم‌ساز حرفه‌ای روان‌سنجی: گزینه‌های نمره‌دار، آیتم معکوس/بحرانی، زیرمقیاس و تفسیر خودکار — + ارسال یک‌کلیکی چک‌لیست برای خانواده و معلم در بله.'
      )
    ),
    el('button', { class: 'btn btn--primary', onclick: () => openTypeForm({ tagName, onSaved: () => renderCaseEventTypes(container) }) },
      icon('plus', 16), 'قالب جدید')
  );

  const tabs = el('div', { style: { display: 'flex', gap: '8px', margin: '0 0 var(--sp-4)', flexWrap: 'wrap' } },
    tabBtn('library', `کتابخانهٔ فرم‌ها (${fa(types.filter((t) => t.active).length)})`),
    tabBtn('pending', `در انتظار پاسخ (${fa(pending.length)})`)
  );
  function tabBtn(key, label) {
    return el('button', {
      class: `btn btn--sm ${state.tab === key ? 'btn--primary' : 'btn--soft'}`,
      onclick: () => { state.tab = key; renderTabs(); }
    }, label);
  }
  function renderTabs() {
    for (const b of tabs.querySelectorAll('button')) {
      b.classList.remove('btn--primary');
      b.classList.add('btn--soft');
    }
    const activeBtn = tabs.querySelectorAll('button')[state.tab === 'library' ? 0 : 1];
    activeBtn.classList.remove('btn--soft');
    activeBtn.classList.add('btn--primary');
    body.replaceChildren(state.tab === 'library' ? renderLibrary() : renderPending());
  }

  const body = el('div', {});
  container.replaceChildren(head, tabs, body);
  body.replaceChildren(renderLibrary());

  function renderLibrary() {
    const wrap = el('div', {});
    const chip = (label, active, onClick) => el('button', {
      class: `chip ${active ? 'is-active' : ''}`,
      style: { cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '5px' },
      onclick: onClick
    }, label);

    const searchInput = el('input', {
      class: 'input exb-search',
      placeholder: 'جستجوی عنوان قالب…',
      value: state.q2 ?? '',
      style: { maxWidth: '220px' }
    });
    let searchTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => { state.q2 = searchInput.value.trim(); renderTabs(); }, 250);
    });

    const filters = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0 0 var(--sp-4)', alignItems: 'center' } },
      el('span', { class: 'cell-sub' }, 'دسته:'),
      chip('همه', state.cat === 'all', () => { state.cat = 'all'; renderTabs(); }),
      ...Object.entries(CATEGORY_LABELS).map(([k, v]) =>
        chip(el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon(CATEGORY_ICONS[k], 13), v), state.cat === k, () => { state.cat = k; renderTabs(); })),
      el('span', { style: { width: '12px' } }),
      el('span', { class: 'cell-sub' }, 'مخاطب:'),
      chip('همه', state.aud === 'all', () => { state.aud = 'all'; renderTabs(); }),
      ...Object.entries(AUDIENCE_LABELS).map(([k, v]) => chip(v, state.aud === k, () => { state.aud = k; renderTabs(); })),
      el('span', { style: { flex: 1 } }),
      searchInput
    );

    const q2 = (state.q2 ?? '').trim();
    const active = state.types.filter((t) => t.active
      && (state.cat === 'all' || t.category === state.cat)
      && (state.aud === 'all' || t.audience === state.aud || t.audience === 'both')
      && (!q2 || String(t.title ?? '').includes(q2)));
    const inactive = state.types.filter((t) => !t.active);

    if (active.length === 0) {
      wrap.replaceChildren(
        filters,
        emptyState({
          iconName: 'file',
          title: 'قالبی در این فیلتر نیست',
          hint: 'با «قالب جدید» فرم خودتان را بسازید؛ قالب‌های سنجش استاندارد (SDQ، کانرز، چک‌لیست رفتاری، معلم، غربال چندگزینه‌ای) از قبل در کتابخانه هست.'
        })
      );
      return wrap;
    }

    wrap.replaceChildren(
      filters,
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-4)' } }, ...active.map((t) => typeCard(t))),
      inactive.length > 0
        ? el('div', { style: { marginTop: 'var(--sp-5)' } },
            el('h3', { style: { marginBottom: 'var(--sp-3)', fontSize: '15px' } }, 'غیرفعال'),
            el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-4)', opacity: '0.65' } },
              ...inactive.map((t) => typeCard(t))))
        : null
    );
    return wrap;
  }

  function renderPending() {
    if (state.pending.length === 0) {
      return emptyState({
        iconName: 'check',
        title: 'صف خالی است',
        hint: 'چک‌لیست در انتظاری وجود ندارد — از پروفایل دانش‌آموز یا دکمهٔ «ارسال» قالب‌ها، چک‌لیست جدید برای خانواده/معلم بفرستید.'
      });
    }
    return el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-4)' } },
      ...state.pending.map((p) => pendingCard(p)));
  }

  function pendingCard(p) {
    const sentLine = p.sentCount > 0
      ? `ارسال: ${fa(p.sentCount)} بار — آخرین: ${formatJalaliDateTime(p.sentAt)}`
      : 'هنوز از پنل ارسال نشده — خانواده فقط از داخل بات می‌تواند آن را ببیند';
    return el('div', { class: 'card' },
      el('div', { class: 'card__body' },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
          el('span', { class: 'typegrid__icon typegrid__icon--lg', style: { display: 'inline-flex' } }, typeIconNode(null, p.typeIcon, 20)),
          el('b', {}, p.studentName || 'دانش‌آموز'),
          el('span', { class: 'badge badge--primary' }, p.typeTitle),
          el('span', { class: 'badge badge--neutral' }, AUDIENCE_LABELS[p.typeAudience] ?? 'خانواده'),
          p.expired ? el('span', { class: 'badge badge--error' }, 'مهلت تمام شده') : el('span', { class: 'badge badge--warning' }, 'در انتظار پاسخ')
        ),
        el('div', { class: 'cell-sub', style: { margin: '8px 0' } },
          `ثبت: ${formatJalaliDateTime(p.occurredAt)} — ${sentLine}`),
        el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
          el('button', {
            class: 'btn btn--primary btn--sm',
            onclick: async () => {
              try {
                const res = await api.post(`/api/case-events/${p.id}/send`, { audience: p.typeAudience });
                toast(res.data.sent > 0
                  ? `یادآوری برای ${fa(res.data.sent)} نفر ارسال شد`
                  : 'همین حالا ارسال شده — یک دقیقه بعد تلاش کنید', res.data.sent > 0 ? 'success' : 'warning');
                renderCaseEventTypes(container);
              } catch (err) { toastError(err); }
            }
          }, icon('bell', 14), p.sentCount > 0 ? 'یادآوری دوباره' : 'ارسال پیام بله'),
          el('a', { class: 'btn btn--soft btn--sm', href: `#/students/${p.studentId}` }, icon('student', 14), 'پرونده'),
          el('button', {
            class: 'btn btn--ghost btn--sm',
            onclick: async () => {
              const ok = await confirmModal({ title: 'لغو چک‌لیست', message: `چک‌لیست «${p.typeTitle}» برای «${p.studentName}» لغو شود؟`, confirmLabel: 'لغو', danger: true });
              if (!ok) return;
              try {
                await api.post(`/api/case-events/${p.id}/cancel`, {});
                toast('لغو شد');
                renderCaseEventTypes(container);
              } catch (err) { toastError(err); }
            }
          }, icon('x', 14), 'لغو'),
          isManager()
            ? el('button', {
                class: 'btn btn--danger btn--sm',
                onclick: async () => {
                  const ok = await confirmModal({
                    title: 'حذف رویداد (مدیر)',
                    message: `چک‌لیست «${p.typeTitle}» برای «${p.studentName}» برای همیشه از صف و پرونده حذف شود؟ این عمل در گزارش رخدادها ثبت می‌شود.`,
                    confirmLabel: 'حذف', danger: true
                  });
                  if (!ok) return;
                  try {
                    await api.del(`/api/case-events/${p.id}`);
                    toast('رویداد حذف شد');
                    renderCaseEventTypes(container);
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 14), 'حذف')
            : null
        )
      )
    );
  }

  function typeCard(t) {
    const tagChips = (t.tags ?? [])
      .map((id) => ({ id, name: state.tagName?.get?.(id) ?? null }))
      .filter((x) => x.name);
    const isChecklist = t.category === 'checklist';
    const subscales = t.subscales ?? [];
    return el('div', { class: 'card' },
      el('div', { class: 'card__body' },
        el('div', { style: { display: 'flex', alignItems: 'flex-start', gap: '10px' } },
          el('div', {
            class: 'typegrid__icon typegrid__icon--lg',
            style: {
              width: '44px', height: '44px', borderRadius: '12px', flexShrink: '0',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isChecklist ? 'var(--accent-soft, rgba(42,171,238,.12))' : 'var(--surface-2, #f2f2f2)',
              color: 'var(--primary)'
            }
          }, typeIconNode(t.category, t.icon, 22)),
          el('div', { style: { flex: '1', minWidth: '0' } },
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' } },
              el('b', {}, t.title),
              el('span', { class: 'badge badge--neutral' }, CATEGORY_LABELS[t.category] ?? t.category),
              el('span', { class: `badge ${fillTargetOf(t).badgeClass}` }, fillTargetOf(t).badge),
              !t.active ? el('span', { class: 'badge badge--neutral' }, 'غیرفعال') : null
            ),
            el('div', { class: 'cell-sub', style: { marginTop: '4px' } },
              `${fa((t.fields ?? []).length)} فیلد` +
              (isChecklist ? ` — ماکسیمم ${fa(totalMax(t.fields ?? [], subscales))} نمره` : '') +
              (isChecklist && subscales.length ? ` — ${fa(subscales.length)} زیرمقیاس` : '') +
              (isChecklist && t.bands?.length ? ` — ${fa(t.bands.length)} باند تحلیل` : '') +
              (t.familyFillable ? ' — قابل پر کردن توسط گیرنده' : '')),
            subscales.length > 0
              ? el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' } },
                  ...subscales.map((s, i) => el('span', {
                    class: 'chip',
                    style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' }
                  },
                  el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: SUBSCALE_DOT_COLORS[i % SUBSCALE_DOT_COLORS.length], display: 'inline-block' } }),
                  s.name + (s.excludeFromTotal ? ' (خارج از کل)' : ''))))
              : null,
            tagChips.length > 0
              ? el('div', { style: { display: 'flex', gap: '5px', flexWrap: 'wrap', marginTop: '6px' } },
                  ...tagChips.map((x) => el('span', { class: 'chip', style: { fontSize: '11px' } }, `#${x.name}`)))
              : null
          )
        ),
        el('div', { style: { display: 'flex', gap: '8px', marginTop: '12px', flexWrap: 'wrap' } },
          isChecklist && t.familyFillable && t.active
            ? el('button', {
                class: 'btn btn--primary btn--sm',
                onclick: () => openStudentPicker(t)
              }, icon('zap', 14), 'ارسال برای دانش‌آموز')
            : null,
          el('button', { class: 'btn btn--soft btn--sm', onclick: () => openTypeForm({ type: t, tagName: state.tagName, onSaved: () => renderCaseEventTypes(container) }) }, icon('edit', 14), 'ویرایش'),
          t.active
            ? el('button', {
                class: 'btn btn--ghost btn--sm',
                onclick: async () => {
                  const ok = await confirmModal({ title: 'غیرفعال‌سازی قالب', message: `«${t.title}» از فهرست انتخاب و ارسال حذف می‌شود (رویدادهای قبلی می‌مانند).`, confirmLabel: 'غیرفعال کن', danger: true });
                  if (!ok) return;
                  try {
                    await api.post(`/api/case-events/types/${t.id}/deactivate`, {});
                    toast('قالب غیرفعال شد');
                    renderCaseEventTypes(container);
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 14), 'غیرفعال‌سازی')
            : null,
          isManager()
            ? el('button', {
                class: 'btn btn--danger btn--sm',
                title: 'فقط وقتی مجاز است که هیچ رویدادی به این قالب وصل نباشد',
                onclick: async () => {
                  const ok = await confirmModal({
                    title: 'حذف کامل قالب (مدیر)',
                    message: `«${t.title}» از کتابخانه حذف شود؟ اگر به این قالب رویدادی وصل باشد، حذف رد می‌شود و باید آن را غیرفعال کنید.`,
                    confirmLabel: 'حذف', danger: true
                  });
                  if (!ok) return;
                  try {
                    await api.del(`/api/case-events/types/${t.id}`);
                    toast('قالب حذف شد');
                    renderCaseEventTypes(container);
                  } catch (err) { toastError(err); }
                }
              }, icon('x', 14), 'حذف')
            : null
        ),
        // — m176: «پشتوانهٔ علمی و نحوهٔ استفاده» زیر هر کارت چک‌لیست
        scienceNote(TOOL_GUIDES[t.key])
      )
    );
  }

  function openStudentPicker(type) {
    const results = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '10px 0', maxHeight: '320px', overflowY: 'auto' } });
    const input = el('input', {
      class: 'input',
      type: 'search',
      placeholder: 'جستجوی نام دانش‌آموز…',
      style: { width: '100%' }
    });
    let timer = null;
    async function search(q) {
      results.replaceChildren(el('p', { class: 'cell-sub' }, 'در حال جستجو…'));
      try {
        const res = await api.get(`/api/students?q=${encodeURIComponent(q)}&page=1&pageSize=8`);
        const items = res.data?.items ?? res.data ?? [];
        if (items.length === 0) {
          results.replaceChildren(el('p', { class: 'cell-sub' }, 'چیزی پیدا نشد — با کد ملی یا بخشی از نام جستجو کنید.'));
          return;
        }
        results.replaceChildren(...items.map((s) => {
          const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || s.fullName || '—';
          return el('button', {
            class: 'btn btn--soft',
            style: { justifyContent: 'flex-start', width: '100%' },
            onclick: () => {
              closeModal();
              openChecklistSendModal({ student: s, typeId: type.id, onSent: () => renderCaseEventTypes(container) });
            }
          }, `${name}${s.class_name ? ` — ${s.class_name}` : ''}`);
        }));
      } catch (err) {
        results.replaceChildren(el('p', { class: 'cell-sub' }, 'جستجو ناموفق بود'));
      }
    }
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const q = input.value.trim();
      if (q.length < 2) { results.replaceChildren(); return; }
      timer = setTimeout(() => search(q), 350);
    });

    const { close: closeModal } = openModal({
      title: `ارسال «${type.title}» — انتخاب دانش‌آموز`,
      body: el('div', {}, input, results),
      actions: [(close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')]
    });
    setTimeout(() => input.focus(), 100);
  }
}

function openTypeForm({ type = null, tagName = null, onSaved }) {
  const isEdit = Boolean(type);
  const isChecklistInit = isEdit ? type.category === 'checklist' : true;
  const st = {
    title: type?.title ?? '',
    category: type?.category ?? 'checklist',
    icon: TYPE_ICON_CHOICES.includes(type?.icon ?? '') ? type.icon : 'clipboard',
    familyFillable: type?.familyFillable ?? (isChecklistInit ? true : false),
    audience: type?.audience ?? 'family',
    fields: isEdit ? JSON.parse(JSON.stringify(type.fields ?? [])) : [],
    bands: isEdit && type.bands ? JSON.parse(JSON.stringify(type.bands)) : null,
    subscales: isEdit && type.subscales ? JSON.parse(JSON.stringify(type.subscales)) : null,
    tags: new Set(isEdit ? (type.tags ?? []) : [])
  };
  const tagMap = tagName instanceof Map ? tagName : new Map(Object.entries(tagName ?? {}));
  const availableTags = [...tagMap.entries()].map(([id, name]) => ({ id, name }));

  const { close } = openModal({
    title: isEdit ? `ویرایش قالب: ${type.title}` : 'قالب جدید — فرم‌ساز سنجش',
    wide: true,
    body: el('div', {}),
    actions: [
      (closeModal) => el('button', {
        class: 'btn btn--primary',
        onclick: () => save(closeModal)
      }, icon('check', 16), isEdit ? 'ذخیره تغییرات' : 'ساخت قالب'),
      (closeModal) => el('button', { class: 'btn btn--ghost', onclick: closeModal }, 'انصراف')
    ]
  });
  const overlays = document.querySelectorAll('.modal-overlay');
  const lastOverlay = overlays[overlays.length - 1];
  const bodySlot = lastOverlay?.querySelector('.modal__body') ?? null;

  function v(text) { return String(text ?? '').trim(); }

  function specsSection() {
    const titleInput = el('input', { class: 'input', type: 'text', value: st.title, placeholder: 'مثلاً: پرسش‌نامهٔ رفتار کودک — فرم خانواده', style: { width: '100%' } });
    titleInput.addEventListener('input', () => { st.title = titleInput.value; });
    const catSelect = el('select', { class: 'input', style: { width: '100%' }, onchange: (e) => { st.category = e.target.value; rerender(); } },
      ...Object.entries(CATEGORY_LABELS).map(([value, label]) => el('option', { value, selected: st.category === value }, label)));

    const iconPicker = el('div', { class: 'iconpicker' },
      ...TYPE_ICON_CHOICES.map((name) =>
        el('button', {
          type: 'button',
          class: `iconpicker__btn${st.icon === name ? ' is-active' : ''}`,
          title: name,
          onclick: () => {
            st.icon = name;
            for (const b of iconPicker.querySelectorAll('button')) b.classList.toggle('is-active', b.title === name);
          }
        }, icon(name, 17))
      )
    );

    const rows = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px' } },
      fieldWrap('عنوان قالب', titleInput),
      fieldWrap('دستهٔ رویداد', catSelect)
    );

    if (st.category === 'checklist') {
      const ff = el('input', { type: 'checkbox', checked: st.familyFillable, onchange: (e) => { st.familyFillable = e.target.checked; } });
      const audSelect = el('select', { class: 'input', style: { width: '100%' }, onchange: (e) => { st.audience = e.target.value; } },
        ...Object.entries(AUDIENCE_LABELS).map(([value, label]) => el('option', { value, selected: st.audience === value }, label)));
      rows.appendChild(fieldWrap('گیرنده می‌تواند خودش پر کند (وب‌فرم/بات)', ff, 'فقط دستهٔ چک‌لیست — نتیجهٔ پر شدن خودکار تحلیل می‌شود'));
      rows.appendChild(fieldWrap('مخاطب پیش‌فرض ارسال', audSelect, 'خانواده = ولیّ‌های متصل بله — معلم = چت متصل کلاس'));
      rows.appendChild(el('div', { class: 'cell-sub', style: { gridColumn: '1 / -1' } },
        `پرکنندهٔ این فرم: خانواده/معلم با پیام بله (لینک امن وب‌فرم) — در انتخابگر پروفایل زیر گروه «${AUDIENCE_LABELS[st.audience] ?? 'خانواده'}» دیده می‌شود.`));
    } else {
      rows.appendChild(el('div', { class: 'cell-sub', style: { gridColumn: '1 / -1' } },
        'پرکنندهٔ این فرم: درمانگر — در پروفایل دانش‌آموز، همین‌جا در سایت باز و پر می‌شود (ثبت روی تایم‌لاین پرونده).'));
    }
    return el('div', {},
      sectionTitle('۱) مشخصات قالب', null),
      rows,
      fieldWrap('آیکون قالب (وکتوری — در کتابخانه و بات نمایش داده می‌شود)', iconPicker)
    );
  }

  function subscalesSection() {
    const subs = st.subscales ?? [];
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' } });
    if (subs.length === 0) {
      list.appendChild(el('p', { class: 'cell-sub' },
        'زیرمقیاسی تعریف نشده است — نمرهٔ کل از جمع همهٔ آیتم‌ها حساب می‌شود. برای چک‌لیست‌های چندبعدی (مثل SDQ) زیرمقیاس بسازید تا نمرهٔ هر بُعد جدا و با باند مستقل تفسیر شود.'));
    }
    subs.forEach((s, i) => {
      const dot = el('span', { style: { width: '10px', height: '10px', borderRadius: '50%', background: SUBSCALE_DOT_COLORS[i % SUBSCALE_DOT_COLORS.length], display: 'inline-block', flexShrink: '0' } });
      list.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', background: 'var(--surface-2, #f7f3ea)', borderRadius: '10px', padding: '8px 10px' } },
        dot,
        el('b', { style: { fontSize: '13px' } }, s.name),
        s.excludeFromTotal ? el('span', { class: 'badge badge--neutral' }, 'خارج از نمرهٔ کل (نقطهٔ قوت)') : null,
        el('span', { class: 'cell-sub' }, `ماکسیمم ${fa(subscaleMax(st.fields, s.id))} نمره`),
        (s.bands?.length ?? 0) > 0 ? el('span', { class: 'badge badge--accent' }, `${fa(s.bands.length)} باند مستقل`) : el('span', { class: 'cell-sub' }, 'بدون باند مستقل'),
        el('span', { style: { flex: 1 } }),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openBandsEditor(s.bands, subscaleMax(st.fields, s.id), (nb) => { s.bands = nb; rerender(); }) }, 'باندها'),
        el('button', { class: 'btn btn--ghost btn--sm', onclick: () => openSubscaleEditor(s, (ns) => { Object.assign(s, ns); rerender(); }) }, 'ویرایش'),
        el('button', {
          class: 'btn btn--ghost btn--sm', title: 'حذف زیرمقیاس',
          onclick: async () => {
            const hasItems = st.fields.some((f) => f.subscaleId === s.id);
            const ok = await confirmModal({
              title: 'حذف زیرمقیاس',
              message: hasItems ? `آیتم‌های متصل به «${s.name}» بی‌زیرمقیاس می‌شوند و در نمرهٔ کل جمع می‌شوند. ادامه؟` : `«${s.name}» حذف شود؟`,
              confirmLabel: 'حذف', danger: true
            });
            if (!ok) return;
            st.fields.forEach((f) => { if (f.subscaleId === s.id) f.subscaleId = null; });
            subs.splice(i, 1);
            if (subs.length === 0) st.subscales = null;
            rerender();
          }
        }, icon('x', 14))
      ));
    });
    return el('div', {},
      sectionTitle('۲) زیرمقیاس‌ها (اختیاری)', `${fa(subs.length)} از ${fa(SUBSCALES_MAX)}`),
      list,
      subs.length < SUBSCALES_MAX
        ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => openSubscaleEditor(null, (ns) => { (st.subscales ??= []).push(ns); rerender(); }) }, icon('plus', 14), 'زیرمقیاس جدید')
        : null
    );
  }

  function fieldsSection() {
    const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '8px 0' } });
    if (st.fields.length === 0) {
      list.appendChild(el('p', { class: 'cell-sub' }, 'هنوز آیتمی اضافه نشده — با «آیتم جدید» شروع کنید.'));
    }
    const subName = new Map((st.subscales ?? []).map((s) => [s.id, s.name]));
    st.fields.forEach((f, i) => {
      const subIdx = (st.subscales ?? []).findIndex((s) => s.id === f.subscaleId);
      const dotColor = f.subscaleId ? SUBSCALE_DOT_COLORS[subIdx % SUBSCALE_DOT_COLORS.length] : null;
      list.appendChild(el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', background: 'var(--surface-2, #f7f3ea)', borderRadius: '10px', padding: '8px 10px' } },
        el('b', { style: { fontSize: '13px' } }, `${fa(i + 1)}. ${f.label}`),
        el('span', { class: 'badge badge--neutral' }, FIELD_TYPE_LABELS[f.type] ?? f.type),
        f.required ? el('span', { class: 'badge badge--warning' }, 'الزامی') : null,
        f.reverse ? el('span', { class: 'badge badge--accent' }, 'معکوس') : null,
        f.critical ? el('span', { class: 'badge badge--error' }, 'بحرانی') : null,
        f.type === 'single' ? el('span', { class: 'cell-sub' }, `${fa((f.scoredOptions ?? []).length)} گزینه نمره‌دار — تا ${fa(itemMax(f))}`) : null,
        f.type === 'scale' ? el('span', { class: 'cell-sub' }, `تا ${fa(f.scaleMax ?? 3)}`) : null,
        f.type === 'select' && f.options?.length ? el('span', { class: 'cell-sub' }, `(${fa(f.options.length)} گزینه)`) : null,
        f.subscaleId && subName.has(f.subscaleId)
          ? el('span', { class: 'chip', style: { fontSize: '11px', display: 'inline-flex', alignItems: 'center', gap: '4px' } },
              el('span', { style: { width: '8px', height: '8px', borderRadius: '50%', background: dotColor, display: 'inline-block' } }),
              subName.get(f.subscaleId))
          : null,
        el('span', { style: { flex: 1 } }),
        el('button', { class: 'btn btn--ghost btn--icon', title: 'بالا', onclick: () => { if (i > 0) { [st.fields[i - 1], st.fields[i]] = [st.fields[i], st.fields[i - 1]]; rerender(); } } }, '↑'),
        el('button', { class: 'btn btn--ghost btn--icon', title: 'پایین', onclick: () => { if (i < st.fields.length - 1) { [st.fields[i + 1], st.fields[i]] = [st.fields[i], st.fields[i + 1]]; rerender(); } } }, '↓'),
        el('button', { class: 'btn btn--ghost btn--icon', title: 'ویرایش', onclick: () => openFieldEditor(f, (nf) => { st.fields[i] = nf; rerender(); }) }, icon('edit', 14)),
        el('button', { class: 'btn btn--ghost btn--icon', title: 'حذف', onclick: () => { st.fields.splice(i, 1); rerender(); } }, icon('x', 14))
      ));
    });
    const stats = st.fields.length > 0 && (st.category === 'checklist')
      ? el('div', { class: 'cell-sub', style: { margin: '6px 2px' } },
          `جمع: ${fa(st.fields.length)} آیتم — ماکسیمم نمرهٔ کل: ${fa(totalMax(st.fields, st.subscales))}`)
      : null;
    return el('div', {},
      sectionTitle('۳) آیتم‌های فرم', `${fa(st.fields.length)} آیتم`),
      list,
      stats,
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
        el('button', { class: 'btn btn--soft btn--sm', onclick: () => openFieldEditor(null, (nf) => { st.fields.push(nf); rerender(); }) }, icon('plus', 14), 'آیتم جدید'),
        st.fields.length > 0
          ? el('button', {
              class: 'btn btn--ghost btn--sm',
              onclick: async () => {
                const ok = await confirmModal({ title: 'پاک کردن همهٔ آیتم‌ها', message: 'همهٔ آیتم‌ها حذف شوند؟', confirmLabel: 'پاک کن', danger: true });
                if (!ok) return;
                st.fields = [];
                rerender();
              }
            }, 'پاک کردن همه')
          : null
      )
    );
  }

  function bandsSection() {
    const maxTotal = totalMax(st.fields, st.subscales);
    const chips = st.bands?.length
      ? el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '8px 0' } },
          ...st.bands.map((b) => el('span', {
            class: `badge badge--${BAND_TONES[b.color] ?? 'neutral'}`,
            title: b.advice ?? ''
          }, `تا ${b.max === 9999 ? '∞' : fa(b.max)}: ${b.label}`)))
      : el('p', { class: 'cell-sub', style: { margin: '8px 0' } },
          'بدون باند — نتیجه فقط جمع نمره گزارش می‌شود. با باندها، سامانه به‌طور خودکار تفسیر و توصیهٔ بالینی تولید می‌کند.');
    const rows = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      el('button', { class: 'btn btn--soft btn--sm', onclick: () => openBandsEditor(st.bands, maxTotal, (nb) => { st.bands = nb; rerender(); }) },
        st.bands?.length ? 'ویرایش باندها' : 'تعریف باندهای تحلیل'),
      st.bands?.length
        ? el('button', { class: 'btn btn--ghost btn--sm', onclick: () => { st.bands = null; rerender(); } }, 'حذف باندها')
        : null
    );
    return el('div', {},
      sectionTitle('۴) باندهای تحلیل و تفسیر خودکار', maxTotal > 0 ? `ماکسیمم ${fa(maxTotal)}` : null),
      chips, rows
    );
  }

  function tagsSection() {
    const chips = availableTags.length === 0
      ? el('p', { class: 'cell-sub', style: { margin: '4px 0' } }, 'برچسبی تعریف نشده است.')
      : el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0' } },
          ...availableTags.map((t) => el('button', {
            class: `chip ${st.tags.has(t.id) ? 'is-active' : ''}`,
            style: { cursor: 'pointer' },
            onclick: () => {
              if (st.tags.has(t.id)) st.tags.delete(t.id);
              else st.tags.add(t.id);
              rerender();
            }
          }, `#${t.name}`)));
    return el('div', {},
      sectionTitle('۵) برچسب‌های مرتبط (اختیاری)', null),
      el('p', { class: 'cell-sub', style: { margin: '2px 0' } }, 'قالب برای دانش‌آموزانی که همین برچسب‌ها را دارند پیشنهاد خودکار می‌شود.'),
      chips
    );
  }

  function rerender() {
    if (!bodySlot) return;
    const parts = [specsSection()];
    if (st.category === 'checklist') {
      parts.push(subscalesSection(), fieldsSection(), bandsSection());
    } else {
      parts.push(fieldsSection());
    }
    parts.push(tagsSection());
    bodySlot.replaceChildren(el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } }, ...parts));
  }
  rerender();

  function sectionTitle(text, hint) {
    return el('div', { style: { display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '4px' } },
      el('b', { style: { fontSize: '14px' } }, text),
      hint ? el('span', { class: 'cell-sub' }, hint) : null
    );
  }
  function fieldWrap(label, inputEl, hint) {
    return el('label', { style: { display: 'flex', flexDirection: 'column', gap: '5px', fontSize: '12px', color: 'var(--muted, #666)' } },
      label, inputEl,
      hint ? el('span', { class: 'cell-sub', style: { fontSize: '11px' } }, hint) : null
    );
  }

  async function save(closeModal) {
    if (v(st.title).length < 2) { toast('عنوان قالب الزامی است', 'error'); return; }
    if (st.fields.length === 0) { toast('حداقل یک آیتم فرم لازم است', 'error'); return; }
    if (st.category === 'checklist') {
      for (const f of st.fields) {
        if (f.type !== 'scale' && f.type !== 'single') {
          toast(`آیتم «${f.label}» نمره‌دار نیست — چک‌لیست فقط آیتم نمره‌ای یا گزینه‌ای نمره‌دار می‌پذیرد`, 'error');
          return;
        }
      }
      if (st.bands?.length && st.bands[st.bands.length - 1].max < totalMax(st.fields, st.subscales)) {
        toast('سقف آخرین باند باید برابر ماکسیمم نمرهٔ کل باشد', 'error');
        return;
      }
    }
    const payload = {
      title: v(st.title),
      category: st.category,
      icon: v(st.icon) || null,
      familyFillable: st.category === 'checklist' ? Boolean(st.familyFillable) : false,
      fields: st.fields,
      bands: st.category === 'checklist' ? (st.bands ?? null) : null,
      subscales: st.category === 'checklist' ? (st.subscales && st.subscales.length > 0 ? st.subscales : null) : null,
      tags: [...st.tags],
      audience: st.category === 'checklist' ? st.audience : 'family'
    };
    try {
      if (isEdit) await api.patch(`/api/case-events/types/${type.id}`, payload);
      else await api.post('/api/case-events/types', payload);
      toast(isEdit ? 'قالب به‌روزرسانی شد' : 'قالب ساخته شد', 'success');
      onSaved?.();
      closeModal();
    } catch (err) {
      toastError(err);
    }
  }

  function openSubscaleEditor(initial, onSave) {
    formModal({
      title: initial ? `ویرایش زیرمقیاس: ${initial.name}` : 'زیرمقیاس جدید',
      submitLabel: 'ثبت',
      fields: [
        { name: 'name', label: 'نام زیرمقیاس (مثلاً: هیجانی و اضطرابی)', type: 'text', required: true, span: 2, value: initial?.name ?? '' },
        { name: 'excludeFromTotal', label: 'خارج از نمرهٔ کل باشد (نقطهٔ قوت — مثل رفتار اجتماعی SDQ)', type: 'switch', value: initial?.excludeFromTotal ?? false }
      ],
      onSubmit: async (vals) => {
        const name = v(vals.name);
        if (name.length < 2) throw new Error('نام زیرمقیاس الزامی است');
        let id = initial?.id;
        if (!id) {
          const base = `sub_${Date.now().toString(36)}`;
          id = base.slice(-12);
        }
        onSave({ id, name, excludeFromTotal: Boolean(vals.excludeFromTotal), bands: initial?.bands ?? null });
        return true;
      }
    });
  }

  function openBandsEditor(initial, expectedMax, onSave) {
    let rows = (initial && initial.length > 0)
      ? JSON.parse(JSON.stringify(initial))
      : [{ max: Math.max(1, Math.floor(expectedMax / 2)), label: 'در محدودهٔ مطلوب', color: 'ok', advice: '' },
         { max: Math.max(2, Math.floor(expectedMax * 0.7)), label: 'مرزی — نیاز به توجه', color: 'warn', advice: '' },
         { max: Math.max(3, expectedMax), label: 'قابل توجه — نیاز به ارزیابی تخصصی', color: 'danger', advice: '' }];
    if (rows.length && rows[rows.length - 1].max < expectedMax) rows[rows.length - 1].max = expectedMax;

    let slot = null;
    const { close } = openModal({
      title: 'باندهای تحلیل — از کم به زیاد',
      wide: true,
      body: el('div', {}),
      actions: [
        () => el('button', { class: 'btn btn--primary', onclick: () => submit(close) }, 'ثبت باندها'),
        (closeModal) => el('button', { class: 'btn btn--ghost', onclick: closeModal }, 'انصراف')
      ]
    });
    const _ov = document.querySelectorAll('.modal-overlay');
    slot = _ov[_ov.length - 1]?.querySelector('.modal__body') ?? null;

    function rerender() {
      const list = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
      rows.forEach((b, i) => {
        const maxInput = el('input', { class: 'input', type: 'number', min: '1', value: b.max, style: { width: '90px' } });
        maxInput.addEventListener('input', () => { b.max = Number(maxInput.value); });
        const labelInput = el('input', { class: 'input', type: 'text', value: b.label, style: { flex: '1', minWidth: '140px' } });
        labelInput.addEventListener('input', () => { b.label = labelInput.value; });
        const colorSelect = el('select', { class: 'input', style: { width: '160px' }, onchange: (e) => { b.color = e.target.value; } },
          ...Object.entries(BAND_COLOR_LABELS).map(([value, label]) => el('option', { value, selected: b.color === value }, label)));
        const adviceInput = el('input', { class: 'input', type: 'text', value: b.advice ?? '', placeholder: 'توصیهٔ خودکار این باند (نمایش در تفسیر نتیجه)', style: { width: '100%', marginTop: '6px' } });
        adviceInput.addEventListener('input', () => { b.advice = adviceInput.value; });
        list.appendChild(el('div', { style: { background: 'var(--surface-2, #f7f3ea)', borderRadius: '10px', padding: '10px' } },
          el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
            el('span', { class: 'cell-sub' }, i === 0 ? 'نمره تا' : 'تا'),
            maxInput,
            labelInput,
            colorSelect,
            el('button', { class: 'btn btn--ghost btn--icon', title: 'حذف باند', onclick: () => { rows.splice(i, 1); rerender(); } }, icon('x', 14))
          ),
          adviceInput
        ));
      });
      slot.replaceChildren(
        el('p', { class: 'cell-sub', style: { margin: '0 0 8px' } },
          `باندها صعودی‌اند؛ سقف آخرین باند باید برابر ماکسیمم (${fa(expectedMax)}) باشد. رنگ هر باند و توصیهٔ آن در تفسیر خودکار نتیجه می‌آید.`),
        list,
        rows.length < 5
          ? el('button', { class: 'btn btn--soft btn--sm', style: { marginTop: '8px' }, onclick: () => { rows.push({ max: expectedMax, label: 'باند جدید', color: 'warn', advice: '' }); rerender(); } }, icon('plus', 14), 'باند جدید')
          : null
      );
    }
    rerender();

    function submit(closeModal) {
      if (rows.length === 0) { toast('حداقل یک باند لازم است', 'error'); return; }
      const cleaned = rows.map((b) => ({ max: Number(b.max), label: v(b.label), color: b.color ?? null, advice: v(b.advice) || null }));
      for (const b of cleaned) {
        if (!Number.isFinite(b.max) || b.max < 1) { toast('سقف هر باند باید عدد مثبت باشد', 'error'); return; }
        if (!b.label) { toast('عنوان هر باند الزامی است', 'error'); return; }
      }
      for (let i = 1; i < cleaned.length; i++) {
        if (cleaned[i].max <= cleaned[i - 1].max) { toast('سقف باندها باید صعودی باشد', 'error'); return; }
      }
      if (expectedMax > 0 && cleaned[cleaned.length - 1].max < expectedMax) {
        toast(`سقف آخرین باند باید برابر ماکسیمم (${fa(expectedMax)}) باشد`, 'error');
        return;
      }
      onSave(cleaned);
      closeModal();
    }
  }

  function openFieldEditor(initial, onSave) {
    const f = initial
      ? JSON.parse(JSON.stringify(initial))
      : { key: `f${Date.now().toString(36)}${Math.floor(Math.random() * 1000).toString(36)}`, label: '', type: st.category === 'checklist' ? 'scale' : 'text', required: false };
    if (st.category === 'checklist' && f.type === 'single' && !f.scoredOptions) {
      f.scoredOptions = [{ label: '', score: 0 }, { label: '', score: 1 }];
    }

    let slot = null;
    const { close } = openModal({
      title: initial ? `ویرایش آیتم: ${initial.label}` : 'آیتم جدید',
      wide: true,
      body: el('div', {}),
      actions: [
        () => el('button', { class: 'btn btn--primary', onclick: () => submit(close) }, 'ثبت آیتم'),
        (closeModal) => el('button', { class: 'btn btn--ghost', onclick: closeModal }, 'انصراف')
      ]
    });
    const _ov = document.querySelectorAll('.modal-overlay');
    slot = _ov[_ov.length - 1]?.querySelector('.modal__body') ?? null;

    function rerender() {
      const labelInput = el('input', { class: 'input', type: 'text', value: f.label, placeholder: 'متن آیتم/پرسش', style: { width: '100%' } });
      labelInput.addEventListener('input', () => { f.label = labelInput.value; });

      const typeOptions = Object.entries(FIELD_TYPE_LABELS)
        .filter(([value]) => st.category === 'checklist' ? ['scale', 'single'].includes(value) : value !== 'single')
        .map(([value, label]) => el('option', { value, selected: f.type === value }, label));
      const typeSelect = el('select', { class: 'input', style: { width: '100%' }, onchange: (e) => {
        const prev = f.type;
        f.type = e.target.value;
        if (f.type === 'single' && !f.scoredOptions) f.scoredOptions = [{ label: '', score: 0 }, { label: '', score: 1 }];
        if (f.type !== 'single') delete f.scoredOptions;
        if (f.type !== 'scale') delete f.reverse;
        if (f.type !== 'scale' && f.type !== 'single') { delete f.critical; delete f.criticalMin; }
        if (prev !== f.type) rerender();
      } }, ...typeOptions);

      const requiredCheck = el('input', { type: 'checkbox', checked: Boolean(f.required), onchange: (e) => { f.required = e.target.checked; } });

      const head = el('div', { style: { display: 'grid', gridTemplateColumns: '2fr 1fr auto', gap: '10px', alignItems: 'end' } },
        fieldWrap('متن آیتم', labelInput),
        fieldWrap('نوع آیتم', typeSelect),
        fieldWrap('الزامی', requiredCheck)
      );
      const parts = [head];

      if (f.type === 'scale') {
        const maxInput = el('input', { class: 'input', type: 'number', min: '1', max: String(SCALE_MAX_LIMIT), value: f.scaleMax ?? 3, style: { width: '110px' } });
        maxInput.addEventListener('input', () => { f.scaleMax = Number(maxInput.value); });
        const reverseCheck = el('input', { type: 'checkbox', checked: Boolean(f.reverse), onchange: (e) => { f.reverse = e.target.checked; rerender(); } });
        parts.push(el('div', { style: { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '10px', alignItems: 'end' } },
          fieldWrap('سقف نمره (۰ تا سقف)', maxInput, 'پاسخ عددی از ۰ تا سقف — برچسب هرگز/گاهی/اغلب/همیشه برای سقف ۳'),
          fieldWrap('آیتم معکوس (جملهٔ مثبت — نمره برعکس محاسبه می‌شود)', reverseCheck)
        ));
      }

      if (f.type === 'single') {
        const optsList = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '6px', margin: '6px 0' } });
        (f.scoredOptions ?? []).forEach((o, i) => {
          const labelIn = el('input', { class: 'input', type: 'text', value: o.label, placeholder: `برچسب گزینهٔ ${fa(i + 1)}`, style: { flex: '1', minWidth: '160px' } });
          labelIn.addEventListener('input', () => { o.label = labelIn.value; });
          const scoreIn = el('input', { class: 'input', type: 'number', min: '0', max: String(SCALE_MAX_LIMIT), value: o.score, style: { width: '90px' } });
          scoreIn.addEventListener('input', () => { o.score = Number(scoreIn.value); });
          optsList.appendChild(el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', background: 'var(--surface-2, #f7f3ea)', borderRadius: '10px', padding: '8px 10px' } },
            el('span', { class: 'cell-sub', style: { minWidth: '18px' } }, `${fa(i + 1)}.`),
            labelIn,
            fieldWrap('نمره', scoreIn),
            el('button', { class: 'btn btn--ghost btn--icon', title: 'حذف گزینه', onclick: () => { f.scoredOptions.splice(i, 1); rerender(); } }, icon('x', 14))
          ));
        });
        parts.push(el('div', {},
          el('div', { style: { fontWeight: '600', fontSize: '13px', margin: '8px 0 2px' } },
            `گزینه‌های نمره‌دار — نمرهٔ هر گزینه فقط برای جمع‌بندی بالینی است و به گیرنده نمایش داده نمی‌شود`),
          optsList,
          (f.scoredOptions?.length ?? 0) < FIELD_OPTIONS_MAX
            ? el('button', { class: 'btn btn--soft btn--sm', onclick: () => { f.scoredOptions.push({ label: '', score: (f.scoredOptions.length * 1) }); rerender(); } }, icon('plus', 14), 'گزینهٔ جدید')
            : null
        ));
      }

      if (f.type === 'select') {
        const optionsInput = el('input', { class: 'input', type: 'text', value: (f.options ?? []).join('، '), placeholder: 'گزینه‌ها را با ویرگول جدا کنید', style: { width: '100%' } });
        optionsInput.addEventListener('input', () => {
          f.options = optionsInput.value.split(/[,،]/).map((s) => s.trim()).filter(Boolean);
        });
        parts.push(fieldWrap('گزینه‌ها (بدون نمره — برای نمره‌دهی از «گزینه‌ای نمره‌دار» استفاده کنید)', optionsInput));
      }

      if (f.type === 'scale' || f.type === 'single') {
        const criticalCheck = el('input', { type: 'checkbox', checked: Boolean(f.critical), onchange: (e) => { f.critical = e.target.checked; rerender(); } });
        const critRow = [fieldWrap('آیتم بحرانی (خط قرمز بالینی — مستقل از جمع کل پرچم می‌زند)', criticalCheck)];
        if (f.critical) {
          const critMinInput = el('input', { class: 'input', type: 'number', min: '0', max: String(SCALE_MAX_LIMIT), value: f.criticalMin ?? itemMax(f), style: { width: '110px' } });
          critMinInput.addEventListener('input', () => { f.criticalMin = Number(critMinInput.value); });
          critRow.push(fieldWrap('آستانهٔ پرچم (نمرهٔ مؤثر ≥ این آستانه)', critMinInput));
        }
        parts.push(el('div', { style: { display: 'grid', gridTemplateColumns: f.critical ? '1fr auto' : '1fr', gap: '10px', alignItems: 'end' } }, ...critRow));
      }

      if (st.category === 'checklist' && (st.subscales ?? []).length > 0) {
        const subSelect = el('select', { class: 'input', style: { width: '100%' }, onchange: (e) => { f.subscaleId = e.target.value || null; } },
          el('option', { value: '', selected: !f.subscaleId }, 'بدون زیرمقیاس'),
          ...(st.subscales ?? []).map((s) => el('option', { value: s.id, selected: f.subscaleId === s.id }, s.name)));
        parts.push(fieldWrap('زیرمقیاس (نمرهٔ این آیتم در نمرهٔ همان زیرمقیاس جمع می‌شود)', subSelect));
      }

      slot.replaceChildren(el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, ...parts));
    }
    rerender();

    function submit(closeModal) {
      if (!v(f.label)) { toast('متن آیتم الزامی است', 'error'); return; }
      if (f.type === 'select' && (f.options ?? []).length < 2) { toast('فیلد گزینه‌ای حداقل به دو گزینه نیاز دارد', 'error'); return; }
      if (f.type === 'single') {
        const opts = (f.scoredOptions ?? []).filter((o) => v(o.label));
        if (opts.length < 2) { toast('آیتم گزینه‌ای نمره‌دار حداقل به دو گزینه نیاز دارد', 'error'); return; }
        f.scoredOptions = opts.map((o) => ({ label: v(o.label), score: Number(o.score) || 0 }));
      }
      if (f.type === 'scale') {
        const max = f.scaleMax === undefined || f.scaleMax === null ? 3 : Number(f.scaleMax);
        if (!Number.isFinite(max) || max < 1 || max > SCALE_MAX_LIMIT) { toast('سقف نمره باید عددی بین ۱ تا ۱۰ باشد', 'error'); return; }
        f.scaleMax = max;
      }
      if (f.critical && f.reverse) { toast('آیتم نمی‌تواند هم‌زمان معکوس و بحرانی باشد', 'error'); return; }
      if (!f.critical) delete f.criticalMin;
      onSave(f);
      closeModal();
    }
  }
}
