// games-console.js — میز حلقهٔ درمانگر بازی‌ها (۱.۲۵.۲۴)
// حلقهٔ کامل «تجویز → مأموریت → لینک → پیگیری → گزارش» یکی‌جا؛
// دو سطح استفاده: نمای «بازی‌ها» (#/games) و تب «بازی‌ها» پروفایل کودک.
// هیچ کلید پاسخی این‌جا نیست — نمره‌دهی همیشه سمت سرور است.
import { api, getToken, getDevStaffId } from './api.js';
import { fa, formatJalaliDateTime, tehranTodayYmd } from './format.js';
import {
  el, icon, toast, toastError, lockBtn, openModal, confirmModal, formModal,
  dataTable, skeletonState, errorState, kpi, rowMenu
} from './ui.js';
import qrcode from 'qrcode-generator';

// ─── واژه‌نامه ───
const RX_STATUS = {
  active: { label: 'فعال', cls: 'badge--success' },
  paused: { label: 'متوقف موقت', cls: 'badge--warning' },
  stopped: { label: 'متوقف', cls: 'badge--error' },
  completed: { label: 'تمام‌شده', cls: 'badge--neutral' }
};
const MISSION_STATUS = {
  pending: { label: 'در انتظار', cls: 'badge--warning' },
  in_progress: { label: 'در حال اجرا', cls: 'badge--accent' },
  done: { label: 'انجام شد', cls: 'badge--success' },
  expired: { label: 'منقضی', cls: 'badge--neutral' }
};
const VALIDITY = {
  valid: { label: 'معتبر', cls: 'badge--success' },
  partial: { label: 'ناقص', cls: 'badge--warning' },
  invalid: { label: 'نامعتبر', cls: 'badge--error' }
};
const QUALITY = {
  explainable: { label: 'قابل اتکا', cls: 'badge--success' },
  needs_caution: { label: 'نیازمند احتیاط', cls: 'badge--warning' },
  incomplete_or_invalid: { label: 'ناقص/نامعتبر', cls: 'badge--error' }
};
const PURPOSE_LABEL = { training: 'تمرین', assessment: 'ارزیابی' };
// پالت دفترچهٔ وظیفه — برای نمودار (SVG attribute، نه CSS)
const CHART_COLORS = {
  correct_go_pct: '#438C89',
  correct_nogo_pct: '#153E50',
  commission_pct: '#E4AA46',
  omission_pct: '#B4552D'
};
const DOSE_KEYS = [
  { key: 'days_per_week', label: 'روز در هفته', min: 1, max: 7 },
  { key: 'minutes', label: 'دقیقه در جلسه', min: 1, max: 120 },
  { key: 'max_missions_per_day', label: 'حداکثر مأموریت در روز', min: 1, max: 10 },
  { key: 'min_weeks', label: 'حداقل هفته', min: 1, max: 52 }
];

function badge(label, cls) {
  return el('span', { class: `badge ${cls ?? 'badge--neutral'}` }, label);
}

// ─── جستجوی کودک (الگوی shared — یک ورودی، نتیجهٔ زنده) ───
export function childSearchField({ onPick, placeholder = 'نام یا کد ملی کودک…', ariaLabel = 'جستجوی کودک' }) {
  const input = el('input', { class: 'input', type: 'search', placeholder, 'aria-label': ariaLabel, autocomplete: 'off' });
  const results = el('div', {
    style: { position: 'absolute', zIndex: '30', top: '100%', right: '0', left: '0', display: 'none' },
    class: 'card'
  });
  const wrap = el('div', { style: { position: 'relative', minWidth: '220px', flex: '1', maxWidth: '340px' } }, input, results);
  let timer = null;
  let seq = 0;
  async function search(q) {
    const ticket = ++seq;
    results.style.display = 'block';
    results.replaceChildren(el('p', { class: 'cell-sub', style: { padding: '8px 10px' } }, 'در حال جستجو…'));
    try {
      const res = await api.get(`/api/students?q=${encodeURIComponent(q)}&page=1&pageSize=8`);
      if (ticket !== seq) return; // پاسخ کهنه — کاربر جلوتر رفته
      const items = res.data?.items ?? res.data ?? [];
      if (!items.length) {
        results.replaceChildren(el('p', { class: 'cell-sub', style: { padding: '8px 10px' } }, 'چیزی پیدا نشد — با بخشی از نام یا کد ملی جستجو کنید.'));
        return;
      }
      results.replaceChildren(...items.map((s) => {
        const name = [s.firstName, s.lastName].filter(Boolean).join(' ') || '—';
        return el('button', {
          class: 'btn btn--soft btn--sm',
          type: 'button',
          style: { justifyContent: 'flex-start', width: '100%', border: 'none', boxShadow: 'none' },
          onclick: () => {
            results.style.display = 'none';
            input.value = name;
            onPick(s);
          }
        }, name, el('span', { class: 'cell-sub' }, s.code ?? s.id?.slice(0, 8) ?? ''));
      }));
    } catch (err) {
      if (ticket === seq) results.replaceChildren(el('p', { class: 'cell-sub', style: { padding: '8px 10px' } }, err.message ?? 'خطا در جستجو'));
    }
  }
  input.addEventListener('input', () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { results.style.display = 'none'; return; }
    timer = setTimeout(() => search(q), 300);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') results.style.display = 'none'; });
  document.addEventListener('click', (e) => { if (!wrap.contains(e.target)) results.style.display = 'none'; });
  return { root: wrap, input };
}

// ─── بارگیری بسته‌ها و هدف‌ها (کش در سطح فراخوانی) ───
async function loadCatalog() {
  const [pkgs, goals] = await Promise.all([
    api.get('/api/games/packages').then((r) => r.data ?? []),
    api.get('/api/games/goals').then((r) => r.data ?? [])
  ]);
  return { pkgs, goals };
}

function doseSummary(dose) {
  if (!dose) return 'پیش‌فرض بسته';
  const parts = [];
  if (dose.days_per_week) parts.push(`${fa(dose.days_per_week)} روز/هفته`);
  if (dose.minutes) parts.push(`${fa(dose.minutes)} دقیقه`);
  if (dose.max_missions_per_day) parts.push(`سقف ${fa(dose.max_missions_per_day)}/روز`);
  return parts.join(' · ');
}

// ─── مودال انتخاب کودک (گام پیش از تجویز وقتی کودک معلوم نیست) ───
function openChildPickModal({ onPicked }) {
  let picked = null;
  let picker;
  const hint = el('p', { class: 'hint-text' }, 'کودک موردنظر را جستجو و انتخاب کنید.');
  const body = el('div', {}, hint, (picker = childSearchField({
    onPick: (s) => { picked = s; }
  })).root);
  openModal({
    title: 'تجویز تازه — انتخاب کودک',
    body,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'انصراف'),
      (close) => {
        const btn = el('button', { class: 'btn btn--primary', type: 'button' }, 'ادامه');
        btn.addEventListener('click', () => {
          if (!picked) { toast('ابتدا یک کودک را از نتایج جستجو انتخاب کنید.', 'warning'); return; }
          const child = picked;
          close();
          onPicked(child);
        });
        return btn;
      }
    ]
  });
}

