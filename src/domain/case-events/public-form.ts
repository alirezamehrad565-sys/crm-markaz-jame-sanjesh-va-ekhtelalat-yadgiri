/**
 * ماژول رویدادساز (فرم/پرسش‌نامه/چک‌لیست) — فرم عمومی پاسخ خانواده/معلم
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// -b — صفحهٔ مستقل وب‌فرم چک‌لیست خانواده/معلم (بدون ورود — با توکن یک‌بارمصرف)
// تصمیم ۳ طراحی: چک‌لیست بلندتر از ۸ آیتم با لینک امن پر می‌شود.
// بازطراحی روان‌سنجی: سربرگ زیرمقیاس‌ها + گزینه‌های نمره‌دار (نمره از گیرنده پنهان است —
// اصل سنجش استاندارد: فقط برچسب گزینه دیده می‌شود) + صفحهٔ سازگار با RTL و موبایل
// نسخهٔ ۲: سربرگ بر اساس گیرنده (خانواده/معلم)، معرفی روایی فرم، لنگرهای کلامی مطابق
// ابزار مرجع (scaleLabels)، نوار پیشرفت چسبان و مشخص‌کردن سؤال‌های بی‌پاسخ

export interface FillFormItem {
  key: string;
  label: string;
  scaleMax?: number;
  /** — گزینه‌های نمره‌دار (فقط برچسب به گیرنده نمایش داده می‌شود؛ value = اندیس) */
  scoredOptions?: { label: string }[];
  /** — لنگرهای کلامی نمرهٔ ۰..scaleMax مطابق ابزار مرجع */
  scaleLabels?: string[];
}

/** — بخش زیرمقیاس: آیتم‌های پیوستهٔ یک زیرمقیاس زیر یک سربرگ می‌نشینند */
export interface FillFormSection {
  title: string | null;
  items: FillFormItem[];
}

export interface FillFormModel {
  typeTitle: string;
  studentName: string;
  sections: FillFormSection[];
  /** — gیرنده: خانواده یا معلم — سربرگ و لحن بر همین اساس */
  audience?: 'family' | 'teacher' | 'both' | null;
  /** — معرفی روایی فرم (یک تا دو جملهٔ ساده) */
  description?: string | null;
}

/** یک فیلد زمینهٔ پکیج (غیرنمره‌دار — select/text/longtext) */
export interface PackageContextField {
  key: string;
  label: string;
  type: 'select' | 'text' | 'longtext';
  options?: string[];
  required?: boolean;
}

/** یک ابزار داخل پکیج — سربرگ اختصاصی + بخش‌های زیرمقیاسی همان ابزار */
export interface PackageToolBlock {
  toolKey: string;
  /** عنوان با شمارهٔ بخش — «بخش ۲ از ۵ — …» */
  toolTitle: string;
  /** معرفی روایی همان ابزار (یک تا دو جملهٔ ساده) */
  toolIntro: string | null;
  /** تعداد آیتم نمره‌دار ابزار (نمایش «N پرسش») */
  itemCount: number;
  sections: FillFormSection[];
}

