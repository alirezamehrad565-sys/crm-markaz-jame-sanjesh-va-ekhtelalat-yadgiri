import { api } from './api.js';
import { el, icon } from './ui.js';

const DISMISS_KEY = 'cs.annDismissed';

function dismissedSet() {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(DISMISS_KEY) || '[]'));
  } catch {
    return new Set();
  }
}

function rememberDismissed(id) {
  const set = dismissedSet();
  set.add(id);
  sessionStorage.setItem(DISMISS_KEY, JSON.stringify([...set]));
}

export async function initAnnouncementBanners() {
  const mount = document.getElementById('ann-banner-root');
  if (!mount) return;

  const items = new Map();
  try {
    const pub = await api.get('/public/announcements');
    for (const a of pub.data ?? []) items.set(a.id, a);
  } catch {
  }
  try {
    const panel = await api.get('/api/announcements');
    for (const a of panel.data ?? []) items.set(a.id, a);
  } catch {
  }

  if (items.size === 0) {
    mount.replaceChildren();
    return;
  }

  const dismissed = dismissedSet();
  const banners = [...items.values()]
    .filter((a) => !dismissed.has(a.id))
    .map((a) =>
      el(
        'div',
        { class: 'ann-banner', role: 'status' },
        icon('bell', 18),
        el('div', { class: 'ann-banner__text' },
          el('b', {}, a.title),
          el('p', {}, a.body)
        ),
        el('button', {
          class: 'ann-banner__close',
          'aria-label': 'بستن اعلان',
          onclick: () => {
            rememberDismissed(a.id);
            banner.classList.add('is-leaving');
            setTimeout(() => {
              banner.remove();
              if (!mount.querySelector('.ann-banner')) mount.replaceChildren();
            }, 200);
          }
        }, icon('x', 15))
      )
    );
  const banner = el('div', { class: 'ann-stack' }, banners);
  mount.replaceChildren(banner);
}
