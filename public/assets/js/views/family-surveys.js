import { api } from '../api.js';
import { fa, formatJalaliDateTime } from '../format.js';
import { el, icon, openModal, confirmModal, toast, toastError, emptyState, errorState, skeletonState, collapseRemove, flashNode } from '../ui.js';
import { session } from '../state.js';
import { fetchAllStudents } from '../student-fetch.js';

/* ═══ ۱.۲۵.۶۰ — «نظرسنجی خانواده‌ها» — ماژول مستقل فقط-مدیر ═══
   خواست کارفرما: بخش نظرسنجی از «فرم‌ها و پرسش‌نامه‌ها» جدا شود، فقط برای مدیر دیده شود و
   دو فرم سیستمی ساخت‌یافته داشته باشد — «پایان دوره (ترخیص/اتمام جلسه‌ها)» و «حین درمان» —
   که از خانواده پر می‌شوند و نتیجه‌شان در شاخص‌های عملکردی مرکز (#/reports) می‌نشیند.
   هر خانواده لینک امن ۷روزهٔ خودش را می‌گیرد (بله/کپی)؛ پاسخ‌ها بی‌نام تجمیع می‌شوند و
   فقط متن پیشنهاد با نام خانواده می‌آید. */

const KIND_META = {
  discharge: { label: 'پایان دوره', hint: 'ترخیص و اتمام جلسه‌ها — تجربهٔ کل دوره', badge: 'badge--primary' },
  progress: { label: 'حین درمان', hint: 'میانهٔ دوره — نگاه کوتاه و سریع', badge: 'badge--accent' },
  general: { label: 'تاریخی', hint: 'نظرسنجی عمومی نسخه‌های پیشین', badge: 'badge--neutral' }
};

const SURVEY_STATUS = {
  pending_family: { label: 'در انتظار پاسخ', cls: 'badge--warning' },
  completed: { label: 'پاسخ داده شد', cls: 'badge--success' },
  cancelled: { label: 'لغو شده', cls: 'badge--neutral' },
  draft: { label: 'پیش‌نویس', cls: 'badge--neutral' }
};

function isManager() {
  return Boolean(session.user && session.user.role === 'manager');
}

const pct = (v) => (v === null || v === undefined ? null : `${fa(v)}٪`);
const avg = (arr) => (arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null);

