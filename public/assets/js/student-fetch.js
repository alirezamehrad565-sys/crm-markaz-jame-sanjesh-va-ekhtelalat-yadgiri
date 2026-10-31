import { api } from './api.js';

// حلقهٔ صفحه‌بندی «همهٔ دانش‌آموزان فعال» برای pickerهای مشترک.
// الگوی قبلی سقف خاموش ۱۰۰ داشت — با عبور مرکز از ۱۰۰ دانش‌آموز، گزینه‌ها بی‌سروصدا ناقص می‌شدند
// و «عدم نمایش» شبیه «عدم وجود» خوانده می‌شد. سقف ۱۰۰ هر صفحه از سرور است (meta.totalPages).
export async function fetchAllStudents() {
  const out = [];
  let page = 1;
  for (;;) {
    const res = await api.get(`/api/students?active=true&page_size=100&page=${page}`);
    out.push(...res.data);
    const totalPages = res.meta?.totalPages ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return out;
}