// ─── مودال تجویز تازه ───
export function prescribeModal({ childId, childName, onCreated }) {
  openChildPickGate(childId, async (resolved) => {
    let catalog;
    try {
      catalog = await loadCatalog();
    } catch (err) {
      toastError(err);
      return;
    }
    const published = catalog.pkgs.filter((p) => p.status === 'published');
    if (!published.length) {
      toast('هنوز بستهٔ منتشرشده‌ای وجود ندارد — ابتدا بسته را منتشر کنید.', 'warning');
      return;
    }
    published.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.version < b.version ? 1 : -1));
    const pkgOptions = published.map((p) => ({
      value: `${p.id}@${p.version}`,
      label: `${p.titleFa || p.id} — نسخهٔ ${fa(p.version)}`
    }));
    const goalsOf = (pkgId) => catalog.goals.filter((g) => g.package_id === pkgId);
    const defaultPkg = published[0];
    const goalOptionsOf = (pkgId) => goalsOf(pkgId).map((g) => ({ value: g.id, label: g.title_fa || g.id }));

    formModal({
      title: `تجویز تازه — ${resolved.childName ?? 'کودک'}`,
      wide: true,
      submitLabel: 'ثبت تجویز',
      fields: [
        { type: 'heading', label: `کودک: ${resolved.childName ?? resolved.childId}` },
        {
          name: 'package', label: 'بستهٔ بازی (فقط منتشرشده)', type: 'select', required: true,
          options: pkgOptions, value: pkgOptions[0]?.value,
          hint: 'هر نسخهٔ بسته یک مدخل جداگانه است — تجویز به همان نسخه قفل می‌شود.',
          onChange: (val, inputs) => {
            const pkgId = String(val).split('@')[0];
            const goalSel = inputs?.goal;
            if (!goalSel) return;
            const opts = goalOptionsOf(pkgId);
            goalSel.replaceChildren(
              el('option', { value: '' }, 'انتخاب کنید'),
              ...opts.map((o) => el('option', { value: o.value }, o.label))
            );
            goalSel.value = '';
          }
        },
        { name: 'goal', label: 'هدف درمانی', type: 'select', required: true, options: goalOptionsOf(defaultPkg.id), placeholder: 'انتخاب کنید' },
        { type: 'heading', label: 'دوز — اختیاری (خالی = پیش‌فرض بسته)' },
        ...DOSE_KEYS.map((d) => ({
          name: d.key, label: d.label, type: 'number', min: d.min, max: d.max,
          placeholder: String(defaultPkg.dose?.[d.key] ?? ''),
          hint: d.key === 'max_missions_per_day' ? 'سقف روزانه سمت سرور هم اعمال می‌شود.' : null
        }))
      ],
      onSubmit: async (values) => {
        const [packageId, packageVersion] = String(values.package).split('@');
        const override = {};
        for (const d of DOSE_KEYS) {
          const raw = values[d.key];
          if (raw === '' || raw == null) continue;
          const n = Number(raw);
          if (!Number.isFinite(n) || n < d.min || n > d.max) throw new Error(`«${d.label}» باید بین ${fa(d.min)} و ${fa(d.max)} باشد.`);
          override[d.key] = n;
        }
        const res = await api.post('/api/games/prescriptions', {
          child_id: resolved.childId,
          package_id: packageId,
          package_version: packageVersion,
          goal_id: values.goal,
          dose_override: Object.keys(override).length ? override : null,
          suggested_by: 'therapist'
        });
        toast('تجویز ثبت شد — اکنون مأموریت اول را زمان‌بندی کنید.', 'success');
        const rx = res.data;
        if (onCreated) onCreated(rx);
        missionsModal(rx, { childName: resolved.childName ?? '', onChanged: onCreated ? () => onCreated(rx) : undefined });
      }
    });
  });
}