export interface PackageFormModel {
  packageTitle: string;
  studentName: string;
  description?: string | null;
  /** بلوک زمینهٔ کوتاه (≤۸ فیلد) — ابتدای فرم */
  context: {
    title: string;
    fields: PackageContextField[];
  };
  /** ابزارهای پکیج به‌ترتیب قرارداد */
  tools: PackageToolBlock[];
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

/** — لنگر عمومی قدیمی (برای فرم‌های بدون لنگر اختصاصی) */
const SCALE_LABELS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۱۰'];

export function renderFillFormPage(model: FillFormModel, token: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let counter = 0;
  const total = model.sections.reduce((sum, s) => sum + s.items.length, 0);
  const isTeacherForm = model.audience === 'teacher';
  const headTitle = isTeacherForm ? 'پرسش‌نامهٔ دانش‌آموز شما — فرم معلم' : 'پرسش‌نامهٔ فرزند شما';
  const headSub = model.studentName
    ? (isTeacherForm ? `دربارهٔ دانش‌آموز: ${model.studentName}` : `دربارهٔ ${model.studentName}`)
    : '';
  const sections = model.sections.map((sec) => {
    const items = sec.items.map((f) => {
      counter += 1;
      let opts: string[] = [];
      if (f.scoredOptions && f.scoredOptions.length > 0) {
        // گزینه‌ای نمره‌دار — value = اندیس گزینه؛ نمره هرگز نمایش داده نمی‌شود
        opts = f.scoredOptions.map((o, idx) =>
          `<label class="opt opt--wide"><input type="radio" name="${esc(f.key)}" value="${idx}" required />
           <span>${esc(o.label)}</span></label>`
        );
      } else {
        const max = Math.min(Math.max(f.scaleMax ?? 3, 1), 10);
        const labels = f.scaleLabels && f.scaleLabels.length === max + 1
          ? f.scaleLabels
          : null;
        for (let v = 0; v <= max; v++) {
          const lbl = labels ? labels[v] : (SCALE_LABELS[v] ?? faNum(v));
          opts.push(
            `<label class="opt"><input type="radio" name="${esc(f.key)}" value="${v}" required />
             <span>${esc(lbl)}</span></label>`
          );
        }
      }
      return `<div class="item" data-key="${esc(f.key)}"><div class="q">${faNum(counter)}. ${esc(f.label)}</div><div class="opts">${opts.join('')}</div></div>`;
    }).join('');
    const head = sec.title
      ? `<div class="subscale"><span class="subscale__dot"></span>${esc(sec.title)}</div>`
      : '';
    return `${head}<div class="card">${items}</div>`;
  }).join('');

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(model.typeTitle)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #F7F3EA; color: #12384f;
         font-family: Tahoma, "Segoe UI", sans-serif; line-height: 1.8; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 24px 16px 64px; }
  .head { background: #12384f; color: #fff; border-radius: 16px; padding: 20px 22px; margin-bottom: 18px; }
  .head h1 { margin: 0 0 6px; font-size: 18px; }
  .head p { margin: 0; font-size: 13px; opacity: .85; }
  .head .desc { margin-top: 10px; font-size: 13px; opacity: .95; line-height: 1.9;
                background: rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px; }
  .progress { position: sticky; top: 8px; z-index: 5; background: #fff; border: 1px solid #E5DCCB;
              border-radius: 12px; padding: 8px 12px; margin-bottom: 14px; font-size: 12px; color: #1c5d80;
              box-shadow: 0 1px 3px rgba(18,56,79,.10); }
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
  .opts { display: flex; flex-wrap: wrap; gap: 8px; }
  .opt { display: inline-flex; align-items: center; gap: 5px; background: #F7F3EA;
         border: 1px solid #E5DCCB; border-radius: 10px; padding: 6px 10px; font-size: 13px; cursor: pointer; }
  .opt--wide { width: 100%; align-items: flex-start; }
  .opt:has(input:checked) { background: #D9EDF7; border-color: #229ED9; }
  .btn { display: block; width: 100%; border: 0; background: #229ED9; color: #fff;
         border-radius: 12px; padding: 14px; font-size: 16px; font-weight: 700; cursor: pointer;
         font-family: inherit; margin-top: 6px; }
  .btn:disabled { opacity: .6; }
  .msg { display: none; border-radius: 12px; padding: 16px; margin-top: 12px; font-size: 14px; }
  .msg.ok { display: block; background: #E4F5E9; color: #1D6B39; }
  .msg.err { display: block; background: #FDE8E8; color: #A12622; }
  .foot { text-align: center; font-size: 12px; color: #8A8377; margin-top: 18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>${esc(model.typeTitle)}</h1>
    ${headSub ? `<p>${esc(headSub)}</p>` : ''}
    ${model.description ? `<div class="desc">${esc(model.description)}</div>` : ''}
  </div>
  <div class="progress" id="prog">
    <span id="progText">پاسخ داده‌شده: ۰ از ${faNum(total)}</span>
    <div class="progress__bar"><div class="progress__fill" id="progFill"></div></div>
  </div>
  <form id="f" novalidate>
    ${sections}
    <button class="btn" type="submit">ارسال پاسخ‌ها</button>
    <div class="msg" id="msg"></div>
  </form>
  <div class="foot">مرکز جامع سنجش و توان‌بخشی — این پیام‌کوتاه یک‌بار مصرف است.</div>
</div>
<script>
(function () {
  var f = document.getElementById('f');
  var msg = document.getElementById('msg');
  var progText = document.getElementById('progText');
  var progFill = document.getElementById('progFill');
  var TOTAL = ${total};

  function updateProgress() {
    var answered = {};
    f.querySelectorAll('.item input[type=radio]:checked').forEach(function (r) { answered[r.name] = true; });
    var n = Object.keys(answered).length;
    progText.textContent = 'پاسخ داده‌شده: ' + String(n).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; })
      + ' از ' + String(TOTAL).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
    progFill.style.width = (TOTAL ? Math.round(n * 100 / TOTAL) : 0) + '%';
    return n;
  }
  f.addEventListener('change', function () { updateProgress(); });

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = new FormData(f);
    var answers = {};
    document.querySelectorAll('#f .item input[type=radio]').forEach(function (radio) {
      var name = radio.name;
      if (data.get(name)) answers[name] = Number(data.get(name));
    });
    var missing = 0;
    document.querySelectorAll('#f .item').forEach(function (item) {
      var has = item.querySelector('input[type=radio]:checked');
      item.classList.toggle('is-missing', !has);
      if (!has) missing += 1;
    });
    if (missing > 0) {
      var m = String(missing).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
      msg.className = 'msg err';
      msg.textContent = 'به ' + m + ' سؤال پاسخ نداده‌اید — سؤال‌های جامانده با رنگ سرخ مشخص شده‌اند.';
      var first = document.querySelector('#f .item.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    var btn = f.querySelector('.btn');
    btn.disabled = true;
    fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(token)}, answers: answers })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = 'پاسخ‌های شما ثبت شد. با تشکر از همراهی شما.';
          f.querySelectorAll('input, button').forEach(function (x) { x.disabled = true; });
          var p = document.getElementById('prog');
          if (p) p.style.display = 'none';
        } else {
          msg.className = 'msg err';
          msg.textContent = (res.j && res.j.error && res.j.error.message) || 'ثبت انجام نشد.';
          btn.disabled = false;
        }
      })
      .catch(function () { msg.className = 'msg err'; msg.textContent = 'خطای شبکه — دوباره تلاش کنید.'; btn.disabled = false; });
  });

