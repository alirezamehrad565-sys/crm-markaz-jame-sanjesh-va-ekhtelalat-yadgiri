import { api } from './api.js';
import { el, icon, openModal, toast } from './ui.js';

let cachedUsername;

export async function resolveBotUsername(force = false) {
  if (!force && cachedUsername !== undefined) return cachedUsername;
  try {
    const res = await api.get('/api/notifications/bot-username');
    cachedUsername = res?.data?.username ?? null;
  } catch {
    cachedUsername = null;
  }
  return cachedUsername;
}

export function buildBotLink(username, code) {
  const u = typeof username === 'string' ? username.trim().replace(/^@/, '') : '';
  if (!u || !code) return null;
  return `https://ble.ir/${u}?start=${encodeURIComponent(code)}`;
}

async function copyText(text) {
  try {
    await navigator.clipboard?.writeText(text);
    return true;
  } catch {
    try {
      const tmp = el('textarea', { style: { position: 'fixed', opacity: '0' } });
      tmp.value = text;
      document.body.appendChild(tmp);
      tmp.select();
      const ok = document.execCommand('copy');
      tmp.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

export function botLinkBox(link, code) {
  if (!link) return null;

  const input = el('input', {
    class: 'input',
    dir: 'ltr',
    readonly: true,
    value: link,
    style: { flex: '1', minWidth: '0', fontSize: 'var(--fs-sm)', fontFamily: 'monospace' },
    onclick: (e) => e.target.select()
  });

  const copyBtn = el('button', {
    class: 'btn btn--soft btn--sm',
    style: { whiteSpace: 'nowrap' },
    onclick: async () => {
      const ok = await copyText(link);
      toast(ok ? 'لینک احراز کپی شد — برای معلم بفرستید' : 'کپی نشد — لینک را دستی انتخاب کنید', ok ? 'success' : 'error');
    }
  }, icon('copy', 14), 'کپی لینک');

  return el('div', { class: 'token-box', style: { marginTop: '10px' } },
    el('span', { style: { fontSize: 'var(--fs-sm)', color: 'var(--text-2)', display: 'block', marginBottom: '8px' } },
      '🔗 لینک احراز خودکار (به معلم بدهید):'),
    el('div', { style: { display: 'flex', gap: '6px', alignItems: 'stretch' } }, input, copyBtn),
    el('p', { style: { margin: '8px 0 0', fontSize: 'var(--fs-xs)', color: 'var(--text-3)' } },
      'با کلیک روی لینک، بات بله باز می‌شود، کد خودکار ارسال و احراز هویت انجام می‌گیرد — معلم چیزی تایپ نمی‌کند. لینک منقضی نمی‌شود — اگر گفتگو عوض شد، همان لینک دوباره استفاده می‌شود و اتصال منتقل می‌گردد.')
  );
}

export async function openBotLinkModal(code, { intro, extraHint } = {}) {
  const username = await resolveBotUsername();
  const link = buildBotLink(username, code);
  const codeBox = el('div', {
    style: {
      fontSize: '28px', fontWeight: '800', letterSpacing: '6px', textAlign: 'center',
      background: 'var(--surface-2)', border: '1px dashed var(--border)',
      borderRadius: 'var(--radius)', padding: '14px', direction: 'ltr', userSelect: 'all'
    }
  }, code);

  const fallbackHint = el('p', { style: { margin: '0', fontSize: 'var(--fs-sm)', color: 'var(--text-3)' } },
    'کافی است در بات این پیام را بفرستد: /link ' + code +
    ' — پس از اتصال، اعلان نوبت‌ها و برنامه (/today و /week) دریافت می‌کند.');

  const body = el('div', { style: { display: 'flex', flexDirection: 'column', gap: '10px' } },
    intro ? el('p', { style: { margin: '0', color: 'var(--text-2)' } }, intro) : null,
    codeBox,
    link ? botLinkBox(link, code) : fallbackHint,
    extraHint ? el('p', { style: { margin: '0', fontSize: 'var(--fs-sm)', color: 'var(--text-3)' } }, extraHint) : null
  );

  const actions = [
    (close) => el('button', {
      class: 'btn btn--primary',
      onclick: async () => {
        const ok = await copyText(link ?? `/link ${code}`);
        toast(ok ? (link ? 'لینک احراز کپی شد' : 'دستور کپی شد') : 'کپی نشد', ok ? 'success' : 'error');
        if (ok) close();
      }
    }, icon('copy', 15), link ? 'کپی لینک احراز' : 'کپی دستور'),
    (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')
  ];

  openModal({ title: 'کد اتصال بات بله', body, actions });
}
