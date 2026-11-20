/* activities-page.ts — صفحهٔ عمومی «تمرین‌ها و کارت‌های آمادهٔ مرکز» (۱.۲۷.۳۸)
 *
 * خواست کارفرما: «لینک استفاده از تمرین‌ها و کارت‌های آمادهٔ مرکز» — یک نشانی قابل اشتراک
 * که خانواده/معلم ببیند مرکز چه محتوای آماده‌ای دارد و چطور استفاده کند.
 * فقط متادیتای امنِ منتشرشده (عنوان/توضیح/قالب/برچسب) از exercise-bank می‌آید —
 * بدون کلید فایل و بدون دادهٔ دانش‌آموز؛ فایل‌ها همان مسیر قبلی (اتصال بات) می‌آیند.
 * الگوی سرو: عین /public/referral (no-store + noindex + CSP)؛ بدون اسکریپت.
 */

export interface ActivitiesViewInput {
  clinicName: string;
  items: Array<{ id: string; title: string; description: string | null; format: string; tags: string[] }>;
}

const FORMAT_LABELS: Record<string, string> = {
  worksheet: 'کاربرگ',
  game: 'بازی',
  instruction: 'راهنما'
};

const FORMAT_ICONS: Record<string, string> = {
  worksheet: '📝',
  game: '🎲',
  instruction: '🧭'
};

export function renderActivitiesPage(input: ActivitiesViewInput): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const cards = input.items.map((it) =>
    `<div class="card"><div class="card-h"><span>${FORMAT_ICONS[it.format] ?? '📝'}</span><b>${esc(it.title)}</b>` +
    `<span class="fmt">${FORMAT_LABELS[it.format] ?? 'تمرین'}</span></div>` +
    (it.description ? `<p>${esc(it.description)}</p>` : '') +
    (it.tags.length ? `<div class="tags">${it.tags.slice(0, 4).map((t) => `<span>${esc(t)}</span>`).join('')}</div>` : '') +
    `</div>`
  ).join('\n');
  const count = input.items.length;
  return `<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>تمرین‌ها و کارت‌های آماده — ${esc(input.clinicName)}</title>
<!-- وزیرمتن از CDN (CSP فقط jsdelivr را اجازه می‌دهد) -->
<link rel="preconnect" href="https://cdn.jsdelivr.net" crossorigin>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css">
<style>
:root{--ink:#2a2118;--muted:#6f675c;--brand:#0e7490;--brand-soft:#f0f7f8;--line:#e8e2d6}
*{box-sizing:border-box}
body{margin:0;background:#f7f3ea;color:var(--ink);font-family:Vazirmatn,sans-serif;font-size:15.5px;line-height:2.1}
.wrap{max-width:720px;margin:0 auto;padding:22px 16px 48px}
header{text-align:center;padding:26px 0 18px}
h1{font-size:clamp(20px,5vw,26px);margin:0 0 10px;line-height:1.6}
.lead{color:var(--muted);font-size:14.5px;margin:0}
main{background:#fff;border:1px solid var(--line);border-radius:18px;padding:24px 20px}
h2{font-size:17px;margin:22px 0 10px;color:var(--brand)}
.card{border:1px solid var(--line);border-radius:14px;padding:14px 16px;margin-bottom:12px}
.card-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.card-h b{font-size:15px}
.card p{margin:6px 0 0;color:var(--muted);font-size:14px}
.fmt{margin-inline-start:auto;background:var(--brand-soft);color:var(--brand);border-radius:999px;
padding:2px 10px;font-size:12px;font-weight:700}
.tags{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
.tags span{background:#f7f3ea;border:1px solid var(--line);border-radius:999px;padding:1px 10px;font-size:12px;color:var(--muted)}
.how{background:var(--brand-soft);border-radius:14px;padding:14px 16px;margin-top:14px}
.how ul{margin:8px 0 0;padding-inline-start:20px}
.how li{margin-bottom:6px;font-size:14px}
.cta{display:block;text-align:center;background:var(--brand);color:#fff;border-radius:14px;padding:14px;
font-weight:800;text-decoration:none;margin-top:20px;font-size:15px}
.cta:active{opacity:.85}
footer{text-align:center;color:var(--muted);font-size:12.5px;margin-top:18px}
@media print{header,footer{padding:8px 0}main{border:none}a.cta{display:none}}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>🎲 تمرین‌ها و کارت‌های آمادهٔ مرکز</h1>
    <p class="lead">محتوای آمادهٔ تیم مرکز برای تمرین در خانه و کلاس — همه ساخته‌شده و بازبینی‌شده؛ ${count ? `${input.items.length.toLocaleString('fa-IR')} مورد در این فهرست` : 'در حال آماده‌سازی'}. فایل هر تمرین پس از طرح درمان یا اتصال بات، مستقیم برایتان ارسال می‌شود.</p>
  </header>
  <main>
    ${cards || '<p>فعلاً کارتی در فهرست عمومی منتشر نشده — به‌زودی محتواها اضافه می‌شوند.</p>'}
    <h2>چطور از این محتواها استفاده کنم؟</h2>
    <div class="how">
      <ul>
        <li><b>خانواده‌ها:</b> پس از جلسه و طرح درمان، فایل تمرین‌های باز فرزندتان در بات بخش «فایل‌های آموزشی» ارسال می‌شود.</li>
        <li><b>معلم‌های همکار:</b> با اتصال بات به سامانه، دکمهٔ «کارت‌های آماده» کل بانک را برچسب‌به‌برچسب با فایل‌ها می‌فرستد.</li>
        <li><b>مرجع تازه:</b> با فرم معرفی ثبت‌نام کنید تا مسیر تمرین مناسب شما ساخته شود.</li>
        <li><b>بازی‌های شناختی:</b> نسخهٔ بازی‌محور هر تمرین با لینک اختصاصی برای هر کودک ساخته می‌شود و در همان گفت‌وگوی بات می‌آید.</li>
      </ul>
    </div>
    <a class="cta" href="/public/referral">🧩 معرفی دانش‌آموز به مرکز — فرم کوتاه چند دقیقه‌ای</a>
  </main>
  <footer>${esc(input.clinicName)} · همهٔ خدمات مرکز رایگان است · این فهرست برای چاپ و اشتراک با اولیا مناسب است</footer>
</div>
</body>
</html>`;
}