/** اگر childId معلوم بود همان را می‌دهد؛ وگرنه گام انتخاب کودک باز می‌شود */
function openChildPickGate(childId, run) {
  if (childId) {
    run({ childId, childName: null });
    return;
  }
  openChildPickModal({
    onPicked: (s) => run({ childId: s.id, childName: [s.firstName, s.lastName].filter(Boolean).join(' ') })
  });
}

// ─── مودال مأموریت‌های یک تجویز ───
export async function missionsModal(rx, { childName = '', onChanged } = {}) {
  const bodyEl = el('div', {});
  openModal({
    title: 'مأموریت‌ها',
    wide: true,
    body: bodyEl,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'بستن')
    ]
  });
  bodyEl.replaceChildren(skeletonState('table', 4));

  async function refresh() {
    let missions;
    try {
      missions = (await api.get(`/api/games/missions?prescription_id=${encodeURIComponent(rx.id)}`)).data ?? [];
    } catch (err) {
      bodyEl.replaceChildren(errorState(err, refresh));
      return;
    }
    bodyEl.replaceChildren(renderMissionsBody(rx, missions, { childName, onChanged: refresh }));
    onChanged?.(); // شمارنده‌های فهرست پشتِ مودال هم هم‌قدم بمانند
  }
  await refresh();
}

function renderMissionsBody(rx, missions, { childName, onChanged }) {
  const head = el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '10px' } },
    childName ? el('b', {}, childName) : null,
    el('span', { class: 'badge badge--neutral' }, `${rx.packageId} · نسخهٔ ${fa(rx.packageVersion)}`),
    rx.goalId ? el('span', { class: 'cell-sub' }, `هدف: ${rx.goalTitleFa ?? rx.goalId}`) : null,
    el('span', { class: 'cell-sub' }, doseSummary(rx.doseOverride)),
    el('span', { style: { flex: '1' } }),
    rx.status === 'active'
      ? el('button', {
          class: 'btn btn--primary btn--sm', type: 'button',
          onclick: (e) => lockBtn(e.currentTarget, () => openMissionForm(rx, onChanged))
        }, icon('plus', 14), 'مأموریت تازه')
      : badge('تجویز فعال نیست — مأموریت تازه نمی‌گیرد', 'badge--warning')
  );
  const table = dataTable({
    columns: [
      { label: 'مأموریت', render: (m) => el('b', {}, m.title ?? m.missionRef) },
      { label: 'تاریخ', render: (m) => fa(m.scheduledFor) },
      { label: 'وضعیت', render: (m) => {
          const st = MISSION_STATUS[m.status] ?? { label: m.status, cls: 'badge--neutral' };
          return badge(st.label, st.cls);
        } },
      { label: 'لینک زنده', render: (m) => {
          if (!m.link) return el('span', { class: 'cell-sub' }, '—');
          return el('span', { style: { display: 'inline-flex', gap: '6px', alignItems: 'center' } },
            icon('link', 13),
            el('span', { class: 'cell-sub' }, `تا ${formatJalaliDateTime(m.link.expiresAt)}`),
            el('button', {
              class: 'btn btn--ghost btn--sm', type: 'button', title: 'ابطال لینک زنده',
              'aria-label': 'ابطال لینک',
              onclick: (e) => lockBtn(e.currentTarget, async () => {
                const ok = await confirmModal({
                  title: 'ابطال لینک',
                  message: 'لینک زندهٔ این مأموریت بی‌اثر می‌شود؛ اگر والد هنوز بازی را باز نکرده، باید لینک تازه صادر کنید.',
                  confirmLabel: 'ابطال', danger: true
                });
                if (!ok) return;
                try {
                  await api.post(`/api/games/links/${encodeURIComponent(m.link.jti)}/revoke`, {});
                  toast('لینک باطل شد.', 'success');
                  onChanged?.();
                } catch (err) { toastError(err); }
              })
            }, icon('x', 13))
          );
        } },
      { label: '', render: (m) => {
          if (m.status !== 'pending') return el('span', { class: 'cell-sub' }, '—');
          return el('button', {
            class: 'btn btn--soft btn--sm', type: 'button',
            onclick: (e) => lockBtn(e.currentTarget, () => openLinkIssue(m, onChanged))
          }, icon('link', 13), 'صدور لینک');
        } }
    ],
    rows: missions,
    empty: { iconName: 'gamepad', title: 'هنوز مأموریتی زمان‌بندی نشده', hint: 'با «مأموریت تازه» روزِ اول را تعیین کنید و لینک کودک را صادر کنید.' }
  });
  return el('div', {}, head, table);
}

