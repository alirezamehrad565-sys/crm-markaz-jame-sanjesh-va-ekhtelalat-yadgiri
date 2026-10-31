function svg(inner, cls = 'illo') {
  const span = document.createElement('span');
  span.className = cls;
  span.setAttribute('aria-hidden', 'true');
  /* I10: وزن خط و گوشهٔ واحد با زبان آیکون اپ (قبلاً سه وزن مخلوط + گوشهٔ تیز miter) */
  span.innerHTML = `<svg viewBox="0 0 160 120" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg">${inner}</svg>`;
  return span;
}

export const illoNoAnnouncements = () => svg(`
  <path d="M80 30a20 20 0 0 1 20 20c0 15 6 19 6 19H54s6-4 6-19a20 20 0 0 1 20-20Z" fill="var(--surface-2)" stroke="var(--border)"/>
  <path d="M73 76a7 7 0 0 0 14 0" stroke="var(--border)" stroke-width="2" stroke-linecap="round"/>
  <path d="M104 36h8l-8 8h8" stroke="var(--text-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M118 26h6l-6 6h6" stroke="var(--surface-3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>`);

export const illoKnowledge = () => svg(`
  <path d="M80 42c-10-8-24-10-34-8v52c10-2 24 0 34 8V42Z" fill="var(--primary-soft)" stroke="var(--primary)"/>
  <path d="M80 42c10-8 24-10 34-8v52c-10-2-24 0-34 8" fill="var(--surface-2)" stroke="var(--border)"/>
  <path d="M80 42v52" stroke="var(--border)"/>
  <path d="M118 24l2.5 6 6 2.5-6 2.5-2.5 6-2.5-6-6-2.5 6-2.5 2.5-6Z" fill="var(--accent-soft)" stroke="var(--accent)"/>`);

export const illoHeroOrnament = () => svg(`
  <circle cx="190" cy="20" r="90" stroke="var(--primary-soft)" stroke-width="26"/>
  <circle cx="190" cy="20" r="46" stroke="color-mix(in srgb, var(--accent) 18%, transparent)" stroke-width="10"/>
  <circle cx="104" cy="120" r="5" fill="var(--accent-soft)" stroke="var(--accent)"/>
  <circle cx="150" cy="96" r="3.5" fill="var(--primary-soft)" stroke="var(--primary)"/>`, 'illo illo--hero');
