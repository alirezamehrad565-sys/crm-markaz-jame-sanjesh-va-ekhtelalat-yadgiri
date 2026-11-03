import { api, qs } from '../api.js';
import { fa, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, confirmModal, toast, toastError, statusBadge, skeletonState, emptyState, callBadge, collapseRemove, flashNode, lockBtn } from '../ui.js';
import { fetchTags, tagChipsPreview, openTagEditor } from '../tagging.js';
import { openFocusEditor } from '../student-focus.js'; // درخت هدف در پروفایل
import { openStudentForm } from '../student-form.js';
import { openStudentDelete } from '../student-delete.js'; // — جریان واحد حذف کامل پرونده (مشترک با کارت پروفایل)
import { hueClass, hueDot } from '../staff-hue.js'; // — رنگ درمانگر روی ردیف جدول/چیپ فیلتر/راهنما
import { session } from '../state.js';

const local = {
  query: '',
  schoolId: '',
  tagId: '',
  ownerId: '',
  page: 1,
  pageSize: 20,
  schools: [],
  tags: [],
  classes: [],
  staff: []
};

function isOffice() {
  return session.user?.role === 'manager' || session.user?.role === 'secretary';
}

function canCreateStudent() {
  return isOffice() || session.user?.role === 'therapist';
}

async function ensureMeta() {
  if (local.schools.length === 0 && local.tags.length === 0 && local.classes.length === 0) {
    const [schoolsRes, tagsRes, classesRes] = await Promise.all([
      api.get('/api/schools').catch(() => ({ data: [] })),
      fetchTags(),
      api.get('/api/classes?active=true').catch(() => ({ data: [] }))
    ]);
    local.schools = schoolsRes.data;
    local.tags = tagsRes;
    local.classes = classesRes.data;
  }
  if (isOffice() && local.staff.length === 0) {
    try {
      const staffRes = await api.get('/api/staff');
      local.staff = (staffRes.data ?? []).filter((s) => s.active !== false);
    } catch {
      local.staff = [];
    }
  }
}

