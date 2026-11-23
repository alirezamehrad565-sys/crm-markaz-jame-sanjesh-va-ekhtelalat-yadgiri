/* timing.ts — مقایسهٔ رازها به‌صورت هم‌زمان‌ایمن (۱.۲۷.۴۳ — حاصل ممیزی نشتی‌ها)
 *
 * الگو: هر دو مقدار با SHA-256 خلاصه می‌شوند (طول و بایت‌ها پنهان می‌مانند) و دیجست‌های
 * هم‌طول با XOR مقایسه می‌شوند — زمان مصرف مستقل از تعداد بایت‌های متفاوت است.
 * مصرف‌کننده: اعتبارسنجی سِکرِت وبهوک بات (notify/service) — و الگو برای هر مقایسهٔ راز تازه.
 */
export async function timingSafeEqualStr(a: string, b: string): Promise<boolean> {
  const enc = new TextEncoder();
  const [da, db] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(a ?? '')),
    crypto.subtle.digest('SHA-256', enc.encode(b ?? ''))
  ]);
  const ba = new Uint8Array(da);
  const bb = new Uint8Array(db);
  let diff = 0;
  for (let i = 0; i < ba.length; i += 1) diff |= ba[i] ^ bb[i];
  return diff === 0;
}
