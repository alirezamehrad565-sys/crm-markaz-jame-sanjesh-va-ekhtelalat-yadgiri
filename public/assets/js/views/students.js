import { api, qs } from '../api.js';
import { fa, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, confirmModal, toast, toastError, dataTable, statusBadge, loadingState, skeletonState, emptyState, callBadge } from '../ui.js';
import { fetchTags, tagChipsPreview, openTagEditor } from '../tagging.js';
import { openFocusEditor } from '../student-focus.js'; // درخت هدف در پروفایل
import { openStudentForm } from '../student-form.js';
import { openEducationHistory } from '../archive-form.js'; // — تاریخچهٔ تحصیلی
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

let searchRefocus = false;

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
    result = await api.get(`/api/students${qs({
      query: local.query || undefined,
      school_id: local.schoolId || undefined,
      tag_id: local.tagId || undefined,
      owner_id: local.ownerId || undefined,
      page: local.page,
      page_size: local.pageSize
    })}`);
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری', hint: err.message }));
    return;
  }

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

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'جستجو: نام یا کد ملی…', 'aria-label': 'جستجوی نام یا کد ملی', value: local.query }); /* S5-03 */
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      local.query = searchInput.value.trim();
      local.page = 1;
      searchRefocus = true; // فوکوس بین رندرها حفظ شود
      renderStudents(container);
    }, 350);
  });

  const schoolSel = el('select', { class: 'select', 'aria-label': 'فیلتر مدرسه', onchange: (e) => { local.schoolId = e.target.value; local.page = 1; renderStudents(container); } }, /* S5-03 */
    el('option', { value: '' }, 'همه مدارس'),
    local.schools.map((s) => el('option', { value: s.id, selected: s.id === local.schoolId }, s.name))
  );

  let ownerChips = null;
  if (isOffice() && local.staff.length > 0) {
    const pickOwner = (id) => { local.ownerId = id; local.page = 1; renderStudents(container); };
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
  const tagFilter = local.tags.length > 0 ? buildTagDropdown(container) : null;

  const toolbar = el('div', { class: 'toolbar' },
    searchInput,
    schoolSel,
    ownerChips,
    tagFilter,
    el('div', { class: 'spacer' }),
    canCreateStudent()
      ? el('button', { class: 'btn btn--primary btn--sm', onclick: () => openStudentForm({ onSaved: () => renderStudents(container) }) }, icon('plus', 16), isOffice() ? 'دانش‌آموز جدید' : 'دانش‌آموز جدید برای من')
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
      pickOwner(id);
    }

    return root;
  }

  function buildTagDropdown(container) {
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
      renderStudents(container);
    }

    return root;
  }

  const hasFilter = Boolean(local.query || local.schoolId || local.tagId || local.ownerId);
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
    { key: 'tags', label: 'برچسب‌ها', render: (s) => tagChipsPreview(s.tags, 3) },
    {
      key: 'owner', label: 'مسئول پرونده',
      render: (s) => s.ownerStaffId
        ? el('span', { class: 'cell-owner', title: 'پرونده به این همکار سپرده شده — در لیست دانش‌آموزهای او دیده می‌شود' },
            hueDot(s.ownerStaffId, 8),
            el('span', { class: 'badge badge--accent' }, ownerBadgeLabel(s.ownerStaffId)))
        : el('span', { class: 'cell-sub', title: 'هنوز مسئولی تعیین نشده' }, '—')
    },
    { key: 'guardianPhone', label: 'تلفن ولی', render: (s) => s.guardianPhone
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
    columns.push({
      key: 'actions', label: 'عملیات', align: 'end',
      render: (s) => el('div', { class: 'cell-actions' },
        el('button', { class: 'btn btn--ghost btn--sm', title: 'پروفایل', 'aria-label': 'پروفایل', onclick: () => { location.hash = `#/students/${s.id}`; } }, icon('user', 15)),
        el('button', { class: 'btn btn--ghost btn--sm', title: 'برچسب‌ها', 'aria-label': 'برچسب‌ها', onclick: () => openRowTagEditor(s, container) }, icon('tag', 15)),
        el('button', { class: 'btn btn--ghost btn--sm', title: 'هدف‌های شناختی', 'aria-label': 'هدف‌های شناختی', onclick: () => openRowFocusEditor(s, container) }, icon('target', 15)), // 
        el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', 'aria-label': 'ویرایش', onclick: () => openStudentForm({ student: s, onSaved: () => renderStudents(container) }) }, icon('edit', 15)),
        s.active
          ? el('button', {
              class: 'btn btn--danger btn--sm', title: 'انتقال به آرشیو', 'aria-label': 'انتقال به آرشیو',
              onclick: async () => {
                if (!(await confirmModal({ title: 'انتقال به آرشیو', message: `«${s.firstName} ${s.lastName}» از چرخهٔ فعال خارج و به «آرشیو» (دیتابیس شهر) منتقل می‌شود. سابقهٔ پرونده حفظ می‌شود.`, confirmLabel: 'به آرشیو ببر', danger: true }))) return;
                try {
                  await api.post(`/api/students/${s.id}/deactivate`);
                  toast('به آرشیو منتقل شد — در ماژول «آرشیو» دیده می‌شود', 'success');
                  renderStudents(container);
                } catch (err) { toastError(err); }
              }
            }, icon('x', 15))
          : el('button', {
              class: 'btn btn--soft btn--sm', title: 'بازگشت به چرخهٔ فعال', 'aria-label': 'بازگشت به چرخهٔ فعال',
              onclick: async () => {
                try {
                  await api.post(`/api/students/${s.id}/activate`);
                  toast('دانش‌آموز دوباره فعال شد', 'success');
                  renderStudents(container);
                } catch (err) { toastError(err); }
              }
            }, icon('check', 15)),
        el('button', {
          class: 'btn btn--danger btn--sm', title: 'حذف کامل پرونده — فقط اگر هیچ سابقه‌ای نداشته باشد', 'aria-label': 'حذف کامل پرونده — فقط اگر هیچ سابقه‌ای نداشته باشد',
          onclick: async () => {
            if (!(await confirmModal({ title: 'حذف کامل پرونده', message: `پروندهٔ «${s.firstName} ${s.lastName}» به‌کلی پاک می‌شود — فقط برای ثبت‌های اشتباه (مثلاً نام غلط که اجازهٔ ثبت مجدد با همان کد ملی نمی‌دهد). اگر سابقهٔ جلسه/پیگیری دارد حذف ممکن نیست و «انتقال به آرشیو» را استفاده کنید. برگشت ندارد.`, confirmLabel: 'حذف کن', danger: true }))) return;
            try {
              await api.del(`/api/students/${s.id}`);
              toast('پرونده حذف شد', 'success');
              renderStudents(container);
            } catch (err) { toastError(err); }
          }
        }, icon('trash', 15))
      )
    });
  }

  const table = dataTable({
    columns,
    rows: result.data,
    onRowClick: (s) => { location.hash = `#/students/${s.id}`; },
    rowClass: (s) => (s.ownerStaffId ? hueClass(s.ownerStaffId) : null),
    empty: {
      iconName: 'student',
      title: hasFilter ? 'نتیجه‌ای پیدا نشد' : (session.user?.role === 'therapist' ? 'هنوز دانش‌آموزی در لیست شما نیست' : 'هنوز دانش‌آموزی ثبت نشده'),
      hint: hasFilter
        ? 'جستجو یا فیلتر را تغییر دهید.'
        : (session.user?.role === 'therapist'
          ? 'دانش‌آموزهای سپرده‌شده به شما یا دارای سابقهٔ جلسه این‌جا دیده می‌شوند — با «دانش‌آموز جدید برای من» پروندهٔ فعال بسازید.'
          : 'اولین دانش‌آموز را با کد ملی معتبر اضافه کنید؛ پشت‌نوبتی‌ها در ماژول «لیست انتظار» ثبت می‌شوند.'),
      actionLabel: hasFilter || !canCreateStudent() ? undefined : 'دانش‌آموز جدید',
      onAction: () => openStudentForm({ onSaved: () => renderStudents(container) })
    }
  });

  const meta = result.meta ?? { page: 1, totalPages: 1, total: 0 };
  const pager = el('div', { class: 'pager' },
    el('span', {}, `صفحه ${fa(meta.page)} از ${fa(meta.totalPages)} · ${fa(meta.total)} نفر`),
    el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page <= 1, onclick: () => { local.page -= 1; renderStudents(container); } }, 'قبلی'),
    el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page >= meta.totalPages, onclick: () => { local.page += 1; renderStudents(container); } }, 'بعدی')
  );

  let legend = null;
  if (isOffice()) {
    const ownerIds = [...new Set(result.data.filter((s) => s.ownerStaffId).map((s) => s.ownerStaffId))];
    const noOwner = result.data.filter((s) => !s.ownerStaffId).length;
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

  container.replaceChildren(
    ...[
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'دانش‌آموزان'),
      el('span', { class: 'badge badge--neutral' }, `${fa(meta.total)} نفر`)
    ),
    el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', margin: '0 2px var(--sp-3)' } }, /* 13px خام (S5-06) */
      session.user?.role === 'therapist'
        ? 'لیست دانش‌آموزهای شما — پرونده‌هایی که مسئولشان هستید یا سابقهٔ جلسه با شما دارند.'
        : 'دانش‌آموزان فعال مرکز؛ پشت‌نوبتی‌ها در ماژول «لیست انتظار» و خروجی‌ها در «آرشیو» نگه داشته می‌شوند.'),
    toolbar,
    legend,
    el('div', { class: 'card card__body--flush card--table cv-block' }, table, pager) /* E2 */
    ].filter(Boolean)
  );

  if (searchRefocus) {
    searchRefocus = false;
    searchInput.focus();
    const end = searchInput.value.length;
    searchInput.setSelectionRange(end, end);
  }
}

function openRowTagEditor(student, container) {
  openTagEditor({
    student,
    tags: local.tags,
    current: student.tags ?? [],
    canCreateTag: session.user?.role === 'manager',
    onSaved: (newTags) => {
      student.tags = newTags;
      renderStudents(container);
    }
  });
}

// ویرایش هدف‌های شناختی با همان درخت واحد؛ بعد از ذخیره چیپ‌های هدف روی ردیف تازه می‌شوند
function openRowFocusEditor(student, container) {
  openFocusEditor({ student, onSaved: () => renderStudents(container) });
}
