import { api } from '../api.js';
import { fa } from '../format.js';
import {
  el, icon, toast, toastError, lockBtn, confirmModal, skeletonState, errorState, tabs, emptyState
} from '../ui.js';
import { renderRxPanel, renderGamesReportPanel } from '../games-console.js';
import { session } from '../state.js';

// ─── بازی‌ها (۱.۲۵.۲۴) — میز کامل حلقهٔ درمانگر: بسته‌ها | تجویزها | گزارش ───
// بسته‌ها: فهرست + پیش‌نمایش + انتشار (پیش‌نویس) + بازنشستگی (مدیر)
// تجویزها: میز حلقهٔ درمانگر (games-console.js) — تجویز/مأموریت/لینک/پیگیری
// گزارش: روند سنجه‌ها + کیفیت جلسه‌ها + چاپ/CSV
// هویت کودک از پروفایل (#/games?child=…) هم می‌آید تا تفسیر هم‌زمینه بماند.

const MODE_LABEL = { training: 'تمرین', assessment: 'ارزیابی' };
const STATUS_LABEL = {
  draft: 'پیش‌نویس',
  review: 'در بازبینی',
  published: 'منتشر شده',
  retired: 'بازنشسته'
};
const STATUS_CLASS = {
  draft: 'badge--neutral',
  review: 'badge--warning',
  published: 'badge--success',
  retired: 'badge--neutral'
};

function badge(label, cls) {
  return el('span', { class: `badge ${cls ?? 'badge--neutral'}` }, label);
}

function isManager() {
  return session.user?.role === 'manager';
}

async function openPreview(pkg) {
  let data;
  try {
    data = (await api.post('/api/games/preview', { package_id: pkg.id, version: pkg.version })).data;
  } catch (err) {
    toastError(err);
    return;
  }
  const win = window.open(data.url, '_blank', 'noopener');
  if (!win) {
    toast('مرورگر تب جدید را بست — نشانی پیش‌نمایش در اعلان بعدی است؛ آن را باز کنید.');
  }
  toast('پیش‌نمایش باز شد — هیچ داده‌ای ثبت نمی‌شود و ۳۰ دقیقه اعتبار دارد.', 'success');
}

async function publishPkg(pkg, onDone) {
  const ok = await confirmModal({
    title: 'انتشار بسته',
    message: `«${pkg.titleFa || pkg.id}» نسخهٔ ${fa(pkg.version)} منتشر می‌شود؛ پس از انتشار، نسخه تغییرناپذیر است و فقط با نسخهٔ جدید می‌توان محتوا را عوض کرد.`,
    confirmLabel: 'انتشار'
  });
  if (!ok) return;
  try {
    await api.post(`/api/games/packages/${encodeURIComponent(pkg.id)}/${encodeURIComponent(pkg.version)}/publish`, {});
    toast('بسته منتشر شد — از همین لحظه قابل تجویز است.', 'success');
    onDone?.();
  } catch (err) {
    toastError(err);
  }
}

async function retirePkg(pkg, onDone) {
  const ok = await confirmModal({
    title: 'بازنشسته‌کردن بسته',
    message: `«${pkg.titleFa || pkg.id}» نسخهٔ ${fa(pkg.version)} دیگر قابل تجویز نیست. تجویزهای موجود به همان نسخه قفل می‌مانند و کارشان قطع نمی‌شود.`,
    confirmLabel: 'بازنشستگی', danger: true
  });
  if (!ok) return;
  try {
    await api.post(`/api/games/packages/${encodeURIComponent(pkg.id)}/${encodeURIComponent(pkg.version)}/retire`, {});
    toast('بسته بازنشسته شد — تجویز تازه از این نسخه بسته شد.', 'success');
    onDone?.();
  } catch (err) {
    toastError(err);
  }
}

function doseText(dose) {
  if (!dose || !dose.days_per_week) return null;
  return `${fa(dose.days_per_week)} روز/هفته · ${fa(dose.minutes)} دقیقه · سقف ${fa(dose.max_missions_per_day)}/روز`;
}