function openMissionForm(rx, onChanged) {
  (async () => {
    let pkg;
    try {
      const pkgs = (await api.get('/api/games/packages')).data ?? [];
      pkg = pkgs.find((p) => p.id === rx.packageId && p.version === rx.packageVersion);
    } catch (err) {
      toastError(err);
      return;
    }
    const missions = pkg?.body?.missions ?? [];
    if (!missions.length) { toast('بستهٔ این تجویز مأموریتی ندارد.', 'warning'); return; }
    formModal({
      title: 'مأموریت تازه',
      submitLabel: 'زمان‌بندی',
      fields: [
        {
          name: 'mission_ref', label: 'مأموریت', type: 'select', required: true, placeholder: 'انتخاب کنید',
          options: missions.map((m) => ({ value: m.id, label: `${m.title ?? m.id} (${fa(m.items?.length ?? 0)} آزمون)` }))
        },
        {
          name: 'scheduled_for', label: 'تاریخ اجرا', type: 'jalali-date', required: true, value: tehranTodayYmd(),
          hint: 'لینک کودک تا پایان همین روز و حداکثر ۱۲ ساعت اعتبار دارد.'
        }
      ],
      onSubmit: async (values) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(values.scheduled_for)) throw new Error('تاریخ نامعتبر است.');
        await api.post('/api/games/missions', {
          prescription_id: rx.id, mission_ref: values.mission_ref, scheduled_for: values.scheduled_for
        });
        toast('مأموریت زمان‌بندی شد — اکنون لینک کودک را صادر کنید.', 'success');
        onChanged?.();
      }
    });
  })();
}

// ─── صدور لینک + QR + کپی + ابطال ───
async function openLinkIssue(mission, onChanged) {
  let out;
  try {
    out = (await api.post(`/api/games/missions/${encodeURIComponent(mission.id)}/link`, {})).data;
  } catch (err) {
    toastError(err);
    return;
  }
  const urlInput = el('input', {
    class: 'input', type: 'text', value: out.url, readonly: true, dir: 'ltr',
    style: { fontFamily: 'monospace', fontSize: '12px', width: '100%' }, 'aria-label': 'نشانی لینک کودک',
    onclick: (e) => e.currentTarget.select()
  });
  const qrBox = el('div', {
    style: { display: 'flex', justifyContent: 'center', padding: '10px', background: '#fff', borderRadius: '10px', border: '1px solid var(--surface-3)' },
    'aria-hidden': 'true'
  });
  try {
    const qr = qrcode(0, 'M');
    qr.addData(out.url);
    qr.make();
    const svgText = qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml');
    const svgEl = doc.documentElement;
    svgEl.setAttribute('width', '168');
    svgEl.setAttribute('height', '168');
    qrBox.replaceChildren(svgEl);
  } catch { /* QR ناموفق — جعبه خالی می‌ماند؛ کپی متن کافی است */ }

  const copyBtn = el('button', { class: 'btn btn--soft btn--sm', type: 'button' }, icon('copy', 14), 'کپی نشانی');
  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(out.url);
      toast('نشانی کپی شد.', 'success');
    } catch {
      urlInput.select();
      document.execCommand('copy');
      toast('نشانی کپی شد.', 'success');
    }
  });

  openModal({
    title: `لینک کودک — ${mission.title ?? mission.missionRef}`,
    body: el('div', { style: { display: 'grid', gap: '12px' } },
      qrBox,
      urlInput,
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' } },
        copyBtn,
        el('span', { class: 'cell-sub' }, `اعتبار تا ${formatJalaliDateTime(out.expiresAt)}`)
      ),
      el('p', { class: 'hint-text' },
        'این نشانی را فقط با والد/کودک همان جلسه در میان بگذارید؛ پس از انقضا یا ابطال بی‌اثر می‌شود و هیچ نسخهٔ ذخیره‌شده‌ای از خودِ نشانی نگه داشته نمی‌شود.')
    ),
    actions: [
      (close) => {
        const btn = el('button', { class: 'btn btn--ghost', type: 'button', style: { color: 'var(--danger)' } }, 'ابطال لینک');
        btn.addEventListener('click', async () => {
          const ok = await confirmModal({
            title: 'ابطال لینک',
            message: 'لینک بی‌اثر می‌شود؛ در صورت نیاز لینک تازه صادر کنید.',
            confirmLabel: 'ابطال', danger: true
          });
          if (!ok) return;
          try {
            await api.post(`/api/games/links/${encodeURIComponent(out.jti)}/revoke`, {});
            toast('لینک باطل شد.', 'success');
            close();
            onChanged?.();
          } catch (err) { toastError(err); }
        });
        return btn;
      },
      (close) => el('button', { class: 'btn btn--primary', type: 'button', onclick: close }, 'پایان')
    ]
  });
  onChanged?.(); // لینک زندهٔ تازه در جدول هم بازتاب شود
}

