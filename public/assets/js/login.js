import { api, setToken, setDevStaffId } from './api.js';
import { el, icon } from './ui.js';

const SESSION_KEY = 'cs.loginOk';

function brandLogo() {
  return el('img', {
    class: 'login__logo',
    src: '/assets/img/logo-192.png?v=0.86.1',
    alt: 'نشان مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام',
    width: '76', height: '76'
  });
}

async function drawPublicAnnouncements(box) {
  try {
    const res = await api.get('/public/announcements');
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

  const userInput = el('input', {
    class: 'input',
    id: 'login-username',
    type: 'text',
    autocomplete: 'username',
    placeholder: 'مثلاً manager',
    dir: 'ltr',
    style: { textAlign: 'left' }
  });
  const passInput = el('input', {
    class: 'input',
    id: 'login-password',
    type: 'password',
    autocomplete: 'current-password',
    placeholder: '••••••',
    dir: 'ltr',
    style: { textAlign: 'left' }
  });
  const errorBox = el('div', { class: 'login__error', style: { display: 'none' } });
  const annBox = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '8px' } });

  const submit = async () => {
    errorBox.style.display = 'none';
    const username = userInput.value.trim();
    const password = passInput.value;
    if (!username || !password) {
      errorBox.textContent = 'نام کاربری و رمز عبور را وارد کنید.';
      errorBox.style.display = '';
      return;
    }
    const btn = root.querySelector('#login-submit');
    btn.disabled = true;
    try {
      const res = await api.post('/api/auth/login', { username, password });
      setToken(res.data.token);
      setDevStaffId(res.data.staff.id);
      sessionStorage.setItem(SESSION_KEY, '1');
      onSuccess?.(res.data.staff);
      setTimeout(() => location.reload(), 250);
    } catch (err) {
      errorBox.textContent = err.message || 'ورود ناموفق بود.';
      errorBox.style.display = '';
      passInput.value = '';
      passInput.focus();
    } finally {
      const b = root.querySelector('#login-submit');
      if (b) b.disabled = false;
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
      el('div', { class: 'login__sub' }, 'سامانه مدیریت نوبت‌دهی، سنجش و مراجعان'),
      form,
      annBox
    )
  );

  drawPublicAnnouncements(annBox);
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
