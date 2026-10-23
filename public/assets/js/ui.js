import { ERROR_TEXT } from './api.js';
import { fa } from './format.js';
import { jalaliDateInput } from './jalali-picker.js';

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'value') node.value = value;
    else if (key === 'checked' || key === 'disabled' || key === 'selected' || key === 'required') node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

function append(node, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) append(node, child);
    else if (child instanceof Node) node.appendChild(child);
    else node.appendChild(document.createTextNode(String(child)));
  }
}

const PATHS = {
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5"/><path d="M16 5a3.2 3.2 0 0 1 0 6.3M17.8 14.6c2 .7 3.3 2.3 3.7 4.4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.2 2"/>',
  school: '<path d="M3 21h18M5 21V8l7-5 7 5v13"/><path d="M9.5 21v-5a2.5 2.5 0 0 1 5 0v5"/><path d="M12 9.5h.01"/>',
  student: '<path d="M12 3 2 8l10 5 10-5-10-5Z"/><path d="M6 10.5V15c0 1.7 2.7 3.5 6 3.5s6-1.8 6-3.5v-4.5"/><path d="M22 8v5"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4.5 21c1-4 4-6 7.5-6s6.5 2 7.5 6"/>',
  sun: '<circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"/>',
  menu: '<path d="M4 6.5h16M4 12h16M4 17.5h16"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  edit: '<path d="M14.5 5.5 18.5 9.5 8.5 19.5 4 20l.5-4.5 10-10Z"/><path d="m13 7 4 4"/>',
  trash: '<path d="M4 6.5h16M9.5 6V4.5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V6M6.5 6.5l.8 12a2 2 0 0 0 2 1.9h5.4a2 2 0 0 0 2-1.9l.8-12"/><path d="M10 10.5v5M14 10.5v5"/>',
  check: '<path d="m4.5 12.5 5 5 10-11"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  alert: '<path d="M12 3 2.5 20h19L12 3Z"/><path d="M12 10v4.5M12 17.5h.01"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2"/><path d="M5 15.5H4a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  undo: '<path d="M4 9h10a6 6 0 0 1 0 12h-4"/><path d="M8.5 4.5 4 9l4.5 4.5"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 3.5V8h-4.5"/>',
  chevR: '<path d="m9 5 7 7-7 7"/>',
  chevL: '<path d="m15 5-7 7 7 7"/>',
  bot: '<rect x="4" y="8" width="16" height="12" rx="3"/><path d="M12 8V4M8 4h8"/><circle cx="9" cy="14" r="1"/><circle cx="15" cy="14" r="1"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m20 20-4.4-4.4"/>',
  logout: '<path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="m14 8 4 4-4 4M18 12H8"/>',
  settings: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1Z"/>',
  zap: '<path d="M13 2 4.5 13.5H11L10 22l8.5-11.5H12L13 2Z"/>',
  bell: '<path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/>',
  tag: '<path d="M20.6 13.4 11 3.8A2 2 0 0 0 9.6 3.2H5a2 2 0 0 0-2 2v4.6c0 .5.2 1 .6 1.4l9.6 9.6a2 2 0 0 0 2.8 0l4.6-4.6a2 2 0 0 0 0-2.8Z"/><circle cx="7.5" cy="7.5" r="1.2"/>',
  printer: '<path d="M7 8V3.5h10V8"/><rect x="4" y="8" width="16" height="8.5" rx="2"/><path d="M7 14h10v6.5H7z"/>',
  file: '<path d="M13.5 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8.5L13.5 3Z"/><path d="M13.5 3v5.5H19"/><path d="M9 13h6M9 16.5h6"/>',
  download: '<path d="M12 4v11M7.5 11.5 12 16l4.5-4.5"/><path d="M4.5 19.5h15"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4.5 19.5h15"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  clip: '<path d="m21 12.5-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.8-8.8a3.7 3.7 0 0 1 5.2 5.2l-8.8 8.8a1.85 1.85 0 0 1-2.6-2.6l8.1-8.1"/>',
  board: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9.5 4v16M15 4v11M5.5 8h1.5M12 8h1.5M17.5 8h1"/>',
  dots: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  phone: '<path d="M21.5 16.7v2.6a1.8 1.8 0 0 1-2 1.8 17.8 17.8 0 0 1-7.8-2.8 17.5 17.5 0 0 1-5.4-5.4A17.8 17.8 0 0 1 3.5 5a1.8 1.8 0 0 1 1.8-2h2.6a1.8 1.8 0 0 1 1.8 1.55c.11.85.32 1.68.62 2.47a1.8 1.8 0 0 1-.4 1.9L8.9 10a14.4 14.4 0 0 0 5.4 5.4l1.08-1.07a1.8 1.8 0 0 1 1.9-.4c.79.3 1.62.51 2.47.62a1.8 1.8 0 0 1 1.55 1.85Z"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 7.5h.01"/>',
  waitlist: '<path d="M9 4.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-2"/><rect x="9" y="2.5" width="6" height="4" rx="1.2"/><path d="M8.5 11.5h7M8.5 15.5h4.5"/>',
  archive: '<rect x="3" y="3.5" width="18" height="4.5" rx="1.2"/><path d="M5 8v11a1.8 1.8 0 0 0 1.8 1.8h10.4A1.8 1.8 0 0 0 19 19V8"/><path d="M10 12h4"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.8"/><circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none"/>',
  trendingUp: '<path d="m3.5 16.5 5.2-5.2 3.5 3.5 8.3-8.3"/><path d="M15 6.5h5.5V12"/>',
  flame: '<path d="M12 21.5c-3.6 0-6.2-2.4-6.2-5.8 0-2.4 1.4-4.3 2.9-5.9.4 1.1 1 1.9 1.9 2.4-.2-2.8 1-5.5 3.7-7.7.2 2.6 1.3 4.1 2.7 5.7 1.2 1.4 2 2.9 2 4.8 0 3.7-3 6.5-7 6.5Z"/>',
  medal: '<circle cx="12" cy="9" r="5.5"/><path d="m8.6 13.6-1.6 7.4 5-2.6 5 2.6-1.6-7.4"/>',
  timeline: '<path d="M12 3v18"/><circle cx="12" cy="6.5" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="12" cy="17.5" r="1.8"/>',
  checklist: '<path d="m3.5 6.2 1.6 1.6 3-3.2"/><path d="M11.5 6.5h9"/><path d="m3.5 13.2 1.6 1.6 3-3.2"/><path d="M11.5 13.5h9"/><path d="M11.5 20.5h9"/>',
  calendarCheck: '<rect x="3" y="4.5" width="18" height="17" rx="2.5"/><path d="M8 2.5v4M16 2.5v4M3 9.5h18"/><path d="m8.8 14.8 2.2 2.2 4.2-4.6"/>',
  bellOff: '<path d="M6.2 9.2a5.8 5.8 0 0 1 11.6 0c0 4.8 1.9 5.9 1.9 5.9H4.3s1.9-1.1 1.9-5.9Z"/><path d="M10 19.2a2.1 2.1 0 0 0 4 0"/><path d="m4 4 16.5 16.5"/>',
  filter: '<path d="M4 5h16l-6.2 7.3v5.2L10.2 20v-7.7L4 5Z"/>',
  grip: '<circle cx="5" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="9" r="1.3" fill="currentColor" stroke="none"/><circle cx="5" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none"/><circle cx="19" cy="15" r="1.3" fill="currentColor" stroke="none"/>',
  moreV: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  hourglass: '<path d="M6.5 3h11M6.5 21h11"/><path d="M8 3v3.2c0 2.1 1.6 3.6 4 5.3 2.4-1.7 4-3.2 4-5.3V3"/><path d="M8 21v-3.2c0-2.1 1.6-3.6 4-5.3 2.4 1.7 4 3.2 4 5.3V21"/>',
  sparkles: '<path d="M12 4 13.9 9.1 19 11l-5.1 1.9L12 18l-1.9-5.1L5 11l5.1-1.9L12 4Z"/><path d="M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z"/>',
  trophy: '<path d="M8 3.5h8V9a4 4 0 0 1-8 0V3.5Z"/><path d="M8 5H5.5a2.5 2.5 0 0 0 2.6 4.3"/><path d="M16 5h2.5a2.5 2.5 0 0 1-2.6 4.3"/><path d="M12 13v3.5"/><path d="M8.5 20.5h7"/><path d="M9.5 20.5c0-2.2 1-4 2.5-4s2.5 1.8 2.5 4"/>',
  book: '<path d="M12 6.6C10.5 5 8.4 4.1 6 4.1H3.5v14.4H6c2.4 0 4.5.9 6 2.5 1.5-1.6 3.6-2.5 6-2.5h2.5V4.1H18c-2.4 0-4.5.9-6 2.5Z"/><path d="M12 6.6V21"/>',
  gamepad: '<path d="M6.7 7.2h10.6a4.4 4.4 0 0 1 4.3 5.3l-.7 3.7a2.8 2.8 0 0 1-5 1.2L14.7 15H9.3l-1.2 2.4a2.8 2.8 0 0 1-5-1.2l-.7-3.7a4.4 4.4 0 0 1 4.3-5.3Z"/><path d="M8.2 9.9v3.2M6.6 11.5h3.2"/><circle cx="15.4" cy="10.7" r="1" fill="currentColor" stroke="none"/><circle cx="17.6" cy="12.9" r="1" fill="currentColor" stroke="none"/>',
  calculator: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 6.5h7"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01M8.5 14.5h.01M12 14.5h.01M15.5 14.5h.01M8.5 18h.01M12 18h.01M15.5 18h.01"/>',
  puzzle: '<path d="M10 4.2a2 2 0 0 1 4 0v1.3h2.8A1.5 1.5 0 0 1 18.3 7v2.8h1.5a2 2 0 0 1 0 4h-1.5v2.8a1.5 1.5 0 0 1-1.5 1.5H14v-1.5a2 2 0 0 0-4 0V18.1H7.2a1.5 1.5 0 0 1-1.5-1.5v-2.8H4.2a2 2 0 0 1 0-4h1.5V7a1.5 1.5 0 0 1 1.5-1.5H10V4.2Z"/>',
  note: '<path d="M4.5 6A1.5 1.5 0 0 1 6 4.5h12A1.5 1.5 0 0 1 19.5 6v9.5l-4.5 4.5H6A1.5 1.5 0 0 1 4.5 18.5V6Z"/><path d="M15.2 19.7v-3.9h4"/>',
  clipboard: '<rect x="4.5" y="4.5" width="15" height="17" rx="2"/><rect x="8.5" y="2.5" width="7" height="4" rx="1.2"/><path d="M8.5 11.5h7M8.5 15h4.5"/>',
  speech: '<path d="M21 11.6a8.5 8.5 0 0 1-8.5 8.5c-1.6 0-3.1-.4-4.4-1.2L3 20.2l1.3-5A8.5 8.5 0 1 1 21 11.6Z"/>',
  heart: '<path d="M12 20.5S3.5 15.4 3.5 9.6A4.7 4.7 0 0 1 12 6.7a4.7 4.7 0 0 1 8.5 2.9c0 5.8-8.5 10.9-8.5 10.9Z"/>',
  activity: '<path d="M3 12h3.8l2.4-6 4.4 12 2.4-6H21"/>',
  shield: '<path d="M12 3 5 5.8v5.4c0 4.4 3 8.2 7 9.3 4-1.1 7-4.9 7-9.3V5.8L12 3Z"/>',
  brain: '<path d="M12 4.6a3 3 0 0 0-5.6 1.4A3.2 3.2 0 0 0 4 9.1c0 .8.3 1.6.8 2.2a3.3 3.3 0 0 0-.3 1.5c0 1.5 1 2.8 2.4 3.2a3 3 0 0 0 5.1 2V4.6Z"/><path d="M12 4.6a3 3 0 0 1 5.6 1.4A3.2 3.2 0 0 1 20 9.1c0 .8-.3 1.6-.8 2.2.2.5.3 1 .3 1.5 0 1.5-1 2.8-2.4 3.2a3 3 0 0 1-5.1 2"/>',
  star: '<path d="m12 3.8 2.5 5.1 5.6.8-4 4 1 5.6-5.1-2.7-5.1 2.7 1-5.6-4-4 5.6-.8L12 3.8Z"/>',
  send: '<path d="m21 3-9.5 9.5"/><path d="M21 3 15 21l-3.5-8.5L3 9l18-6Z"/>',
  save: '<path d="M5 3.5h10.5L19.5 7.5V19A1.5 1.5 0 0 1 18 20.5H5A1.5 1.5 0 0 1 3.5 19V5A1.5 1.5 0 0 1 5 3.5Z"/><path d="M7.5 3.5V9h7V3.5"/><path d="M7.5 20.5V14h9v6.5"/>',
  message: '<path d="M19.5 4.5h-15a1.5 1.5 0 0 0-1.5 1.5v9.5A1.5 1.5 0 0 0 4.5 17H8v4l5-4h6.5a1.5 1.5 0 0 0 1.5-1.5V6a1.5 1.5 0 0 0-1.5-1.5Z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/>'
};

