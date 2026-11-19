/* ۱.۲۵.۸۱ — صفحهٔ «پیش‌نمایش از نگاه خانواده» برای فرم‌ساز (خواست کارفرما):
   همکار طراح با یک کلیک باید ببیند خانواده دقیقاً چه صفحه‌ای می‌بیند، فرم را تا آخر پر کند و
   «چه جوابی می‌دهد» — یعنی همان تحلیلی که پس از ارسال واقعی خانواده در پرونده ثبت می‌شود.
   قراردادهای سختِ این صفحه:
   ① رندر = همان زبان بصری renderFillFormPage (بخش‌بندی از familySectionsOf مشترک).
   ② هیچ نوشتنی: این صفحه فقط HTML رندرشده است؛ «تحلیل» با POST /preview/analyze روی
      توابع خالص (analyzeChecklist/buildSummary) انجام می‌شود — بدون db، بدون audit، بدون sync.
   ③ بنر زرد + پانوشت صریح: «هیچ پاسخی ذخیره نمی‌شود» — تا همکار و خانواده اشتباه نکنند.
   ④ پیام‌کوتاه واقعی این صفحه نیست — پر کردن پیش‌نمایش «پاسخ داده‌شده» تولید نمی‌کند. */
import type { CaseEventTypeInput, CaseEventSubscale } from './types';
import { familySectionsOf } from './public-form';

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

