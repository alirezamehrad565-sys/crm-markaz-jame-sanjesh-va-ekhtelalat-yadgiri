import { api } from '../api.js';
import { fa, formatJalaliDateTime } from '../format.js';
import {
  el, icon, toast, toastError, lockBtn, confirmModal, skeletonState, errorState, tabs, emptyState, openModal, rowMenu
} from '../ui.js';
import { renderRxPanel, renderGamesReportPanel, prescribeModal } from '../games-console.js';
import { session } from '../state.js';

// ─── بازی‌ها (فاز ۱ بازطراحی UI) — میز درمانگر: بانک بازی‌ها | ارسال به دانش‌آموز | گزارش ───
// بانک بازی‌ها: نوار ابزار (جست‌وجو + فیلتر حوزه/وضعیت) + دسته‌بندی حوزهٔ شناختی + کارت با
// سلسله‌مراتب بصری (عنوان > حوزه/سن/دشواری > متادیتای فنی نرم > اکشن ثابت) + مودال جزئیات.
// منطق، API و قابلیت‌ها دست‌نخورده — فقط ساختار نمایش. واژه‌نامهٔ ۱.۲۵.۲۶ حفظ می‌شود:
// «تجویز» → «ارسال به دانش‌آموز»؛ بدون توضیح اضافه بالای تب‌ها؛ شناسهٔ لاتین با fa() فارسی‌نما نمی‌شود.
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

// حوزهٔ شناختی هدف — از شناسهٔ هدف (گیت‌شده با دادهٔ واقعی بسته‌های این مرکز)؛
// ناشناخته = پیشوند عنوان هدف پیش از «—» یا «عمومی». رنگ از هشت‌گانهٔ دسته‌ای توکن‌محور.
const DOMAIN_BY_GOAL = {
  inhibition: { title: 'توجه و بازداری پاسخ', cls: 'gmk-chip--d1', icon: 'brain' },
  scan_attention: { title: 'توجه و تمرکز', cls: 'gmk-chip--d2', icon: 'target' },
  flanker_attention: { title: 'توجه و تمرکز', cls: 'gmk-chip--d2', icon: 'target' },
  stroop_attention: { title: 'توجه و تمرکز', cls: 'gmk-chip--d2', icon: 'target' },
  trail_attention: { title: 'جست‌وجوی دیداری و دنبال‌کردن', cls: 'gmk-chip--d8', icon: 'compass' },
  numline: { title: 'عدد و حس عددی', cls: 'gmk-chip--d3', icon: 'grid' },
  numline_road: { title: 'عدد و حس عددی', cls: 'gmk-chip--d3', icon: 'grid' },
  numcompare: { title: 'عدد و حس عددی', cls: 'gmk-chip--d3', icon: 'grid' },
  math_facts: { title: 'عدد و حس عددی', cls: 'gmk-chip--d3', icon: 'grid' },
  pa: { title: 'خواندن و آگاهی واجی', cls: 'gmk-chip--d7', icon: 'book' },
  letter_sound: { title: 'خواندن و آگاهی واجی', cls: 'gmk-chip--d7', icon: 'book' },
  adherence: { title: 'خانواده و پایبندی', cls: 'gmk-chip--d4', icon: 'heart' }
};
const FALLBACK_DOMAIN = { title: 'عمومی', cls: '', icon: 'gamepad' };
// ترتیب پایدار گروه‌ها؛ حوزهٔ ناشناخته بعد از این‌ها می‌نشیند
const DOMAIN_ORDER = [
  'توجه و بازداری پاسخ',
  'توجه و تمرکز',
  'جست‌وجوی دیداری و دنبال‌کردن',
  'عدد و حس عددی',
  'خواندن و آگاهی واجی',
  'خانواده و پایبندی',
  'عمومی'
];

function domainOf(pkg, goalNames) {
  const goals = Array.isArray(pkg.body?.goals) ? pkg.body.goals : [];
  for (const g of goals) {
    if (DOMAIN_BY_GOAL[g]) return DOMAIN_BY_GOAL[g];
    const title = goalNames?.[g] ?? '';
    if (title.includes('—')) {
      return { title: title.split('—')[0].trim(), cls: '', icon: 'gamepad' };
    }
  }
  return FALLBACK_DOMAIN;
}

