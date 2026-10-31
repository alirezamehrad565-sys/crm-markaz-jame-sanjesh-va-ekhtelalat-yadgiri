import { el, formModal, toast } from './ui.js';
import { api } from './api.js';
import { session } from './state.js';

export const SESSION_TYPES = [
  { key: 'individual', label: 'مداخله فردی', short: 'فردی', durationMin: 45, hint: 'جلسهٔ یک‌به‌یک درمانگر با دانش‌آموز' },
  { key: 'group', label: 'مداخله گروهی', short: 'گروهی', durationMin: 60, hint: 'جلسهٔ گروهی — چند دانش‌آموز با هم' },
  { key: 'family_ed', label: 'آموزش خانواده‌محور', short: 'خانواده', durationMin: 60, hint: 'آموزش و توانمندسازی خانواده' },
  { key: 'teacher_ed', label: 'آموزش آموزگاران', short: 'آموزگاران', durationMin: 50, hint: 'آموزش و توانمندسازی آموزگاران و کارکنان مدارس' },
  { key: 'mental_ot', label: 'کاردرمانی ذهنی', short: 'ذهنی', durationMin: 45, hint: 'توانبخشی شناختی با پروتکل کاردرمانی ذهنی' }
];

export function sessionTypeOf(key) {
  return SESSION_TYPES.find((t) => t.key === key);
}

export function sessionTypeChip(key) {
  const t = sessionTypeOf(key);
  if (!t) return null;
  return el('span', { class: `st-chip st-chip--${t.key}`, title: t.hint, 'aria-label': `${t.label} — ${t.hint}` }, t.short); /* S2-11 */
}

export function sessionTypeOptions({ withNone = true } = {}) {
  const none = withNone ? [{ value: '', label: 'بدون نوع' }] : [];
  return [...none, ...SESSION_TYPES.map((t) => ({ value: t.key, label: t.label }))];
}

export const STUDENT_PATHWAYS = [
  { key: 'learning', label: 'مسیر اختلال یادگیری' },
  { key: 'rehab', label: 'مسیر توانبخشی ذهنی-جسمی' }
];

export function pathwayOf(key) {
  return STUDENT_PATHWAYS.find((p) => p.key === key);
}

export function pathwayChip(key) {
  if (!key) return null;
  const p = pathwayOf(key);
  if (!p) return null;
  return el('span', { class: `path-chip path-chip--${p.key}`, title: 'مسیر پرونده' }, p.label);
}

export function canEditPathway(student) {
  const u = session.user;
  if (!u) return false;
  if (['manager', 'secretary'].includes(u.role)) return true;
  return u.role === 'therapist' && Boolean(student.ownerStaffId) && student.ownerStaffId === u.staffId;
}

export function openPathwayModal(student, onSaved) {
  formModal({
    title: 'مسیر پرونده',
    submitLabel: 'ذخیره',
    fields: [
      {
        name: 'pathway', label: 'مسیر', type: 'select',
        placeholder: '— هنوز تعیین نشده (تفسیر پیش‌فرض: مسیر یادگیری)',
        options: STUDENT_PATHWAYS.map((p) => ({ value: p.key, label: p.label })),
        value: student.pathway ?? '',
        hint: 'تب «تفسیر بالینی»، فرم‌های پیشنهادی و گام‌های مسیر مداخله بر اساس همین انتخاب شاخه می‌خورد.'
      }
    ],
    onSubmit: async (values) => {
      await api.patch(`/api/students/${student.id}/pathway`, { pathway: values.pathway || null });
      toast('مسیر پرونده ذخیره شد', 'success');
      onSaved?.();
    }
  });
}