export function isKnownIcon(name) {
  return typeof name === 'string' && name.length > 0 && Object.prototype.hasOwnProperty.call(PATHS, name);
}

export function progressRing(value, max, { size = 84, stroke = 8, color = 'var(--primary)', trackColor = 'var(--surface-3)' } = {}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(1, max > 0 ? value / max : 0));
  return el(
    'svg',
    { width: size, height: size, viewBox: `0 0 ${size} ${size}`, 'aria-hidden': 'true', class: 'ring-svg' },
    el('circle', { cx: size / 2, cy: size / 2, r, fill: 'none', stroke: trackColor, 'stroke-width': stroke }),
    el('circle', {
      cx: size / 2, cy: size / 2, r, fill: 'none', stroke: color, 'stroke-width': stroke,
      'stroke-linecap': 'round', 'stroke-dasharray': String(c), 'stroke-dashoffset': String(c * (1 - pct)),
      transform: `rotate(-90 ${size / 2} ${size / 2})`, class: 'ring__fill'
    })
  );
}

export function tabs(items, initialKey) {
  const root = el('div', { class: 'tabs', role: 'tablist' });
  const buttons = new Map();
  for (const item of items) {
    const btn = el(
      'button',
      { class: 'tab', role: 'tab', dataset: { tab: item.key }, onclick: () => item.onSelect(item.key) },
      item.icon ? icon(item.icon, 17) : null,
      item.label
    );
    buttons.set(item.key, btn);
    root.appendChild(btn);
  }
  const setActive = (key) => {
    for (const [k, btn] of buttons) btn.classList.toggle('is-active', k === key);
  };
  setActive(initialKey);
  return { root, setActive };
}