// سطح دشواری — توصیف ساختار بسته، نه قضاوت
function difficultyOf(pkg) {
  if ((pkg.body?.mode ?? 'training') === 'assessment') return 'پروتکل ثابت';
  if (pkg.body?.stages_enabled === false) return 'تک‌مرحله‌ای';
  return `${fa(5)} مرحلهٔ پیشرفتی`;
}

// گروه سنی — اولویت: body.age، سپس بازهٔ سنِ هدفِ ثبت‌شده
function ageOf(pkg, goals) {
  const age = pkg.body?.age;
  if (age?.min != null && age?.max != null) return age;
  const goalsArr = Array.isArray(pkg.body?.goals) ? pkg.body.goals : [];
  for (const gid of goalsArr) {
    const g = goals.find((x) => x.id === gid);
    if (g?.age_min != null && g?.age_max != null) return { min: g.age_min, max: g.age_max };
  }
  return null;
}

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
    toast('بسته منتشر شد — از همین لحظه قابل ارسال به دانش‌آموز است.', 'success');
    onDone?.();
  } catch (err) {
    toastError(err);
  }
}

async function retirePkg(pkg, onDone) {
  const ok = await confirmModal({
    title: 'بازنشسته‌کردن بسته',
    message: `«${pkg.titleFa || pkg.id}» نسخهٔ ${fa(pkg.version)} دیگر قابل ارسال نیست. ارسال‌های موجود به همان نسخه قفل می‌مانند و کارشان قطع نمی‌شود.`,
    confirmLabel: 'بازنشستگی', danger: true
  });
  if (!ok) return;
  try {
    await api.post(`/api/games/packages/${encodeURIComponent(pkg.id)}/${encodeURIComponent(pkg.version)}/retire`, {});
    toast('بسته بازنشسته شد — ارسال تازه از این نسخه بسته شد.', 'success');
    onDone?.();
  } catch (err) {
    toastError(err);
  }
}

function doseText(dose) {
  if (!dose || !dose.days_per_week) return null;
  return `${fa(dose.days_per_week)} روز/هفته · ${fa(dose.minutes)} دقیقه · سقف ${fa(dose.max_missions_per_day)}/روز`;
}

// ─── مودال جزئیات و تنظیمات بازی ───
function openPkgDetails(pkg, goals, goalNames, onDone) {
  const domain = domainOf(pkg, goalNames);
  const missions = Array.isArray(pkg.body?.missions) ? pkg.body.missions : [];
  const age = ageOf(pkg, goals ?? []);
  const goalIds = Array.isArray(pkg.body?.goals) ? pkg.body.goals : [];
  const published = pkg.status === 'published';
  const canPublish = pkg.status === 'draft' || pkg.status === 'review';

  const detail = (label, value) => [
    el('div', { class: 'gmk-detail__dt' }, label),
    el('div', { class: 'gmk-detail__dd' }, value)
  ];

  const body = el('div', {},
    el('div', { class: 'gmk-detail__grid' },
      ...detail('شناسه', el('span', { class: 'gmk-ltr' }, pkg.id)),
      ...detail('نسخه', fa(pkg.version)),
      ...detail('وضعیت', badge(STATUS_LABEL[pkg.status] ?? pkg.status, STATUS_CLASS[pkg.status])),
      ...detail('حالت', MODE_LABEL[pkg.body?.mode] ?? 'تمرین'),
      ...detail('سطح شواهد', fa(pkg.evidenceLevel ?? '—')),
      ...detail('سطح دشواری', difficultyOf(pkg)),
      ...detail('گروه سنی', age ? `${fa(age.min)} تا ${fa(age.max)} سال` : 'ثبت نشده'),
      ...detail('دوز', doseText(pkg.dose) ?? 'ثبت نشده')
    ),
    el('div', { class: 'gmk-detail__sec' },
      el('b', {}, 'هدف‌های درمانی'),
      goalIds.length
        ? el('div', { class: 'gmk-card__facts' },
            goalIds.map((g) => el('span', { class: 'badge badge--neutral' }, goalNames?.[g] ?? g)))
        : el('span', { class: 'gmk-fact' }, 'هدف مستقلی ثبت نشده')
    ),
    el('div', { class: 'gmk-detail__sec' },
      el('b', {}, `مأموریت‌ها (${fa(missions.length)})`),
      missions.length
        ? el('div', { class: 'gmk-missions' },
            missions.map((m, i) => el('div', { class: 'gmk-mission' },
              el('span', { class: 'gmk-mission__n' }, fa(i + 1)),
              el('b', {}, m.title ?? m.id),
              el('span', { class: 'cell-sub' }, `${fa(m.items?.length ?? 0)} آزمون`)
            )))
        : el('span', { class: 'gmk-fact' }, 'مأموریتی تعریف نشده')
    ),
    pkg.reviewedAt
      ? el('p', { class: 'cell-sub', style: { marginTop: '10px' } }, `آخرین بازبینی: ${formatJalaliDateTime(pkg.reviewedAt)}`)
      : null
  );

  const actions = [];
  if (published) {
    actions.push((close) => el('button', {
      class: 'btn btn--primary', type: 'button',
      onclick: (e) => lockBtn(e.currentTarget, async () => { close(); await openPreview(pkg); })
    }, icon('eye', 15), 'پیش‌نمایش'));
    actions.push((close) => el('button', {
      class: 'btn btn--soft', type: 'button',
      onclick: (e) => lockBtn(e.currentTarget, () => {
        close();
        prescribeModal({ childId: null, childName: '', onCreated: onDone });
      })
    }, icon('send', 15), 'ارسال به دانش‌آموز'));
  }
  if (canPublish) {
    actions.push((close) => el('button', {
      class: 'btn btn--soft', type: 'button',
      onclick: (e) => lockBtn(e.currentTarget, () => { close(); publishPkg(pkg, onDone); })
    }, icon('check', 15), 'انتشار'));
  }
  if (published && isManager()) {
    actions.push((close) => el('button', {
      class: 'btn btn--ghost', type: 'button', style: { color: 'var(--error)' },
      onclick: () => { close(); retirePkg(pkg, onDone); }
    }, icon('x', 15), 'بازنشستگی'));
  }
  actions.push((close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'بستن'));

  openModal({
    title: `${pkg.titleFa || pkg.id} — جزئیات بازی`,
    body,
    actions
  });
}

