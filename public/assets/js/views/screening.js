import { api, qs } from '../api.js';
import {
  fa,
  tehranTodayYmd,
  tehranTimeOfIso, // برش UTC ساعت ثبت ۳/۵ ساعت عقب می‌افتاد
  addDaysYmd,
  formatJalaliShort,
  formatJalaliFull,
  iranianWeekdayOfYmd,
  toJalali,
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
  tabs,
  collapseRemove,
  flashNode,
  lockBtn
} from '../ui.js';
import { jalaliDateInput } from '../jalali-picker.js';
import { session } from '../state.js';

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

let state = {
  tab: 'daily',
  quick: '30',
  customFrom: '',
  customTo: '',
  search: '',
  tagFilter: [],
  editingId: null
};

let tabGen = 0; // — گارد نسل تب (الگوی router.js): پاسخِ دیرِ تب کهنه اجازه ندارد بدنهٔ تب تازه را بازنویسی کند

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

/* —— ۱.۲۳.۰ جریان پیوستهٔ تب «ثبت روزانه» (زبان ۱.۱۹–۱.۲۲):
   کارت ثبت‌کننده و کارت لیست یک‌بار مونت می‌شوند؛ ثبت جدید = درج ردیف در بالای
   لیست از بدنهٔ پاسخ (ORDER BY جدیدترین)، ویرایش = پچ همان ردیف، حذف = جمع‌شدن نرم —
   فوکوس input و ریتم تایپ زنجیره‌ای هرگز با اسکلت شکسته نمی‌شود. —— */
