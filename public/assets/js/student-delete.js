/* ۱.۱۵.۰ — جریان واحد «حذف کامل پرونده» — از students.js استخراج شد تا روی کارت پروفایل هم
   همان دکمهٔ دایره‌ای حذف بنشیند و دو نسخهٔ واگرا ساخته نشود.
   · بدون سابقه → حذف کامل ساده
   · سابقه + مدیر → «حذف با سابقه»: دقیقاً اعلام می‌شود چه چیزی پاک می‌شود — DELETE ?force=true
   · سابقه + منشی → راهنمای آرشیو/مدیر (بک‌اند هم ۴۰۹ می‌دهد)
   · گزارش ارزیابی رسمی یا سابقهٔ مالی → سد سخت؛ حتی مدیر هم به «انتقال به آرشیو» هدایت می‌شود */
import { api } from './api.js';
import { fa } from './format.js';
import { el, openModalAsync, toast, toastError, lockBtn } from './ui.js';
import { session } from './state.js';

export function openStudentDelete(student, { onDeleted } = {}) {
  openModalAsync({
    title: 'حذف کامل پرونده',
    loadingText: 'در حال شمارش سابقهٔ پرونده…',
    load: async () => {
      let check = null;
      try {
        check = (await api.get(`/api/students/${student.id}/delete-check`)).data;
      } catch { check = null; }
      const name = check?.fullName ?? `${student.firstName} ${student.lastName}`;

      const hard = check?.hardBlocks ?? [];
      if (hard.length > 0) {
        return {
          title: 'حذف کامل ممکن نیست',
          body: el('p', { style: { margin: '0', lineHeight: '1.9' } },
            `«${name}»: ${hard.map((b) => `${fa(b.count)} ${b.label}`).join(' و ')} دارد — این سابقه‌ها با حذف پاک نمی‌شوند. برای حفظ پرونده «انتقال به آرشیو» را استفاده کنید.`),
          actions: [(close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'متوجه شدم')]
        };
      }

      const blocks = check?.blocks ?? [];
      const isManager = session.user?.role === 'manager';
      if (blocks.length > 0 && !isManager) {
        return {
          title: 'حذف با سابقه — فقط مدیر مرکز',
          body: el('p', { style: { margin: '0', lineHeight: '1.9' } },
            `«${name}»: سابقهٔ ${blocks.map((b) => b.label).join('، ')} دارد — حذف کامل فقط با تأیید مدیر مرکز است. برای حفظ سابقه «انتقال به آرشیو» را استفاده کنید.`),
          actions: [(close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'متوجه شدم')]
        };
      }

      const purgeLine = blocks.length > 0
        ? ` سابقه‌ای که همراه پرونده پاک می‌شود: ${blocks.map((b) => `${fa(b.count)} ${b.label}`).join('، ')}؛ نوبت‌های یتیم‌شدهٔ همین پرونده هم از تقویم برداشته می‌شود.`
        : '';
      const message = `پروندهٔ «${name}» به‌کلی پاک می‌شود — فقط برای ثبت‌های اشتباه (مثلاً نام غلط که اجازهٔ ثبت مجدد با همان کد ملی نمی‌دهد).${purgeLine} اگر سابقهٔ پرونده ارزشمند است «انتقال به آرشیو» را انتخاب کنید. برگشت ندارد.`;
      return {
        title: blocks.length > 0 ? 'حذف با سابقه — مدیر مرکز' : 'حذف کامل پرونده',
        body: el('p', { style: { margin: '0', lineHeight: '1.9' } }, message),
        actions: [
          (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'انصراف'),
          (close) => {
            const btn = el('button', { class: 'btn btn--danger', type: 'button' }, blocks.length > 0 ? 'با سابقه حذف کن' : 'حذف کن');
            btn.addEventListener('click', () => lockBtn(btn, async () => {
              await api.del(`/api/students/${student.id}${blocks.length > 0 ? '?force=true' : ''}`);
              toast('پرونده حذف شد', 'success');
              close();
              onDeleted?.();
            }).catch(toastError));
            return btn;
          }
        ]
      };
    }
  });
}