// ─── کارت بازی — سلسله‌مراتب: عنوان > حوزه/سن/دشواری > فنی نرم > دوز > اکشن ثابت ───
function pkgCard(pkg, goals, goalNames, onDone) {
  const published = pkg.status === 'published';
  const retired = pkg.status === 'retired';
  const domain = domainOf(pkg, goalNames);
  const age = ageOf(pkg, goals ?? []);
  const missionsCount = Array.isArray(pkg.body?.missions) ? pkg.body.missions.length : 0;

  const manageItems = [];
  if (pkg.status === 'draft' || pkg.status === 'review') {
    manageItems.push({
      label: 'انتشار', icon: 'check',
      onclick: () => publishPkg(pkg, onDone)
    });
  }
  if (published && isManager()) {
    manageItems.push({
      label: 'بازنشستگی', icon: 'x', danger: true,
      onclick: () => retirePkg(pkg, onDone)
    });
  }

  const actions = el('div', { class: 'gmk-card__actions' },
    published
      ? el('button', {
          class: 'btn btn--primary btn--sm', type: 'button',
          title: 'اجرای آزمایشی بازی در تب جدید — بدون ثبت داده (۳۰ دقیقه اعتبار)',
          'aria-label': `پیش‌نمایش ${pkg.titleFa || pkg.id}`,
          onclick: (e) => lockBtn(e.currentTarget, () => openPreview(pkg))
        }, icon('eye', 14), 'پیش‌نمایش')
      : null,
    el('button', {
      class: 'btn btn--soft btn--sm', type: 'button',
      'aria-label': `جزئیات ${pkg.titleFa || pkg.id}`,
      onclick: (e) => lockBtn(e.currentTarget, () => openPkgDetails(pkg, goals, goalNames, onDone))
    }, icon('info', 14), 'جزئیات'),
    retired ? el('span', { class: 'gmk-fact' }, 'ارسال تازه بسته است') : null,
    manageItems.length ? el('span', { style: { flex: '1' } }) : null,
    manageItems.length ? rowMenu({ label: 'مدیریت بازی', items: manageItems }) : null
  );

  return el('div', { class: 'card gmk-card', 'data-pkg': pkg.id, 'data-domain': domain.title },
    el('div', { class: 'gmk-card__head' },
      el('span', { class: `gmk-card__icon ${domain.cls}`, 'aria-hidden': 'true' }, icon(domain.icon, 20)),
      el('div', { class: 'gmk-card__titlewrap' },
        el('div', { class: 'gmk-card__title' }, pkg.titleFa || pkg.id),
        el('div', { class: 'gmk-card__badges' },
          badge(STATUS_LABEL[pkg.status] ?? fa(pkg.status), STATUS_CLASS[pkg.status] ?? 'badge--neutral'),
          pkg.body?.mode ? badge(`حالت ${MODE_LABEL[pkg.body.mode] ?? fa(pkg.body.mode)}`, 'badge--accent') : null
        )
      )
    ),
    el('div', { class: 'gmk-card__facts' },
      el('span', { class: `gmk-chip ${domain.cls}` },
        el('span', { class: 'gmk-chip__dot', 'aria-hidden': 'true' }), domain.title),
      age ? el('span', { class: 'gmk-fact' }, icon('student', 12), `سن ${fa(age.min)} تا ${fa(age.max)}`) : null,
      el('span', { class: 'gmk-fact' }, icon('layers', 12), difficultyOf(pkg))
    ),
    el('div', { class: 'gmk-card__meta' },
      el('span', { class: 'gmk-id' }, pkg.id),
      el('span', {}, `نسخهٔ ${fa(pkg.version)}`),
      el('span', {}, `شواهد ${fa(pkg.evidenceLevel ?? '—')}`),
      el('span', {}, `${fa(missionsCount)} مأموریت`)
    ),
    doseText(pkg.dose) ? el('div', { class: 'gmk-card__dose' }, icon('clock', 12), doseText(pkg.dose)) : null,
    actions
  );
}