export async function renderStudents(container, ctx) {
  if (ctx?.query?.tab === 'waitlist') {
    const carry = [];
    if (ctx.query.q) carry.push(`q=${encodeURIComponent(ctx.query.q)}`);
    if (ctx.query.prefill) carry.push(`prefill=${encodeURIComponent(ctx.query.prefill)}`);
    location.replace(`#/waitlist${carry.length ? `?${carry.join('&')}` : ''}`);
    return;
  }

  if (ctx?.query && 'tag_id' in ctx.query) local.tagId = ctx.query.tag_id || '';

  container.replaceChildren(skeletonState('table', 6));

  try {
    await ensureMeta();
  } catch {
    local.schools = [];
    local.tags = [];
    local.classes = [];
  }

  let result;
  try {
    result = await fetchPage();
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }));
    return;
  }

  /* —— ۱.۲۳.۰ جریان ترکیبی (زبان ۱.۱۹–۱.۲۲): شِل (جستجو/فیلترها/جدول/پیجر) یک‌بار مونت می‌شود؛
     برچسب‌ها = پچ همان ردیف از آبجکت محلی، آرشیو/فعال‌سازی = پچ بج وضعیت از پاسخ سرور
     (این لیست فعال‌ها و غیرفعال‌ها را با هم نشان می‌دهد)، حذف = جمع‌شدن نرم،
     ایجاد/ویرایش = همگام‌سازی بی‌صدای فقط-tbody. فیلتر/جستجو/صفحه‌بندی هم فقط tbody. —— */

  const schoolName = (id) => local.schools.find((s) => s.id === id)?.name ?? '—';
  const classInfo = (s) => {
    const cls = local.classes.find((c) => c.id === s.classId);
    if (!cls && !s.className) return null;
    const name = s.className ?? cls?.name ?? '';
    const teacher = s.teacherName ?? cls?.teacherName ?? '';
    return teacher ? `${name} — ${teacher}` : name;
  };
  const ownerName = (id) => local.staff.find((s) => s.id === id)?.fullName ?? null;
  const ownerBadgeLabel = (id) => (id === session.user?.staffId ? 'خود شما' : ownerName(id) ?? 'همکار');
  const hasFilter = () => Boolean(local.query || local.schoolId || local.tagId || local.ownerId);

  const columns = [
    {
      key: 'name', label: 'نام',
      render: (s) => el('div', {},
        el('div', { class: 'cell-main' }, `${s.firstName} ${s.lastName}`),
        s.grade ? el('div', { class: 'cell-sub' }, gradeLabel(s.grade)) : null
      )
    },
    { key: 'nationalId', label: 'کد ملی', render: (s) => el('span', { dir: 'ltr' }, isPlaceholderNid(s.nationalId) ? '—' : fa(s.nationalId)) },
    {
      key: 'schoolId', label: 'مدرسه / کلاس',
      render: (s) => el('div', {},
        el('div', { class: 'cell-main' }, schoolName(s.schoolId)),
        classInfo(s) ? el('div', { class: 'cell-sub' }, classInfo(s)) : null
      )
    },
    { key: 'tags', label: 'برچسب‌ها', render: (s) => tagChipsPreview(s.tags, 2) }, /* ۱.۱۶.۰: پیش‌نمایش ۲ چیپ — جا برای دایره‌های اقدام بدون اسکرول افقی */
    {
      key: 'owner', label: 'مسئول پرونده',
      render: (s) => s.ownerStaffId
        ? el('span', { class: 'cell-owner', title: 'پرونده به این همکار سپرده شده — در لیست دانش‌آموزهای او دیده می‌شود' },
            hueDot(s.ownerStaffId, 8),
            el('span', { class: 'badge badge--accent' }, ownerBadgeLabel(s.ownerStaffId)))
        : el('span', { class: 'cell-sub', title: 'هنوز مسئولی تعیین نشده' }, '—')
    },
    { key: 'guardianPhone', label: 'تلفن ولیّ', render: (s) => s.guardianPhone
      ? el('span', { class: 'cell-phone' },
          el('span', { dir: 'ltr' }, fa(s.guardianPhone)),
          callBadge(s.guardianPhone, `تماس با ولیّ ${s.firstName} ${s.lastName} — ${fa(s.guardianPhone)}`))
      : el('span', { class: 'cell-sub' }, '—') },
    {
      key: 'assessmentCount', label: 'رویداد', align: 'center',
      render: (s) => (s.assessmentCount ?? 0) > 0
        ? el('span', {
            class: 'badge badge--accent',
            title: `${fa(s.assessmentCount)} رویداد/گزارش ثبت‌شده برای این دانش‌آموز`
          }, fa(s.assessmentCount))
        : el('span', { class: 'cell-sub', title: 'هنوز رویدادی ثبت نشده' }, '—')
    },
    {
      key: 'active', label: 'وضعیت',
      render: (s) => statusBadge(s.active ? 'active' : 'inactive')
    }
  ];

  if (isOffice()) {
    /* ۱.۱۶.۰ — به درخواست کاربر: سیستم مودال‌محورِ منوی ⋯ حذف شد — دکمه‌ها مستقیم سرِ ردیف‌اند.
       ترتیب: امن‌ها اول (ویرایش/برچسب/هدف/آرشیو)؛ حذفِ مخرب همیشه آخری با فاصلهٔ ایمن اضافه.
       هر دکمه قفل مشغولی واحد lockBtn دارد (ضد اسپم/دوبارکلیک). دسترسی‌ها دست‌نخورده ماند. */
    const rowCircle = (iconName, label, onclick, danger = false) =>
      el('button', {
        class: `icon-circle${danger ? ' icon-circle--danger' : ''}`,
        type: 'button', title: label, 'aria-label': label,
        onclick: (e) => lockBtn(e.currentTarget, onclick)
      }, icon(iconName, 14));
    columns.push({
      key: 'actions', label: 'عملیات', align: 'end',
      render: (s) => el('div', { class: 'cell-actions row-circles', role: 'group', 'aria-label': `اقدامات ${s.firstName} ${s.lastName}` },
        rowCircle('edit', 'ویرایش', () => openStudentForm({ student: s, onSaved: () => ctl.quietSync() })),
        rowCircle('tag', 'برچسب‌ها', () => openRowTagEditor(s, ctl)),
        rowCircle('target', 'هدف‌های شناختی', () => openRowFocusEditor(s)),
        s.active
          ? rowCircle('archive', 'انتقال به آرشیو — سابقهٔ پرونده حفظ می‌شود', () => archiveStudent(s))
          : rowCircle('check', 'بازگشت به چرخهٔ فعال', () => activateStudent(s)),
        rowCircle('trash', 'حذف کامل پرونده', () => openStudentDelete(s, { onDeleted: () => ctl.remove(s.id) }), true)
      )
    });
  }

  async function archiveStudent(s) {
    if (!(await confirmModal({ title: 'انتقال به آرشیو', message: `«${s.firstName} ${s.lastName}» از چرخهٔ فعال خارج و به «آرشیو» (دیتابیس شهر) منتقل می‌شود. سابقهٔ پرونده حفظ می‌شود.`, confirmLabel: 'به آرشیو ببر', danger: true }))) return;
    try {
      const res = await api.post(`/api/students/${s.id}/deactivate`);
      toast('به آرشیو منتقل شد — در ماژول «آرشیو» دیده می‌شود', 'success');
      ctl.patch(res.data); // — این لیست غیرفعال‌ها را هم نشان می‌دهد؛ فقط بج وضعیت و دایرهٔ اقدام عوض می‌شود
    } catch (err) { toastError(err); }
  }

  async function activateStudent(s) {
    try {
      const res = await api.post(`/api/students/${s.id}/activate`);
      toast('دانش‌آموز دوباره فعال شد', 'success');
      ctl.patch(res.data);
    } catch (err) { toastError(err); }
  }

  const colCount = columns.length;
  const thead = el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col', style: c.align ? { textAlign: c.align } : null }, c.label))));
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, thead, tbody));
  const legendZone = el('div', {});
  const pagerZone = el('div', {});
  const tableZone = el('div', {}, legendZone, el('div', { class: 'card card__body--flush card--table cv-block' }, table, pagerZone)); /* E2 */
  const countBadge = el('span', { class: 'badge badge--neutral' });

  function fetchPage() {
    return api.get(`/api/students${qs({
      query: local.query || undefined,
      school_id: local.schoolId || undefined,
      tag_id: local.tagId || undefined,
      owner_id: local.ownerId || undefined,
      page: local.page,
      page_size: local.pageSize
    })}`);
  }

  function rowEl(s) {
    return el(
      'tr',
      {
        class: ['is-clickable', s.ownerStaffId ? hueClass(s.ownerStaffId) : null].filter(Boolean).join(' ') || null,
        dataset: { id: String(s.id) },
        tabindex: '0',
        // — ردیف کلیک‌پذیر با کیبورد (الگوی dataTable): Enter/Space روی خود ردیف
        onkeydown: (e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key !== 'Enter' && e.key !== ' ') return;
          e.preventDefault();
          location.hash = `#/students/${s.id}`;
        },
        onclick: (e) => {
          if (e.target.closest('button, a, input, select, textarea, label, [role="button"]')) return;
          location.hash = `#/students/${s.id}`;
        }
      },
      columns.map((c) =>
        el('td', { style: c.align ? { textAlign: c.align } : null, dataset: { label: c.label } }, c.render ? c.render(s) : s[c.key] ?? '—')
      )
    );
  }

  function emptyRow() {
    return el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } },
      emptyState({
        iconName: 'student',
        title: hasFilter() ? 'نتیجه‌ای پیدا نشد' : (session.user?.role === 'therapist' ? 'هنوز دانش‌آموزی در لیست شما نیست' : 'هنوز دانش‌آموزی ثبت نشده'),
        hint: hasFilter()
          ? 'جستجو یا فیلتر را تغییر دهید.'
          : (session.user?.role === 'therapist'
            ? 'دانش‌آموزهای سپرده‌شده به شما یا دارای سابقهٔ جلسه این‌جا دیده می‌شوند — با «دانش‌آموز جدید برای من» پروندهٔ فعال بسازید.'
            : 'اولین دانش‌آموز را با کد ملی معتبر اضافه کنید؛ پشت‌نوبتی‌ها در ماژول «لیست انتظار» ثبت می‌شوند.'),
        actionLabel: hasFilter() || !canCreateStudent() ? undefined : 'دانش‌آموز جدید',
        onAction: () => openStudentForm({ onSaved: () => ctl.quietSync() })
      })));
  }

  function paintLegend(rows) {
    let legend = null;
    if (isOffice()) {
      const ownerIds = [...new Set(rows.filter((s) => s.ownerStaffId).map((s) => s.ownerStaffId))];
      const noOwner = rows.filter((s) => !s.ownerStaffId).length;
      if (ownerIds.length >= 2) {
        legend = el('div', { class: 'appt-legend' },
          el('span', { class: 'appt-legend__name' }, 'رنگ ردیف = درمانگرِ مسئول پرونده'),
          ownerIds.map((id) => el('span', { class: 'appt-legend__item' }, hueDot(id, 8), ownerName(id) ?? 'همکار')),
          noOwner > 0
            ? el('span', { class: 'appt-legend__item' }, el('span', { class: 'appt-legend__none', 'aria-hidden': 'true' }), 'بدون مسئول')
            : null
        );
      }
    }
    legendZone.replaceChildren(...(legend ? [legend] : []));
  }

  function renderTbody(res) {
    result = res;
    const rows = res.data ?? [];
    const meta = res.meta ?? { page: 1, totalPages: 1, total: rows.length };
    countBadge.textContent = `${fa(meta.total)} نفر`;
    tbody.replaceChildren(...(rows.length ? rows.map((s) => rowEl(s)) : [emptyRow()]));
    paintLegend(rows);

    /* UX-ممیزی P3: پیجر «صفحه ۱ از ۱» در لیست‌های تک‌صفحه‌ای حذف شد */
    pagerZone.replaceChildren(
      ...(meta.totalPages > 1
        ? [el('div', { class: 'pager' },
            el('span', {}, `صفحه ${fa(meta.page)} از ${fa(meta.totalPages)} · ${fa(meta.total)} نفر`),
            el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page <= 1, onclick: () => { local.page -= 1; refreshRows(); } }, 'قبلی'),
            el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page >= meta.totalPages, onclick: () => { local.page += 1; refreshRows(); } }, 'بعدی'))]
        : [])
    );
  }

  let gen = 0; // — گارد نسل: پاسخ کهنه رندر نمی‌شود (تایپ/فیلتر سریع)
  async function refreshRows() {
    const myGen = ++gen;
    try {
      const r = await fetchPage();
      if (myGen !== gen || !tbody.isConnected) return; // پاسخ کهنه — کاربر ادامه تایپ/فیلتر زده
      renderTbody(r);
    } catch (err) {
      if (myGen !== gen || !tbody.isConnected) return;
      tbody.replaceChildren(el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } },
        emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }))));
    }
  }

  function ensureNonEmptyPaint() {
    setTimeout(() => {
      if (tbody.isConnected && !tbody.querySelector('tr[data-id]')) renderTbody(result);
    }, 320);
  }

  const ctl = {
    /* پچ درجای یک ردیف — همسایه‌ها، اسکرول و فوکوس سرجایشان */
    patch(s) {
      if (!s?.id || !tbody.isConnected) { ctl.quietSync(); return; }
      const list = result?.data ?? [];
      const idx = list.findIndex((r) => String(r.id) === String(s.id));
      if (idx >= 0) list[idx] = s;
      const old = tbody.querySelector(`tr[data-id="${CSS.escape(String(s.id))}"]`);
      if (!old) { ctl.quietSync(); return; }
      const fresh = rowEl(s);
      old.replaceWith(fresh);
      flashNode(fresh);
    },
    /* حذف کامل (پاسخ بدون رکورد): جمع‌شدن نرم همان ردیف + کش صفحهٔ جاری به‌روز (رفع شبح ۱.۲۲) */
    remove(id) {
      if (result?.data) {
        result = {
          ...result,
          data: (result.data ?? []).filter((s) => String(s.id) !== String(id)),
          meta: { ...(result.meta ?? {}), total: Math.max(0, (result.meta?.total ?? 1) - 1) }
        };
      }
      const old = tbody.querySelector(`tr[data-id="${CSS.escape(String(id))}"]`);
      if (old) { collapseRemove(old); ensureNonEmptyPaint(); }
      ctl.quietSyncCount();
    },
    /* همگام‌سازی بی‌صدای فهرست + پیجر — بدون اسکلت، بدون دست‌زدن به نوار ابزار */
    quietSync: refreshRows,
    /* فقط شمارندهٔ سربرگ (پس از حذف؛ پیجر همان‌جا می‌ماند تا انیمیشن سالم بماند) */
    quietSyncCount() {
      api.get(`/api/students${qs({ query: local.query || undefined, school_id: local.schoolId || undefined, tag_id: local.tagId || undefined, owner_id: local.ownerId || undefined, page: 1, page_size: 1 })}`)
        .then((res) => { countBadge.textContent = `${fa(res.meta?.total ?? 0)} نفر`; })
        .catch(() => {});
    }
  };

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'جستجو: نام یا کد ملی…', 'aria-label': 'جستجوی نام یا کد ملی', value: local.query }); /* S5-03 */
  let searchTimer = null;

  function runSearch() {
    const v = searchInput.value.trim();
    if (v === local.query) return;
    local.query = v;
    local.page = 1;
    if (v.length === 1) {
      countBadge.textContent = '—';
      tbody.replaceChildren(el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } },
        emptyState({ iconName: 'search', title: 'حداقل ۲ نویسه بنویسید…', hint: 'بخشی از نام خانوادگی یا کد ملی را وارد کنید.' }))));
      return;
    }
    refreshRows();
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(runSearch, 300);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); clearTimeout(searchTimer); runSearch(); }
    else if (e.key === 'Escape' && searchInput.value) { searchInput.value = ''; clearTimeout(searchTimer); runSearch(); }
  });

  const schoolSel = el('select', { class: 'select', 'aria-label': 'فیلتر مدرسه', onchange: (e) => { local.schoolId = e.target.value; local.page = 1; refreshRows(); } }, /* S5-03 */
    el('option', { value: '' }, 'همه مدارس'),
    local.schools.map((s) => el('option', { value: s.id, selected: s.id === local.schoolId }, s.name))
  );

  let ownerChips = null;
  if (isOffice() && local.staff.length > 0) {
    const pickOwner = (id) => { local.ownerId = id; local.page = 1; refreshRows(); };
    if (local.staff.length > 5) {
      // درمانگرهای زیاد: فیلتر کشویی؛ نوار اسکرولی داخل تولبار با تعداد زیاد چیدمان را می‌شکست
      ownerChips = buildOwnerDropdown();
    } else {
      ownerChips = el('div',
        {
          class: 'staff-chips',
          role: 'group',
          'aria-label': 'فیلتر مسئول پرونده'
        },
        el('button', { class: `staff-chip${local.ownerId === '' ? ' is-active' : ''}`, onclick: () => pickOwner('') }, 'همه'),
        local.staff.map((s) =>
          el('button',
            { class: `staff-chip ${hueClass(s.id)}${local.ownerId === s.id ? ' is-active' : ''}`, onclick: () => pickOwner(s.id) },
            hueDot(s.id, 10),
            `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id
          )
        )
      );
    }
  }

  const activeTag = local.tagId ? local.tags.find((t) => t.id === local.tagId) : null;
  const tagFilter = local.tags.length > 0 ? buildTagDropdown() : null;

  const toolbar = el('div', { class: 'toolbar' },
    searchInput,
    schoolSel,
    ownerChips,
    tagFilter,
    el('div', { class: 'spacer' }),
    canCreateStudent()
      ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => openStudentForm({ onSaved: () => ctl.quietSync() }) }, icon('plus', 16), isOffice() ? 'دانش‌آموز جدید' : 'دانش‌آموز جدید برای من')
      : null
  );

  // فیلتر مسئول پرونده برای درمانگرهای زیاد: کشویی با همان الگوی برچسب‌ها؛ هرگز تولبار را نمی‌شکند
  function buildOwnerDropdown() {
    const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
    const currentLabel = local.ownerId ? (ownerName(local.ownerId) ?? 'مسئول پرونده') : 'مسئول پرونده: همه';
    const btn = el('button', { class: `btn btn--soft btn--sm${local.ownerId ? ' is-active' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', title: 'فیلتر مسئول پرونده', onclick: toggle }, /* S5-04 */
      local.ownerId ? hueDot(local.ownerId, 10) : null,
      el('span', {}, currentLabel),
      icon('chevL', 13)
    );
    const root = el('div', { class: 'dd' }, btn, panel);

    function drawPanel() {
      const items = [
        el('button', {
          class: `dd__item dd__all${!local.ownerId ? ' is-on' : ''}`,
          onclick: () => pick('')
        }, 'همه درمانگرها')
      ];
      for (const s of local.staff) {
        const isOn = local.ownerId === s.id;
        items.push(el('button', {
          class: `dd__item${isOn ? ' is-on' : ''}`,
          onclick: () => pick(isOn ? '' : s.id)
        },
          hueDot(s.id, 10),
          `${s.fullName ?? s.full_name ?? ''}`.trim() || s.id
        ));
      }
      panel.replaceChildren(...items);
    }

    function ddEsc(e) { /* S5-04: Escape منو را می‌بندد، نه مودال/نما */
      if (e.key !== 'Escape') return;
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', ddEsc, true);
      document.removeEventListener('mousedown', outside, true);
      btn.focus();
    }
    function toggle() {
      const open = panel.style.display !== 'none';
      if (open) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', ddEsc, true); }
      else { drawPanel(); panel.style.display = 'block'; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', ddEsc, true); }
    }

    function outside(e) {
      if (!root.contains(e.target)) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', ddEsc, true); }
    }

    function pick(id) {
      panel.style.display = 'none';
      document.removeEventListener('mousedown', outside, true);
      local.ownerId = id;
      local.page = 1;
      refreshRows();
    }

    return root;
  }

  function buildTagDropdown() {
    const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
    const btnLabel = el('span', {}, activeTag ? activeTag.name : 'همه برچسب‌ها');
    const btn = el('button', { class: `btn btn--soft btn--sm${activeTag ? ' is-active' : ''}`, type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', onclick: toggle }, /* S5-04 */
      icon('tag', 15),
      btnLabel,
      icon('chevL', 13)
    );
    const root = el('div', { class: 'dd' }, btn, panel);

    const CAT_LABELS = { disorder: 'نوع اختلال', grade: 'پایه تحصیلی', school_type: 'نوع مدرسه', custom: 'سفارشی' };
    const catOrder = ['disorder', 'grade', 'school_type', 'custom'];
    const ordered = [...local.tags].sort((a, b) => catOrder.indexOf(a.category) - catOrder.indexOf(b.category));

    function drawPanel() {
      const groups = new Map();
      for (const t of ordered) {
        if (!groups.has(t.category)) groups.set(t.category, []);
        groups.get(t.category).push(t);
      }
      const items = [
        el('button', {
          class: `dd__item dd__all${!local.tagId ? ' is-on' : ''}`,
          onclick: () => pick('')
        }, 'همه برچسب‌ها')
      ];
      for (const [cat, tags] of groups) {
        items.push(el('div', { class: 'dd__group' }, CAT_LABELS[cat] ?? cat));
        for (const t of tags) {
          const isOn = local.tagId === t.id;
          items.push(el('button', {
            class: `dd__item${isOn ? ' is-on' : ''}`,
            onclick: () => pick(isOn ? '' : t.id)
          },
            el('span', { class: 'tag-chip__dot', style: { background: t.color ?? 'var(--primary)' }, 'aria-hidden': 'true' }),
            t.name,
            t.usageCount !== undefined ? el('span', { class: 'count' }, `${fa(t.usageCount)} نفر`) : null
          ));
        }
      }
      panel.replaceChildren(...items);
    }

    function ddEsc(e) { /* S5-04: Escape منو را می‌بندد، نه مودال/نما */
      if (e.key !== 'Escape') return;
      panel.style.display = 'none';
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('keydown', ddEsc, true);
      document.removeEventListener('mousedown', outside, true);
      btn.focus();
    }
    function toggle() {
      const open = panel.style.display !== 'none';
      if (open) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', ddEsc, true); }
      else { drawPanel(); panel.style.display = 'block'; btn.setAttribute('aria-expanded', 'true'); document.addEventListener('mousedown', outside, true); document.addEventListener('keydown', ddEsc, true); }
    }

    function outside(e) {
      if (!root.contains(e.target)) { panel.style.display = 'none'; btn.setAttribute('aria-expanded', 'false'); document.removeEventListener('mousedown', outside, true); document.removeEventListener('keydown', ddEsc, true); }
    }

    function pick(tagId) {
      local.tagId = tagId;
      local.page = 1;
      panel.style.display = 'none';
      document.removeEventListener('mousedown', outside, true);
      btn.classList.toggle('is-active', Boolean(local.tagId));
      btnLabel.textContent = local.tagId ? (local.tags.find((t) => t.id === local.tagId)?.name ?? 'همه برچسب‌ها') : 'همه برچسب‌ها';
      refreshRows(); // — خود دکمهٔ دراپ‌داون درجا به‌روز شد؛ فقط tbody عوض می‌شود
    }

    return root;
  }

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'دانش‌آموزان'),
      countBadge
    ),
    el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', margin: '0 2px var(--sp-3)' } }, /* 13px خام (S5-06) */
      session.user?.role === 'therapist'
        ? 'لیست دانش‌آموزهای شما — پرونده‌هایی که مسئولشان هستید یا سابقهٔ جلسه با شما دارند.'
        : 'دانش‌آموزان فعال مرکز؛ پشت‌نوبتی‌ها در ماژول «لیست انتظار» و خروجی‌ها در «آرشیو» نگه داشته می‌شوند.'),
    toolbar,
    tableZone
  );

  renderTbody(result);
}

function openRowTagEditor(student, ctl) {
  openTagEditor({
    student,
    tags: local.tags,
    current: student.tags ?? [],
    canCreateTag: session.user?.role === 'manager',
    onSaved: (newTags) => {
      student.tags = newTags;
      ctl.patch(student); // — چیپ‌های برچسب همان ردیف درجا؛ بدون GET
    }
  });
}

// ویرایش هدف‌های شناختی با همان درخت واحد؛ هیچ ستونی از این لیست هدف‌ها را نشان نمی‌دهد
// بنابراین بعد از ذخیره هیچ بازترسیمی لازم نیست (بدون اسکلت، بدون GET)
function openRowFocusEditor(student) {
  openFocusEditor({ student, onSaved: () => {} });
}
