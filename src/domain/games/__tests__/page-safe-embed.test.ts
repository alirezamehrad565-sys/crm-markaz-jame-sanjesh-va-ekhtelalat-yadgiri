/**
 * گیت ۱.۲۷.۷۵ (sdt153) — رفع security-001 ممیزی (critical): XSS بازتابی در صفحهٔ بازی عمومی.
 * توکن از مسیر URL /m/:token می‌آید و در <script> درون‌خطی نشسته بود با JSON.stringify خام؛
 * اکنون safeJson از < > U+2028/U+2029 فرار یونی‌کد می‌سازد و esc همهٔ صفحات عمومی
 * تک‌کوتیشن را هم escape می‌کند (security-006). این آزمون اجرای واقعی رندر است، نه متن‌سنجی.
 */
import { describe, it, expect } from 'vitest';
import { renderGamesPage, renderPreviewPage } from '../page';

const EVIL = `</script><script>alert(1)</script>`;

function minimalModel(state = 'closed'): any {
  return { state, missionRef: '', missionTitle: 'بازی تمرینی', packageTitle: '', expiresAt: '' };
}

describe('embed امن توکن در صفحهٔ بازی عمومی — ۱.۲۷.۷۵ (به‌روزشده برای ADR-004 در ۱.۲۷.۸۲)', () => {
  it('① توکن مخرب در بلاک دادهٔ JSON هرگز خام نمی‌نشیند (فرار \u003c — safeJsonEmbed)', () => {
    const out = renderGamesPage(minimalModel('closed'), EVIL);
    expect(out).toContain('<script type="application/json" id="page-boot">');
    expect(out).toContain('"\\u003c/script\\u003e'); // فرار یونی‌کد داخل بلاک داده
    expect(out).not.toContain('</script><script>alert'); // خروج از بلاک داده ناممکن
    // توکن مخرب نباید در هیچ جای خروجی به‌صورت اجراپذیر ظاهر شود
    expect(out).not.toContain('<script>alert(1)</script>');
  });

  it('② state بازی (child_active) با توکن مخرب هم سالم رندر می‌شود', () => {
    const model = { ...minimalModel('child_active'), playGame: 'gonogo' };
    const out = renderGamesPage(model, EVIL);
    expect(out).not.toContain('</script><script>alert');
    expect(out).toContain('\\u003c');
  });

  it('③ attribute data-token با esc کامل (شامل تک‌کوتیشن security-006)', () => {
    const state = { game: 'gonogo', missionTitle: 'ت', packageTitle: 'پ', hint: null, protocol: null } as any;
    const out = renderPreviewPage(state, `<img src=x onerror='bad()'>"`);
    expect(out).not.toContain(`<img src=x onerror='bad()'>`);
    expect(out).toContain('&#39;bad()&#39;');
  });

  it('④ توکن با U+2028 (جداکنندهٔ خط JS) هم فرار می‌شود', () => {
    const out = renderGamesPage(minimalModel('closed'), 'a\u2028b');
    expect(out).not.toContain('a\u2028b'); // کاراکتر خام در خروجی نیست — فرار یونی‌کد
    expect(out).toContain('a\\u2028b');
  });
});
