import { el, icon } from '../ui.js';
import { openPalette } from '../global-search.js';

// ═══════════════════════════════════════════════════════════════
// نمای ۴۰۴ برای مسیرهای ناشناختهٔ هش‌روتر
// به‌جای ریدایرکت بی‌صدا به داشبورد، همین نما رندر می‌شود و
// نشانی خراب در نوار آدرس دست‌نخورده می‌ماند (لینک خراب قابل ردیابی بماند).
// فقط از کلاس‌ها/کامپوننت‌های موجود (.empty، .btn) + متغیرهای توکن ساخته می‌شود.
// ═══════════════════════════════════════════════════════════════

export async function renderNotFound(container, ctx) {
  const requested = location.hash || `#/${ctx?.path ?? ''}`;
  container.replaceChildren(
    el('div', { class: 'empty' },
      el('div', {
        'aria-hidden': 'true',
        style: {
          fontSize: 'calc(var(--fs-3xl) * 2.5)', // ۴۰۴ درشت — از بزرگ‌ترین تیتر توکن‌دار
          fontWeight: '700',
          lineHeight: '1.15',
          letterSpacing: '0.04em',
          color: 'var(--primary-hover)' /* primary خالص روی bg لایت ≈۲٫۷ حتی زیر سقف متن‌درشت ۳:۱ (S11-26)؛ عنصر تزئینی aria-hidden */
        }
      }, '۴۰۴'),
      el('div', { class: 'empty__title', style: { fontSize: 'var(--fs-3xl)' } }, 'این صفحه پیدا نشد'),
      el('div', { class: 'empty__hint' }, 'ممکن است لینک تغییر کرده باشد یا آدرس اشتباه وارد شده باشد.'),
      el('div', {
        class: 'empty__hint',
        style: {
          fontSize: 'var(--fs-xs)',
          direction: 'ltr',
          maxWidth: 'none',
          overflowWrap: 'anywhere',
          opacity: '0.75'
        }
      }, requested), // مسیر خراب — برای گزارش و ردیابی لینک
      el('div', {
        style: { display: 'flex', gap: 'var(--sp-2)', marginTop: 'var(--sp-2)', flexWrap: 'wrap', justifyContent: 'center' }
      },
        el('button', {
          type: 'button',
          class: 'btn btn--primary',
          onclick: () => { location.hash = '#/dashboard'; }
        }, icon('dashboard', 16), 'بازگشت به داشبورد'),
        el('button', {
          type: 'button',
          class: 'btn btn--ghost',
          onclick: () => openPalette() // جست‌وجوی سراسری — همان API دکمهٔ Ctrl+K
        }, icon('search', 16), 'جستجوی دانش‌آموز')
      )
    )
  );
}