export function renderPreviewPage(def: CaseEventTypeInput, token: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const sections = familySectionsOf(def.fields, (def.subscales ?? null) as CaseEventSubscale[] | null);
  let counter = 0;
  const total = sections.reduce((sum, s) => sum + s.items.filter((f) => f.kind !== 'longtext').length, 0);
  const rendered = sections.map((sec) => {
    const items = sec.items.map((f) => {
      counter += 1;
      if (f.kind === 'longtext') {
        counter -= 1;
        return `<div class="item item--free"><div class="q">${esc(f.label)}</div>${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<textarea class="free" name="${esc(f.key)}" maxlength="1500" rows="3" placeholder="اختیاری — اگر چیزی برای گفتن دارید بنویسید"></textarea></div>`;
      }
      const opts: string[] = [];
      if (f.scoredOptions && f.scoredOptions.length > 0) {
        for (const o of f.scoredOptions) {
          opts.push(`<label class="opt opt--wide"><input type="radio" name="${esc(f.key)}" value="${opts.length}" required /><span>${esc(o.label)}</span></label>`);
        }
      } else {
        const max = Math.min(Math.max(f.scaleMax ?? 3, 1), 10);
        const labels = f.scaleLabels && f.scaleLabels.length === max + 1 ? f.scaleLabels : null;
        for (let v = 0; v <= max; v++) {
          const lbl = labels ? labels[v] : (['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۱۰'][v] ?? faNum(v));
          opts.push(`<label class="opt"><input type="radio" name="${esc(f.key)}" value="${v}" required /><span>${esc(lbl)}</span></label>`);
        }
      }
      return `<div class="item" data-key="${esc(f.key)}"><div class="q">${faNum(counter)}. ${esc(f.label)}</div>${f.hint ? `<div class="hint">${esc(f.hint)}</div>` : ''}<div class="opts">${opts.join('')}</div></div>`;
    }).join('');
    const head = sec.title ? `<div class="subscale"><span class="subscale__dot"></span>${esc(sec.title)}</div>` : '';
    return `${head}<div class="card">${items}</div>`;
  }).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>پیش‌نمایش — ${esc(def.title)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F7F3EA; color: #12384f;
         font-family: Tahoma, "Segoe UI", sans-serif; line-height: 1.8; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 64px; }
  .banner { position: sticky; top: 0; z-index: 9; background: #FFF3CD; border: 1px solid #E8D48B;
            color: #6B5416; border-radius: 12px; padding: 10px 14px; margin-bottom: 14px;
            font-size: 13px; font-weight: 700; }
  .banner span { font-weight: 400; display: block; font-size: 12px; }
  .head { background: #12384f; color: #fff; border-radius: 16px; padding: 20px 22px; margin-bottom: 18px; }
  .head h1 { margin: 0 0 6px; font-size: 18px; }
  .head p { margin: 0; font-size: 13px; opacity: .85; }
  .head .desc { margin-top: 10px; font-size: 13px; opacity: .95; line-height: 1.9;
                background: rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px; }
  .progress { background: #fff; border: 1px solid #E5DCCB; border-radius: 12px;
              padding: 8px 12px; margin-bottom: 14px; font-size: 12px; color: #1c5d80; }
  .progress__bar { height: 5px; background: #EFE8DC; border-radius: 999px; overflow: hidden; margin-top: 6px; }
  .progress__fill { height: 100%; width: 0%; background: #229ED9; border-radius: 999px; transition: width .2s; }
  .subscale { display: flex; align-items: center; gap: 7px; font-size: 13px; font-weight: 700;
              color: #1c5d80; margin: 16px 4px 8px; }
  .subscale__dot { width: 9px; height: 9px; border-radius: 50%; background: #229ED9; display: inline-block; }
  .card { background: #fff; border-radius: 16px; padding: 18px 20px; margin-bottom: 14px;
          box-shadow: 0 1px 3px rgba(18,56,79,.08); }
  .item { padding: 12px 0; border-bottom: 1px solid #EFE8DC; }
  .item:last-child { border-bottom: 0; }
  .item.is-missing .q { color: #A12622; }
  .q { font-weight: 700; font-size: 14px; margin-bottom: 8px; }
  .hint { font-size: 12px; color: #8A8377; margin: -5px 0 8px; line-height: 1.9; }
  .opts { display: flex; flex-wrap: wrap; gap: 8px; }
  .opt { display: inline-flex; align-items: center; gap: 5px; background: #F7F3EA;
         border: 1px solid #E5DCCB; border-radius: 10px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
  .opt--wide { width: 100%; align-items: flex-start; }
  .opt:has(input:checked) { background: #D9EDF7; border-color: #229ED9; }
  .item--free .q { font-size: 13.5px; }
  textarea.free { width: 100%; border: 1px solid #E5DCCB; border-radius: 10px; padding: 10px 12px;
                  font-family: inherit; font-size: 13.5px; line-height: 1.9; resize: vertical; background: #FDFCF9; }
  textarea.free:focus { outline: 2px solid #229ED9; outline-offset: -1px; }
  .notice { text-align: center; font-size: 11.5px; color: #8A8377; margin: -4px 0 12px; }
  .btn { display: block; width: 100%; border: 0; background: #229ED9; color: #fff;
         border-radius: 12px; padding: 14px; font-size: 16px; font-weight: 700; cursor: pointer;
         font-family: inherit; margin-top: 6px; }
  .btn:disabled { opacity: .6; }
  .btn--ghost { background: #fff; color: #1c5d80; border: 1px solid #E5DCCB; margin-top: 10px; }
  .msg { display: none; border-radius: 12px; padding: 16px; margin-top: 12px; font-size: 14px; }
  .msg.err { display: block; background: #FDE8E8; color: #A12622; }
  .result { display: none; }
  .result.show { display: block; }
  .result__card { background: #fff; border-radius: 16px; padding: 20px; margin-bottom: 14px;
                  box-shadow: 0 1px 3px rgba(18,56,79,.08); }
  .result__score { font-size: 22px; font-weight: 700; color: #1c5d80; margin-bottom: 8px; }
  .band { display: inline-block; border-radius: 999px; padding: 5px 14px; font-size: 13.5px; font-weight: 700; }
  .band.ok { background: #E4F5E9; color: #1D6B39; }
  .band.warn { background: #FFF7E0; color: #6B5416; }
  .band.danger { background: #FDE8E8; color: #A12622; }
  .band.none { background: #EFE8DC; color: #5A5347; }
  .sub-row { display: flex; align-items: center; gap: 8px; padding: 8px 0; border-bottom: 1px solid #EFE8DC; font-size: 13.5px; }
  .sub-row:last-child { border-bottom: 0; }
  .sub-row .name { font-weight: 700; }
  .interp { white-space: pre-line; background: #FDFCF9; border: 1px solid #E5DCCB; border-radius: 12px;
            padding: 12px 14px; font-size: 13.5px; line-height: 2; }
  .raw { margin-top: 10px; }
  .raw details summary { cursor: pointer; font-size: 12.5px; color: #1c5d80; }
  .raw .pair { display: flex; gap: 8px; font-size: 13px; padding: 4px 0; border-bottom: 1px dashed #EFE8DC; }
  .raw .pair:last-child { border-bottom: 0; }
  .raw .pair b { color: #5A5347; flex-shrink: 0; }
  .foot { text-align: center; font-size: 12px; color: #8A8377; margin-top: 18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="banner">⚠ این فقط پیش‌نمایش آزمایشی است — هیچ پاسخی جایی ذخیره نمی‌شود
    <span>پر کردن این صفحه «پاسخ واقعی» تولید نمی‌کند و در پروندهٔ هیچ دانش‌آموزی ثبت نمی‌شود. برای پاسخ واقعی، خانواده پیام‌کوتاه رسمی را پر می‌کند.</span>
  </div>
  <div class="head">
    <h1>${esc(def.title)}</h1>
    <p>پرسش‌نامهٔ فرزند شما — نمای پیش‌نمایش فرم‌ساز</p>
    ${def.description ? `<div class="desc">${esc(def.description)}</div>` : ''}
  </div>
  <div class="progress" id="prog">
    <span id="progText">پاسخ داده‌شده: ۰ از ${faNum(total)}</span>
    <div class="progress__bar"><div class="progress__fill" id="progFill"></div></div>
  </div>
  <div class="notice">این فرم تشخیص نیست؛ فقط به تصمیم‌گیری درمانگر کمک می‌کند.</div>
  <form id="f" novalidate>
    ${rendered}
    <button class="btn" type="submit" id="submitBtn">دیدن نتیجهٔ تحلیل (پیش‌نمایش)</button>
    <div class="msg" id="msg"></div>
  </form>
  <div class="result" id="result">
    <div class="result__card">
      <div style="font-size:14px;font-weight:700;margin-bottom:10px">نتیجهٔ تحلیل — همان که پس از ارسال واقعی خانواده در پرونده ثبت می‌شود</div>
      <div id="resultBody"></div>
    </div>
    <button class="btn btn--ghost" type="button" id="againBtn">پر کردن دوباره</button>
    <button class="btn btn--ghost" type="button" onclick="window.close()">بستن پیش‌نمایش</button>
  </div>
  <div class="foot">پیش‌نمایش فرم‌ساز «فرم‌ها و پرسش‌نامه‌ها» — پاسخ‌های این صفحه هیچ‌جا ذخیره نمی‌شوند.</div>
</div>
<script>
(function () {
  var TOKEN = ${JSON.stringify(token)};
  var DEFINITION = ${JSON.stringify(JSON.stringify(def))};
  var f = document.getElementById('f');
  var msg = document.getElementById('msg');
  var progText = document.getElementById('progText');
  var progFill = document.getElementById('progFill');
  var TOTAL = ${total};
  var FA = '۰۱۲۳۴۵۶۷۸۹';
  function fa(n) { return String(n).replace(/[0-9]/g, function (d) { return FA[Number(d)]; }); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }

  function updateProgress() {
    var answered = {};
    f.querySelectorAll('.item input[type=radio]:checked').forEach(function (r) { answered[r.name] = true; });
    var n = Object.keys(answered).length;
    progText.textContent = 'پاسخ داده‌شده: ' + fa(n) + ' از ' + fa(TOTAL);
    progFill.style.width = (TOTAL ? Math.round(n * 100 / TOTAL) : 0) + '%';
  }
  f.addEventListener('change', updateProgress);

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = new FormData(f);
    var answers = {};
    document.querySelectorAll('#f .item input[type=radio]').forEach(function (radio) {
      if (data.get(radio.name)) answers[radio.name] = Number(data.get(radio.name));
    });
    document.querySelectorAll('#f textarea.free').forEach(function (ta) {
      var v = (ta.value || '').trim();
      if (v) answers[ta.name] = v;
    });
    var missing = 0;
    document.querySelectorAll('#f .item').forEach(function (item) {
      if (item.classList.contains('item--free')) return;
      var has = item.querySelector('input[type=radio]:checked');
      item.classList.toggle('is-missing', !has);
      if (!has) missing += 1;
    });
    if (missing > 0) {
      msg.className = 'msg err';
      msg.textContent = 'به ' + fa(missing) + ' سؤال پاسخ نداده‌اید — سؤال‌های جامانده با رنگ سرخ مشخص شده‌اند.';
      var first = document.querySelector('#f .item.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var btn = document.getElementById('submitBtn');
    btn.disabled = true;
    fetch('/public/case-events/preview/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, definition: JSON.parse(DEFINITION), answers: answers })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (!res.ok) {
          msg.className = 'msg err';
          msg.textContent = (res.j && res.j.error && res.j.error.message) || 'تحلیل انجام نشد.';
          btn.disabled = false;
          return;
        }
        showResult(res.j);
      })
      .catch(function () { msg.className = 'msg err'; msg.textContent = 'خطای شبکه — دوباره تلاش کنید.'; btn.disabled = false; });
  });

  function bandChip(band, color) {
    var cls = color === 'ok' || color === 'warn' || color === 'danger' ? color : 'none';
    return band ? '<span class="band ' + cls + '">' + esc(band) + '</span>' : '';
  }

  function showResult(j) {
    var parts = [];
    var a = j.analysis;
    if (a) {
      parts.push('<div class="result__score">نمرهٔ کل: ' + fa(a.score) + ' از ' + fa(a.maxScore ?? (a.total * 3)) + '</div>');
      parts.push('<div style="margin-bottom:12px">' + (bandChip(a.band, null) || '<span class="band none">بدون باند تحلیل</span>') + '</div>');
      if (a.subscaleScores && a.subscaleScores.length > 0) {
        parts.push('<div style="margin-bottom:6px;font-size:13px;font-weight:700">زیرمقیاس‌ها</div>');
        a.subscaleScores.forEach(function (s) {
          parts.push('<div class="sub-row"><span class="name">' + esc(s.name) + '</span><span>' + fa(s.score) + ' از ' + fa(s.max) + '</span>' + bandChip(s.band, s.color) + '</div>');
        });
      }
      if (a.flags && a.flags.length > 0) {
        parts.push('<div style="margin:10px 0 6px;font-size:13px;font-weight:700;color:#A12622">آیتم بحرانی (' + fa(a.flags.length) + ' مورد)</div>');
        a.flags.forEach(function (fl) {
          parts.push('<div style="font-size:13px;padding:3px 0">• ' + esc(fl.label) + '</div>');
        });
      }
      parts.push('<div style="margin-top:12px" class="interp">' + esc(a.interpretation) + '</div>');
      parts.push('<div style="margin-top:8px;font-size:12.5px;color:#5A5347">جمع‌بندی ثبت‌شده در پرونده: ' + esc(j.summary ?? '') + '</div>');
    } else {
      parts.push('<div class="band none">این قالب خانواده‌پرکن نیست — نمرهٔ خودکار فقط برای چک‌لیست خانواده ساخته می‌شود.</div>');
    }
    var pairs = [];
    var payload = j.payload ?? {};
    Object.keys(payload).forEach(function (k) {
      pairs.push('<div class="pair"><b>' + esc(payload[k].label) + ':</b><span>' + esc(payload[k].value) + '</span></div>');
    });
    parts.push('<div class="raw"><details><summary>دیتای خام فرم (' + fa(pairs.length) + ' فیلد)</summary>' + pairs.join('') + '</details></div>');
    document.getElementById('resultBody').innerHTML = parts.join('');
    f.style.display = 'none';
    document.getElementById('prog').style.display = 'none';
    var r = document.getElementById('result');
    r.classList.add('show');
    r.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  document.getElementById('againBtn').addEventListener('click', function () {
    fetch('/public/case-events/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: TOKEN, definition: JSON.parse(DEFINITION) })
    }).then(function (r) { return r.text(); })
      .then(function (html) { document.open(); document.write(html); document.close(); });
  });

  updateProgress();
})();
</script>
</body>
</html>`;
}

/** صفحهٔ خطای پیش‌نمایش — وقتی تعریف در حال طراحی هنوز کامل نیست (مثلاً آیتم بدون برچسب) */
export function renderPreviewErrorPage(title: string, message: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  return `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>پیش‌نمایش در دسترس نیست</title>
<style>body{margin:0;background:#F7F3EA;color:#12384f;font-family:Tahoma,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
.box{background:#fff;border-radius:16px;padding:28px;max-width:440px;text-align:center;box-shadow:0 1px 3px rgba(18,56,79,.08);margin:16px}</style></head>
<body><div class="box"><h1 style="font-size:17px">${esc(title)}</h1><p style="font-size:13.5px;line-height:2">${esc(message)}</p>
<p style="font-size:12px;color:#8A8377">در پنجرهٔ فرم‌ساز «ذخیره» بزنید تا خطاها دقیق نشان داده شود، سپس دوباره پیش‌نمایش بگیرید.</p></div></body></html>`;
}
