import { api, setDevStaffId } from './api.js';
import { el, icon, bindThemeBtn } from './ui.js';

const SESSION_KEY = 'cs.loginOk';

function brandLogo() {
  /* ۱.۲۷.۴۷ — لوگوی بزرگ‌تر (۹۶px) و دوسطحی سیاه‌وسفید؛ SVG درون‌خطی با متغیرهای تم وارونه می‌شود */
  const node = el('span', { class: 'login__logo' });
  node.innerHTML = `<svg viewBox="0 0 512 512" width="96" height="96" role="img" aria-label="نشان مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام" xmlns="http://www.w3.org/2000/svg">
    <!-- ۱.۲۷.۴۷ — نشان مونوکروم دوسطحی — وارونه در تم تیره -->
    <rect width="512" height="512" rx="116" fill="var(--logo-tile)"/>
    <circle cx="256" cy="106" r="38" fill="none" stroke="var(--logo-glyph)" stroke-width="26"/>
    <rect x="142" y="150" width="228" height="72" rx="36" fill="var(--logo-glyph)"/>
    <rect x="170" y="196" width="172" height="236" rx="48" fill="var(--logo-glyph)"/>
    <rect x="198" y="246" width="116" height="132" rx="22" fill="var(--logo-tile)"/>
    <path d="M256 258 C284 300 284 340 256 372 C228 340 228 300 256 258 Z" fill="var(--logo-glyph)"/>
    <rect x="158" y="446" width="196" height="30" rx="15" fill="var(--logo-glyph)"/>
        </svg>`;
  return node;
}

async function drawPublicAnnouncements(box) {
  try {
    const res = await api.getDetached('/public/announcements'); // بیرون از عمر نما
    const items = (res.data ?? []).slice(0, 3);
    if (items.length === 0) return;
    box.replaceChildren(
      ...items.map((a) =>
        el('div', { class: 'alert alert--info', style: { textAlign: 'start' } },
          icon('bell', 16),
          el('div', {},
            el('b', { style: { display: 'block', fontSize: 'var(--fs-sm)' } }, a.title),
            a.body ? el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)' } }, a.body) : null
          )
        )
      )
    );
  } catch {
    /* نرم — بنر اعلان اختیاری است */
  }
}

/* v1.26.0 — راهنمای نصب اولیه: فقط تا وقتی راه‌اندازی کامل نشده (docs/rust/first-run-and-cloud.md §۲).
   هر خطا خاموش است — این کارت کمک است نه شرط ورود؛ پس از بستن حساب نمایشی دیگر ظاهر نمی‌شود. */
async function drawFirstRunHint(box) {
  try {
    const res = await api.getDetached('/api/setup/status');
    if (!res?.data || res.data.initialized !== false) return;
    box.replaceChildren(
      el('div', { class: 'alert alert--info', style: { textAlign: 'start' } },
        icon('info', 16),
        el('div', {},
          el('b', { style: { display: 'block', fontSize: 'var(--fs-sm)' } }, 'راه‌اندازی اولیه'),
          el('span', { style: { fontSize: 'var(--fs-xs)', color: 'var(--text-2)' } },
            'با حساب شروع کار وارد شوید: نام کاربری manager و رمز 1234. بعد از ساخت حساب‌های مرکز در ویزار راه‌اندازی، این حساب بسته می‌شود.')
        )
      )
    );
  } catch {
  }
}

