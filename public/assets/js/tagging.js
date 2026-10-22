import { api } from './api.js';
import { el, icon, openModal, confirmModal, toast, toastError } from './ui.js';

export const TAG_CATEGORY_ORDER = ['disorder', 'grade', 'school_type', 'custom'];

export const TAG_CATEGORY_LABELS = {
  disorder: 'نوع اختلال',
  grade: 'پایه تحصیلی',
  school_type: 'نوع مدرسه',
  custom: 'سفارشی'
};

function fa(n) {
  return String(n).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[d]);
}

export async function fetchTags() {
  try {
    const res = await api.get('/api/tags?active=true');
    return res.data ?? [];
  } catch {
    return [];
  }
}

export async function fetchStudentTags(studentId) {
  try {
    const res = await api.get(`/api/students/${studentId}/tags`);
    return res.data ?? [];
  } catch {
    return [];
  }
}

export function tagChip(tag, { removable = false, onRemove } = {}) {
  const chip = el('span', {
    class: `tag-chip tag-chip--${tag.category}`,
    title: TAG_CATEGORY_LABELS[tag.category] ?? tag.category
  }, el('span', { class: 'tag-chip__dot', 'aria-hidden': 'true' }), tag.name);
  if (tag.color) chip.style.setProperty('--tag-color', tag.color);
  if (removable && onRemove) {
    chip.appendChild(
      el('button', { class: 'tag-chip__x', type: 'button', 'aria-label': `حذف برچسب ${tag.name}`, onclick: onRemove }, icon('x', 11))
    );
  }
  return chip;
}

export function tagChipsPreview(tags, max = 3) {
  if (!tags || tags.length === 0) return el('span', { class: 'cell-sub' }, '—');
  const shown = tags.slice(0, max).map((t) => tagChip(t));
  if (tags.length > max) shown.push(el('span', { class: 'tag-more' }, `+${fa(tags.length - max)}`));
  return el('div', { class: 'tag-chips' }, ...shown);
}

export function openTagEditor({ student, tags, current, canCreateTag = false, onSaved }) {
  const selected = new Set(current.map((t) => t.id));
  let allTags = [...tags];

  const body = el('div', { class: 'tag-editor' });

  function toggle(id, btn) {
    const on = selected.has(id) ? !selected.delete(id) : selected.add(id);
    const isOn = selected.has(id);
    btn.classList.toggle('is-on', isOn);
    btn.setAttribute('aria-pressed', isOn ? 'true' : 'false');
    for (const counter of body.querySelectorAll('.tag-editor__count')) {
      const cat = counter.dataset.cat;
      counter.replaceChildren(fa(allTags.filter((t) => t.category === cat && selected.has(t.id)).length));
    }
  }

  async function removeTag(t) {
    const usage = t.usageCount ?? 0;
    const ok = await confirmModal({
      title: 'حذف برچسب',
      message: usage > 0
        ? `برچسب «${t.name}» روی ${fa(usage)} دانش‌آموز استفاده شده. با حذف، از فهرست انتخاب همه برداشته می‌شود (غیرفعال‌سازی — تاریخچهٔ پرونده‌ها حفظ می‌ماند). برگشت فوری ندارد.`
        : `برچسب «${t.name}» حذف شود؟ (غیرفعال‌سازی — هیچ دانش‌آموزی این برچسب را ندارد)`,
      confirmLabel: 'حذف برچسب',
      danger: true
    });
    if (!ok) return;
    try {
      await api.post(`/api/tags/${t.id}/deactivate`);
      allTags = allTags.filter((x) => x.id !== t.id);
      selected.delete(t.id);
      renderSections();
      toast('برچسب حذف شد', 'success');
    } catch (err) {
      toastError(err);
    }
  }

  function renderSections() {
    body.replaceChildren();
    for (const cat of TAG_CATEGORY_ORDER) {
      const catTags = allTags.filter((t) => t.category === cat);
      if (catTags.length === 0) continue;

      const chipsRow = el('div', { class: 'tag-editor__chips' });
      for (const t of catTags) {
        const isOn = selected.has(t.id);
        const btn = el('button', {
          type: 'button',
          class: `tag-toggle${isOn ? ' is-on' : ''}`,
          'aria-pressed': isOn ? 'true' : 'false',
          onclick: () => toggle(t.id, btn)
        }, el('span', { class: 'tag-chip__dot', 'aria-hidden': 'true' }), t.name);
        if (t.color) btn.style.setProperty('--tag-color', t.color);
        if (canCreateTag) {
          const delBtn = el('button', {
            type: 'button',
            class: 'tag-del',
            title: `حذف برچسب «${t.name}»`,
            'aria-label': `حذف برچسب ${t.name}`,
            onclick: () => removeTag(t)
          }, icon('trash', 11));
          chipsRow.appendChild(el('span', { class: 'tag-toggle-wrap' }, btn, delBtn));
        } else {
          chipsRow.appendChild(btn);
        }
      }

      body.appendChild(el('div', { class: 'tag-editor__section' },
        el('div', { class: 'tag-editor__cat' },
          TAG_CATEGORY_LABELS[cat],
          el('span', { class: 'tag-editor__count', dataset: { cat } }, fa(selectedTagCount(cat)))
        ),
        chipsRow
      ));
    }

    if (canCreateTag) {
      const nameInput = el('input', { class: 'input', placeholder: 'نام برچسب جدید…', maxlength: '60' });
      const catSel = el('select', { class: 'select' },
        el('option', { value: 'custom' }, 'سفارشی'),
        el('option', { value: 'disorder' }, 'نوع اختلال'),
        el('option', { value: 'grade' }, 'پایه تحصیلی'),
        el('option', { value: 'school_type' }, 'نوع مدرسه')
      );
      const addBtn = el('button', {
        type: 'button',
        class: 'btn btn--soft btn--sm',
        onclick: async () => {
          const name = nameInput.value.replace(/\s+/g, ' ').trim();
          if (name.length < 2) {
            toast('نام برچسب حداقل ۲ نویسه است', 'warning');
            nameInput.focus();
            return;
          }
          addBtn.disabled = true;
          try {
            const res = await api.post('/api/tags', { name, category: catSel.value });
            allTags.push(res.data);
            selected.add(res.data.id);
            renderSections();
            toast('برچسب ساخته شد', 'success');
          } catch (err) {
            toastError(err);
          }
          addBtn.disabled = false;
        }
      }, icon('plus', 14), 'افزودن');

      body.appendChild(el('div', { class: 'tag-editor__section tag-editor__creator' },
        el('div', { class: 'tag-editor__cat' }, 'ساخت برچسب جدید'),
        el('div', { class: 'tag-editor__create-row' }, nameInput, catSel, addBtn)
      ));
    }
  }

  function selectedTagCount(cat) {
    return allTags.filter((t) => t.category === cat && selected.has(t.id)).length;
  }

  renderSections();

  openModal({
    title: `برچسب‌های ${student.firstName} ${student.lastName}`,
    wide: true,
    body,
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'انصراف'),
      (close) => {
        const saveBtn = el('button', { class: 'btn btn--primary', type: 'button' }, 'ذخیره');
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          try {
            const res = await api.put(`/api/students/${student.id}/tags`, { tag_ids: [...selected] });
            toast('برچسب‌ها ذخیره شد', 'success');
            close();
            if (onSaved) onSaved(res.data ?? []);
          } catch (err) {
            toastError(err);
            saveBtn.disabled = false;
          }
        });
        return saveBtn;
      }
    ]
  });
}
