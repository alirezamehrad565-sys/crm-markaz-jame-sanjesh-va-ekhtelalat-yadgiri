export interface FillFormItem {
  key: string;
  label: string;
  scaleMax?: number;
  scoredOptions?: { label: string }[];
  scaleLabels?: string[];
  hint?: string | null; // — : مثال ساده زیر گویه (خاکستری)
  teacherLabel?: string | null; // — : متن جایگزین گویه برای فرم معلم
  teacherHint?: string | null; // — : مثال جایگزین برای فرم معلم
}

export interface FillFormSection {
  title: string | null;
  items: FillFormItem[];
}

export interface FillFormModel {
  typeTitle: string;
  studentName: string;
  sections: FillFormSection[];
  audience?: 'family' | 'teacher' | 'both' | null;
  description?: string | null;
  teacherLabel?: string | null;
}

const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';

function faNum(n: number): string {
  return String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
}

const SCALE_LABELS = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹', '۱۰'];

export function renderFillFormPage(model: FillFormModel, token: string): string {
  const esc = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  let counter = 0;
  const total = model.sections.reduce((sum, s) => sum + s.items.length, 0);
  const isTeacherForm = model.audience === 'teacher' || !!model.teacherLabel;
  const headTitle = isTeacherForm ? 'پرسش‌نامهٔ دانش‌آموز شما — فرم معلم' : 'پرسش‌نامهٔ فرزند شما';
  const headSub = model.studentName
    ? (isTeacherForm ? `دربارهٔ دانش‌آموز: ${model.studentName}` : `دربارهٔ ${model.studentName}`)
    : '';
  const sections = model.sections.map((sec) => {
    const items = sec.items.map((f) => {
      counter += 1;
      let opts: string[] = [];
      if (f.scoredOptions && f.scoredOptions.length > 0) {
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
      const qLabel = isTeacherForm && f.teacherLabel ? f.teacherLabel : f.label;
      const qHint = isTeacherForm && f.teacherHint ? f.teacherHint : f.hint;
      return `<div class="item" data-key="${esc(f.key)}"><div class="q">${faNum(counter)}. ${esc(qLabel)}</div>${qHint ? `<div class="hint">${esc(qHint)}</div>` : ''}<div class="opts">${opts.join('')}</div></div>`;
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
  .head .who { margin-top: 10px; font-size: 13.5px; font-weight: 700; line-height: 1.8;
               background: rgba(255,255,255,.14); border: 1px solid rgba(255,255,255,.25);
               border-radius: 10px; padding: 9px 12px; }
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
  .hint { font-size: 12px; color: #8A8377; margin: -5px 0 8px; line-height: 1.9; }
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
  .notice { text-align: center; font-size: 11.5px; color: #8A8377; margin: -4px 0 12px; }
</style>
</head>
<body>
<div class="wrap">
  <div class="head">
    <h1>${esc(model.typeTitle)}</h1>
    ${headSub ? `<p>${esc(headSub)}</p>` : ''}
    ${model.teacherLabel ? `<div class="who">${esc(model.teacherLabel)}</div>` : ''}
    ${model.description ? `<div class="desc">${esc(model.description)}</div>` : ''}
  </div>
  <div class="progress" id="prog">
    <span id="progText">پاسخ داده‌شده: ۰ از ${faNum(total)}</span>
    <div class="progress__bar"><div class="progress__fill" id="progFill"></div></div>
  </div>
  <div class="notice">این فرم تشخیص نیست؛ فقط به تصمیم‌گیری درمانگر کمک می‌کند.</div>
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