export function renderLoginPage(onSuccess) {
  const shell = document.querySelector('.shell');
  if (shell) shell.style.display = 'none';

  let root = document.getElementById('login-root');
  if (!root) {
    root = el('div', { id: 'login-root', class: 'login-root' });
    document.body.appendChild(root);
  }
  root.style.display = '';
  document.body.classList.add('is-login');

  /* ۱.۲۷.۷۴ — دکمهٔ روشن/تاریک صفحهٔ ورود: پیش از ورود هم تم قابل تغییر است؛
     همان منطق مشترک ui.js — پس از ورود دکمهٔ سربرگ همان را ادامه می‌دهد */
  const loginThemeBtn = el('button', {
    class: 'btn btn--ghost btn--icon login__theme theme-toggle',
    type: 'button'
  });

  const userInput = el('input', {
    class: 'input',
    id: 'login-username',
    type: 'text',
    autocomplete: 'username',
    placeholder: 'e.g. manager', /* ۱.۲۷.۸۷ — نمونهٔ حرفه‌ای تک‌دست‌وری (ASCII خالص) در input لاتین‌چپ؛ بدون artifact bidi */
    dir: 'ltr',
    style: { textAlign: 'left' }
  });
  const passInput = el('input', {
    class: 'input',
    id: 'login-password',
    type: 'password',
    autocomplete: 'current-password',
    /* ۱.۲۷.۸۷ — placeholder حرفه‌ای: جملهٔ راهنمای فارسیِ تک‌دست‌وری (بدون مخلوط دو جهت)
       راست‌چین تا زیر لیبل راست‌چین بنشیند؛ dir=ltr می‌ماند تا نگارش رمز لاتین درست بماند */
    placeholder: 'رمز عبور خود را وارد کنید',
    dir: 'ltr',
    style: { textAlign: 'right' }
  });
  /* ۱.۲۷.۷۷ — role=alert: اسکرین‌ریدر خطا را بلافاصله اعلام می‌کند (قبلاً فقط تغییر متن بود) */
  const errorBox = el('div', { class: 'login__error', id: 'login-error', role: 'alert', style: { display: 'none' } });
  const annBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });
  const hintBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

  /* ۱.۲۷.۸۶ — پیوند خطا به فیلد (WCAG 4.1.2): state فیلد معیوب و متن خطا برای SR اعلام می‌شود */
  const markInvalid = (input) => {
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', 'login-error');
    input.classList.add('is-invalid');
  };
  const clearInvalid = () => {
    for (const i of [userInput, passInput]) {
      i.removeAttribute('aria-invalid');
      i.removeAttribute('aria-describedby');
      i.classList.remove('is-invalid');
    }
  };

  const submit = async () => {
    clearInvalid();
    errorBox.style.display = 'none';
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      errorBox.textContent = 'نام کاربری و رمز عبور را وارد کنید.';
      errorBox.style.display = '';
      if (!username) markInvalid(userInput);
      if (!password) markInvalid(passInput);
      return;
    }
    const btn = root.querySelector('#login-submit');
    btn.disabled = true;
    btn.classList.add('is-busy'); /* ۱.۲۷.۸۶ — بازخورد «در حال ورود» روی شبکهٔ کند (چرخ‌ندهٔ مشترک) */
    btn.setAttribute('aria-busy', 'true');
    try {
      const res = await api.post('/api/auth/login', { username, password });
      /* ۱.۲۷.۸۲ (security-009/ADR-005): توکن نشست در کوکی httpOnly صادر شد — SPA آن را
         ذخیره/ارسال نمی‌کند. مقدار body.token فقط برای کلاینت‌های غیرمرورگری (wizard ابری) است. */
      setDevStaffId(res.data.staff.id);
      sessionStorage.setItem(SESSION_KEY, '1');
      /* B1 — ورود موفق نباید روی hash «#/login» بماند: روتر این مسیر را نمی‌شناسد و نمای ۴۰۴ می‌بیند.
         دیپ‌لینک واقعی (مثل #/reports) دست‌نخورده می‌ماند و پس از reload همان جا رندر می‌شود. */
      if (!location.hash || location.hash === '#/' || location.hash === '#/login') location.hash = '#/dashboard';
      onSuccess?.(res.data.staff);
      setTimeout(() => location.reload(), 250);
    } catch (err) {
      errorBox.textContent = err.message || 'ورود ناموفق بود.';
      errorBox.style.display = '';
      markInvalid(userInput); /* پیام سرور کدام فیلد را مقصر نمی‌داند — هر دو اعلام می‌شوند */
      markInvalid(passInput);
      passInput.value = '';
      passInput.focus();
    } finally {
      const b = root.querySelector('#login-submit');
      if (b) {
        b.disabled = false;
        b.classList.remove('is-busy');
        b.removeAttribute('aria-busy');
      }
    }
  };

  const form = el('form', {
    class: 'login__form',
    onsubmit: (e) => { e.preventDefault(); submit(); }
  },
    el('label', { class: 'field-label', for: 'login-username' }, 'نام کاربری'),
    userInput,
    el('label', { class: 'field-label', for: 'login-password' }, 'رمز عبور'),
    passInput,
    errorBox,
    el('button', { class: 'btn btn--primary btn--lg', id: 'login-submit', type: 'submit', style: { width: '100%' } },
      icon('check', 17), 'ورود به سامانه'
    )
  );

  root.replaceChildren(
    el('div', { class: 'login-card' },
      brandLogo(),
      el('div', { class: 'login__title' }, 'مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام'),
      el('div', { class: 'login__sub' }, 'سامانهٔ مدیریت نوبت‌دهی، سنجش و مراجعان'),
      form,
      hintBox,
      annBox
    )
  );

  /* ۱.۲۷.۷۴ — append پس از replaceChildren (فرزندان قبلی پاک می‌شوند) */
  bindThemeBtn(loginThemeBtn);
  root.append(loginThemeBtn);

  drawPublicAnnouncements(annBox);
  drawFirstRunHint(hintBox);
  setTimeout(() => userInput.focus(), 50);

  return { submit };
}

export function showApp() {
  const root = document.getElementById('login-root');
  if (root) root.style.display = 'none';
  const shell = document.querySelector('.shell');
  if (shell) shell.style.display = '';
  document.body.classList.remove('is-login');
}
