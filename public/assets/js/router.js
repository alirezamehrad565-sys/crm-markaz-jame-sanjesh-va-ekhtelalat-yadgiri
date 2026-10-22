import { el, errorState } from './ui.js';

const routes = [];

export function register(pattern, view) {
  const keys = [];
  const regexStr = pattern
    .replace(/^#\//, '')
    .split('/')
    .map((seg) => {
      if (seg.startsWith(':')) {
        keys.push(seg.slice(1));
        return '([^/]+)';
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    })
    .join('/');
  routes.push({ regex: new RegExp(`^${regexStr}$`), keys, view });
}

export function navigate(hash) {
  if (location.hash === hash) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = hash;
  }
}

function parseHash() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [pathPart, queryPart] = raw.split('?');
  const path = pathPart ?? '';
  const query = {};
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=');
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v ?? '');
    }
  }
  return { path, query };
}

export async function render(outlet) {
  const { path, query } = parseHash();
  for (const route of routes) {
    const match = path.match(route.regex);
    if (match) {
      const params = {};
      route.keys.forEach((k, i) => {
        params[k] = decodeURIComponent(match[i + 1]);
      });
      outlet.replaceChildren();
      const ctx = { params, query, path };
      try {
        await route.view.render(outlet, ctx);
      } catch (err) {
        outlet.replaceChildren(errorState(err, () => render(outlet)));
      }
      outlet.firstElementChild?.classList.add('view-enter');
      document.dispatchEvent(new CustomEvent('routechange', { detail: { path, view: route.view } }));
      return route.view;
    }
  }
  navigate('#/dashboard');
  return null;
}

export function start(outlet) {
  window.addEventListener('hashchange', () => render(outlet));
  render(outlet);
}