async function renderDailyTab(box, container, myGen) {
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
    if (myGen !== tabGen) return; // — تب عوض شده؛ خطای نسخهٔ مرده روی تب تازه نمی‌نشیند
    box.replaceChildren(errorState(err, () => renderDailyTab(box, container, ++tabGen)));
    return;
  }
  if (myGen !== tabGen) return; // — گارد نسل: کاربر حین دریافت، تب را عوض کرده — این مونت دور ریخته می‌شود

  let entries = [...(result.entries ?? [])]; // کش محلی — هر mutation همین‌جا هم به‌روز می‌شود
  const canEdit = session.user && ['manager', 'secretary'].includes(session.user.role);

  const composer = { toggles: new Set(), custom: new Set() };
  if (state.editingId) {
    const cur = entries.find((e) => e.id === state.editingId);
    if (cur) {
      for (const t of cur.tags) {
        if (KIND_BY_LABEL.has(t)) composer.toggles.add(t);
        else composer.custom.add(t);
      }
    } else {
      state.editingId = null;
    }
  }

  const input = el('input', {
    class: 'input input--xl',
    placeholder: state.editingId ? 'نام و فامیل…' : 'نام و فامیل دانش‌آموز… مثلاً: آوا محمدی #مهدکودک_ستاره',
    value: state.editingId ? (entries.find((e) => e.id === state.editingId) ?? {}).name ?? '' : '',
    'aria-label': 'نام و فامیل دانش‌آموز و برچسب‌های هشتگ‌دار'
  });

  const preview = el('div', { class: 'sanj-preview', style: { display: 'none' } });

  const drawPreview = () => {
    const parsed = parseEntryInput(input.value);
    const finalTags = mergeFinalTags(parsed, composer).slice(0, 12); // S3-06: پیش‌نمایش مثل قبل سقف ۱۲
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
      lockBtn(submitBtn, submit); // — همان قفل مشغولی دکمه ثبت؛ Enter با ضربه‌های پی‌سرپی کار مفتوح نمی‌سازد
    }
  });

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
    return out; // — بدون برش؛ سقف ۱۲ و هشدارش فقط در submit اعمال می‌شود (نه با هر ضربهٔ کلید در drawPreview)
  };

  const submitBtn = el('button', {
    class: 'btn btn--primary btn--lg',
    type: 'button',
    style: { width: '100%' },
    onclick: (e) => lockBtn(e.currentTarget, submit) // — قفل مشغولی واحد؛ تا پایان submit دکمه غیرفعال
  });

  const headTitle = el('div', { class: 'card__title' });

  const cancelBtn = el('button', {
    class: 'btn btn--ghost btn--sm',
    onclick: () => { exitEdit(); }
  }, 'انصراف');

  const syncComposerMode = () => {
    const editing = Boolean(state.editingId);
    const cur = editing ? entries.find((e) => e.id === state.editingId) : null;
    headTitle.textContent = editing ? `ویرایش: ${cur?.name ?? ''}` : 'ثبت سریع روز سنجش';
    submitBtn.replaceChildren(icon(editing ? 'check' : 'plus', 16), editing ? 'ذخیرهٔ تغییرات' : 'ثبت در روز سنجش');
    cancelBtn.style.display = editing ? '' : 'none';
    input.placeholder = editing ? 'نام و فامیل…' : 'نام و فامیل دانش‌آموز… مثلاً: آوا محمدی #مهدکودک_ستاره';
  };
  syncComposerMode();

  /* —— شِل لیست: سربرگ با شمارنده‌ها + ناحیهٔ ردیف‌ها؛ هر mutation همین‌جا درجا عوض می‌شود —— */
  const listCount = el('span', { class: 'cell-sub' });
  const rowsZone = el('div', { class: 'card__body' });

  const paintCounts = () => {
    const normalCount = entries.filter((e) => !hasPreTag(e.tags)).length;
    listCount.textContent = `${fa(normalCount)} عادی • ${fa(entries.length - normalCount)} ارجاع/خاص — جمع ${fa(entries.length)}`;
  };

  function rowEl(e) {
    return el('div', { class: 'sanj-row', dataset: { id: String(e.id) } },
      el('div', { class: 'sanj-row__main' },
        el('span', { class: 'cell-main' }, e.name),
        el('span', { class: 'cell-sub' },
          `${e.creatorName ?? '—'} • ${e.createdAt ? fa(tehranTimeOfIso(e.createdAt)) : ''}`) // ساعت تهران، نه برش UTC
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
          onclick: () => { enterEdit(e); }
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
              entries = entries.filter((x) => x.id !== e.id);
              if (state.editingId === e.id) exitEdit();
              const old = rowsZone.querySelector(`.sanj-row[data-id="${CSS.escape(String(e.id))}"]`);
              if (old) collapseRemove(old); else paintRows();
              paintCounts();
              /* الگوی ensureNonEmptyPaint: اگر لیست خالی شد، بعد از انیمیشن جمع‌شدن
                 حالت خالی درجای همان ناحیه رنگ بگیرد (ظرف .sanj-rows خالی نماند) */
              if (entries.length === 0) {
                setTimeout(() => {
                  if (rowsZone.isConnected && !rowsZone.querySelector('.sanj-row[data-id]')) paintRows();
                }, 480); // — بعد از پایان کامل انیمیشن جمع‌شدن (260ms) + حاشیهٔ امن
              }
            } catch (err) {
              toastError(err);
            }
          }
        }, icon('trash', 16))
      )
    );
  }

  function paintRows() {
    rowsZone.replaceChildren(
      ...(entries.length === 0
        ? [emptyState({
            iconName: 'student',
            title: 'امروز هنوز کسی ثبت نشده است',
            hint: 'نام و فامیل را در باکس بالا بنویسید و برچسب بزنید — تمام.'
          })]
        : [el('div', { class: 'sanj-rows' }, ...entries.map((e) => rowEl(e)))])
    );
  }

  const enterEdit = (e) => {
    state.editingId = e.id;
    input.value = e.name;
    composer.toggles.clear();
    composer.custom.clear();
    for (const t of e.tags) {
      if (KIND_BY_LABEL.has(t)) composer.toggles.add(t);
      else composer.custom.add(t);
    }
    drawChips();
    drawPreview();
    syncComposerMode();
    input.focus();
  };

  const exitEdit = () => {
    state.editingId = null;
    input.value = '';
    composer.toggles.clear();
    composer.custom.clear();
    drawChips();
    drawPreview();
    syncComposerMode();
    input.focus();
  };

  const submit = async () => {
    if (!canEdit) return;
    const parsed = parseEntryInput(input.value);
    const merged = mergeFinalTags(parsed, composer);
    if (!parsed.name) {
      toast('نام و فامیل را در باکس بنویسید', 'warning');
      input.focus();
      return;
    }
    if (merged.length > 12) toast('بیش از ۱۲ برچسب انتخاب شده — فقط ۱۲ مورد نخست ثبت می‌شود', 'warning'); /* S3-06 — یک‌بار در هر تلاش ثبت، نه با هر ضربهٔ کلید */
    const tags = merged.slice(0, 12);
    try {
      if (state.editingId) {
        const res = await api.patch(`/api/screening/${state.editingId}`, { name: parsed.name, tags });
        entries = entries.map((x) => (x.id === res.data.id ? res.data : x));
        paintCounts(); // — ویرایش می‌تواند عادی↔ارجاع را برعکس کند؛ شمارنده‌های سربرگ درجا
        const old = rowsZone.querySelector(`.sanj-row[data-id="${CSS.escape(String(res.data.id))}"]`);
        if (old) {
          const fresh = rowEl(res.data);
          old.replaceWith(fresh);
          flashNode(fresh);
        } else {
          paintRows();
        }
        toast('تغییرات ذخیره شد', 'success');
        exitEdit(); // — فوکوس برای ثبت بعدی سرجایش می‌ماند
        return;
      }
      if (entries.some((e) => e.name === parsed.name)) {
        toast(`«${parsed.name}» امروز قبلاً ثبت شده — برای تغییر برچسب‌ها از ویرایش استفاده کنید`, 'warning');
        return;
      }
      const res = await api.post('/api/screening', { name: parsed.name, tags, day: today });
      toast(
        tags.filter((t) => KIND_BY_LABEL.has(t)).length > 0
          ? `${parsed.name} با برچسب ثبت شد`
          : `${parsed.name} به‌عنوان «عادی» ثبت شد`,
        'success'
      );
      entries = [res.data, ...entries]; // سرور جدیدترین را اول برمی‌گرداند (created_at DESC)
      paintCounts();
      if (rowsZone.querySelector('.sanj-rows')) {
        const fresh = rowEl(res.data);
        rowsZone.querySelector('.sanj-rows').prepend(fresh);
        flashNode(fresh);
      } else {
        paintRows(); // اولین ثبت امروز — حالت خالی درجا لیست می‌شود
      }
      input.value = '';
      composer.toggles.clear();
      composer.custom.clear();
      drawChips();
      drawPreview();
      input.focus(); // ریتم ثبت زنجیره‌ای: باکس آمادهٔ نام بعدی است
    } catch (err) {
      toastError(err);
    }
  };

  const listCard = el('div', { class: 'card', style: { marginTop: 'var(--sp-4)' } },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'لیست روز سنجش امروز'),
      listCount
    ),
    rowsZone
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

  composerCard.classList.add('sanj-daily__composer');
  paintCounts();
  paintRows();
  box.replaceChildren(el('div', { class: 'sanj-daily' }, composerCard, listCard));
  if (state.editingId) input.focus();
}

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