export async function renderFamilySurveys(container) {
  if (!isManager()) {
    container.replaceChildren(emptyState({
      iconName: 'shield',
      title: 'دسترسی مجاز نیست',
      hint: '«نظرسنجی خانواده‌ها» فقط از دسترسی مدیر فعال است — ساخت، ارسال و لغو نظرسنجی و دیدن پاسخ‌ها همه منحصر به مدیر مرکز است.'
    }));
    return;
  }

  container.replaceChildren(skeletonState('table', 4));

  let surveys;
  try {
    surveys = await api.get('/api/case-events/surveys').then((r) => r.data ?? []);
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderFamilySurveys(container)));
    return;
  }

  const state = { surveys, kind: 'all', status: 'all' };
  const listZone = el('div', {});
  const summaryZone = el('div', {});

  const head = el('div', { class: 'page-head' },
    el('div', {},
      el('div', { class: 'page-head__title' }, 'نظرسنجی خانواده‌ها — کیفی مرکز و درمانگر'),
      el('div', { class: 'page-head__desc' },
        'دو فرم ساخت‌یافتهٔ سیستم: «پایان دوره» برای ترخیص و اتمام جلسه‌ها و «حین درمان» برای میانهٔ دوره. هر خانواده لینک امن اختصاصی می‌گیرد؛ پاسخ‌ها بی‌نام در شاخص‌های عملکردی مرکز (آمار دوره) می‌نشیند و فقط متن پیشنهاد با نام خانواده به شما می‌رسد.'
      )
    ),
    el('button', { class: 'btn btn--primary', onclick: () => openCreateModal() },
      icon('send', 16), 'نظرسنجی جدید')
  );

  const kindChip = (key, label) => el('button', {
    class: `chip ${state.kind === key ? 'is-active' : ''}`,
    type: 'button',
    'aria-pressed': String(state.kind === key),
    dataset: { chip: 'kind', val: key },
    style: { cursor: 'pointer' },
    onclick: () => { state.kind = key; paintChips(); paintList(); }
  }, label);
  const statusChip = (key, label) => el('button', {
    class: `chip ${state.status === key ? 'is-active' : ''}`,
    type: 'button',
    'aria-pressed': String(state.status === key),
    dataset: { chip: 'status', val: key },
    style: { cursor: 'pointer' },
    onclick: () => { state.status = key; paintChips(); paintList(); }
  }, label);

  const chips = el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '0 0 var(--sp-4)', alignItems: 'center' } },
    el('span', { class: 'cell-sub' }, 'فرم:'),
    kindChip('all', 'همه'),
    kindChip('discharge', 'پایان دوره'),
    kindChip('progress', 'حین درمان'),
    el('span', { style: { width: '12px' } }),
    el('span', { class: 'cell-sub' }, 'وضعیت:'),
    statusChip('all', 'همه'),
    statusChip('pending', 'در انتظار پاسخ'),
    statusChip('completed', 'پاسخ داده شد'),
    statusChip('cancelled', 'لغو/مهلت‌گذشته')
  );

  container.replaceChildren(head, summaryZone, chips, listZone);
  paintSummary();
  paintList();

  function matchesFilter(s) {
    const kindOk = state.kind === 'all' || s.kind === state.kind;
    const expired = s.status === 'pending_family' && s.fillExpiresAt && new Date(s.fillExpiresAt).getTime() < Date.now();
    const statusOk = state.status === 'all'
      || (state.status === 'pending' && s.status === 'pending_family' && !expired)
      || (state.status === 'completed' && s.status === 'completed')
      || (state.status === 'cancelled' && (s.status === 'cancelled' || expired));
    return kindOk && statusOk;
  }

  function paintSummary() {
    if (!summaryZone.isConnected) return;
    const all = state.surveys ?? [];
    const filled = all.filter((s) => s.status === 'completed');
    const pendingN = all.filter((s) => s.status === 'pending_family').length;
    const centerAvg = avg(filled.map((s) => s.centerScore).filter((x) => x !== null && x !== undefined));
    const therapistAvg = avg(filled.map((s) => s.therapistScore).filter((x) => x !== null && x !== undefined));
    const progressAvg = avg(filled.map((s) => s.progressScore).filter((x) => x !== null && x !== undefined));
    const npsVals = filled.map((s) => s.nps).filter((x) => x !== null && x !== undefined);
    const npsAvg = npsVals.length ? Math.round((npsVals.reduce((a, b) => a + b, 0) / npsVals.length) * 10) / 10 : null;
    const dischargeN = all.filter((s) => s.kind === 'discharge').length;
    const progressN = all.filter((s) => s.kind === 'progress').length;

    summaryZone.replaceChildren(
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', margin: '0 0 var(--sp-4)', alignItems: 'center' } },
        el('span', { class: 'badge badge--accent' }, `ارسال‌شده: ${fa(all.length)}`),
        el('span', { class: 'badge badge--warning' }, `در انتظار: ${fa(pendingN)}`),
        el('span', { class: 'badge badge--success' }, `پاسخ‌گرفته: ${fa(filled.length)}`),
        el('span', { class: 'badge badge--neutral' }, `پایان دوره: ${fa(dischargeN)} · حین درمان: ${fa(progressN)}`),
        centerAvg !== null ? el('span', { class: 'badge badge--info' }, `میانگین مرکز: ${fa(centerAvg)}٪`) : null,
        therapistAvg !== null ? el('span', { class: 'badge badge--info' }, `میانگین درمانگر: ${fa(therapistAvg)}٪`) : null,
        progressAvg !== null ? el('span', { class: 'badge badge--info' }, `پیشرفت از نگاه خانواده: ${fa(progressAvg)}٪`) : null,
        npsAvg !== null ? el('span', { class: 'badge badge--neutral' }, `توصیه به آشنایان: ${fa(npsAvg)} از ۱۰`) : null
      )
    );
  }

  function paintChips() {
    for (const b of chips.querySelectorAll('button.chip')) {
      const on = b.dataset.chip === 'kind' ? state.kind === b.dataset.val : state.status === b.dataset.val;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', String(on));
    }
  }

  function paintList() {
    if (!listZone.isConnected) return;
    paintSummary();
    const rows = (state.surveys ?? []).filter(matchesFilter);
    if (rows.length === 0) {
      listZone.replaceChildren(emptyState({
        iconName: 'clipboard',
        title: (state.surveys ?? []).length === 0 ? 'هنوز نظرسنجی‌ای ارسال نشده' : 'نظرسنجی‌ای در این فیلتر نیست',
        hint: (state.surveys ?? []).length === 0
          ? 'با «نظرسنجی جدید» از خانواده‌های فعال دعوت کنید — هر خانواده لینک امن ۷روزهٔ خودش را می‌گیرد و نتیجه در شاخص‌های عملکردی مرکز می‌نشیند.'
          : 'فیلتر فرم یا وضعیت را عوض کنید.'
      }));
      return;
    }
    listZone.replaceChildren(
      el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--sp-4)' } },
        ...rows.map((s) => surveyCard(s)))
    );
  }

  function surveyCard(s) {
    const st = SURVEY_STATUS[s.status] ?? { label: s.status, cls: 'badge--neutral' };
    const kind = KIND_META[s.kind] ?? KIND_META.general;
    const expired = s.status === 'pending_family' && s.fillExpiresAt && new Date(s.fillExpiresAt).getTime() < Date.now();
    const scoreBadges = s.status === 'completed'
      ? el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', margin: '6px 0 0' } },
          s.centerScore !== null && s.centerScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `مرکز: ${fa(s.centerScore)}٪`) : null,
          s.therapistScore !== null && s.therapistScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `درمانگر: ${fa(s.therapistScore)}٪`) : null,
          s.progressScore !== null && s.progressScore !== undefined ? el('span', { class: 'badge badge--neutral' }, `پیشرفت: ${fa(s.progressScore)}٪`) : null,
          s.nps !== null && s.nps !== undefined ? el('span', { class: 'badge badge--neutral' }, `توصیه: ${fa(s.nps)}/۱۰`) : null)
      : null;
    const note = s.note
      ? el('div', { class: 'cell-sub', style: { marginTop: '6px', whiteSpace: 'pre-wrap' } }, `«${s.note}»`)
      : null;
    return el('div', { class: 'card', dataset: { id: s.id }, style: { padding: 'var(--sp-3)', display: 'flex', flexDirection: 'column', gap: '6px' } },
      el('div', { style: { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } },
        el('b', { style: { flex: '1', minWidth: '0' } }, s.studentName || 'دانش‌آموز'),
        el('span', { class: `badge ${kind.badge}` }, kind.label),
        el('span', { class: `badge ${expired ? 'badge--error' : st.cls}` }, expired ? 'مهلت تمام شده' : st.label)
      ),
      el('div', { class: 'cell-sub' },
        s.typeTitle || '',
        s.therapistName ? ` · درمانگر مورد ارزیابی: ${s.therapistName}` : '',
        ` · ساخت: ${formatJalaliDateTime(s.createdAt)}`
      ),
      scoreBadges,
      note,
      el('div', { style: { display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: 'auto' } },
        s.status === 'completed'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: () => openDetailsModal(s) }, icon('info', 14), 'جزئیات پاسخ')
          : null,
        s.status === 'pending_family' && s.link
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async () => {
              try { await navigator.clipboard.writeText(s.link); toast('لینک فرم کپی شد — برای خانواده بفرستید'); }
              catch { toastError(new Error('کپی لینک ممکن نشد — مرورگر اجازه نداد')); }
            } }, icon('copy', 14), 'کپی لینک')
          : null,
        s.status === 'pending_family'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async (ev) => {
              const btn = ev.currentTarget;
              btn.disabled = true;
              try {
                const res = await api.post(`/api/case-events/${s.id}/send`, { audience: 'family' });
                toast(`برای ${fa(res.data?.sent ?? 0)} چت بله ارسال شد`);
                s.sentAt = new Date().toISOString();
                refresh();
              } catch (err) {
                toastError(err);
                btn.disabled = false;
              }
            } }, icon('send', 14), 'ارسال با بله')
          : null,
        s.status === 'pending_family'
          ? el('button', { class: 'btn btn--sm btn--soft', onclick: async () => {
              const ok = await confirmModal({ title: 'لغو نظرسنجی', message: `نظرسنجی «${s.studentName}» لغو شود؟ خانواده دیگر نمی‌تواند پاسخ دهد.`, confirmLabel: 'لغو نظرسنجی', danger: true });
              if (!ok) return;
              try {
                await api.post(`/api/case-events/${s.id}/cancel`, {});
                toast('نظرسنجی لغو شد');
                removeSurvey(s.id);
              } catch (err) { toastError(err); }
            } }, icon('x', 14), 'لغو')
          : null
      )
    );
  }

  function openDetailsModal(s) {
    const rows = [
      ['رضایت از مرکز', pct(s.centerScore)],
      ['رضایت از درمانگر', pct(s.therapistScore)],
      ['پیشرفت مشاهده‌شده', pct(s.progressScore)],
      ['احتمال توصیه (۰-۱۰)', s.nps === null || s.nps === undefined ? null : fa(s.nps)]
    ].filter(([, v]) => v !== null);
    openModal({
      title: `پاسخ نظرسنجی — ${s.studentName}`,
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        rows.length
          ? el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
              ...rows.map(([k, v]) => el('span', { class: 'badge badge--neutral' }, `${k}: ${v}`)))
          : el('div', { class: 'cell-sub' }, 'امتیاز زیرمقیاسی ثبت نشده است.'),
        el('div', { class: 'cell-sub' }, `فرم: ${s.typeTitle || KIND_META[s.kind]?.label || ''} · پاسخ: ${formatJalaliDateTime(s.sentAt ?? s.createdAt)}`),
        s.note
          ? el('div', { style: { background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-3)', whiteSpace: 'pre-wrap' } }, `«${s.note}»`)
          : el('div', { class: 'cell-sub' }, 'متن پیشنهادی ثبت نشده — پاسخ بی‌نام در شاخص‌های مرکز تجمیع شده است.')
      ),
      actions: []
    });
  }

  function removeSurvey(id) {
    state.surveys = state.surveys.filter((x) => x.id !== id);
    const old = listZone.querySelector(`[data-id="${CSS.escape(String(id))}"]`);
    if (old) collapseRemove(old);
    setTimeout(() => {
      if (listZone.isConnected) paintList();
    }, 320);
  }

  async function refresh({ flashId = null } = {}) {
    try {
      const res = await api.get('/api/case-events/surveys');
      state.surveys = res.data ?? [];
      paintList();
      if (flashId) {
        const fresh = listZone.querySelector(`[data-id="${CSS.escape(String(flashId))}"]`);
        if (fresh) flashNode(fresh);
      }
    } catch (err) {
      toastError(err);
    }
  }

  /* ─── ساخت نظرسنجی جدید: انتخاب فرم ساخت‌یافته + خانواده‌ها + درمانگر اختیاری ─── */
  async function openCreateModal() {
    let students = [];
    let staffList = [];
    listZone.replaceChildren(skeletonState('table', 3));
    try {
      [students, staffList] = await Promise.all([
        fetchAllStudents(),
        api.get('/api/staff').then((r) => r.data ?? []).catch(() => [])
      ]);
    } catch (err) {
      toastError(err);
      paintList();
      return;
    }
    if (students.length === 0) {
      toast('دانش‌آموز فعالی برای نظرسنجی نیست');
      paintList();
      return;
    }

    let kind = 'discharge';
    const checked = new Map(students.map((s) => [s.id, false]));
    const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'جستجوی نام دانش‌آموز…', style: { margin: '0 0 var(--sp-2)' } });
    const listWrap = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '4px', maxHeight: '280px', overflowY: 'auto', padding: '4px', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' } });
    const footNote = el('div', { class: 'cell-sub', style: { marginTop: '6px' } });
    const therapists = staffList.filter((x) => !x.role || x.role === 'therapist');
    const therapistSel = el('select', { class: 'input' },
      el('option', { value: '' }, '— درمانگر مورد ارزیابی (اختیاری) —'),
      ...therapists.map((t) => el('option', { value: t.id }, t.full_name ?? t.fullName ?? t.name ?? t.id))
    );

    const kindCard = (key, title, hint, minutes) => {
      const btn = el('button', {
        type: 'button',
        class: `card ${kind === key ? 'is-selected' : ''}`,
        style: { padding: 'var(--sp-3)', textAlign: 'right', cursor: 'pointer', border: kind === key ? '2px solid var(--brand)' : '1px solid var(--border)', flex: '1', minWidth: '0' },
        onclick: () => {
          kind = key;
          for (const b of kindRow.querySelectorAll('button.card')) {
            b.style.border = '1px solid var(--border)';
            b.classList.remove('is-selected');
          }
          btn.style.border = '2px solid var(--brand)';
          btn.classList.add('is-selected');
        }
      },
        el('div', { style: { display: 'flex', alignItems: 'center', gap: '6px' } },
          icon(key === 'discharge' ? 'medal' : 'activity', 15),
          el('b', { style: { fontSize: 'var(--fs-sm)' } }, title)),
        el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, `${hint} — حدود ${minutes} دقیقه`)
      );
      return btn;
    };
    const kindRow = el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      kindCard('discharge', 'پایان دوره', 'ترخیص و اتمام جلسه‌ها — تجربهٔ کل دوره + پیشرفت', '۴'),
      kindCard('progress', 'حین درمان', 'میانهٔ دوره — کوتاه‌تر برای نرخ پاسخ بالاتر', '۲')
    );

    const studentNameOf = (s) => {
      const nm = [s.firstName ?? s.first_name, s.lastName ?? s.last_name].filter(Boolean).join(' ').trim();
      return nm || s.fullName || s.full_name || s.name || s.id;
    };

    const rowOf = (s) => {
      const cb = el('input', { type: 'checkbox', checked: checked.get(s.id), style: { width: '17px', height: '17px', accentColor: 'var(--brand)', flex: 'none' } });
      cb.addEventListener('change', () => { checked.set(s.id, cb.checked); syncFooter(); });
      return el('label', { dataset: { sid: s.id }, style: { display: 'flex', alignItems: 'center', gap: '9px', padding: '7px 10px', background: 'var(--surface-2)', borderRadius: 'var(--radius-sm)', cursor: 'pointer' } },
        cb,
        el('span', { style: { flex: '1', minWidth: '0', fontSize: '13px' } }, studentNameOf(s))
      );
    };
    const paintStudentList = (q) => {
      const query = (q ?? '').trim();
      listWrap.replaceChildren(...students
        .filter((s) => !query || studentNameOf(s).includes(query))
        .map(rowOf));
    };
    searchInput.addEventListener('input', () => paintStudentList(searchInput.value));
    const syncFooter = () => {
      const n = [...checked.values()].filter(Boolean).length;
      footNote.textContent = n === 0 ? 'حداقل یک خانواده را انتخاب کنید' : `${fa(n)} خانواده انتخاب شده — هرکدام لینک امن ۷روزهٔ خودش را می‌گیرد.`;
      submitBtn.disabled = n === 0;
    };
    const submitBtn = el('button', { class: 'btn btn--primary', disabled: true, onclick: async () => {
      const ids = [...checked.entries()].filter(([, v]) => v).map(([k]) => k);
      submitBtn.disabled = true;
      try {
        const res = await api.post('/api/case-events/surveys', {
          student_ids: ids,
          therapist_id: therapistSel.value || null,
          kind
        });
        const createdN = res.data?.created?.length ?? 0;
        toast(`نظرسنجی «${kind === 'discharge' ? 'پایان دوره' : 'حین درمان'}» برای ${fa(createdN)} خانواده ساخته شد — لینک‌ها آمادهٔ کپی/ارسال‌اند`, 'success');
        shell.close();
        await refresh({ flashId: null });
      } catch (err) {
        toastError(err);
        submitBtn.disabled = false;
      }
    } }, icon('send', 15), 'ساخت و صدور لینک‌ها');

    const shell = openModal({
      title: 'نظرسنجی جدید از خانواده‌ها',
      wide: true,
      onClose: () => { if (listZone.isConnected && !listZone.querySelector('[data-id]')) paintList(); },
      body: el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' } },
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'فرم نظرسنجی — ساخت‌یافتهٔ سیستمی'),
          kindRow
        ),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, 'درمانگر مورد ارزیابی — اگر نظرسنجی دربارهٔ یک درمانگر خاص است انتخاب کنید'),
          therapistSel
        ),
        el('div', { class: 'field' },
          el('label', { class: 'field__label' }, `خانواده‌های هدف (${fa(students.length)} دانش‌آموز فعال) — هر خانواده یک نظرسنجی مستقل با لینک خودش می‌گیرد`),
          searchInput, listWrap, footNote
        )
      ),
      actions: [(closeShell) => submitBtn], /* قرارداد openModal: هر اکشن تابعی است که close می‌گیرد و گره می‌دهد — ریشهٔ باگ «باز نمی‌شد» ۱.۲۵.۵۹ */
    });
    paintStudentList('');
    syncFooter();
  }
}
