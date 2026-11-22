/* موج ۰ طرح ارتقای پرونده (docs/PROFILE-UPGRADE-DESIGN.md §۵ — اسکلت لولایی):
   رجیستری تب‌محور با fallback قدیمی. قرارداد هر descriptor:
   · key — کلید تب (همان کلید دیپ‌لینک ?tab=)
   · mount(box, ctx) — رندر محتوای تب
   · when?(ctx) — گیت دسترسی (RBAC موجود)؛ falsy یعنی تب به fallback قدیمی برمی‌گردد
   قانون اسکلت لولایی: رجیستری فقط تب‌های مهاجرت‌شده را می‌شناسد؛ کلید ناشناس یا ردشده
   توسط when به نقشهٔ قدیمی student-profile می‌افتد — هیچ گام «کل یا هیچ» وجود ندارد. */
export function createProfileRegistry(descriptors = []) {
  const map = new Map();
  for (const d of descriptors) {
    if (!d || typeof d.key !== 'string' || d.key.length === 0 || typeof d.mount !== 'function') {
      throw new Error('descriptor نامعتبر — key و mount الزامی است');
    }
    if (map.has(d.key)) throw new Error(`کلید تب تکراری در رجیستری: ${d.key}`);
    map.set(d.key, d);
  }
  return {
    has: (key) => map.has(key),
    get: (key) => map.get(key) ?? null,
    keys: () => [...map.keys()],
    /* resolve: تنها نقطهٔ ورود dispatch — وقتی descriptor نیست یا when رد می‌کند null می‌دهد
       تا پوسته به رندرر قدیمی برود (رفتار امروز عیناً حفظ می‌شود). */
    resolve: (key, ctx) => {
      const d = map.get(key);
      if (!d) return null;
      if (d.when && !d.when(ctx)) return null;
      return d;
    }
  };
}