// ─── پنل فهرست تجویزها (میز درمانگر) ───
export function renderRxPanel(container, { childId = null, childName = '', embedded = false } = {}) {
  const state = { childId, childName, status: '' };
  let listWrap;
  let prescribeBtn;
  const statusSel = el('select', { class: 'select', style: { maxWidth: '170px' }, 'aria-label': 'فیلتر وضعیت' },
    el('option', { value: '' }, 'همهٔ وضعیت‌ها'),
    ...Object.entries(RX_STATUS).map(([k, v]) => el('option', { value: k }, v.label))
  );
  statusSel.addEventListener('change', () => { state.status = statusSel.value; refresh(); });

  prescribeBtn = el('button', {
    class: 'btn btn--primary btn--sm', type: 'button',
    onclick: (e) => lockBtn(e.currentTarget, () => prescribeModal({
      childId: state.childId,
      childName: state.childName,
      onCreated: () => refresh()
    }))
  }, icon('plus', 14), 'تجویز تازه');

  const childArea = embedded
    ? el('span', { class: 'badge badge--accent' }, `کودک: ${childName || '—'}`)
    : (() => {
        const picker = childSearchField({
          onPick: (s) => {
            state.childId = s.id;
            state.childName = [s.firstName, s.lastName].filter(Boolean).join(' ');
          },
          placeholder: 'فیلتر کودک — نام یا کد ملی…',
          ariaLabel: 'فیلتر کودک'
        });
        picker.input.addEventListener('change', () => { if (!picker.input.value.trim()) { state.childId = null; state.childName = ''; refresh(); } });
        const clearBtn = el('button', {
          class: 'btn btn--ghost btn--sm', type: 'button', title: 'همهٔ کودکان', 'aria-label': 'حذف فیلتر کودک',
          onclick: () => {
            state.childId = null; state.childName = '';
            picker.input.value = '';
            refresh();
          }
        }, icon('x', 13));
        return el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center', flex: '1', maxWidth: '400px' } }, picker.root, clearBtn);
      })();

  const toolbar = el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '14px' } },
    childArea, statusSel, el('span', { style: { flex: '1' } }), prescribeBtn);
  listWrap = el('div', {});
  const followupsWrap = el('div', { style: { marginBottom: '14px' } });
  container.replaceChildren(toolbar, followupsWrap, listWrap);
  refresh();

  async function refresh() {
    listWrap.replaceChildren(skeletonState('table', 4));
    const params = new URLSearchParams();
    if (state.childId) params.set('child_id', state.childId);
    if (state.status) params.set('status', state.status);
    params.set('limit', '50');
    let rows;
    try {
      rows = (await api.get(`/api/games/prescriptions?${params.toString()}`)).data ?? [];
    } catch (err) {
      listWrap.replaceChildren(errorState(err, refresh));
      loadFollowups(); // فهرست شکست خورد — میز پیگیری همچنان تلاش می‌کند
      return;
    }
    listWrap.replaceChildren(renderRxTable(rows, { onOpenMissions: (rx) => missionsModal(rx, { childName: rx.childName ?? '', onChanged: refresh }), onChanged: refresh }));
    if (!state.childId) loadFollowups(); // تریاژ سراسری — با فیلتر کودک خودِ جدول کافی است
    else followupsWrap.replaceChildren();
  }

  // میز پیگیری تبعیت (۱.۲۵.۲۵) — کارت «نیازمند پیگیری» بالای فهرست؛ اختیاری و بی‌سروصدا
  async function loadFollowups() {
    let rows;
    try {
      rows = (await api.get('/api/games/followups')).data ?? [];
    } catch {
      followupsWrap.replaceChildren(); // خطای میز پیگیری هرگز فهرست اصلی را نمی‌بندد
      return;
    }
    followupsWrap.replaceChildren(rows.length > 0 ? renderFollowupsCard(rows) : document.createTextNode(''));
  }
}

// کد دلیل پیگیری — فقط توصیف رفتار داده، بدون هیچ تفسیر بالینی
const FOLLOWUP_REASON = {
  never_scheduled: { text: () => 'مأموریتی برنامه‌ریزی نشده', cls: 'badge--warning' },
  stalled: { text: (r) => `${fa(r.idleDays ?? 0)} روز بدون جلسه`, cls: 'badge--error' },
  pending_overdue: { text: (r) => `${fa(r.pendingOverdue)} مأموریتِ تاریخ‌گذشته`, cls: 'badge--warning' },
  today_unlinked: { text: (r) => `${fa(r.todayUnlinked)} مأموریتِ امروز بی‌لینک`, cls: 'badge--accent' }
};

function renderFollowupsCard(rows) {
  const items = rows.map((r) => {
    const open = el('button', {
      class: 'btn btn--ghost btn--sm', type: 'button',
      onclick: (e) => lockBtn(e.currentTarget, () => missionsModal(
        {
          id: r.prescriptionId, childName: r.childName ?? '', packageTitleFa: r.packageTitleFa,
          packageId: r.packageId ?? '', packageVersion: r.packageVersion ?? '',
          goalId: r.goalId ?? null, goalTitleFa: r.goalTitleFa,
          status: r.status, doseOverride: null
        },
        { childName: r.childName ?? '' }
      ))
    }, icon('gamepad', 14), 'مأموریت‌ها و لینک');
    return el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', padding: '10px 0', borderTop: '1px solid var(--border)' } },
      el('b', {}, r.childName ?? '—'),
      el('span', { class: 'cell-sub' }, r.packageTitleFa ?? ''),
      el('span', { class: 'cell-sub' }, `${fa(r.missionDone)}/${fa(r.missionTotal)} مأموریت`),
      el('span', { style: { display: 'flex', gap: '4px', flexWrap: 'wrap' } },
        ...r.reasons.map((code) => {
          const def = FOLLOWUP_REASON[code] ?? null;
          return def ? badge(def.text(r), def.cls) : null;
        }).filter(Boolean)),
      el('span', { style: { flex: '1' } }),
      open
    );
  });
  return el('div', { class: 'card', style: { borderInlineStart: '3px solid var(--warning)' } },
    el('div', { class: 'card-body' },
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginBottom: '4px' } },
        icon('bell', 15),
        el('b', {}, 'نیازمند پیگیری'),
        badge(fa(rows.length), 'badge--warning')),
      el('p', { class: 'hint-text', style: { marginBottom: '8px' } },
        'تجویزهای فعال که به توجه امروز نیاز دارند — فقط توصیف رفتار داده؛ تفسیر با درمانگر است.'),
      ...items
    )
  );
}