// ─── نوار ابزار بانک: جست‌وجو + فیلتر حوزه/وضعیت + شمارنده ───
function pkgToolbar(state, domains, onFilter) {
  const search = el('input', {
    class: 'input', type: 'search', placeholder: 'جست‌وجوی نام بازی…',
    'aria-label': 'جست‌وجوی بازی', autocomplete: 'off'
  });
  search.addEventListener('input', () => { state.q = search.value.trim(); onFilter(); });

  const domainSel = el('select', { class: 'select', 'aria-label': 'فیلتر حوزهٔ شناختی' },
    el('option', { value: '' }, 'همهٔ حوزه‌ها'),
    ...domains.map((d) => el('option', { value: d }, d)));
  domainSel.addEventListener('change', () => { state.domain = domainSel.value; onFilter(); });

  const statusSel = el('select', { class: 'select', 'aria-label': 'فیلتر وضعیت انتشار' },
    el('option', { value: '' }, 'همهٔ وضعیت‌ها'),
    ...Object.entries(STATUS_LABEL).map(([k, v]) => el('option', { value: k }, v)));
  statusSel.addEventListener('change', () => { state.status = statusSel.value; onFilter(); });

  const count = el('span', { class: 'gmk-toolbar__count', 'data-count': '' }, '');

  return {
    root: el('div', { class: 'gmk-toolbar' },
      el('div', { class: 'gmk-toolbar__search' }, search),
      el('div', { class: 'gmk-toolbar__filters' }, domainSel, statusSel, count)
    ),
    setCount: (shown, total) => {
      count.textContent = shown === total ? `${fa(total)} بازی` : `${fa(shown)} از ${fa(total)} بازی`;
    }
  };
}

function matchesFilters(pkg, state, goalNames) {
  if (state.status && pkg.status !== state.status) return false;
  if (state.domain && domainOf(pkg, goalNames).title !== state.domain) return false;
  if (state.q) {
    const hay = `${pkg.titleFa ?? ''} ${pkg.id} ${(pkg.body?.goals ?? []).map((g) => goalNames?.[g] ?? '').join(' ')}`;
    if (!hay.includes(state.q)) return false;
  }
  return true;
}

const STATUS_RANK = { published: 0, review: 1, draft: 2, retired: 3 };