  updateProgress();
})();
</script>
</body>
</html>`;
}

// ───────── فرم عمومی پکیجی (T5 — فرم جامع خانواده) ─────────

/**
 * رندر بخش‌به‌بخش پکیج چند-ابزاری — یک صفحه، چند ابزار پشت‌سرهم:
 * بلوک زمینهٔ کوتاه → سربرگ اختصاصی هر ابزار (شمارهٔ بخش + معرفی روایی + شمار پرسش)
 * → آیتم‌های همان ابزار با بخش‌بندی زیرمقیاسی؛ یک دکمهٔ ارسال در پایان.
 * اعتبارسنجی مرورگر هر بخش و سرور هر کامپوننت را با همان موتور v2 جدا نمره می‌دهد
 * (POST همان مسیر عمومی — answers تخت: نمرهٔ عددی برای آیتم‌ها، متن خام برای زمینه).
 * سبک بصری = عین renderFillFormPage (RTL، موبایل‌پسند، نمره از گیرنده پنهان).
 */
export function renderPackageFormPage(model: PackageFormModel, token: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  let counter = 0;
  /** آیتم‌های نمره‌دار یک ابزار — همان رندر فرم تکی؛ شمارندهٔ سراسری ادامه می‌یابد */
  const renderItems = (sections: FillFormSection[]): string => sections.map((sec) => {
    const items = sec.items.map((f) => {
      counter += 1;
      let opts: string[] = [];
      let optsCls = 'opts opts--scale';
      if (f.scoredOptions && f.scoredOptions.length > 0) {
        // گزینه‌ای نمره‌دار — value = اندیس گزینه؛ نمره هرگز نمایش داده نمی‌شود
        optsCls = 'opts opts--list';
        opts = f.scoredOptions.map((o, idx) =>
          `<label class="opt opt--wide"><input type="radio" name="${esc(f.key)}" value="${idx}" required />
           <span>${esc(o.label)}</span></label>`
        );
      } else {
        const max = Math.min(Math.max(f.scaleMax ?? 3, 1), 10);
        const labels = f.scaleLabels && f.scaleLabels.length === max + 1
          ? f.scaleLabels
          : null;
        for (let v = 0; v <= max; v++) {
          const lbl = labels ? labels[v] : (SCALE_LABELS[v] ?? faNum(v));
          opts.push(
            `<label class="opt"><input type="radio" name="${esc(f.key)}" value="${v}" required />
             <span>${esc(lbl)}</span></label>`
          );
        }
      }
      return `<div class="item" data-key="${esc(f.key)}"><div class="q">${faNum(counter)}. ${esc(f.label)}</div><div class="${optsCls}">${opts.join('')}</div></div>`;
    }).join('');
    const head = sec.title
      ? `<div class="subscale"><span class="subscale__dot"></span>${esc(sec.title)}</div>`
      : '';
    return `${head}<div class="card">${items}</div>`;
  }).join('');

  // بلوک زمینه — select با چیپ رادیویی، text با ورودی خطی، longtext با textarea
  const contextFields = model.context.fields.map((f) => {
    let ctrl: string;
    if (f.type === 'select') {
      const opts = (f.options ?? []).map((o) =>
        `<label class="opt"><input type="radio" name="${esc(f.key)}" value="${esc(o)}"${f.required ? ' required' : ''} />
         <span>${esc(o)}</span></label>`
      ).join('');
      ctrl = `<div class="opts--list">${opts}</div>`;
    } else if (f.type === 'longtext') {
      ctrl = `<textarea class="txt txt--area" name="${esc(f.key)}" rows="3" maxlength="2000" placeholder="مثلاً جابه‌جایی، مدرسهٔ جدید، تولد خواهر یا برادر…"></textarea>`;
    } else {
      ctrl = `<input class="txt" type="text" name="${esc(f.key)}" maxlength="200" />`;
    }
    const req = f.required ? '<span class="req">*</span>' : '';
    return `<div class="item ctx-item" data-ctx="${esc(f.key)}" data-ctx-required="${f.required ? '1' : '0'}"><div class="q">${esc(f.label)} ${req}</div>${ctrl}</div>`;
  }).join('');
  const contextBlock = model.context.fields.length > 0
    ? `<div class="subscale"><span class="subscale__dot"></span>${esc(model.context.title)}</div>
       <div class="card">${contextFields}</div>`
    : '';

  const tools = model.tools.map((t) => {
    const items = renderItems(t.sections);
    return `
    <div class="toolhead">
      <div class="toolhead__title">${esc(t.toolTitle)}</div>
      <div class="toolhead__meta">${faNum(t.itemCount)} پرسش</div>
      ${t.toolIntro ? `<div class="toolhead__intro">${esc(t.toolIntro)}</div>` : ''}
    </div>${items}`;
  }).join('');

  const totalScored = counter;
  const totalCtx = model.context.fields.length;
  const total = totalScored + totalCtx;
  const headSub = model.studentName ? `دربارهٔ ${model.studentName}` : '';

  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#12384f" />
<meta name="robots" content="noindex, nofollow" />
<title>${esc(model.packageTitle)}</title>
<style>
  :root { color-scheme: light; --ink:#12384f; --brand:#229ED9; --cream:#F7F3EA; }
  * { box-sizing: border-box; }
  html { -webkit-text-size-adjust: 100%; }
  body { margin: 0; background: var(--cream); color: var(--ink);
         font-family: Tahoma, "Segoe UI", sans-serif; line-height: 1.8;
         -webkit-tap-highlight-color: transparent; }
  .wrap { max-width: 640px; margin: 0 auto; padding: 20px 14px 40px; }
  .head { background: linear-gradient(160deg, #1a4a66, #12384f); color: #fff;
          border-radius: 18px; padding: 20px 20px 22px; margin-bottom: 16px;
          box-shadow: 0 4px 14px rgba(18,56,79,.18); }
  .head h1 { margin: 0 0 6px; font-size: 18px; line-height: 1.6; }
  .head p { margin: 0; font-size: 13px; opacity: .85; }
  .head .desc { margin-top: 10px; font-size: 13px; opacity: .95; line-height: 1.9;
                background: rgba(255,255,255,.08); border-radius: 10px; padding: 10px 12px; }
  .progress { position: sticky; top: 8px; z-index: 5; background: #fff; border: 1px solid #E5DCCB;
              border-radius: 12px; padding: 9px 12px; margin-bottom: 14px; font-size: 12.5px; color: #1c5d80;
              box-shadow: 0 1px 3px rgba(18,56,79,.10); }
  .progress__bar { height: 6px; background: #EFE8DC; border-radius: 999px; overflow: hidden; margin-top: 6px; }
  .progress__fill { height: 100%; width: 0%; background: linear-gradient(90deg, #229ED9, #2FB1E8); border-radius: 999px; transition: width .25s; }
  .subscale { display: flex; align-items: center; gap: 7px; font-size: 13.5px; font-weight: 800;
              color: #1c5d80; margin: 16px 4px 8px; }
  .subscale__dot { width: 9px; height: 9px; border-radius: 50%; background: var(--brand); display: inline-block; flex: none; }
  .toolhead { background: #fff; border: 1px solid #E5DCCB; border-right: 4px solid var(--brand);
              border-radius: 12px; padding: 12px 16px; margin: 22px 0 10px;
              box-shadow: 0 1px 3px rgba(18,56,79,.08); }
  .toolhead__title { font-size: 14.5px; font-weight: 800; color: var(--ink); line-height: 1.7; }
  .toolhead__meta { font-size: 12px; color: #1c5d80; margin-top: 2px; }
  .toolhead__intro { font-size: 12.5px; color: #4b5f6d; line-height: 1.9; margin-top: 6px; }
  .card { background: #fff; border-radius: 16px; padding: 6px 14px; margin-bottom: 14px;
          box-shadow: 0 1px 3px rgba(18,56,79,.08); }
  .item { padding: 14px 2px; border-bottom: 1px solid #EFE8DC; border-radius: 10px;
          transition: background .2s, box-shadow .2s; }
  .item:last-child { border-bottom: 0; }
  .item.is-missing { background: #FDF4F3; box-shadow: inset -3px 0 0 #A12622; }
  .item.is-missing .q { color: #A12622; }
  .q { font-weight: 700; font-size: 15px; margin-bottom: 10px; line-height: 1.9; }
  .req { color: #A12622; }
  .opts--scale { display: flex; flex-wrap: wrap; gap: 7px; }
  .opts--scale .opt { flex: 1 1 44px; justify-content: center; }
  .opts--list { display: grid; gap: 8px; }
  .opts--list .opt { width: 100%; min-height: 44px; }
  .opt { display: inline-flex; align-items: center; gap: 8px; background: #FAF7F0;
         border: 1.5px solid #E5DCCB; border-radius: 12px; padding: 9px 12px;
         font-size: 14.5px; font-weight: 600; cursor: pointer; min-height: 44px;
         user-select: none; -webkit-user-select: none; touch-action: manipulation;
         transition: background .15s, border-color .15s, transform .1s; }
  .opt:active { transform: scale(.96); }
  .opt--wide { align-items: center; }
  .opt input[type="radio"] { appearance: none; -webkit-appearance: none; margin: 0; flex: none;
        width: 20px; height: 20px; border: 2px solid #C7BBA4; border-radius: 50%;
        background: #fff; position: relative; transition: border-color .15s; }
  .opt input[type="radio"]:checked { border-color: var(--brand); }
  .opt input[type="radio"]:checked::after { content: ""; position: absolute; inset: 3px;
        border-radius: 50%; background: var(--brand); }
  .opt input[type="radio"]:focus-visible { outline: 2px solid var(--brand); outline-offset: 2px; }
  .opt:has(input:checked) { background: #D9EDF7; border-color: var(--brand); }
  .opt:has(input:focus-visible) { outline: 2px solid var(--brand); outline-offset: 2px; }
  .txt { width: 100%; border: 1.5px solid #E5DCCB; border-radius: 12px; padding: 10px 12px;
         font-size: 14px; font-family: inherit; background: #FAF7F0; color: var(--ink); line-height: 1.9; }
  .txt:focus { outline: 2px solid var(--brand); background: #fff; }
  .txt--area { resize: vertical; }
  .sendbar { position: sticky; bottom: 10px; z-index: 5; margin: 6px -6px 0;
             padding: 8px 6px calc(8px + env(safe-area-inset-bottom));
             background: linear-gradient(180deg, rgba(247,243,234,0), var(--cream) 34%);
             border-radius: 18px; }
  .btn { display: block; width: 100%; border: 0; background: linear-gradient(180deg, #2FB1E8, #229ED9);
         color: #fff; border-radius: 14px; padding: 15px; font-size: 17px; font-weight: 800;
         cursor: pointer; font-family: inherit; box-shadow: 0 8px 22px rgba(34,158,217,.38), 0 2px 6px rgba(18,56,79,.18);
         transition: transform .1s, filter .15s; }
  .btn:active { transform: translateY(1px); filter: brightness(.97); }
  .btn:disabled { opacity: .6; cursor: default; }
  .msg { display: none; border-radius: 12px; padding: 16px; margin-top: 12px; font-size: 14px; }
  .msg.ok { display: block; background: #E4F5E9; color: #1D6B39; }
  .msg.err { display: block; background: #FDE8E8; color: #A12622; }
  .foot { text-align: center; font-size: 12px; color: #8A8377; margin-top: 18px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>${esc(model.packageTitle)}</h1>
    ${headSub ? `<p>${esc(headSub)}</p>` : ''}
    ${model.description ? `<div class="desc">${esc(model.description)}</div>` : ''}
  </div>
  <div class="progress" id="prog">
    <span id="progText">پاسخ داده‌شده: ۰ از ${faNum(total)}</span>
    <div class="progress__bar"><div class="progress__fill" id="progFill"></div></div>
  </div>
  <form id="f" novalidate>
    ${contextBlock}
    ${tools}
    <div class="sendbar">
      <button class="btn" type="submit">ارسال همهٔ پاسخ‌ها</button>
    </div>
    <div class="msg" id="msg"></div>
  </form>
  <div class="foot">مرکز جامع سنجش/توان‌بخشی تربیتی سرورستان — این پیام‌کوتاه یک‌بارمصرف است.</div>
</div>
<script>
(function () {
  var f = document.getElementById('f');
  var msg = document.getElementById('msg');
  var prog = document.getElementById('prog');
  var progText = document.getElementById('progText');
  var progFill = document.getElementById('progFill');
  var sendbar = f.querySelector('.sendbar');
  var btn = f.querySelector('.btn');
  var TOTAL = ${total};

  function faD(x) {
    return String(x).replace(/[0-9]/g, function (d) { return '۰۱۲۳۴۵۶۷۸۹'[Number(d)]; });
  }

  function countAnswered() {
    var n = 0;
    var radios = {};
    f.querySelectorAll('.item:not(.ctx-item) input[type=radio]:checked').forEach(function (r) { radios[r.name] = true; });
    n += Object.keys(radios).length;
    f.querySelectorAll('.ctx-item .txt').forEach(function (t) {
      if (t.value && t.value.trim().length > 0) n += 1;
    });
    return n;
  }
  function updateProgress() {
    var n = countAnswered();
    var pct = TOTAL ? Math.round(n * 100 / TOTAL) : 0;
    progText.textContent = 'پاسخ داده‌شده: ' + faD(n) + ' از ' + faD(TOTAL) + ' (٪' + faD(pct) + ')';
    progFill.style.width = pct + '%';
    return n;
  }
  f.addEventListener('change', function () { updateProgress(); });
  f.addEventListener('input', function () { updateProgress(); });

  f.addEventListener('submit', function (ev) {
    ev.preventDefault();
    var data = new FormData(f);
    var answers = {};
    // آیتم‌های نمره‌دار — اندیس گزینه/نمرهٔ عددی (بلوک زمینه مستثنا)
    document.querySelectorAll('#f .item:not(.ctx-item) input[type=radio]').forEach(function (radio) {
      var name = radio.name;
      if (data.get(name)) answers[name] = Number(data.get(name));
    });
    // بلوک زمینه — select برچسب گزینه را می‌فرستد؛ text/longtext متن خام
    document.querySelectorAll('#f .ctx-item').forEach(function (item) {
      var radio = item.querySelector('input[type=radio]:checked');
      var t = item.querySelector('.txt');
      if (radio) answers[radio.name] = radio.value;
      else if (t && t.value && t.value.trim().length > 0) answers[t.name] = t.value.trim();
    });
    var missing = 0;
    document.querySelectorAll('#f .item:not(.ctx-item)').forEach(function (item) {
      var has = item.querySelector('input[type=radio]:checked');
      item.classList.toggle('is-missing', !has);
      if (!has) missing += 1;
    });
    document.querySelectorAll('#f .ctx-item').forEach(function (item) {
      var t = item.querySelector('.txt');
      var radio = item.querySelector('input[type=radio]:checked');
      var required = item.getAttribute('data-ctx-required') === '1';
      var has = (t && t.value && t.value.trim().length > 0) || radio;
      item.classList.toggle('is-missing', required && !has);
      if (required && !has) missing += 1;
    });
    if (missing > 0) {
      msg.className = 'msg err';
      msg.textContent = 'به ' + faD(missing) + ' پرسش پاسخ نداده‌اید — پرسش‌های جامانده با رنگ سرخ مشخص شده‌اند.';
      var first = document.querySelector('#f .item.is-missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    btn.disabled = true;
    btn.textContent = 'در حال ارسال…';
    fetch(location.pathname, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: ${JSON.stringify(token)}, answers: answers })
    }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
      .then(function (res) {
        if (res.ok) {
          msg.className = 'msg ok';
          msg.textContent = 'پاسخ‌های شما ثبت شد. با تشکر از همراهی شما.';
          f.querySelectorAll('input, button, textarea').forEach(function (x) { x.disabled = true; });
          if (sendbar) sendbar.style.display = 'none';
          if (prog) prog.style.display = 'none';
          msg.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } else {
          msg.className = 'msg err';
          msg.textContent = (res.j && res.j.error && res.j.error.message) || 'ثبت انجام نشد.';
          btn.disabled = false;
          btn.textContent = 'ارسال همهٔ پاسخ‌ها';
        }
      })
      .catch(function () {
        msg.className = 'msg err';
        msg.textContent = 'خطای شبکه — دوباره تلاش کنید.';
        btn.disabled = false;
        btn.textContent = 'ارسال همهٔ پاسخ‌ها';
      });
  });

  updateProgress();
})();
<\/script>
</body>
</html>`;
}