function renderRxTable(rows, { onOpenMissions, onChanged }) {
  return dataTable({
    columns: [
      { label: 'کودک', render: (r) => el('b', {}, r.childName ?? '—') },
      { label: 'بسته', render: (r) => el('span', {}, `${r.packageTitleFa ?? r.packageId} `, el('span', { class: 'cell-sub' }, `نسخهٔ ${fa(r.packageVersion)}`)) },
      { label: 'هدف', render: (r) => r.goalTitleFa ?? r.goalId ?? '—' },
      { label: 'دوز', render: (r) => el('span', { class: 'cell-sub' }, doseSummary(r.doseOverride)) },
      { label: 'مأموریت‌ها', render: (r) => el('span', { style: { whiteSpace: 'nowrap' } },
          el('b', {}, `${fa(r.missionDone)}/${fa(r.missionTotal)}`),
          r.missionLive > 0 ? el('span', { class: 'badge badge--accent', style: { marginInlineStart: '6px' } }, `${fa(r.missionLive)} در جریان`) : null) },
      { label: 'وضعیت', render: (r) => {
          const st = RX_STATUS[r.status] ?? { label: r.status, cls: 'badge--neutral' };
          return badge(st.label, st.cls);
        } },
      { label: 'ثبت', render: (r) => el('span', { class: 'cell-sub' }, r.createdAt ? formatJalaliDateTime(r.createdAt) : '—') },
      { label: '', render: (r) => {
          const items = [
            { label: 'مأموریت‌ها و لینک', icon: 'gamepad', onclick: () => onOpenMissions(r) },
            r.status === 'active' || r.status === 'paused'
              ? { label: r.status === 'active' ? 'توقف موقت' : 'ادامه', icon: r.status === 'active' ? 'pause' : 'check', onclick: () => changeStatus(r, r.status === 'active' ? 'pause' : 'resume', onChanged) }
              : null,
            r.status === 'active' || r.status === 'paused'
              ? { label: 'اتمام تجویز', icon: 'check', onclick: () => changeStatus(r, 'complete', onChanged) }
              : null,
            r.status === 'active'
              ? { sep: true }
              : null,
            r.status === 'active'
              ? { label: 'توقف قطعی', icon: 'x', danger: true, onclick: () => changeStatus(r, 'stop', onChanged) }
              : null
          ].filter(Boolean);
          return rowMenu({ items });
        } }
    ],
    rows,
    empty: {
      iconName: 'gamepad',
      title: 'هنوز تجویزی ثبت نشده',
      hint: 'با «تجویز تازه» یک بستهٔ منتشرشده را به یک کودک نسبت بدهید؛ سپس مأموریت و لینک کودک ساخته می‌شود.'
    }
  });
}

async function changeStatus(rx, action, onChanged) {
  const labels = { pause: 'توقف موقت', resume: 'ادامه', stop: 'توقف قطعی', complete: 'اتمام' };
  const ok = await confirmModal({
    title: `${labels[action]} تجویز`,
    message: `وضعیت تجویز «${rx.childName ?? rx.childId}» به «${labels[action]}» تغییر می‌کند.`,
    confirmLabel: labels[action],
    danger: action === 'stop'
  });
  if (!ok) return;
  try {
    await api.post(`/api/games/prescriptions/${encodeURIComponent(rx.id)}/status`, { action });
    toast(`تجویز ${labels[action]} شد.`, 'success');
    onChanged?.();
  } catch (err) { toastError(err); }
}

