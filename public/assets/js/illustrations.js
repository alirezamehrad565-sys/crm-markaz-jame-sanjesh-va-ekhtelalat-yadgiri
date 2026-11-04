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

/* ─── ۱.۲۵.۰۵ — نگاره‌های حالت خالی نماهای پربازدید (هم‌زبان با سه وکتور بالا:
   خط وزن ۲، گوشهٔ گرد، رنگ فقط از توکن‌ها — جای قالب عمومی «چیزی اینجا نیست») ─── */

export const illoStudents = () => svg(`
  <circle cx="56" cy="46" r="13" fill="var(--primary-soft)" stroke="var(--primary)"/>
  <path d="M38 88c0-11 8-19 18-19s18 8 18 19" fill="var(--surface-2)" stroke="var(--border)"/>
  <circle cx="102" cy="52" r="10" fill="var(--surface-2)" stroke="var(--border)"/>
  <path d="M88 88c0-9 6-16 14-16s14 7 14 16" fill="none" stroke="var(--border)"/>
  <path d="M128 40l2.2 5.3 5.3 2.2-5.3 2.2-2.2 5.3-2.2-5.3-5.3-2.2 5.3-2.2 2.2-5.3Z" fill="var(--accent-soft)" stroke="var(--accent)"/>
  <path d="M28 96h104" stroke="var(--border)" stroke-dasharray="2 6"/>`);

export const illoExercises = () => svg(`
  <rect x="46" y="28" width="68" height="64" rx="8" fill="var(--surface-2)" stroke="var(--border)"/>
  <rect x="56" y="20" width="68" height="64" rx="8" fill="var(--primary-soft)" stroke="var(--primary)"/>
  <path d="M66 38h34M66 50h48M66 62h40" stroke="var(--primary)" stroke-opacity=".55" stroke-linecap="round"/>
  <path d="M126 74h14M133 67v14" stroke="var(--accent)" stroke-linecap="round"/>
  <path d="M40 100h80" stroke="var(--border)" stroke-dasharray="2 6"/>`);

export const illoWaitlist = () => svg(`
  <circle cx="50" cy="46" r="12" fill="var(--surface-2)" stroke="var(--border)"/>
  <path d="M34 86c0-10 7-17 16-17s16 7 16 17" fill="none" stroke="var(--border)"/>
  <circle cx="92" cy="42" r="12" fill="var(--primary-soft)" stroke="var(--primary)"/>
  <path d="M76 84c0-10 7-17 16-17s16 7 16 17" fill="var(--surface-2)" stroke="var(--border)"/>
  <circle cx="126" cy="52" r="14" fill="var(--accent-soft)" stroke="var(--accent)"/>
  <path d="M126 45v8l5 4" stroke="var(--accent)" stroke-linecap="round"/>
  <path d="M28 100h104" stroke="var(--border)" stroke-dasharray="2 6"/>`);

export const illoScreening = () => svg(`
  <rect x="52" y="24" width="60" height="72" rx="8" fill="var(--surface-2)" stroke="var(--border)"/>
  <rect x="70" y="18" width="24" height="12" rx="4" fill="var(--primary-soft)" stroke="var(--primary)"/>
  <path d="M62 46l4 4 7-8" stroke="var(--success)" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M80 46h22" stroke="var(--border)" stroke-linecap="round"/>
  <path d="M62 64l4 4 7-8" stroke="var(--border)" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M80 64h22" stroke="var(--border)" stroke-linecap="round"/>
  <path d="M62 82l4 4 7-8" stroke="var(--accent)" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M80 82h14" stroke="var(--border)" stroke-linecap="round"/>`);
