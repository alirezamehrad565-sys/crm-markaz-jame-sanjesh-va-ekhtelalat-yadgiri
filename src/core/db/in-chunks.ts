/**
 * دروازهٔ تکه‌بندی IN-list — بدهی ثبت‌شدهٔ ف۶ ⑧ طرح ارتقا (کلاس باگ کشف‌شده در baseline بار ف۵):
 * D1 سقف سخت «۱۰۰ پارامتر بایند در هر پرس‌وجو» دارد؛ هر سازندهٔ IN با تعداد placeholders بی‌کران
 * روی دادهٔ واقعی ۵۰۰ «too many SQL variables» می‌گیرد (نمونهٔ واقعی: خلاصهٔ دورهٔ پنجرهٔ ۳روزه — ۱.۲۵.۷۰).
 *
 * قرارداد (هم‌الگوی APPOINTMENT_STUDENT_QUERY_CHUNK=۹۰ در appointment-core):
 *   - سقف تکه ۹۰ (زیر سقف سخت ۱۰۰ با headroom برای پارامترهای هم‌مسیر)؛
 *   - هر شناسه همیشه دقیقاً در یک تکه است، پس ترتیب درون هر شناسه/گروه دست‌نخورده می‌ماند؛
 *   - گارد IN خالی: آرایهٔ تهی = بدون پرس‌وجو (SQL با IN() نامعتبر است)؛
 *   - کوئری‌های ORDER BY+LIMIT سراسری باید پس از ادغام تکه‌ها دوباره مرتب شوند.
 *
 * گیت پویش دائمی: src/__tests__/in-list-chunk-gate.test.ts — هر سازندهٔ IN تازه یا از این دروازه
 * می‌گذرد یا با نشان «IN-bounded:» (محدود به ثابت/ساخت) مستند می‌شود.
 */

export const IN_PARAM_CHUNK = 90;

/** آرایه را به تکه‌های ≤max می‌شکند؛ آرایهٔ تهی = خروجی تهی (گارد IN خالی). */
export function inParamChunks<T>(items: readonly T[], max: number = IN_PARAM_CHUNK): T[][] {
  if (items.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += max) chunks.push(items.slice(i, i + max));
  return chunks;
}

/** رشتهٔ placeholders «?, ?, ?» برای شمار مشخص — فقط برای count>0 صدا زده شود. */
export function inPlaceholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}
