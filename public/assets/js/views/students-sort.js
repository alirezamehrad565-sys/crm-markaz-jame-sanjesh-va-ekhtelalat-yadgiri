/* مرتب‌سازی و شمارندهٔ سربرگ فهرست دانش‌آموزان — جدا از view تا فایل view سبک بماند (گیت کمپلکسیتی).
   همهٔ کارها سمت کاربر و روی دادهٔ همین صفحه‌اند؛ GET نُه‌بتی فقط برای «جمع کل بی‌فیلتر» است. */
import { api, qs } from '../api.js';
import { fa } from '../format.js';
import { el } from '../ui.js';

export function createStudentsSort({ local, hasFilter, countBadge, getResult, onSortChange }) {
  let totalAll = null;

  function paintCount(filteredTotal) {
    countBadge.textContent = (hasFilter() && totalAll !== null && totalAll !== filteredTotal)
      ? `${fa(filteredTotal)} از ${fa(totalAll)} نفر`
      : `${fa(filteredTotal)} نفر`;
  }

  function sortRows(rows) {
    const byName = (a, b) => `${a.firstName ?? ''} ${a.lastName ?? ''}`.trim().localeCompare(`${b.firstName ?? ''} ${b.lastName ?? ''}`.trim(), 'fa');
    if (local.sort === 'newest') return [...rows].sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
    if (local.sort === 'oldest') return [...rows].sort((a, b) => String(a.createdAt ?? '').localeCompare(String(b.createdAt ?? '')));
    if (local.sort === 'status') return [...rows].sort((a, b) => Number(b.active === true) - Number(a.active === true) || byName(a, b));
    return [...rows].sort(byName);
  }

  function noteServerTotal(t) { /* بی‌فیلتر، جمع سرور همان جمع کل است */
    if (!hasFilter()) totalAll = t;
  }

  function syncTotalAll() {
    if (!hasFilter() || totalAll !== null) return;
    api.get(`/api/students${qs({ page: 1, page_size: 1 })}`)
      .then((r) => { totalAll = r.meta?.total ?? null; if (countBadge.isConnected) paintCount(getResult()?.meta?.total ?? 0); })
      .catch(() => {});
  }

  function quietSyncCount() {
    Promise.all([
      api.get(`/api/students${qs({ query: local.query || undefined, school_id: local.schoolId || undefined, tag_id: local.tagId || undefined, owner_id: local.ownerId || undefined, page: 1, page_size: 1 })}`),
      hasFilter() ? api.get(`/api/students${qs({ page: 1, page_size: 1 })}`) : Promise.resolve(null)
    ])
      .then(([res, allRes]) => {
        if (allRes) totalAll = allRes.meta?.total ?? totalAll;
        paintCount(res.meta?.total ?? 0);
      })
      .catch(() => {});
  }

  /* مرتب‌سازی — فقط همین صفحه را سمت کاربر می‌چیند (بدون GET)؛ انتخاب در state ماژول می‌ماند */
  const sortSel = el('select', { class: 'select', 'aria-label': 'مرتب‌سازی', onchange: (e) => { local.sort = e.target.value; onSortChange(); } },
    el('option', { value: 'name', selected: local.sort === 'name' }, 'نام'),
    el('option', { value: 'newest', selected: local.sort === 'newest' }, 'جدیدترین'),
    el('option', { value: 'oldest', selected: local.sort === 'oldest' }, 'قدیمی‌ترین'),
    el('option', { value: 'status', selected: local.sort === 'status' }, 'وضعیت')
  );

  return { paintCount, sortRows, noteServerTotal, syncTotalAll, quietSyncCount, sortSel };
}
