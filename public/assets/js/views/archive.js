import { api, qs } from '../api.js';
import { fa, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, confirmModal, toast, toastError, dataTable, skeletonState, emptyState, phoneCell } from '../ui.js';
import { fetchTags, tagChipsPreview, openTagEditor } from '../tagging.js';
import { openArchiveStudentForm, openEducationHistory } from '../archive-form.js';
import { session } from '../state.js';

const local = {
  query: '',
  schoolId: '',
  tagId: '',
  page: 1,
  pageSize: 20,
  schools: [],
  tags: [],
  classes: []
};

export async function renderArchive(container) {
  container.replaceChildren(skeletonState('table', 6));

  if (local.schools.length === 0 && local.tags.length === 0 && local.classes.length === 0) {
    try {
      const [schoolsRes, tagsRes, classesRes] = await Promise.all([
        api.get('/api/schools').catch(() => ({ data: [] })),
        fetchTags(),
        api.get('/api/classes?active=true').catch(() => ({ data: [] }))
      ]);
      local.schools = schoolsRes.data;
      local.tags = tagsRes;
      local.classes = classesRes.data;
    } catch {
      local.schools = [];
      local.tags = [];
      local.classes = [];
    }
  }

  let result;
  try {
    result = await api.get(`/api/students${qs({
      active: 'false',
      query: local.query || undefined,
      school_id: local.schoolId || undefined,
      tag_id: local.tagId || undefined,
      page: local.page,
      page_size: local.pageSize
    })}`);
  } catch (err) {
    container.replaceChildren(emptyState({ iconName: 'alert', title: 'خطا در بارگذاری آرشیو', hint: err.message }));
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

  const searchInput = el('input', { class: 'input', placeholder: 'جستجو: نام یا کد ملی…', value: local.query });
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      local.query = searchInput.value.trim();
      local.page = 1;
      renderArchive(container);
    }, 350);
  });

  const schoolSel = el('select', { class: 'select', onchange: (e) => { local.schoolId = e.target.value; local.page = 1; renderArchive(container); } },
    el('option', { value: '' }, 'همه مدارس'),
    local.schools.map((s) => el('option', { value: s.id, selected: s.id === local.schoolId }, s.name))
  );

  const tagFilter = local.tags.length > 0 ? buildTagDropdown(container) : null;

  const toolbar = el('div', { class: 'toolbar' },
    searchInput,
    schoolSel,
    tagFilter,
    el('div', { class: 'spacer' }),
    el('button', { class: 'btn btn--primary btn--sm', onclick: () => openArchiveStudentForm({
      onSaved: ({ student }) => {
        renderArchive(container);
        if (student) setTimeout(() => openEducationHistory(student, { onChanged: () => {} }), 150);
      }
    }) },
      icon('plus', 16), 'دانش‌آموز جدید در آرشیو')
  );

  const hasFilter = Boolean(local.query || local.schoolId || local.tagId);
  const table = dataTable({
    columns: [
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
      { key: 'guardianPhone', label: 'تلفن ولی', render: (s) => s.guardianPhone
        ? phoneCell(s.guardianPhone, `تماس با ولیّ ${s.firstName ?? ''} ${s.lastName ?? ''} — ${fa(s.guardianPhone)}`)
        : el('span', { class: 'cell-sub' }, '—') },
      {
        key: 'actions', label: 'عملیات', align: 'end',
        render: (s) => el('div', { class: 'cell-actions' },
          el('button', { class: 'btn btn--ghost btn--sm', title: 'پروفایل', onclick: () => { location.hash = `#/students/${s.id}`; } }, icon('user', 15)),
          el('button', {
            class: 'btn btn--ghost btn--sm', title: 'تاریخچهٔ تحصیلی',
            onclick: () => openEducationHistory(s)
          }, icon('school', 15)),
          el('button', { class: 'btn btn--ghost btn--sm', title: 'برچسب‌ها', onclick: () => openRowTagEditor(s, container) }, icon('tag', 15)),
          el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', onclick: () => openArchiveStudentForm({ student: s, onSaved: () => renderArchive(container) }) }, icon('edit', 15)),
          el('button', {
            class: 'btn btn--soft btn--sm', title: 'بازگشت به چرخهٔ مرکز',
            onclick: async () => {
              if (!(await confirmModal({
                title: 'بازگشت به چرخهٔ مرکز',
                message: `«${s.firstName} ${s.lastName}» از آرشیو به «دانش‌آموزان» فعال منتقل می‌شود و در لیست دانش‌آموزهای مسئول پرونده‌اش دیده می‌شود.`,
                confirmLabel: 'فعال کن'
              }))) return;
              try {
                await api.post(`/api/students/${s.id}/activate`);
                toast('به چرخهٔ مرکز بازگشت — در «دانش‌آموزان» دیده می‌شود', 'success');
                renderArchive(container);
              } catch (err) { toastError(err); }
            }
          }, icon('check', 15), 'فعال‌سازی'),
          el('button', {
            class: 'btn btn--danger btn--sm', title: 'حذف کامل پرونده — فقط اگر هیچ سابقه‌ای نداشته باشد',
            onclick: async () => {
              if (!(await confirmModal({ title: 'حذف کامل پرونده', message: `پروندهٔ «${s.firstName} ${s.lastName}» به‌کلی از آرشیو پاک می‌شود — فقط برای ثبت‌های اشتباه. اگر سابقهٔ جلسه/پیگیری دارد حذف ممکن نیست (پیام سرور راهنمایی می‌کند). برگشت ندارد.`, confirmLabel: 'حذف کن', danger: true }))) return;
              try {
                await api.del(`/api/students/${s.id}`);
                toast('پرونده حذف شد', 'success');
                renderArchive(container);
              } catch (err) { toastError(err); }
            }
          }, icon('trash', 15))
        )
      }
    ],
    rows: result.data,
    onRowClick: (s) => { location.hash = `#/students/${s.id}`; },
    empty: {
      iconName: 'file',
      title: hasFilter ? 'نتیجه‌ای در آرشیو پیدا نشد' : 'آرشیو خالی است',
      hint: hasFilter
        ? 'جستجو یا فیلتر را تغییر دهید.'
        : 'دیتابیس دانش‌آموزان نیاز ویژهٔ شهر — پرونده‌های خارج‌شده از چرخه این‌جا نگه داشته می‌شوند و می‌توانید مستقیم هم دانش‌آموز تعریف کنید.',
      actionLabel: hasFilter ? undefined : 'دانش‌آموز جدید در آرشیو',
      onAction: () => openArchiveStudentForm({
        onSaved: ({ student }) => {
          renderArchive(container);
          if (student) setTimeout(() => openEducationHistory(student, { onChanged: () => {} }), 150);
        }
      })
    }
  });

  const meta = result.meta ?? { page: 1, totalPages: 1, total: 0 };
  const pager = el('div', { class: 'pager' },
    el('span', {}, `صفحه ${fa(meta.page)} از ${fa(meta.totalPages)} · ${fa(meta.total)} پرونده`),
    el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page <= 1, onclick: () => { local.page -= 1; renderArchive(container); } }, 'قبلی'),
    el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page >= meta.totalPages, onclick: () => { local.page += 1; renderArchive(container); } }, 'بعدی')
  );

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'آرشیو'),
      el('span', { class: 'badge badge--neutral' }, `${fa(meta.total)} پرونده`)
    ),
    el('div', { class: 'muted', style: { fontSize: '13px', margin: '0 2px var(--sp-3)' } },
      'دیتابیس دانش‌آموزان نیاز ویژهٔ شهر — پرونده‌های خارج‌شده از چرخهٔ مرکز این‌جا حفظ می‌شوند؛ می‌توانید مستقیم هم دانش‌آموز با برچسب تعریف کنید و هر زمان به چرخه برگردانید.'),
    toolbar,
    el('div', { class: 'card card__body--flush', style: { boxShadow: 'var(--shadow-1)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-lg)' } }, table, pager)
  );

  searchInput.focus();
  const end = searchInput.value.length;
  searchInput.setSelectionRange(end, end);
}

