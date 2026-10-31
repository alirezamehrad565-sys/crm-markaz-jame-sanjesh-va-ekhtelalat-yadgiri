// درخت هدف در پروفایل دانش‌آموز («فاز جدا» نقشهٔ حالا اجرا شد)
// همان زبان واحد طبقه‌بندی (taxonomy.js — ) در بافت پروفایل: دانش‌آموز به کلیدهای
// نیمهٔ علمی درخت (پردازش اطلاعات + کارکردهای اجرایی) متصل می‌شود؛ برچسب‌های اختلال/پایه
// همان سازوکار قدیمی student_tags هستند و اینجا تکرار نمی‌شوند.
// ذخیره‌سازی: PUT /api/students/:id/focus → student_focus_links (مهاجرت ۰۰۸۵) — سقف ۸ پیوند.
// پیشنهاد کارت () با همین پیوندها دو-بعدی می‌شود: برچسب مشترک + هدف مشترک.
import { api } from './api.js';
import { el, icon, openModal, toast, toastError } from './ui.js';
import { buildTaxonomyPicker } from './taxonomy.js';

let treeCache = null; // درخت واحد از meta — یک بار در نشست

async function fetchFocusTree() {
  if (treeCache) return treeCache;
  const res = await api.get('/api/exercises/meta');
  const tree = res.data?.taxonomyTree ?? [];
  // فقط دو ستون علمی — اختلال/پایهٔ دانش‌آموز از برچسب‌ها (tag editor) می‌آید، نه از اینجا
  treeCache = tree.filter((p) => p.source === 'focus');
  return treeCache;
}

export async function fetchStudentFocus(studentId) {
  try {
    return (await api.get(`/api/students/${studentId}/focus`)).data ?? [];
  } catch {
    return [];
  }
}

/** نقشهٔ کلید→برچسب فارسی از منبع حقیقت (meta.taxonomyTree؛ کش‌شده در نشست) */
export async function focusLabels() {
  const tree = await fetchFocusTree();
  const map = {};
  for (const px of tree) {
    for (const d of px.domains ?? []) {
      map[d.key] = d.fa;
      for (const lf of d.leaves ?? []) map[lf.key] = lf.fa;
    }
  }
  return map;
}

/**
 * ویرایشگر هدف‌های شناختی دانش‌آموز — همان کامپوننت درخت واحد با بافت پروفایل
 * @param {{ student: { id: string, firstName: string, lastName: string }, onSaved?: Function }} p
 */
export async function openFocusEditor({ student, onSaved }) {
  let tree;
  try {
    tree = await fetchFocusTree();
  } catch (err) {
    toastError(err);
    return;
  }
  if (!tree || tree.length === 0) {
    toast('درخت طبقه‌بندی بارگذاری نشده است', 'warning');
    return;
  }

  const current = await fetchStudentFocus(student.id);
  const focusSel = new Set(current);
  const tagSel = new Set(); // ستون برچسبی در این بافت رندر نمی‌شود — خالی می‌ماند

  const picker = buildTaxonomyPicker({
    tree,
    focusSel,
    tagSel,
    maxFocus: 8,
    subjectFa: 'دانش‌آموز', // پیام سقف با زبان پروفایل
    selectedNote: 'پیشنهاد کارت‌ها با هدف‌های پروفایل هم‌راستا می‌شود', // 
    summaryHint: 'هدف‌های شناختی دانش‌آموز را انتخاب کنید — اختیاری؛ پایهٔ پیشنهاد هوشمند کارت در «ارسال تمرین»'
  });

  openModal({
    title: `هدف‌های شناختی ${student.firstName} ${student.lastName}`,
    wide: true,
    body: el('div', {}, picker.el),
    actions: [
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'انصراف'),
      (close) => {
        const saveBtn = el('button', { class: 'btn btn--primary', type: 'button' }, icon('check', 14), 'ذخیره');
        saveBtn.addEventListener('click', async () => {
          saveBtn.disabled = true;
          try {
            const res = await api.put(`/api/students/${student.id}/focus`, { focus_keys: [...focusSel] });
            toast('هدف‌های شناختی ذخیره شد', 'success');
            close();
            onSaved?.(res.data ?? []);
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
