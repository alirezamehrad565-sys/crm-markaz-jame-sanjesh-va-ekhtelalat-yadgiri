import { api, qs } from '../api.js';
import { fa, gradeLabel, isPlaceholderNid } from '../format.js';
import { el, icon, confirmModal, toast, toastError, loadingState, emptyState, phoneCell, collapseRemove, flashNode, lockBtn } from '../ui.js';
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
  container.replaceChildren(loadingState('بارگذاری آرشیو…'));

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

  /* —— ۱.۲۲.۰ جریان پیوسته (زبان ۱.۱۹–۱.۲۱): شِل (جستجو/فیلترها/جدول) یک‌بار مونت می‌شود؛
     برچسب‌ها، ویرایش، فعال‌سازی و حذف فقط ردیف خودشان را پچ یا جمع می‌کنند و
     جستجو/فیلتر/صفحه‌بندی فقط tbody و پیجر را عوض می‌کند — هک بازگشت مکان‌نما
     هم با همین کار بی‌معنا و حذف شد، چون input دیگر هرگز بازسازی نمی‌شود. —— */

  const schoolName = (id) => local.schools.find((s) => s.id === id)?.name ?? '—';
  /* ۱.۲۵.۰۱ — ناظر فقط-خواندن: اکشن‌های نوشتنی ردیف (برچسب/ویرایش/فعال‌سازی/حذف) و «دانش‌آموز جدید»
     پنهان می‌شوند؛ فقط مشاهدهٔ پروفایل و تاریخچهٔ تحصیلی می‌ماند (بک‌اند POST/PATCH/DELETE را ۴۰۳ می‌کند) */
  const isSupervisor = session.user?.role === 'supervisor';
  const classInfo = (s) => {
    const cls = local.classes.find((c) => c.id === s.classId);
    if (!cls && !s.className) return null;
    const name = s.className ?? cls?.name ?? '';
    const teacher = s.teacherName ?? cls?.teacherName ?? '';
    return teacher ? `${name} — ${teacher}` : name;
  };

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
    { key: 'guardianPhone', label: 'تلفن ولی', render: (s) => s.guardianPhone
      ? phoneCell(s.guardianPhone, `تماس با ولیّ ${s.firstName ?? ''} ${s.lastName ?? ''} — ${fa(s.guardianPhone)}`)
      : el('span', { class: 'cell-sub' }, '—') },
    {
      key: 'actions', label: 'عملیات', align: 'end',
      render: (s) => el('div', { class: 'cell-actions' },
        el('button', { class: 'btn btn--ghost btn--sm', title: 'پروفایل', 'aria-label': 'پروفایل', onclick: () => { location.hash = `#/students/${s.id}`; } }, icon('user', 15)),
        el('button', {
          class: 'btn btn--ghost btn--sm', title: 'تاریخچهٔ تحصیلی', 'aria-label': 'تاریخچهٔ تحصیلی',
          onclick: () => openEducationHistory(s)
        }, icon('school', 15)),
        ...(isSupervisor ? [] : [ /* ۱.۲۵.۰۱ — ناظر: فقط مشاهده */
        el('button', { class: 'btn btn--ghost btn--sm', title: 'برچسب‌ها', 'aria-label': 'برچسب‌ها', onclick: () => openRowTagEditor(s, ctl) }, icon('tag', 15)),
        el('button', { class: 'btn btn--ghost btn--sm', title: 'ویرایش', 'aria-label': 'ویرایش', onclick: () => openArchiveStudentForm({ student: s, onSaved: ({ student }) => ctl.patch(student) }) }, icon('edit', 15)),
        el('button', {
          class: 'btn btn--soft btn--sm', title: 'بازگشت به چرخهٔ مرکز',
          onclick: async (e) => lockBtn(e.currentTarget, async () => {
            if (!(await confirmModal({
              title: 'بازگشت به چرخهٔ مرکز',
              message: `«${s.firstName} ${s.lastName}» از آرشیو به «دانش‌آموزان» فعال منتقل می‌شود و در لیست دانش‌آموزهای مسئول پرونده‌اش دیده می‌شود.`,
              confirmLabel: 'فعال کن'
            }))) return;
            try {
              await api.post(`/api/students/${s.id}/activate`);
              toast('به چرخهٔ مرکز بازگشت — در «دانش‌آموزان» دیده می‌شود', 'success');
              ctl.remove(s.id); // — از آرشیو خارج شد؛ جمع‌شدن نرم همان ردیف
            } catch (err) { toastError(err); }
          })
        }, icon('check', 15), 'فعال‌سازی'),
        el('button', {
          class: 'btn btn--danger btn--sm', title: 'حذف کامل پرونده — فقط اگر هیچ سابقه‌ای نداشته باشد', 'aria-label': 'حذف کامل پرونده — فقط اگر هیچ سابقه‌ای نداشته باشد',
          onclick: async (e) => lockBtn(e.currentTarget, async () => {
            if (!(await confirmModal({ title: 'حذف کامل پرونده', message: `پروندهٔ «${s.firstName} ${s.lastName}» به‌کلی از آرشیو پاک می‌شود — فقط برای ثبت‌های اشتباه. اگر سابقهٔ جلسه/پیگیری دارد حذف ممکن نیست (پیام سرور راهنمایی می‌کند). برگشت ندارد.`, confirmLabel: 'حذف کن', danger: true }))) return;
            try {
              await api.del(`/api/students/${s.id}`);
              toast('پرونده حذف شد', 'success');
              ctl.remove(s.id);
            } catch (err) { toastError(err); }
          })
        }, icon('trash', 15))
        ]) /* — بستن spread ناظر ۱.۲۵.۰۱ */
      )
    }
  ];
  const colCount = columns.length;
  const thead = el('thead', {}, el('tr', {}, columns.map((c) => el('th', { scope: 'col', style: c.align ? { textAlign: c.align } : null }, c.label))));
  const tbody = el('tbody');
  const table = el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, thead, tbody));

  function rowEl(s) {
    return el(
      'tr',
      {
        class: 'is-clickable',
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
    const hasFilter = Boolean(local.query || local.schoolId || local.tagId);
    return el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } },
      emptyState({
        iconName: 'file',
        title: hasFilter ? 'نتیجه‌ای در آرشیو پیدا نشد' : 'آرشیو خالی است',
        hint: hasFilter
          ? 'جستجو یا فیلتر را تغییر دهید.'
          : 'پروندهٔ دانش‌آموزان نیاز ویژهٔ شهر — پرونده‌های خارج‌شده از چرخهٔ مرکز این‌جا نگه داشته می‌شوند و هر زمان خواستید همان‌جا به چرخه برگردانید.', /* H3 */
        actionLabel: hasFilter || isSupervisor ? undefined : 'دانش‌آموز جدید در آرشیو' /* ۱.۲۵.۰۱ — ناظر: بدون اکشن مرده */,
        onAction: hasFilter || isSupervisor ? undefined : openNewArchiveStudent /* ۱.۲۵.۰۱ — ناظر */
      })));
  }

  function openNewArchiveStudent() {
    openArchiveStudentForm({
      onSaved: ({ student }) => {
        ctl.quietSync(); // جای پروندهٔ تازه را ترتیب سرور تعیین می‌کند
        if (student) setTimeout(() => openEducationHistory(student, { onChanged: () => {} }), 150);
      }
    });
  }

  const metaBar = el('span', {});
  const pagerZone = el('div', {});

  function renderTbody(res) {
    result = res;
    const list = res.data ?? [];
    tbody.replaceChildren(...(list.length ? list.map((s) => rowEl(s)) : [emptyRow()]));

    const meta = res.meta ?? { page: 1, totalPages: 1, total: 0 };
    metaBar.textContent = `${fa(meta.total)} پرونده`;
    /* UX-ممیزی P3: پیجر تک‌صفحه‌ای در لیست‌های کوتاه حذف شد */
    pagerZone.replaceChildren(
      ...(meta.totalPages > 1
        ? [el('div', { class: 'pager' },
            el('span', {}, `صفحه ${fa(meta.page)} از ${fa(meta.totalPages)} · ${fa(meta.total)} پرونده`),
            el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page <= 1, onclick: () => { local.page -= 1; refreshRows(); } }, 'قبلی'),
            el('button', { class: 'btn btn--ghost btn--sm', disabled: meta.page >= meta.totalPages, onclick: () => { local.page += 1; refreshRows(); } }, 'بعدی'))]
        : [])
    );
  }

  let gen = 0; // — گارد نسل: پاسخ کهنه رندر نمی‌شود
  async function refreshRows() {
    const myGen = ++gen;
    try {
      const res = await api.get(`/api/students${qs({
        active: 'false',
        query: local.query || undefined,
        school_id: local.schoolId || undefined,
        tag_id: local.tagId || undefined,
        page: local.page,
        page_size: local.pageSize
      })}`);
      if (myGen !== gen || !tbody.isConnected) return;
      renderTbody(res);
    } catch (err) {
      if (myGen !== gen || !tbody.isConnected) return;
      tbody.replaceChildren(el('tr', {}, el('td', { colspan: colCount, style: { padding: 'var(--sp-2)' } },
        emptyState({ iconName: 'alert', title: 'خطا در بارگذاری آرشیو', hint: String(err?.message ?? err) }))));
    }
  }

  function ensureNonEmptyPaint() {
    setTimeout(() => {
      if (!tbody.isConnected || tbody.querySelector('tr[data-id]')) return;
      /* ۱.۲۲.۲ (F9) — اگر صفحهٔ کش‌شده خالی شده ولی پیجر هنوز «صفحه N از M» را نشان می‌دهد،
         یک صفحه عقب برو و بی‌صدا همگام کن — نه نقاشی صفحهٔ خالیِ کهنه */
      const meta = result?.meta ?? {};
      if ((result?.data ?? []).length === 0 && (meta.page ?? 1) > 1) {
        local.page -= 1;
        ctl.quietSync();
        return;
      }
      renderTbody(result);
    }, 320);
  }

  /* ۱.۲۲.۲ (F8) — بازتاب محلی فیلترهای سرور (service.ts: جستجو روی نام/کد ملی، school_id دقیق، tag_id عضویت).
     فقط وقتی پاسخ ویرایش دادهٔ آن بخش را دارد قضاوت می‌شود تا ردیف اشتباهی جمع نشود */
  function matchesLocal(s) {
    if (local.schoolId && s.schoolId != null && String(s.schoolId) !== String(local.schoolId)) return false;
    if (local.tagId && Array.isArray(s.tags) && !s.tags.some((t) => String(t?.id) === String(local.tagId))) return false;
    const q = (local.query ?? '').trim().toLowerCase();
    if (q) {
      const hay = [s.firstName, s.lastName, s.nationalId]
        .filter((x) => x != null)
        .map((x) => String(x).toLowerCase());
      if (hay.length > 0 && !hay.some((x) => x.includes(q))) return false;
    }
    return true;
  }

  const ctl = {
    /* پچ درجای یک پرونده از بدنهٔ پاسخ mutation — همسایه‌ها، اسکرول و فوکوس سرجایشان */
    patch(s) {
      if (!s?.id || !tbody.isConnected) { ctl.quietSync(); return; }
      /* ۱.۲۲.۲ (F8) — کش با پاسخ ویرایش به‌روز می‌شود؛ ادغام به‌جای جایگزینی تا برچسب‌های همان ردیف
         (که در پاسخ PATCH نیستند ولی tagChipsPreview به آن‌ها نیاز دارد) از کش نیفتند */
      const list = result?.data ?? [];
      const idx = list.findIndex((r) => String(r.id) === String(s.id));
      const merged = idx >= 0 ? { ...list[idx], ...s } : s;
      if (idx >= 0) list[idx] = merged;
      const old = tbody.querySelector(`tr[data-id="${CSS.escape(String(s.id))}"]`);
      if (!old) { ctl.quietSync(); return; }
      if (!matchesLocal(merged)) { /* از فیلتر جاری (جستجو/مدرسه/برچسب) خارج شد — جمع‌شدن نرم + کش همگام */
        if (idx >= 0) list.splice(idx, 1);
        if (result) result = { ...result, meta: { ...(result.meta ?? {}), total: Math.max(0, (result.meta?.total ?? 1) - 1) } };
        collapseRemove(old);
        ensureNonEmptyPaint();
        ctl.quietSyncCount();
        return;
      }
      const fresh = rowEl(merged);
      old.replaceWith(fresh);
      flashNode(fresh);
    },
    /* حذف/خروج از آرشیو (پاسخ بدون بدنه یا خروج از فیلتر): جمع‌شدن نرم همان ردیف */
    remove(id) {
      /* ۱.۲۲.۰ (رفع شبح): کش صفحهٔ جاری هم باید به‌روز شود وگرنه ensureNonEmptyPaint
         ردیفِ حذف‌شده را از کش کهنه دوباره می‌کشد */
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
      const myGen = gen; /* ۱.۲۲.۲ (F10) — گارد نسل refreshRows: پاسخ عقب‌افتاده از فیلتر قبلی شمارنده را خراب نمی‌کند */
      api.get(`/api/students${qs({ active: 'false', query: local.query || undefined, school_id: local.schoolId || undefined, tag_id: local.tagId || undefined, page: 1, page_size: 1 })}`)
        .then((res) => {
          if (myGen !== gen) return;
          metaBar.textContent = `${fa(res.meta?.total ?? 0)} پرونده`;
        })
        .catch(() => {});
    }
  };

  const searchInput = el('input', { class: 'input', type: 'search', placeholder: 'جستجو: نام یا کد ملی…', 'aria-label': 'جستجوی نام یا کد ملی', value: local.query }); /* S5-23 */
  let debounce;
  searchInput.addEventListener('input', () => {
    clearTimeout(debounce);
    debounce = setTimeout(() => {
      local.query = searchInput.value.trim();
      local.page = 1;
      refreshRows(); // — ۱.۲۲.۰: فقط tbody؛ مکان‌نما و فوکوس همین input حفظ می‌شود
    }, 350);
  });

  const schoolSel = el('select', { class: 'select', onchange: (e) => { local.schoolId = e.target.value; local.page = 1; refreshRows(); } },
    el('option', { value: '' }, 'همه مدارس'),
    local.schools.map((s) => el('option', { value: s.id, selected: s.id === local.schoolId }, s.name))
  );

  const tagFilter = local.tags.length > 0 ? buildTagDropdown(ctl) : null;

  const toolbar = el('div', { class: 'toolbar' },
    searchInput,
    schoolSel,
    tagFilter,
    el('div', { class: 'spacer' }),
    ...(isSupervisor ? [] : [el('button', { class: 'btn btn--primary btn--sm', onclick: openNewArchiveStudent },
      icon('plus', 16), 'دانش‌آموز جدید در آرشیو')]) /* ۱.۲۵.۰۱ — ناظر: بدون ثبت */
  );

  container.replaceChildren(
    el('div', { class: 'page-head' },
      el('div', { class: 'page-head__title' }, 'آرشیو'),
      el('span', { class: 'badge badge--neutral' }, metaBar)
    ),
    el('div', { class: 'muted', style: { fontSize: 'var(--fs-xs)', margin: '0 2px var(--sp-3)' } }, /* 13px خام (S5-06) */
      'پروندهٔ دانش‌آموزان نیاز ویژهٔ شهر — پرونده‌های خارج‌شده از چرخهٔ مرکز این‌جا نگه داشته می‌شوند؛ هر زمان خواستید، همان‌جا به چرخه برگردانید.'), /* H3 */
    toolbar,
    el('div', { class: 'card card__body--flush card--table cv-block' }, table, pagerZone) /* E2 */
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
      ctl.patch(student); // — چیپ‌های برچسب همان ردیف درجا
    }
  });
}

function buildTagDropdown(ctl) {
  const panel = el('div', { class: 'dd__panel', style: { display: 'none' } });
  const activeTag = local.tagId ? local.tags.find((t) => t.id === local.tagId) : null;
  const btnLabel = el('span', {}, activeTag ? activeTag.name : 'همه برچسب‌ها');
  const btn = el('button', { class: `btn btn--soft btn--sm${activeTag ? ' is-active' : ''}`, onclick: toggle },
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
    btn.classList.toggle('is-active', Boolean(local.tagId));
    btnLabel.textContent = local.tagId ? (local.tags.find((t) => t.id === local.tagId)?.name ?? 'همه برچسب‌ها') : 'همه برچسب‌ها';
    ctl.quietSync(); // — ۱.۲۲.۰: فقط tbody؛ خود دکمهٔ دراپ‌داون درجا به‌روز شد
  }

  return root;
}