/* —— ۱.۲۳.۰ تب گزارش/KPI: کارت فیلتر یک‌بار مونت می‌شود (چیپ‌ها/جستجو/تاریخ‌ها درجا sync می‌شوند)
   و فقط «ناحیهٔ نتایج» (KPI/نمودار/تفکیک/پیگیری/لیست) با هر تغییر فیلتر از نو ساخته می‌شود.
   هک بازگشت مکان‌نمای جستجو حذف شد — input دیگر بازسازی نمی‌شود. —— */
async function renderManagerTab(box, container, myGen) {
  box.replaceChildren(skeletonState('table', 6));

  const quickBtns = QUICKS.map((q) =>
    el('button', {
      type: 'button',
      class: `chip${state.quick === q.id ? ' is-active' : ''}`,
      'aria-pressed': String(state.quick === q.id), /* S3-05 */
      onclick: () => {
        if (state.quick === q.id) return;
        state.quick = q.id;
        syncQuickUI();
        customDates.style.display = state.quick === 'custom' ? '' : 'none';
        void refreshResults();
      }
    }, q.label)
  );

  const quickChips = el('div', { class: 'sanj-chips', role: 'group', 'aria-label': 'بازهٔ سریع' }, ...quickBtns);
  const syncQuickUI = () => {
    quickBtns.forEach((b, i) => {
      const on = state.quick === QUICKS[i].id;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };

  // بازهٔ دلخواه: همیشه در شِل هست، فقط وقتی «دلخواه» است دیده می‌شود
  const fromInput = jalaliDateInput({ value: state.customFrom, onChange: (v) => { state.customFrom = v || ''; } });
  const toInput = jalaliDateInput({ value: state.customTo, onChange: (v) => { state.customTo = v || ''; } });
  const customDates = el('div', { class: 'toolbar', style: { marginTop: 'var(--sp-3)', alignItems: 'flex-end', display: state.quick === 'custom' ? '' : 'none' } },
    el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'از تاریخ'), fromInput.root),
    el('label', { class: 'field' }, el('span', { class: 'cell-sub' }, 'تا تاریخ'), toInput.root),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => void refreshResults() }, icon('check', 15), 'اعمال')
  );

  const searchInput = el('input', {
    class: 'input',
    placeholder: 'جستجوی نام دانش‌آموز…',
    'aria-label': 'جستجوی نام دانش‌آموز', /* S3-09 */
    value: state.search,
    style: { maxWidth: '260px' }
  });
  let searchTimer = null;
  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      state.search = searchInput.value.trim();
      void refreshResults(); // — فقط ناحیهٔ نتایج؛ فوکوس همین input حفظ می‌شود
    }, 350);
  });

  let tagSummary;
  try {
    tagSummary = (await api.get('/api/screening/tags')).data;
  } catch {
    tagSummary = [];
  }
  if (myGen !== tabGen) return; // — گارد نسل تب: تب عوض شده؛ این مونت نباید بدنهٔ تازه را بازنویسی کند

  const customTags = tagSummary.filter((t) => !KIND_BY_LABEL.has(t.label)).slice(0, 12);

  /* F4: چیپ «همهٔ ارجاع‌ها» حالت فعال = همهٔ ارجاع‌های تخصصی در فیلتر باشند
     (همان معنای کلیک خودش: [] ↔ [...REFERRALS]) — تا syncTagUI بتواند sync کند */
  const allReferralsSelected = () => state.tagFilter.length > 0 && REFERRALS.every((t) => state.tagFilter.includes(t));

  const filterChips = [el('button', {
    type: 'button',
    'data-tag': '__all_referrals__', /* F4: لنگر sync — بدون این، syncTagUI این چیپ را نمی‌شناخت و منجمد می‌ماند */
    class: `chip${allReferralsSelected() ? ' is-active' : ''}`, /* S3-05: حالت فعال بصری هم می‌گیرد */
    'aria-pressed': String(allReferralsSelected()),
    onclick: () => {
      state.tagFilter = state.tagFilter.length > 0 ? [] : [...REFERRALS]; /* S3-05: کلیک دوباره، خنثی */
      syncTagUI();
      void refreshResults();
    }
  }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('alert', 13), 'نیازمند پیگیری (همهٔ ارجاع‌ها)')),
  ...PREDEFINED.map((t) =>
    el('button', {
      type: 'button',
      'data-tag': t.label,
      class: `chip${state.tagFilter.includes(t.label) ? ' is-active' : ''}`,
      'aria-pressed': state.tagFilter.includes(t.label) ? 'true' : 'false',
      onclick: () => {
        state.tagFilter.includes(t.label)
          ? state.tagFilter = state.tagFilter.filter((x) => x !== t.label)
          : state.tagFilter.push(t.label);
        syncTagUI();
        void refreshResults();
      }
    }, t.label)
  ),
  ...customTags.map((t) =>
    el('button', {
      type: 'button',
      'data-tag': t.label,
      class: `chip${state.tagFilter.includes(t.label) ? ' is-active' : ''}`, /* S3-05 */
      'aria-pressed': state.tagFilter.includes(t.label) ? 'true' : 'false',
      onclick: () => {
        state.tagFilter.includes(t.label)
          ? state.tagFilter = state.tagFilter.filter((x) => x !== t.label)
          : state.tagFilter.push(t.label);
        syncTagUI();
        void refreshResults();
      }
    }, '# ', t.label)
  )];

  const clearChip = el('button', {
    type: 'button',
    class: 'chip',
    style: { display: state.tagFilter.length > 0 ? '' : 'none' },
    onclick: () => { state.tagFilter = []; syncTagUI(); void refreshResults(); }
  }, el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px' } }, icon('x', 12), 'پاک‌کردن فیلتر برچسب‌ها'));

  const syncTagUI = () => {
    for (const b of [...filterChips, clearChip]) {
      const label = b.getAttribute('data-tag');
      if (!label) continue;
      const on = label === '__all_referrals__' ? allReferralsSelected() : state.tagFilter.includes(label); /* F4: سنتی‌نل همهٔ ارجاع‌ها */
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
    clearChip.style.display = state.tagFilter.length > 0 ? '' : 'none';
  };

  const tagFilterChips = el('div', { class: 'sanj-chips', role: 'group', 'aria-label': 'فیلتر پیگیری' }, ...filterChips, clearChip);

  const filterSub = el('span', { class: 'cell-sub' });
  const filterCard = el('div', { class: 'card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, 'فیلتر گزارش'),
      filterSub
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

  const resultsZone = el('div', {});

  let resultsGen = 0; // — گارد نسل نتایج (الگوی students.js): پاسخ فیلتر کهنه نباید زیر چیپ‌های تازه رنگ بگیرد
  async function refreshResults() {
    const myGen = ++resultsGen;
    const range = quickRange(state.quick, state.customFrom, state.customTo);
    filterSub.replaceChildren(range.from ? `${formatJalaliShort(range.from)} تا ${formatJalaliShort(range.to)}` : 'همهٔ روزها');
    if (range.from) filterSub.title = formatJalaliFull(range.from); else filterSub.removeAttribute('title');

    resultsZone.replaceChildren(skeletonState('table', 6));
    let result;
    try {
      result = (await api.get(`/api/screening${qs({
        from: range.from || undefined,
        to: range.to || undefined,
        q: state.search || undefined,
        tag: state.tagFilter.length ? state.tagFilter.join(',') : undefined
      })}`)).data;
    } catch (err) {
      if (myGen !== resultsGen) return; // — فیلتر عوض شده؛ خطای نسخهٔ مرده رنگ نگیرد
      resultsZone.replaceChildren(errorState(err, () => void refreshResults()));
      return;
    }
    if (myGen !== resultsGen || !resultsZone.isConnected) return; // — پاسخ کهنه یا ناحیه از DOM خارج — دور بریز
    const { entries, stats } = result;

    const kpis = el('div', { style: { marginTop: 'var(--sp-4)' } },
      el('div', { class: 'kpi-grid' },
      sanjKpi('کل سنجش‌های بازه', fa(stats.total), stats.total ? `عادی ${fa(stats.normal)} از کل` : 'بدون داده', 'primary'),
      sanjKpi('عادی (بدون ارجاع و خاص)', fa(stats.normal), stats.total ? `٪${fa(Math.round((stats.normal / stats.total) * 100))} از کل` : '—', 'success'),
      sanjKpi('ارجاع تخصصی', fa(stats.referrals), stats.total ? `نرخ ارجاع ٪${fa(stats.referralRate)}` : '—', stats.referrals > 0 ? 'error' : 'neutral'),
      sanjKpi('موارد خاص', fa(stats.noCoop + stats.noReg), `عدم همکاری ${fa(stats.noCoop)} • بی‌ثبت‌نام ${fa(stats.noReg)}`, 'accent')
      ),
      el('p', { class: 'sanj-hint', style: { margin: '8px 4px 0', lineHeight: 'var(--lh-relaxed)' } },
        'تعریف «عادی»: بدون برچسب ارجاع تخصصی (بینایی، شنوایی، هوش، جسمی‌حرکتی) و بدون موارد خاص (عدم همکاری، نداشتن ثبت‌نام) — برچسب کارمند سنجش‌گر و مهدکودک مبدأ «عادی» را تغییر نمی‌دهد.'
      )
    );

    const chartCard = buildChartCard(stats.byDay);

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
                el('div', { class: 'sanj-row' },
                  el('div', { class: 'sanj-row__main' },
                    el('span', { class: 'cell-main' }, e.name),
                    el('span', { class: 'cell-sub' }, formatJalaliShort(e.day))
                  ),
                  el('div', { class: 'sanj-row__tags' },
                    e.tags.filter((t) => REFERRALS.includes(t)).map((t) => tagBadge(t))
                  ),
                  el('div', { class: 'sanj-row__actions' },
                    el('button', {
                      class: 'btn btn--soft btn--sm',
                      title: 'ثبت این نوآموز در لیست انتظار مرکز (نام خودکار پر می‌شود)',
                      onclick: () => { location.hash = `#/waitlist?prefill=${encodeURIComponent(e.name)}`; } // — ماژول مستقل
                    }, icon('plus', 13), 'ثبت در لیست انتظار')
                  )
                )
              )
            )
      )
    );

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

    resultsZone.replaceChildren(kpis, chartCard, breakdownCard, followCard, listCard);
  }

  box.replaceChildren(filterCard, resultsZone);
  await refreshResults();
}

