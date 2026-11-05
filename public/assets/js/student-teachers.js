/* ۱.۱۵.۰ — مدیریت معلم‌های پرونده در یک مودال واحد (از دکمهٔ دایره‌ای «معلم» کارت پروفایل):
   · فهرست معلم‌ها — GET /api/students/:id/teachers
   · افزودن معلم — POST /api/students/:id/teachers { name, class_label, contact }
     (پیش‌تر این API هیچ رابطی نداشت؛ معلم فقط از انتخاب کلاس یا پاسخ فرم معلم ثبت می‌شد)
   · حذف معلم — DELETE /api/students/:id/teachers/:teacherId
   الگوی ۱.۱۴.۰: مودال همان لحظه با اسپینر باز می‌شود و فهرست که آمد با populateModalShell
   در همان پوسته پر می‌شود — هیچ «سکوتِ» پیش از مودالی وجود ندارد. */
import { api } from './api.js';
import { el, icon, openModalAsync, populateModalShell, toast, toastError, lockBtn } from './ui.js';

function fieldRow(labelText, input) {
  return el('div', { class: 'field' }, el('label', { class: 'field__label' }, labelText), input);
}

export function openTeacherManager(student, { onChanged } = {}) {
  const shell = openModalAsync({
    title: 'معلم‌های پرونده',
    loadingText: 'در حال دریافت فهرست معلم‌ها…',
    load: async () => {
      let items = [];
      try {
        items = (await api.get(`/api/students/${student.id}/teachers`)).data ?? [];
      } catch { items = []; }
      return {
        title: 'معلم‌های پرونده',
        body: buildBody(items),
        actions: [(close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'بستن')]
      };
    }
  });

  function buildBody(items) {
    const list = el('div', { style: { display: 'grid', gap: 'var(--sp-2)' } },
      items.length === 0
        ? el('div', { class: 'cell-sub', style: { lineHeight: '1.9' } },
            'هنوز معلمی ثبت نشده است — با فرم زیر معلم کلاس را دستی ثبت کنید؛ پاسخ فرم جامع معلم هم با نام او روی پرونده می‌نشیند.')
        : items.map((t) => el('div', {
            style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'var(--sp-2)', flexWrap: 'wrap', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 'var(--sp-2) var(--sp-3)' }
          },
            el('div', {},
              el('div', { style: { fontWeight: 600 } }, t.name),
              el('div', { class: 'cell-sub' }, [t.classLabel, t.contact].filter(Boolean).join(' — ') || '—')),
            el('button', {
              class: 'icon-circle icon-circle--danger', type: 'button',
              title: `حذف ${t.name}`, 'aria-label': `حذف معلم ${t.name}`,
              onclick: (e) => lockBtn(e.currentTarget, async () => {
                await api.del(`/api/students/${student.id}/teachers/${t.id}`);
                toast('معلم حذف شد');
                refresh();
                onChanged?.();
              }).catch(toastError)
            }, icon('trash', 16))
          )));

    /* فرم افزودن — فیلدهای سبک (بدون formModal چون داخل مودالِ زنده هستیم) */
    const nameIn = el('input', { class: 'input', type: 'text', placeholder: 'مثلاً: خانم رضایی', 'aria-label': 'نام معلم' });
    const classIn = el('input', { class: 'input', type: 'text', placeholder: 'مثلاً: سوم ابتدایی — کلاس ۲', 'aria-label': 'کلاس / پایه', style: { marginTop: 'var(--sp-2)' } });
    const contactIn = el('input', { class: 'input', type: 'tel', dir: 'ltr', placeholder: '۰۹۱۲· · · · · · ·', 'aria-label': 'شماره تماس معلم', style: { marginTop: 'var(--sp-2)' } });
    const addBtn = el('button', { class: 'btn btn--primary btn--sm', type: 'button', style: { marginTop: 'var(--sp-3)' } },
      icon('plus', 15), 'افزودن معلم');
    addBtn.addEventListener('click', () => lockBtn(addBtn, async () => {
      const name = nameIn.value.trim();
      if (name.length < 2) { toast('نام معلم را بنویسید', 'warning'); nameIn.focus(); return; }
      await api.post(`/api/students/${student.id}/teachers`, {
        name,
        class_label: classIn.value.trim() || null,
        contact: contactIn.value.trim() || null
      });
      toast('معلم ثبت شد', 'success');
      refresh();
      onChanged?.();
    }).catch(toastError));

    return el('div', { style: { display: 'flex', flexDirection: 'column', gap: 'var(--sp-3)' } },
      list,
      el('div', { style: { borderTop: '1px solid var(--border)', paddingTop: 'var(--sp-3)' } },
        el('div', { class: 'card__title', style: { fontSize: '14px', marginBottom: 'var(--sp-2)' } }, 'افزودن معلم'),
        fieldRow('نام معلم', nameIn),
        classIn,
        contactIn,
        addBtn
      )
    );
  }

  async function refresh() {
    let items = [];
    try {
      items = (await api.get(`/api/students/${student.id}/teachers`)).data ?? [];
    } catch { items = []; }
    populateModalShell(shell, {
      title: 'معلم‌های پرونده',
      body: buildBody(items),
      actions: [(close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'بستن')]
    });
  }
}