function openRowTagEditor(student, container) {
  openTagEditor({
    student,
    tags: local.tags,
    current: student.tags ?? [],
    canCreateTag: session.user?.role === 'manager',
    onSaved: (newTags) => {
      student.tags = newTags;
      renderArchive(container);
    }
  });
}

function buildTagDropdown(container) {
  const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
  const activeTag = local.tagId ? local.tags.find((t) => t.id === local.tagId) : null;
  const btnLabel = el('span', {}, activeTag ? activeTag.name : 'همه برچسب‌ها');
  const btn = el('button', { class: `btn btn--soft btn--sm${activeTag ? ' is-active' : ''}`, onclick: toggle },
    icon('tag', 15),
    btnLabel,
    icon('chevL', 13)
  );
  const root = el('div', { class: 'dd' }, btn, panel);

  const CAT_LABELS = { disorder: 'نوع اختلال', grade: 'پایه', school_type: 'نوع مدرسه', custom: 'سفارشی' };
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
          t.name
        ));
      }
    }
    panel.replaceChildren(...items);
  }

  function toggle() {
    const open = panel.style.display !== 'none';
    if (open) { panel.style.display = 'none'; document.removeEventListener('mousedown', outside, true); }
    else { drawPanel(); panel.style.display = 'block'; document.addEventListener('mousedown', outside, true); }
  }

  function outside(e) {
    if (!root.contains(e.target)) { panel.style.display = 'none'; document.removeEventListener('mousedown', outside, true); }
  }

  function pick(tagId) {
    local.tagId = tagId;
    local.page = 1;
    panel.style.display = 'none';
    document.removeEventListener('mousedown', outside, true);
    renderArchive(container);
  }

  return root;
}
