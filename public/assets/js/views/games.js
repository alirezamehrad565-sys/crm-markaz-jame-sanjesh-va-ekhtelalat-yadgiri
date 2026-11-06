import { api } from '../api.js';
import { fa } from '../format.js';
import { el, icon, toast, toastError, lockBtn, skeletonState, errorState } from '../ui.js';

// ─── بازی‌ها (۱.۲۵.۲۰) — نخستین گرهٔ UI حلقهٔ درمانگر بازی‌ها (U3 ممیزی فاز ۰) ───
// فعلاً فقط: فهرست بسته‌های بازی + «پیش‌نمایش درمانگر» (توکن کوتاه‌عمر، صفحهٔ
// جدا با همان موتور کودک — هیچ داده‌ای ثبت نمی‌شود). تجویز/مأموریت/گزارش =
// مایلستون حلقهٔ درمان؛ این نما زمینِ آن است.

const MODE_LABEL = { training: 'تمرین', assessment: 'ارزیابی' };
const STATUS_LABEL = {
  draft: 'پیش‌نویس',
  review: 'در بازبینی',
  published: 'منتشر شده',
  retired: 'بازنشسته'
};
const STATUS_CLASS = {
  draft: 'badge--neutral',
  review: 'badge--warning',
  published: 'badge--success',
  retired: 'badge--neutral'
};

function pkgCard(pkg) {
  const published = pkg.status === 'published';
  return el('div', { class: 'card', 'data-pkg': pkg.id },
    el('div', { class: 'card-body', style: 'display:flex;gap:14px;align-items:center;flex-wrap:wrap;' },
      el('span', { class: 'ico', 'aria-hidden': 'true' }, icon('gamepad', 20)),
      el('div', { style: 'flex:1;min-width:180px;' },
        el('div', { style: 'font-weight:700;' }, pkg.titleFa || pkg.id),
        el('div', { class: 'muted', style: 'font-size:12px;margin-top:2px;' },
          `${fa(pkg.id)} · نسخهٔ ${fa(pkg.version)}`,
          pkg.body?.mode ? ` · حالت ${MODE_LABEL[pkg.body.mode] ?? fa(pkg.body.mode)}` : '')
      ),
      el('span', { class: `badge ${STATUS_CLASS[pkg.status] ?? 'badge--neutral'}` }, STATUS_LABEL[pkg.status] ?? fa(pkg.status)),
      published
        ? el('button', {
            class: 'btn btn--primary btn--sm', type: 'button',
            title: 'اجرای آزمایشی بازی در تب جدید — بدون ثبت داده (۳۰ دقیقه اعتبار)',
            'aria-label': `پیش‌نمایش ${pkg.titleFa || pkg.id}`,
            onclick: (e) => lockBtn(e.currentTarget, () => openPreview(pkg))
          }, icon('eye', 14), 'پیش‌نمایش')
        : el('span', { class: 'muted', style: 'font-size:12px;' }, 'پیش‌نمایش فقط برای بستهٔ منتشرشده')
    )
  );
}

async function openPreview(pkg) {
  let data;
  try {
    data = (await api.post('/api/games/preview', { package_id: pkg.id, version: pkg.version })).data;
  } catch (err) {
    toastError(err);
    return;
  }
  const win = window.open(data.url, '_blank', 'noopener');
  if (!win) {
    toast('مرورگر تب جدید را بست — نشانی پیش‌نمایش در اعلان بعدی است؛ آن را باز کنید.');
  }
  toast('پیش‌نمایش باز شد — هیچ داده‌ای ثبت نمی‌شود و ۳۰ دقیقه اعتبار دارد.', 'success');
}

export async function renderGames(container) {
  container.replaceChildren(skeletonState('list', 4));

  let packages = [];
  try {
    packages = (await api.get('/api/games/packages')).data ?? [];
  } catch (err) {
    container.replaceChildren(errorState(err, () => renderGames(container)));
    return;
  }

  const wrap = el('div', {},
    el('h3', {}, icon('gamepad', 18), ' بازی‌ها'),
    el('p', { class: 'hint-text' },
      'بسته‌های بازی درمانی این مرکز. «پیش‌نمایش» همان بازی را با موتور کودک در تب جدید اجرا می‌کند — فقط برای آشنایی شما؛ هیچ نتیجه‌ای ثبت یا گزارش نمی‌شود.',
      ' ', 'تجویز به کودک و گزارش جلسه‌ها در مرحلهٔ بعدی این بخش اضافه می‌شود.')
  );

  if (!packages.length) {
    wrap.appendChild(el('div', { class: 'card' },
      el('div', { class: 'card-body muted' },
        'هنوز بسته‌ای ساخته نشده است — بسته‌های بازی از مسیر API رجیستری ثبت و منتشر می‌شوند.')));
  } else {
    const publishedFirst = [...packages].sort((a, b) =>
      (a.status === 'published' ? 0 : 1) - (b.status === 'published' ? 0 : 1));
    for (const p of publishedFirst) wrap.appendChild(pkgCard(p));
  }

  container.replaceChildren(wrap);
}