function pkgCard(pkg, goalNames, onDone) {
  const published = pkg.status === 'published';
  const retired = pkg.status === 'retired';
  const goals = Array.isArray(pkg.body?.goals) ? pkg.body.goals : [];
  const missionsCount = Array.isArray(pkg.body?.missions) ? pkg.body.missions.length : 0;
  const age = pkg.body?.age;
  return el('div', { class: 'card', 'data-pkg': pkg.id },
    el('div', { class: 'card-body', style: 'display:flex;gap:14px;align-items:flex-start;flex-wrap:wrap;' },
      el('span', { class: 'ico', 'aria-hidden': 'true' }, icon('gamepad', 20)),
      el('div', { style: 'flex:1;min-width:220px;' },
        el('div', { style: 'font-weight:700;display:flex;gap:8px;align-items:center;flex-wrap:wrap;' },
          pkg.titleFa || pkg.id,
          pkg.body?.mode ? badge(`حالت ${MODE_LABEL[pkg.body.mode] ?? fa(pkg.body.mode)}`, 'badge--accent') : null,
          age?.min != null && age?.max != null ? el('span', { class: 'cell-sub' }, `سن ${fa(age.min)} تا ${fa(age.max)}`) : null
        ),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;' },
          `${fa(pkg.id)} · نسخهٔ ${fa(pkg.version)} · شواهد سطح ${fa(pkg.evidenceLevel ?? '—')} · ${fa(missionsCount)} مأموریت`),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;' },
          doseText(pkg.dose) ?? 'دوز ثبت نشده'),
        goals.length
          ? el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;margin-top:6px;' },
              goals.map((g) => el('span', { class: 'badge badge--neutral' }, goalNames?.[g] ?? g)))
          : null
      ),
      el('div', { style: 'display:flex;flex-direction:column;gap:8px;align-items:flex-end;' },
        badge(STATUS_LABEL[pkg.status] ?? fa(pkg.status), STATUS_CLASS[pkg.status] ?? 'badge--neutral'),
        el('div', { style: 'display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;' },
          published
            ? el('button', {
                class: 'btn btn--primary btn--sm', type: 'button',
                title: 'اجرای آزمایشی بازی در تب جدید — بدون ثبت داده (۳۰ دقیقه اعتبار)',
                'aria-label': `پیش‌نمایش ${pkg.titleFa || pkg.id}`,
                onclick: (e) => lockBtn(e.currentTarget, () => openPreview(pkg))
              }, icon('eye', 14), 'پیش‌نمایش')
            : null,
          (pkg.status === 'draft' || pkg.status === 'review')
            ? el('button', {
                class: 'btn btn--soft btn--sm', type: 'button',
                title: 'گیت انتشار سمت سرور اجرا می‌شود؛ پس از انتشار نسخه تغییرناپذیر است',
                onclick: (e) => lockBtn(e.currentTarget, () => publishPkg(pkg, onDone))
              }, icon('check', 14), 'انتشار')
            : null,
          published && isManager()
            ? el('button', {
                class: 'btn btn--ghost btn--sm', type: 'button',
                title: 'بستن تجویز تازه از این نسخه — تجویزهای موجود دست‌نخورده',
                onclick: (e) => lockBtn(e.currentTarget, () => retirePkg(pkg, onDone))
              }, icon('x', 14), 'بازنشستگی')
            : null,
          retired ? el('span', { class: 'muted', style: 'font-size:12px;' }, 'تجویز تازه بسته است') : null
        )
      )
    )
  );
}

async function renderPackagesTab(container) {
  container.replaceChildren(skeletonState('list', 4));
  let packages = [];
  let goalNames = null;
  try {
    const [pkgsRes, goalsRes] = await Promise.all([
      api.get('/api/games/packages'),
      api.get('/api/games/goals').catch(() => null)
    ]);
    packages = pkgsRes.data ?? [];
    if (goalsRes?.data) {
      goalNames = Object.fromEntries(goalsRes.data.map((g) => [g.id, g.title_fa]));
    }
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderPackagesTab(container)));
    return;
  }
  const wrap = el('div', {},
    el('p', { class: 'hint-text' },
      'بسته‌های بازی درمانی مرکز. «پیش‌نمایش» بازی را با موتور کودک در تب جدید اجرا می‌کند (بدون ثبت داده)؛ «انتشار» نسخه را برای تجویز باز می‌کند؛ «بازنشستگی» فقط تجویز تازه را می‌بندد و جلسه‌های در جریان را نمی‌شکند.')
  );
  if (!packages.length) {
    wrap.appendChild(emptyState({
      iconName: 'gamepad',
      title: 'هنوز بسته‌ای ساخته نشده است',
      hint: 'بسته‌های بازی از مسیر رجیستری (API بسته‌ها) ثبت و منتشر می‌شوند.'
    }));
  } else {
    const publishedFirst = [...packages].sort((a, b) =>
      (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const p of publishedFirst) wrap.appendChild(pkgCard(p, goalNames, () => renderPackagesTab(container)));
  }
  container.replaceChildren(wrap);
}

function renderPrescriptionsTab(container, childId) {
  const wrap = el('div', {},
    el('p', { class: 'hint-text' },
      'میز تجویز: بستهٔ منتشرشده را به کودک نسبت بدهید، مأموریت زمان‌بندی کنید و لینک کودک را با QR/کپی بسپارید؛ پیشرفت و وضعیت لینک همین‌جا دیده می‌شود.'),
    el('div', { 'data-rx-panel': '' })
  );
  container.replaceChildren(wrap);
  renderRxPanel(wrap.querySelector('[data-rx-panel]'), { childId: childId || null });
}

function renderReportTab(container, childId) {
  const wrap = el('div', {});
  container.replaceChildren(wrap);
  renderGamesReportPanel(wrap, { childId: childId || null });
}

export async function renderGames(container) {
  // دیپ‌لینک از پروفایل کودک: #/games?child=<id> — تب تجویزها با فیلتر همان کودک باز می‌شود
  const hashQuery = location.hash.split('?')[1] ?? '';
  const params = new URLSearchParams(hashQuery);
  const childId = params.get('child');
  const initialTab = childId ? 'rx' : 'packages';

  const body = el('div', {});
  const tabBar = tabs([
    { key: 'packages', label: 'بسته‌ها', icon: 'gamepad', onSelect: (k) => select(k) },
    { key: 'rx', label: 'تجویزها', icon: 'clipboard', onSelect: (k) => select(k) },
    { key: 'report', label: 'گزارش', icon: 'trendingUp', onSelect: (k) => select(k) }
  ], initialTab);

  const wrap = el('div', {},
    el('h3', {}, icon('gamepad', 18), ' بازی‌ها — میز درمانگر'),
    tabBar.root,
    el('div', { style: { marginTop: 'var(--sp-4, 14px)' } }, body)
  );
  container.replaceChildren(wrap);

  function select(key) {
    tabBar.setActive(key); // kit کلیک را خودش فعال نمی‌کند — هم‌الگوی پروفایل
    if (key === 'packages') renderPackagesTab(body);
    else if (key === 'rx') renderPrescriptionsTab(body, childId);
    else renderReportTab(body, childId);
  }
  select(initialTab);
}
