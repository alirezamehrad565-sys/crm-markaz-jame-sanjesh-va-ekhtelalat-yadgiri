const CACHE = new Map();

function fnv1a(str) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function staffHue(staffId) {
  const key = String(staffId ?? '');
  if (!CACHE.has(key)) CACHE.set(key, (fnv1a(key) % 8) + 1);
  return CACHE.get(key);
}

export function hueClass(staffId) {
  return `hue-${staffHue(staffId)}`;
}

export function hueDot(staffId, size = 10) {
  const span = document.createElement('span');
  span.className = `staff-chip__dot ${hueClass(staffId)}`;
  span.style.width = `${size}px`;
  span.style.height = `${size}px`;
  span.setAttribute('aria-hidden', 'true');
  return span;
}