// ─── نمودار خطی SVG سبک (بدون کتابخانه) ───
function lineChart(seriesList, { height = 190, yMax = null, unit = '' } = {}) {
  const W = 560;
  const H = height;
  const padL = 40, padR = 14, padT = 14, padB = 26;
  const allVals = seriesList.flatMap((s) => s.points.map((p) => p.y));
  const dataMax = allVals.length ? Math.max(...allVals) : 1;
  const top = yMax ?? Math.max(Math.ceil(dataMax / 10) * 10, 10);
  const n = Math.max(...seriesList.map((s) => s.points.length), 1);
  const xAt = (i) => padL + (n <= 1 ? (W - padL - padR) / 2 : (i * (W - padL - padR)) / (n - 1));
  const yAt = (v) => padT + (1 - v / top) * (H - padT - padB);
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('role', 'img');
  svg.setAttribute('dir', 'ltr');
  const gridCount = 4;
  for (let g = 0; g <= gridCount; g += 1) {
    const v = (top * g) / gridCount;
    const y = yAt(v);
    const line = document.createElementNS(NS, 'line');
    line.setAttribute('x1', padL); line.setAttribute('x2', W - padR);
    line.setAttribute('y1', y); line.setAttribute('y2', y);
    line.setAttribute('stroke', '#E3DCC9'); line.setAttribute('stroke-width', '1');
    svg.appendChild(line);
    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', padL - 6); lbl.setAttribute('y', y + 4);
    lbl.setAttribute('text-anchor', 'end'); lbl.setAttribute('font-size', '10');
    lbl.setAttribute('fill', '#6E7B76');
    lbl.textContent = fa(Math.round(v));
    svg.appendChild(lbl);
  }
  for (const s of seriesList) {
    if (s.points.length < 1) continue;
    const pts = s.points.map((p, i) => `${xAt(p.x ?? i)},${yAt(p.y)}`).join(' ');
    if (s.points.length > 1) {
      const poly = document.createElementNS(NS, 'polyline');
      poly.setAttribute('points', pts);
      poly.setAttribute('fill', 'none');
      poly.setAttribute('stroke', s.color);
      poly.setAttribute('stroke-width', '2');
      poly.setAttribute('stroke-linejoin', 'round');
      svg.appendChild(poly);
    }
    for (let i = 0; i < s.points.length; i += 1) {
      const c = document.createElementNS(NS, 'circle');
      c.setAttribute('cx', xAt(s.points[i].x ?? i)); c.setAttribute('cy', yAt(s.points[i].y));
      c.setAttribute('r', '3.2'); c.setAttribute('fill', s.color);
      const t = document.createElementNS(NS, 'title');
      t.textContent = `${s.label}: ${fa(s.points[i].y)}${unit ? ' ' + unit : ''}`;
      c.appendChild(t);
      svg.appendChild(c);
    }
  }
  const xStep = Math.max(1, Math.ceil(n / 8));
  for (let i = 0; i < n; i += xStep) {
    const lbl = document.createElementNS(NS, 'text');
    lbl.setAttribute('x', xAt(i)); lbl.setAttribute('y', H - 8);
    lbl.setAttribute('text-anchor', 'middle'); lbl.setAttribute('font-size', '10');
    lbl.setAttribute('fill', '#6E7B76');
    lbl.textContent = fa(i + 1);
    svg.appendChild(lbl);
  }
  const legend = el('div', { style: { display: 'flex', gap: '12px', flexWrap: 'wrap', marginTop: '6px' } },
    seriesList.map((s) => el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '12px' } },
      el('span', { style: { width: '10px', height: '10px', borderRadius: '3px', background: s.color, display: 'inline-block' } }),
      s.label)));
  return el('div', { style: { marginTop: '8px' } }, svg, legend);
}