export function icon(name, size = 20) {
  const span = el('span', {
    class: 'ico',
    style: { display: 'inline-flex', flexShrink: '0' },
    'aria-hidden': 'true'
  });
  span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${PATHS[name] || ''}</svg>`;
  return span;
}

function toastStack() {
  let stack = document.querySelector('.toast-stack');
  if (!stack) {
    stack = el('div', { class: 'toast-stack', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(stack);
  }
  return stack;
}

export function toast(message, type = 'info', ttl = 3600) {
  const t = el('div', { class: `toast toast--${type}` }, icon(type === 'success' ? 'check' : type === 'error' ? 'alert' : type === 'warning' ? 'alert' : 'clock', 18), el('span', {}, message));
  toastStack().appendChild(t);
  setTimeout(() => {
    t.classList.add('is-leaving');
    setTimeout(() => t.remove(), 200);
  }, ttl);
}

export function toastError(err) {
  const detail = Array.isArray(err?.details) && err.details.length > 0
    ? err.details.find((d) => d?.message)?.message
    : null;
  const msg = err?.message || ERROR_TEXT.INTERNAL_ERROR;
  toast(detail && detail !== msg ? `${msg} — ${detail}` : msg, 'error', 5200);
}

const modalStack = [];

export function openModal({ title, body, actions = [], wide = false, onClose }) {
  const overlay = el('div', { class: 'modal-overlay' });
  const close = () => {
    if (overlay.dataset.closing) return;
    overlay.dataset.closing = '1';
    overlay.classList.add('is-leaving');
    document.removeEventListener('keydown', onKey);
    const idx = modalStack.indexOf(overlay);
    if (idx >= 0) modalStack.splice(idx, 1);
    const remove = () => { overlay.remove(); };
    let removed = false;
    const once = () => { if (!removed) { removed = true; remove(); } };
    overlay.addEventListener('animationend', once, { once: true });
    setTimeout(once, 220); // کمی بیشتر از مدت انیمیشن خروج
    if (onClose) onClose();
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && modalStack[modalStack.length - 1] === overlay) close();
  };

  const modal = el(
    'div',
    { class: `modal${wide ? ' modal--wide' : ''}`, role: 'dialog', 'aria-modal': 'true' },
    el(
      'div',
      { class: 'modal__head' },
      el('div', { class: 'modal__title' }, title),
      el('button', { class: 'btn btn--ghost btn--icon', 'aria-label': 'بستن', onclick: close }, icon('x', 18))
    ),
    el('div', { class: 'modal__body' }, typeof body === 'function' ? body(close) : body),
    actions.length > 0 ? el('div', { class: 'modal__foot' }, ...actions.map((a) => a(close))) : null
  );

  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay) close();
  });
  document.addEventListener('keydown', onKey);
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  modalStack.push(overlay);

  const first = modal.querySelector('input, select, textarea, button.btn--primary');
  if (first) setTimeout(() => first.focus(), 60);

  return { close, root: modal };
}

export function confirmModal({ title = 'تأیید', message, confirmLabel = 'تأیید', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    openModal({
      title,
      onClose: () => done(false),
      body: el('p', { style: { color: 'var(--text-2)', margin: '0' } }, message),
      actions: [
        (close) => el('button', { class: 'btn btn--ghost', onclick: () => { done(false); close(); } }, 'انصراف'),
        (close) =>
          el(
            'button',
            { class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, onclick: () => { done(true); close(); } },
            confirmLabel
          )
      ]
    });
  });
}

function buildSearchableSelect(f, value) {
  const opts = f.options ?? [];
  const hiddenInput = el('input', { type: 'hidden', name: f.name });
  const labelOf = (v) => opts.find((o) => String(o.value) === String(v))?.label ?? '';
  hiddenInput.value = value;

  const root = el('div', { class: 'combo' });
  const text = el('input', {
    class: 'input',
    type: 'text',
    placeholder: f.placeholder ?? 'جستجو کنید…',
    autocomplete: 'off'
  });
  text.value = labelOf(hiddenInput.value);
  const clearBtn = el('button', { class: 'combo__clear', type: 'button', 'aria-label': 'پاک کردن', title: 'پاک کردن', hidden: !hiddenInput.value }, '×');
  const list = el('div', { class: 'combo__list', hidden: true });
  root.append(text, clearBtn, list);

  let items = [];
  let activeIdx = -1;

  const syncClear = () => { clearBtn.hidden = !hiddenInput.value; };
  function pick(v) {
    const changed = String(v) !== String(hiddenInput.value);
    hiddenInput.value = v;
    text.value = labelOf(v);
    syncClear();
    closeList();
    if (changed) hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function renderFilter(q) {
    const needle = (q ?? '').trim().toLowerCase();
    items = opts.filter((o) => !needle || String(o.label).toLowerCase().includes(needle));
    activeIdx = items.length ? 0 : -1;
    const shown = items.slice(0, 60).map((o, i) =>
      el('div', {
        class: `combo__opt${String(o.value) === String(hiddenInput.value) ? ' is-selected' : ''}${i === activeIdx ? ' is-active' : ''}`,
        onmousedown: (e) => e.preventDefault(), // blur قبل از click رخ ندهد
        onclick: () => pick(o.value)
      }, o.label)
    );
    if (items.length > 60) shown.push(el('div', { class: 'combo__empty' }, 'بیشتر تایپ کنید…'));
    if (items.length === 0) shown.push(el('div', { class: 'combo__empty' }, 'گزینه‌ای یافت نشد'));
    list.replaceChildren(...shown);
  }
  function openList() { renderFilter(''); list.hidden = false; }
  function closeList() { list.hidden = true; }

  text.addEventListener('focus', openList);
  text.addEventListener('input', () => {
    hiddenInput.value = '';
    syncClear();
    renderFilter(text.value);
    list.hidden = false;
  });
  text.addEventListener('keydown', (e) => {
    if (list.hidden && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) { openList(); e.preventDefault(); return; }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (items.length === 0) return;
      activeIdx = e.key === 'ArrowDown' ? Math.min(activeIdx + 1, items.length - 1) : Math.max(activeIdx - 1, 0);
      [...list.querySelectorAll('.combo__opt')].forEach((n, i) => n.classList.toggle('is-active', i === activeIdx));
    } else if (e.key === 'Enter') {
      if (!list.hidden && activeIdx >= 0 && items[activeIdx]) { e.preventDefault(); pick(items[activeIdx].value); }
    } else if (e.key === 'Escape') {
      closeList();
    }
  });
  text.addEventListener('blur', () => setTimeout(closeList, 120));
  clearBtn.addEventListener('click', () => { pick(''); text.focus(); });

  return { root, hiddenInput };
}

export function formModal({ title, fields, initial = {}, submitLabel = 'ذخیره', wide = false, onSubmit, secondary }) {
  const form = el('form', { class: 'form-grid', novalidate: true });
  const inputs = {};

  for (const f of fields) {
    if (f.type === 'heading') {
      form.appendChild(el('div', { class: 'form-heading', style: { gridColumn: '1 / -1' } }, f.label));
      continue;
    }
    const field = el('div', { class: `field${f.span === 2 ? ' span-2' : ''}` });
    let labelEl = null;
    if (f.type !== 'switch') {
      labelEl = el('label', { class: 'field__label' }, f.label, f.required ? el('span', { class: 'req' }, ' *') : null);
      field.appendChild(labelEl);
    }

    let input;
    if (f.type === 'select') {
      input = el(
        'select',
        { class: 'select', name: f.name, required: f.required },
        f.placeholder ? el('option', { value: '' }, f.placeholder) : null,
        (f.options ?? []).map((o) => el('option', { value: o.value }, o.label))
      );
      input.value = initial[f.name] ?? f.value ?? '';
    } else if (f.type === 'searchable-select') {
      const combo = buildSearchableSelect(f, initial[f.name] ?? f.value ?? '');
      input = combo.hiddenInput;
      field.appendChild(combo.root);
    } else if (f.type === 'chips') {
      const hidden = el('input', { type: 'hidden', name: f.name });
      hidden.value = initial[f.name] ?? f.value ?? '';
      const current = Number(hidden.value);
      const group = el('div', { class: 'chip-group' });
      (f.labels ?? []).forEach((lbl, idx) => {
        const btn = el('button', {
          type: 'button', class: `chip${Number.isInteger(current) && current === idx ? ' is-on' : ''}`,
          onclick: () => {
            hidden.value = String(idx);
            group.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-on'));
            btn.classList.add('is-on');
          }
        }, lbl);
        group.appendChild(btn);
      });
      input = hidden;
      field.appendChild(group);
    } else if (f.type === 'textarea') {
      input = el('textarea', { class: 'textarea', name: f.name, placeholder: f.placeholder, rows: f.rows ?? 3 });
      input.value = initial[f.name] ?? f.value ?? '';
    } else if (f.type === 'jalali-date') {
      const w = jalaliDateInput({ value: initial[f.name] ?? f.value ?? '', allowClear: !f.required });
      input = w.hiddenInput;
      field.appendChild(w.root);
    } else if (f.type === 'switch') {
      input = el('input', { type: 'checkbox', name: f.name });
      input.checked = Boolean(initial[f.name] ?? f.value ?? false);
      const wrap = el('label', { style: { display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' } }, input, el('span', { class: 'field__label', style: { margin: 0 } }, f.label));
      const sw = el('span', { class: 'switch' }, input, el('span', { class: 'switch__track' }));
      input.style.display = 'none';
      wrap.insertBefore(sw, wrap.children[1]);
      field.appendChild(wrap);
      inputs[f.name] = input;
      form.appendChild(field);
      continue;
    } else {
      input = el('input', {
        class: 'input',
        type: f.type ?? 'text',
        name: f.name,
        placeholder: f.placeholder,
        min: f.min,
        max: f.max,
        step: f.step,
        maxlength: f.maxlength,
        dir: f.ltr ? 'ltr' : null,
        autocomplete: 'off'
      });
      input.value = initial[f.name] ?? f.value ?? '';
    }

    if (f.hint) field.appendChild(el('div', { class: 'field__hint' }, f.hint));
    const errSlot = el('div', { class: 'field__error', style: { display: 'none' } });
    field.appendChild(input);
    field.appendChild(errSlot);
    inputs[f.name] = input;
    if (typeof f.extra === 'function' && labelEl) {
      const extraNode = f.extra(input);
      if (extraNode) labelEl.after(extraNode);
    }
    if (f.onChange) {
      input.addEventListener('change', () => f.onChange(input.type === 'checkbox' ? input.checked : input.value, inputs));
    }
    form.appendChild(field);
  }

  const errBox = el('div', { class: 'alert alert--error', style: { display: 'none' } });
  let closing = false;

  const collectValues = () => {
    const values = {};
    for (const f of fields) {
      if (f.type === 'heading') continue; // — سربرگ مقدار ندارد
      const input = inputs[f.name];
      values[f.name] = f.type === 'switch' ? input.checked : input.value.trim();
    }
    return values;
  };

  const submitBtn = el('button', { class: 'btn btn--primary', type: 'submit' }, submitLabel);
  const secondaryAction = secondary
    ? (close) => {
        const btn = el('button', { class: 'btn btn--ghost', type: 'button' }, secondary.label);
        btn.addEventListener('click', async () => {
          btn.disabled = true;
          try {
            await secondary.onClick(collectValues());
            closing = true;
            close();
          } catch (err) {
            btn.disabled = false;
            errBox.style.display = 'flex';
            errBox.textContent = err.message || 'خطا در ذخیره';
          }
        });
        return btn;
      }
    : null;
  openModal({
    title,
    wide,
    body: [form, errBox],
    actions: [
      ...(secondaryAction ? [secondaryAction] : []),
      (close) => el('button', { class: 'btn btn--ghost', type: 'button', onclick: close }, 'انصراف'),
      (close) => {
        submitBtn.addEventListener('click', () => form.requestSubmit());
        form.addEventListener('submit', async (e) => {
          e.preventDefault();
          if (closing) return;
          const values = {};
          for (const f of fields) {
            if (f.type === 'heading') continue; // — سربرگ مقدار ندارد
            const input = inputs[f.name];
            values[f.name] = f.type === 'switch' ? input.checked : input.value.trim();
          }
          for (const f of fields) {
            if (f.required && !values[f.name] && f.type !== 'switch') {
              inputs[f.name].classList.add('is-invalid');
              toast(`«${f.label}» الزامی است`, 'warning');
              inputs[f.name].focus();
              return;
            }
          }
          submitBtn.disabled = true;
          try {
            await onSubmit(values);
            closing = true;
            close();
          } catch (err) {
            submitBtn.disabled = false;
            errBox.style.display = 'flex';
            errBox.textContent = err.message || 'خطا در ذخیره';
            if (err.details) {
              for (const d of err.details) {
                const input = inputs[d.path?.split('.')[0]];
                if (input) {
                  input.classList.add('is-invalid');
                  const slot = input.closest('.field')?.querySelector('.field__error');
                  if (slot) {
                    slot.style.display = 'block';
                    slot.textContent = d.message;
                  }
                }
              }
            }
          }
        });
        return submitBtn;
      }
    ]
  });

  return { form };
}

export function dataTable({ columns, rows, empty, onRowClick, rowClass }) {
  if (!rows || rows.length === 0) {
    return emptyState(empty ?? {});
  }
  const thead = el(
    'thead',
    {},
    el('tr', {}, columns.map((c) => el('th', { style: c.thStyle ?? (c.align ? { textAlign: c.align } : null) }, c.label)))
  );
  const tbody = el(
    'tbody',
    {},
    rows.map((row) =>
      el(
        'tr',
        {
          dataset: { id: row.id ?? '' },
          class: [onRowClick ? 'is-clickable' : null, rowClass ? rowClass(row) : null].filter(Boolean).join(' ') || null,
          onclick: onRowClick
            ? (e) => {
                if (e.target.closest('button, a, input, select, textarea, label, [role="button"]')) return;
                onRowClick(row);
              }
            : null
        },
        columns.map((c) =>
          el(
            'td',
            {
              style: c.tdStyle ?? (c.align ? { textAlign: c.align } : null),
              dataset: { label: c.label }
            },
            c.render ? c.render(row) : row[c.key] ?? '—'
          )
        )
      )
    )
  );
  return el('div', { class: 'table-wrap' }, el('table', { class: 'table' }, thead, tbody));
}

export function emptyState({ iconName = 'alert', title = 'چیزی اینجا نیست', hint, actionLabel, onAction, illo }) {
  return el(
    'div',
    { class: 'empty' },
    illo ? illo() : el('div', { class: 'empty__icon' }, icon(iconName, 26)),
    el('div', { class: 'empty__title' }, title),
    hint ? el('div', { class: 'empty__hint' }, hint) : null,
    actionLabel && onAction ? el('button', { class: 'btn btn--primary btn--sm', onclick: onAction }, icon('plus', 16), actionLabel) : null
  );
}

let activeRowMenuClose = null;
export function rowMenu({ label = 'اقدامات بیشتر', items }) {
  const btn = el('button', {
    class: 'btn btn--ghost btn--icon row-menu__btn',
    'aria-label': label, title: label, type: 'button'
  }, icon('dots', 15));
  const pop = el('div', { class: 'row-menu__pop', hidden: true },
    ...items.map((it) => (it.sep
      ? el('div', { class: 'row-menu__sep', role: 'separator' })
      : el('button', {
          class: `row-menu__item${it.danger ? ' row-menu__item--danger' : ''}`,
          type: 'button'
        }, it.icon ? icon(it.icon, 14) : null, el('span', {}, it.label))))
  );
  const root = el('div', { class: 'row-menu' }, btn, pop);

  function close() {
    pop.hidden = true;
    btn.classList.remove('is-open');
    btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('click', onDoc, true);
    document.removeEventListener('keydown', onKey, true);
    document.removeEventListener('scroll', onScroll, true);
    if (activeRowMenuClose === close) activeRowMenuClose = null;
  }
  function open() {
    if (activeRowMenuClose) activeRowMenuClose(); // فقط یک منو در آن واحد
    pop.hidden = false;
    btn.classList.add('is-open');
    btn.setAttribute('aria-expanded', 'true');
    const r = btn.getBoundingClientRect();
    const w = pop.offsetWidth;
    const h = pop.offsetHeight;
    let top = r.bottom + 6;
    if (top + h > window.innerHeight - 8) top = Math.max(8, r.top - h - 6);
    pop.style.top = `${top}px`;
    let left = r.left;
    if (left + w > window.innerWidth - 8) left = window.innerWidth - w - 8;
    if (left < 8) left = 8;
    pop.style.left = `${left}px`;
    activeRowMenuClose = close;
    setTimeout(() => {
      document.addEventListener('click', onDoc, true);
      document.addEventListener('keydown', onKey, true);
      document.addEventListener('scroll', onScroll, true);
    }, 0);
  }
  function onDoc(e) { if (!root.contains(e.target)) close(); }
  function onKey(e) { if (e.key === 'Escape') close(); }
  function onScroll() { close(); } // با اسکرول مختصر منوی fixed از دکمه جدا می‌شود — بستن تمیزتر است

  items.forEach((it, idx) => {
    if (it.sep) return;
    pop.children[idx].addEventListener('click', () => { close(); it.onclick?.(); });
  });
  btn.addEventListener('click', () => (pop.hidden ? open() : close()));
  return root;
}

export function loadingState(text = 'در حال بارگذاری…') {
  return el('div', { class: 'state-block' }, el('div', { class: 'spinner' }), el('p', { style: { marginTop: '10px' } }, text));
}

export function skeletonState(kind = 'table', rows = 5) {
  const n = Math.max(1, Math.min(12, rows));
  if (kind === 'cards') {
    return el('div', { class: 'skel-state' },
      el('div', { class: 'skel-state__cards' },
        ...Array.from({ length: n }, () =>
          el('div', { class: 'skel-card' },
            el('div', { class: 'skel skel--chip' }),
            el('div', { class: 'skel skel--line--lg', style: { width: '62%' } }),
            el('div', { class: 'skel skel--line', style: { width: '40%' } })
          )
        )
      )
    );
  }
  if (kind === 'list') {
    return el('div', { class: 'skel-state' },
      el('div', { class: 'skel-state__head' },
        el('div', { class: 'skel skel--title', style: { width: '30%' } })
      ),
      el('div', { style: { padding: 'var(--sp-3) var(--sp-5)', display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' } },
        ...Array.from({ length: n }, (_, i) =>
          el('div', { class: 'skel skel--line', style: { width: `${88 - (i % 4) * 14}%` } })
        )
      )
    );
  }
  return el('div', { class: 'skel-state' },
    el('div', { class: 'skel-state__head' },
      el('div', { class: 'skel skel--title' }),
      el('div', { class: 'skel skel--chip', style: { marginInlineStart: 'auto' } })
    ),
    ...Array.from({ length: n }, (_, i) =>
      el('div', { class: 'skel-row' },
        el('div', { class: 'skel skel-row__avatar' }),
        el('div', { class: 'skel-row__lines' },
          el('div', { class: 'skel skel--line--lg', style: { width: `${72 - (i % 3) * 10}%` } }),
          el('div', { class: 'skel skel--line', style: { width: '46%' } })
        ),
        el('div', { class: 'skel skel--chip skel-row__meta' })
      )
    )
  );
}

export function errorState(err, onRetry) {
  return el(
    'div',
    { class: 'state-block' },
    icon('alert', 30),
    el('p', { style: { margin: '10px 0' } }, err?.message || 'خطای غیرمنتظره'),
    onRetry ? el('button', { class: 'btn btn--ghost btn--sm', onclick: onRetry }, icon('refresh', 16), 'تلاش مجدد') : null
  );
}

const BADGE_TONES = {
  draft: 'warning',
  scheduled: 'primary',
  cancelled: 'neutral',
  pending: 'warning',
  present: 'success',
  absent: 'error',
  checked_in: 'accent',
  delayed: 'warning',
  in_session: 'primary',
  completed: 'success',
  no_show: 'error',
  active: 'success',
  inactive: 'neutral',
  manager: 'accent',
  therapist: 'primary',
  secretary: 'neutral',
  school: 'primary',
  kindergarten: 'accent',
  male: 'primary',
  female: 'accent',
  sent: 'success',
  failed: 'error',
  linked: 'success',
  revoked: 'error',
  draft: 'warning',
  final: 'success',
  open: 'warning',
  in_progress: 'primary',
  done: 'success',
  corrected: 'accent',
  assigned: 'warning'
};

const BADGE_LABELS = {
  draft: 'پیش‌نویس',
  scheduled: 'برنامه‌ریزی‌شده',
  cancelled: 'لغوشده',
  pending: 'در انتظار',
  present: 'حاضر',
  absent: 'غایب',
  checked_in: 'آمد',
  delayed: 'تأخیر',
  in_session: 'در جلسه',
  completed: 'انجام شد',
  no_show: 'نیامد',
  active: 'فعال',
  inactive: 'غیرفعال',
  manager: 'مدیر',
  therapist: 'درمانگر',
  secretary: 'منشی',
  supervisor: 'ناظر اداره',
  school: 'مدرسه',
  kindergarten: 'مهدکودک',
  male: 'پسر',
  female: 'دختر',
  mixed: 'مختلط',
  sent: 'ارسال‌شده',
  failed: 'ناموفق',
  linked: 'متصل',
  revoked: 'لغوشده',
  draft: 'پیش‌نویس',
  final: 'نهایی',
  open: 'باز',
  in_progress: 'در جریان',
  done: 'تکمیل شد',
  corrected: 'تصحیح‌شده',
  assigned: 'در انتظار انجام'
};

export function statusBadge(value) {
  const tone = BADGE_TONES[value] ?? 'neutral';
  const label = BADGE_LABELS[value] ?? value;
  return el('span', { class: `badge badge--${tone}` }, label);
}

export function callBadge(phone, title) {
  return el('a', {
    class: 'call-badge',
    href: `tel:${phone}`,
    title,
    'aria-label': title,
    onclick: (e) => e.stopPropagation()
  }, icon('phone', 12));
}

export function phoneCell(phone, title) {
  return el('span', { class: 'cell-phone' },
    el('span', { dir: 'ltr' }, fa(phone)),
    callBadge(phone, title));
}

// — m170: بلوک تاشوی «پشتوانهٔ علمی و نحوهٔ استفاده» — عمومی‌شدهٔ rehabFxScienceNote؛ داده از TOOL_GUIDES
export function scienceNote(guide) {
  if (!guide || !Array.isArray(guide.items) || guide.items.length === 0) return null;
  return el('details', { class: 'science-guide' },
    el('summary', {}, icon('compass', 13), guide.title ?? 'پشتوانهٔ علمی و نحوهٔ استفاده'),
    el('div', { class: 'rehab-fx-guide__body' },
      ...guide.items.map((t) => el('div', { class: 'cell-sub' }, t))));
}