function sanjKpi(label, value, hint, tone) {
  return el('div', { class: `kpi kpi--${tone}` }, // data-tone قاعدهٔ CSS نداشت؛ الگوی finance.js
    el('div', { class: 'kpi__value' }, value),
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
      el('span', { class: 'cell-sub' }, 'بازهٔ ۱۴ روز اخیر')
    ),
    el('div', { class: 'card__body' },
      el('div', { class: 'sanj-chart' },
        ...cols.map((c) =>
          el('div', { class: 'sanj-chart__col', 'aria-label': `${formatJalaliFull(c.day)} — ${fa(c.count)} سنجش`, role: 'img' },
            el('span', { class: 'sanj-chart__label' }, c.count > 0 ? fa(c.count) : ''),
            // C13: صفر واقعی = نقطهٔ پایهٔ کم‌رنگ
            c.count === 0
              ? el('div', { class: 'sanj-chart__bar', style: { height: '3px', opacity: '.35' } })
              : el('div', { class: 'sanj-chart__bar', style: { height: `${Math.max(3, (c.count / max) * 72)}px` } }),
            el('span', { class: 'sanj-chart__label' }, fa(toJalali(...c.day.split('-').map(Number)).jd)) // — روز شمسی، هم‌خوان با aria-label خود ستون
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
    const myGen = ++tabGen; // — هر تعویض تب یک نسل تازه؛ رندر تب کهنه بعد از awaitهایش دور ریخته می‌شود
    if (key === 'daily') void renderDailyTab(body, container, myGen);
    else void renderManagerTab(body, container, myGen);
  }

  container.replaceChildren(head, tabbar.root, el('div', { style: { marginTop: 'var(--sp-4)' } }, body));
  draw(state.tab);
}

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
    body.replaceChildren(el('div', { class: 'cell-sub' }, 'بارگذاری فهرست سنجش ناموفق بود'));
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
            el('span', { class: 'cell-sub' }, `${e.creatorName ?? '—'} • ${e.createdAt ? fa(tehranTimeOfIso(e.createdAt)) : ''}`) // ساعت تهران، نه برش UTC
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