function groupedDeck(packages, goals, goalNames, onDone) {
  const byDomain = new Map();
  for (const p of packages) {
    const d = domainOf(p, goalNames);
    if (!byDomain.has(d.title)) byDomain.set(d.title, { cls: d.cls, icon: d.icon, pkgs: [] });
    byDomain.get(d.title).pkgs.push(p);
  }
  const titles = [...byDomain.keys()].sort((a, b) => {
    const ia = DOMAIN_ORDER.indexOf(a), ib = DOMAIN_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  const wrap = el('div', {});
  for (const t of titles) {
    const g = byDomain.get(t);
    g.pkgs.sort((a, b) =>
      (STATUS_RANK[a.status] ?? 9) - (STATUS_RANK[b.status] ?? 9) ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    wrap.appendChild(el('section', { class: 'gmk-group' },
      el('div', { class: 'gmk-group__head' },
        el('span', { class: `gmk-chip ${g.cls}` }, el('span', { class: 'gmk-chip__dot', 'aria-hidden': 'true' }), t),
        el('b', { class: 'gmk-group__title' }, `${fa(g.pkgs.length)} بازی`),
        el('span', { class: 'gmk-group__line', 'aria-hidden': 'true' })
      ),
      el('div', { class: 'gmk-deck' },
        g.pkgs.map((p) => pkgCard(p, goals, goalNames, onDone)))
    ));
  }
  return wrap;
}

async function renderPackagesTab(container) {
  container.replaceChildren(skeletonState('cards', 6));
  let packages = [];
  let goals = [];
  let goalNames = null;
  try {
    const [pkgsRes, goalsRes] = await Promise.all([
      api.get('/api/games/packages'),
      api.get('/api/games/goals').catch(() => null)
    ]);
    packages = pkgsRes.data ?? [];
    if (goalsRes?.data) {
      goals = goalsRes.data;
      goalNames = Object.fromEntries(goals.map((g) => [g.id, g.title_fa]));
    }
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderPackagesTab(container)));
    return;
  }

  const state = { q: '', domain: '', status: '' };
  const domains = [...new Set(packages.map((p) => domainOf(p, goalNames).title))]
    .sort((a, b) => {
      const ia = DOMAIN_ORDER.indexOf(a), ib = DOMAIN_ORDER.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
  const toolbar = pkgToolbar(state, domains, apply);
  const listWrap = el('div', {});
  const refreshBtn = el('button', {
    class: 'btn btn--ghost btn--icon', type: 'button', title: 'به‌روزرسانی فهرست',
    'aria-label': 'به‌روزرسانی فهرست بازی‌ها',
    onclick: (e) => lockBtn(e.currentTarget, () => renderPackagesTab(container))
  }, icon('refresh', 16));
  toolbar.root.insertBefore(refreshBtn, toolbar.root.firstChild);

  function apply() {
    const filtered = packages.filter((p) => matchesFilters(p, state, goalNames));
    toolbar.setCount(filtered.length, packages.length);
    if (!packages.length) {
      listWrap.replaceChildren(emptyState({
        iconName: 'gamepad',
        title: 'هنوز بسته‌ای ساخته نشده است',
        hint: 'بسته‌های بازی از مسیر رجیستری (API بسته‌ها) ثبت و منتشر می‌شوند.'
      }));
      return;
    }
    if (!filtered.length) {
      listWrap.replaceChildren(emptyState({
        iconName: 'search',
        title: 'با این فیلترها بازی‌ای پیدا نشد',
        hint: 'جست‌وجو یا فیلترها را ساده‌تر کنید.'
      }));
      return;
    }
    listWrap.replaceChildren(groupedDeck(filtered, goals, goalNames, () => renderPackagesTab(container)));
  }

  container.replaceChildren(toolbar.root, listWrap);
  apply();
}

function renderPrescriptionsTab(container, childId) {
  const wrap = el('div', {},
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
  // دیپ‌لینک از پروفایل کودک: #/games?child=<id> — تب ارسال با فیلتر همان دانش‌آموز باز می‌شود
  const hashQuery = location.hash.split('?')[1] ?? '';
  const params = new URLSearchParams(hashQuery);
  const childId = params.get('child');
  const initialTab = childId ? 'rx' : 'packages';

  const body = el('div', {});
  const tabBar = tabs([
    { key: 'packages', label: 'بانک بازی‌ها', icon: 'gamepad', onSelect: (k) => select(k) },
    { key: 'rx', label: 'ارسال به دانش‌آموز', icon: 'clipboard', onSelect: (k) => select(k) },
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