// ─── دریافت خام با توکن (برای HTML/CSV) ───
async function fetchReportBlob(childId, format) {
  const headers = { Accept: format === 'csv' ? 'text/csv' : 'text/html' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const staffId = getDevStaffId();
  if (staffId) headers['X-Dev-Staff-Id'] = staffId;
  const res = await fetch(`/api/games/children/${encodeURIComponent(childId)}/report?format=${format}`, { headers });
  if (!res.ok) throw new Error(`دریافت گزارش ناموفق بود (${res.status})`);
  return res.blob();
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = el('a', { href: url, download: filename });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ─── پنل گزارش بازی کودک ───
export function renderGamesReportPanel(container, { childId = null, childName = '' } = {}) {
  const panel = el('div', {});
  container.replaceChildren(panel);
  if (!childId) {
    let picker;
    panel.replaceChildren(
      el('div', { class: 'card' },
        el('div', { class: 'card-body' },
          el('p', { class: 'hint-text', style: { marginBottom: '8px' } }, 'کودک را انتخاب کنید تا گزارش جلسه‌های بازی او نمایش داده شود.'),
          (picker = childSearchField({ onPick: (s) => {
            const name = [s.firstName, s.lastName].filter(Boolean).join(' ');
            renderGamesReportPanel(container, { childId: s.id, childName: name });
          } })).root
        )
      )
    );
    return;
  }
  loadReportInto(panel, childId, childName);
}

async function loadReportInto(panel, childId, childName) {
  panel.replaceChildren(skeletonState('table', 5));
  let report;
  try {
    report = (await api.get(`/api/games/children/${encodeURIComponent(childId)}/report`)).data;
  } catch (err) {
    panel.replaceChildren(errorState(err, () => loadReportInto(panel, childId, childName)));
    return;
  }
  panel.replaceChildren(buildReportBody(report, childId, childName));
}

function buildReportBody(report, childId, childName) {
  const sessions = report.sessions ?? [];
  const validCount = sessions.filter((s) => s.computed?.validity === 'valid').length;
  const last = sessions[sessions.length - 1];
  const starsTotal = sessions.reduce((acc, s) => acc + (typeof s.computed?.summary?.stage?.stars === 'number' ? s.computed.summary.stage.stars : 0), 0);
  const lastQ = last?.computed?.quality_verdict ? QUALITY[last.computed.quality_verdict] : null;

  const kpis = el('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '10px', margin: '10px 0 16px' } },
    kpi('جلسه‌ها', sessions.length),
    kpi('جلسات معتبر', validCount, 'برای گذار مرحله و ارزیابی'),
    kpi('مجموع ستاره‌ها', starsTotal, 'مسیر پنج‌مرحله‌ای تمرین'),
    kpi('کیفیت آخرین جلسه', lastQ ? badge(lastQ.label, lastQ.cls) : '—')
  );

  // سری‌های نمودار از مقایسهٔ آمادهٔ گزارش
  const sessionIndex = new Map(sessions.map((s, i) => [s.session_id, i]));
  const METRIC_LABELS = {
    correct_go_pct: 'گو درست ٪',
    correct_nogo_pct: 'نوگو درست ٪',
    commission_pct: 'کمیسیون ٪',
    omission_pct: 'اُمیشن ٪',
    median_rt: 'میانهٔ زمان واکنش'
  };
  const pctSeries = [];
  const rtSeries = [];
  for (const m of report.comparison?.by_metric ?? []) {
    const points = m.points
      .map((p) => ({ x: sessionIndex.get(p.session_id) ?? 0, y: p.value }))
      .sort((a, b) => a.x - b.x);
    if (!points.length) continue;
    const entry = { label: METRIC_LABELS[m.metric_id] ?? m.metric_id, color: CHART_COLORS[m.metric_id] ?? '#438C89', points };
    if (m.metric_id === 'median_rt' || m.unit === 'ms') rtSeries.push(entry);
    else pctSeries.push(entry);
  }

  const chartCard = (title, node, hint) => node
    ? el('div', { class: 'card', style: { marginBottom: '14px' } },
        el('div', { class: 'card-body' },
          el('b', {}, title),
          hint ? el('p', { class: 'hint-text' }, hint) : null,
          node))
    : null;

  const table = dataTable({
    columns: [
      { label: 'مأموریت', render: (s) => el('b', {}, s.mission_title || s.mission_ref || '—') },
      { label: 'تاریخ', render: (s) => el('span', { class: 'cell-sub' }, s.started_at ? formatJalaliDateTime(s.started_at) : '—') },
      { label: 'حالت', render: (s) => PURPOSE_LABEL[s.purpose] ?? s.purpose ?? '—' },
      { label: 'اعتبار', render: (s) => {
          const v = VALIDITY[s.computed?.validity];
          return v ? badge(v.label, v.cls) : '—';
        } },
      { label: 'کیفیت', render: (s) => {
          const q = QUALITY[s.computed?.quality_verdict];
          return q ? badge(q.label, q.cls) : '—';
        } },
      { label: 'آزمون', render: (s) => fa(s.computed?.summary?.totals?.total ?? s.raw?.attempt_count ?? '—') },
      { label: 'گو٪', render: (s) => fa(s.computed?.summary?.pct?.correct_go ?? '—') },
      { label: 'نوگو٪', render: (s) => fa(s.computed?.summary?.pct?.correct_nogo ?? '—') },
      { label: 'کمیسیون٪', render: (s) => fa(s.computed?.summary?.pct?.commission ?? '—') },
      { label: 'اُمیشن٪', render: (s) => fa(s.computed?.summary?.pct?.omission ?? '—') },
      { label: 'میانهٔ RT', render: (s) => {
          const rt = s.computed?.summary?.rt?.median;
          return rt == null ? '—' : `${fa(rt)} ms`;
        } },
      { label: 'مرحله', render: (s) => {
          const st = s.computed?.summary?.stage;
          if (!st || typeof st.stars !== 'number') return '—';
          return `${st.title_fa ?? ''} ${st.passed ? '★'.repeat(st.stars) : '—'}`;
        } }
    ],
    rows: sessions,
    empty: { iconName: 'gamepad', title: 'هنوز جلسه‌ای ثبت نشده', hint: 'پس از اجرای کودک، جلسه‌ها همین‌جا با کیفیت و سنجه‌ها دیده می‌شوند.' }
  });

  return el('div', {},
    el('div', { style: { display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '6px' } },
      el('h3', { style: { margin: '0' } }, icon('gamepad', 18), ` گزارش بازی — ${childName || 'کودک'}`),
      el('span', { style: { flex: '1' } }),
      el('button', {
        class: 'btn btn--soft btn--sm', type: 'button',
        onclick: (e) => lockBtn(e.currentTarget, async () => {
          try {
            const blob = await fetchReportBlob(childId, 'html');
            const url = URL.createObjectURL(blob);
            window.open(url, '_blank', 'noopener');
            setTimeout(() => URL.revokeObjectURL(url), 60000);
          } catch (err) { toastError(err); }
        })
      }, icon('printer', 14), 'نمای چاپی'),
      el('button', {
        class: 'btn btn--soft btn--sm', type: 'button',
        onclick: (e) => lockBtn(e.currentTarget, async () => {
          try {
            const blob = await fetchReportBlob(childId, 'csv');
            downloadBlob(blob, `games-report-${childId.slice(0, 8)}.csv`);
            toast('CSV بارگیری شد.', 'success');
          } catch (err) { toastError(err); }
        })
      }, icon('download', 14), 'CSV')
    ),
    el('p', { class: 'hint-text' },
      'این گزارش فقط داده و پرچم کیفیت است — هیچ تفسیر بالینی خودکاری انجام نمی‌شود؛ تفسیر با درمانگر است.'),
    kpis,
    chartCard('روند سنجه‌های درصدی (قدیمی → جدید)', pctSeries.length ? lineChart(pctSeries, { yMax: 100, unit: '٪' }) : null),
    chartCard('روند میانهٔ زمان واکنش (ms)', rtSeries.length ? lineChart(rtSeries, { unit: 'ms' }) : null, 'RT پایین‌تر و پایدارتر معمولاً به معنای پردازش روان‌تر است — قضاوت با شما.'),
    el('div', { class: 'card' }, el('div', { class: 'card-body' }, table)),
    el('p', { class: 'cell-sub', style: { marginTop: '8px' } }, `تولید ${formatJalaliDateTime(report.generated_at)} · شناسهٔ کودک ${fa(childId.slice(0, 8))}`)
  );
}
