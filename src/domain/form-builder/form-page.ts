/* form-builder/form-page.ts — موتور نمایش تعاملی عمومی فرم‌ها (v1.27.34 — REFERRAL-DESIGN §A-2)
 *
 * صفحهٔ خودکفا (HTML+CSS+JS همه inline — الگوی referral-page): خوش‌آمد → یک‌بلوک-در-هر-صفحه
 * (صفحه‌های آگاهی هم در جریان می‌نشینند) → مشخصات پاسخ‌دهنده → مرور نهایی با ویرایش هر سطر → ثبت.
 * رعایت prefers-reduced-motion؛ تم با توکن‌های هم‌ارز referral؛ بدون باندل و بدون فونت بیرونی (۱.۲۷.۴۲: وزیرمتن خودی).
 * هیچ تشخیص یا محاسبه‌ای سمت کلاینت انجام نمی‌شود — فقط گردآوری؛ اعتبارسنجی کامل سمت سرور.
 */
import type { FormDefinition } from './types';

const PAGE_STYLES = `
:root{--bg:#f6f7fb;--card:#ffffff;--ink:#1f2430;--muted:#6b7280;--brand:#2563eb;--brand-soft:#eef2ff;
--ok:#16a34a;--err:#dc2626;--line:#e5e7eb;--r:14px}
*{box-sizing:border-box}html,body{margin:0;padding:0}
/* ۱.۲۷.۴۲ — فونت وزیر متن باندل‌شدهٔ خودی (بدون وب‌فونت بیرونی) — واقعاً لود می‌شود */
@font-face{font-family:Vazirmatn;src:url('/assets/fonts/Vazirmatn-Variable.woff2') format('woff2');
font-weight:100 900;font-style:normal;font-display:swap}
body{background:var(--bg);color:var(--ink);font-family:Vazirmatn,Tahoma,'Segoe UI',sans-serif;
font-size:16px;line-height:1.9;direction:rtl}
.bar{position:fixed;top:0;right:0;left:0;height:5px;background:var(--line);z-index:5}
.bar__fill{height:100%;width:0;background:var(--brand);transition:width .3s ease}
/* ۱.۲۷.۴۲ — عمودی‌چین‌شدن مرحله (خواست کارفرما: فرم دقیقاً وسط صفحه)؛ safe center = بدون برش در محتوای بلند؛ پدینگ متقارن تا مرکز بصری دقیق باشد */
.app{max-width:560px;margin:0 auto;padding:24px 16px;min-height:100dvh;
display:flex;flex-direction:column;justify-content:safe center}
.card{background:var(--card);border:1px solid var(--line);border-radius:var(--r);padding:24px;
box-shadow:0 1px 3px rgba(15,23,42,.06)}
.step-no{color:var(--muted);font-size:13px;margin-bottom:8px}
h1{font-size:20px;margin:0 0 6px}h2{font-size:19px;margin:0 0 10px}
p.lead{color:var(--muted);margin:0 0 18px;font-size:14.5px}
.badge-free{display:inline-block;background:#e7f7ee;color:var(--ok);border-radius:999px;
padding:4px 14px;font-size:13.5px;font-weight:700;margin-bottom:14px}
/* ۱.۲۷.۳۶ — دکمه‌های هم‌اندازه: basis صفر یعنی «ادامه» و «بازگشت» همیشه هم‌پهنا؛ min-height هم‌قد */
.btn{display:inline-flex;align-items:center;justify-content:center;border:none;cursor:pointer;
border-radius:12px;padding:12px 22px;font-family:inherit;font-size:15.5px;font-weight:700;width:100%;
min-height:52px}
.btn--primary{background:var(--brand);color:#fff}
.btn--primary:disabled{opacity:.45;cursor:not-allowed}
.btn--ghost{background:transparent;color:var(--brand);border:1.5px solid var(--brand)}
.btn--sm{width:auto;min-height:44px;padding:9px 16px;font-size:14px}
.btnrow{display:flex;gap:10px;margin-top:20px}.btnrow .btn{flex:1 1 0}
.choice{display:block;background:var(--card);border:2px solid var(--line);border-radius:var(--r);
padding:14px 18px;margin-bottom:12px;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;
font-family:inherit;font-size:15px;text-align:start;width:100%;position:relative}
.choice:hover{border-color:var(--brand)}
.choice.sel{border-color:var(--brand);background:var(--brand-soft);box-shadow:0 2px 10px rgba(37,99,235,.12)}
.choice.sel::after{content:'✓';position:absolute;top:10px;left:14px;color:var(--brand);font-weight:800;font-size:15px}
label.f{display:block;font-weight:700;margin:0 0 6px}
input.i,select.i,textarea.i{width:100%;border:1.5px solid var(--line);border-radius:12px;padding:11px 14px;
font-family:inherit;font-size:15.5px;background:#fff;color:var(--ink)}
input.i:focus,textarea.i:focus{outline:none;border-color:var(--brand)}
textarea.i{min-height:110px;resize:vertical}
.field{margin-bottom:16px}
.err-msg{color:var(--err);font-size:13.5px;margin-top:4px;display:none}
.err-msg.show{display:block}
.hint{color:var(--muted);font-size:13px;margin-top:4px}
.review{border:1px solid var(--line);border-radius:12px;overflow:hidden;margin-top:6px}
.review__row{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
.review__row:last-child{border-bottom:none}
.review__row .k{color:var(--muted);font-size:13px;min-width:110px;padding-top:2px}
.review__row .v{flex:1;font-size:14.5px;white-space:pre-wrap}
.review__row .e{background:none;border:none;color:var(--brand);cursor:pointer;font-family:inherit;
font-size:13px;font-weight:700;padding:2px 4px}
.aware{font-size:15.5px;line-height:2.2;white-space:pre-wrap}
.done{text-align:center}.done .big{font-size:46px;margin-bottom:6px}
/* ۱.۲۷.۳۵ — افکت فید و جریان پیوسته: هر صفحهٔ تازه با فیدین نرم می‌نشیند؛ کاهش-حرکت رعایت می‌شود */
.app>.card{animation:fadein .3s ease}
@keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.choice,.btn{transition:transform .12s ease,border-color .15s,background .15s}
.choice:active{transform:scale(.98)}
input.i:focus-visible,textarea.i:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.bar__fill{transition:none}.app>.card{animation:none}.choice,.btn{transition:none}}
`;

const PAGE_SCRIPT = `
(function(){
'use strict';
var F = window.__FORM__; var app = document.getElementById('app'); var bar = document.getElementById('bar');
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var state = { step: 0, answers: {}, name: '', phone: '', submitting: false };
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function normDigits(s){return String(s==null?'':s).replace(/[۰-۹]/g,function(d){return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}).replace(/[٠-٩]/g,function(d){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));});}
function normPhone(s){var v=normDigits(s).replace(/[\\s\\-().]/g,'');if(v.indexOf('+98')===0){v='0'+v.slice(3);}else if(v.indexOf('98')===0&&v.length===12){v='0'+v.slice(2);}return v;}
function validPhone(s){return /^09\\d{9}$/.test(normPhone(s));}
/* صفحات تعاملی = بلوک‌های غیر note + صفحهٔ مشخصات + مرور */
var interactive = [];
for (var i=0;i<F.blocks.length;i++){ if(F.blocks[i].kind!=='note') interactive.push(i); }
var TOTAL = interactive.length + 3; // خوش‌آمد + بلوک‌ها + مشخصات + مرور
function setBar(){ bar.style.width = Math.round(Math.min(state.step, TOTAL-1)/(TOTAL-1)*100)+'%'; }
function stepNo(){ return 'گام '+(state.step+1)+' از '+TOTAL; }
function blockInput(i, b){
  var k=b.kind;
  if(k==='text'||k==='phone'||k==='number'){
    var type = k==='number'?'number':(k==='phone'?'tel':'text');
    var extra = k==='phone'?' dir="ltr" placeholder="09xxxxxxxxx" inputmode="tel"':(k==='number'?' dir="ltr" inputmode="decimal"':'');
    return '<input class="i" id="in" type="'+type+'"'+extra+' value="'+esc(valueOf(i))+'">';
  }
  if(k==='longtext'){ return '<textarea class="i" id="in">'+esc(valueOf(i))+'</textarea>'; }
  if(k==='select'){
    return b.options.map(function(o){ return '<button class="choice'+(valueOf(i)===o.value?' sel':'')+'" data-v="'+esc(o.value)+'">'+esc(o.label)+'</button>'; }).join('');
  }
  if(k==='multi'){
    var cur = Array.isArray(valueOf(i))?valueOf(i):[];
    return b.options.map(function(o){
      return '<button class="choice'+(cur.indexOf(o.value)>=0?' sel':'')+'" data-mv="'+esc(o.value)+'">'+esc(o.label)+'</button>';
    }).join('');
  }
  if(k==='yes_no'){
    return '<button class="choice'+(valueOf(i)==='yes'?' sel':'')+'" data-v="yes">بله</button>'+
           '<button class="choice'+(valueOf(i)==='no'?' sel':'')+'" data-v="no">خیر</button>';
  }
  return '';
}
function valueOf(i){ return state.answers[i]!==undefined?state.answers[i]:''; }
function setValue(i, v){ state.answers[i]=v; }
function labelOf(v){
  if(v===null||v===undefined||v==='')return '—';
  if(Array.isArray(v))return v.map(function(x){return optLabel(v.length&&x);}).join('، ');
  return String(v);
}
function optLabel(v){ return String(v); }
function displayValue(i){
  var b=F.blocks[i];var v=state.answers[i];
  if(v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length))return '—';
  if(b.kind==='select'||b.kind==='multi'){
    var arr=Array.isArray(v)?v:[v];
    return arr.map(function(x){var o=(b.options||[]).filter(function(o){return o.value===x;})[0];return o?o.label:x;}).join('، ');
  }
  if(b.kind==='yes_no')return v==='yes'?'بله':'خیر';
  return String(v);
}
function err(id, show, msg){
  var el=document.getElementById(id);if(!el)return;
  el.className=show?'err-msg show':'err-msg';if(msg)el.textContent=msg;
}
function btnRow(nextLabel, backTo, okId){
  return '<div class="btnrow"><button class="btn btn--ghost" data-act="back" data-to="'+backTo+'">بازگشت</button>'+
    '<button class="btn btn--primary" id="'+(okId||'__nx')+'">'+nextLabel+'</button></div>';
}
function renderIntro(){
  setBar();
  app.innerHTML='<div class="card"><div class="badge-free">پاسخ دادن به این فرم رایگان است</div>'+
    '<h1>'+esc(F.title)+'</h1>'+
    (F.description?'<p class="lead">'+esc(F.description)+'</p>':'')+
    '<p class="hint">حدود '+interactive.length+' پرسش — در هر صفحه یک پرسش.</p>'+
    '<button class="btn btn--primary" id="startBtn">شروع</button></div>';
  document.getElementById('startBtn').addEventListener('click',function(){state.step=1;render();});
}
function renderBlock(){
  setBar();
  var nth=state.step-1;var i=interactive[nth];var b=F.blocks[i];
  var req=b.required?'':' <span class="hint">(اختیاری)</span>';
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>'+esc(b.label)+req+'</h2>'+
    (b.kind==='longtext'?'<p class="hint">هر چیزی که فکر می‌کنید کمک می‌کند بنویسید.</p>':'')+
    '<div class="field">'+blockInput(i,b)+'<div class="err-msg" id="be"></div></div>'+
    btnRow('ادامه', state.step-1)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=Number(this.getAttribute('data-to'))||0;render();});
  var nx=document.getElementById('__nx');nx.textContent='ادامه';
  nx.addEventListener('click',function(){ if(checkBlock(i,b)){state.step=state.step+1;render();} });
  bindBlock(i,b);
}
function bindBlock(i,b){
  var app2=document.getElementById('app');
  if(b.kind==='select'||b.kind==='yes_no'){
    app2.querySelectorAll('[data-v]').forEach(function(el){
      el.addEventListener('click',function(){
        setValue(i,el.getAttribute('data-v'));
        app2.querySelectorAll('[data-v]').forEach(function(x){x.classList.remove('sel');});
        el.classList.add('sel');
        setTimeout(function(){ if(checkBlock(i,b)){state.step=state.step+1;render();} },180);
      });
    });
  } else if(b.kind==='multi'){
    app2.querySelectorAll('[data-mv]').forEach(function(el){
      el.addEventListener('click',function(){
        var v=valueOf(i);var cur=Array.isArray(v)?v.slice():[];
        var val=el.getAttribute('data-mv');
        var idx=cur.indexOf(val);
        if(idx>=0){cur.splice(idx,1);}else{cur.push(val);}
        setValue(i,cur);el.classList.toggle('sel',cur.indexOf(val)>=0);
      });
    });
  } else {
    var inp=document.getElementById('in');
    if(inp){
      inp.addEventListener('input',function(e){setValue(i,e.target.value);});
      /* جریان پیوسته — Enter (یا Ctrl+Enter در متن بلند) = ادامه؛ بدون پرسش اضافی */
      inp.addEventListener('keydown',function(e){
        var isTa=(e.target.tagName==='TEXTAREA');
        if(e.key==='Enter'&&!isTa){e.preventDefault();var nx=document.getElementById('__nx');if(nx&&checkBlock(i,b)){state.step=state.step+1;render();}}
        else if(e.key==='Enter'&&isTa&&e.ctrlKey){e.preventDefault();var nx2=document.getElementById('__nx');if(nx2&&checkBlock(i,b)){state.step=state.step+1;render();}}
      });
      /* فوکوس خودکار — کاربر همان‌جا که بود تایپ می‌کند */
      setTimeout(function(){try{inp.focus({preventScroll:true});}catch(_){try{inp.focus();}catch(__){}}},60);
    }
  }
}
function checkBlock(i,b){
  var v=state.answers[i];
  var empty=v===undefined||v===null||v===''||(Array.isArray(v)&&!v.length);
  if(b.required&&empty){err('be',true,'برای ادامه به این پرسش پاسخ بدهید');return false;}
  if(b.kind==='phone'&&!empty&&!validPhone(String(v))){err('be',true,'شماره موبایل ۱۱ رقم است و با ۰۹ شروع می‌شود');return false;}
  err('be',false);return true;
}
function renderContact(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>اسم و راه تماس شما</h2><p class="lead">برای اینکه بتوانیم پیگیری یا پاسخ بدهیم.</p>'+
    '<div class="field"><label class="f">نام و نام خانوادگی</label><input class="i" id="rn" value="'+esc(state.name)+'">'+
    '<div class="err-msg" id="rnErr">نام را کامل بنویسید — دست‌کم دو حرف</div></div>'+
    '<div class="field"><label class="f">شماره موبایل (اختیاری)</label><input class="i" id="rp" dir="ltr" inputmode="tel" placeholder="09xxxxxxxxx" value="'+esc(state.phone)+'">'+
    '<div class="err-msg" id="rpErr">شماره موبایل ۱۱ رقم است و با ۰۹ شروع می‌شود</div></div>'+
    btnRow('ادامه به مرور نهایی', state.step-1)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=Number(this.getAttribute('data-to'))||0;render();});
  document.getElementById('rn').addEventListener('input',function(e){state.name=e.target.value;});
  document.getElementById('rp').addEventListener('input',function(e){state.phone=e.target.value;});
  var nx=document.getElementById('__nx');nx.textContent='ادامه به مرور نهایی';
  nx.addEventListener('click',function(){
    var ok1=state.name.trim().length>=2;var ok2=state.phone.trim()===''||validPhone(state.phone);
    err('rnErr',!ok1);err('rpErr',!ok2);
    if(ok1&&ok2){state.phone=normPhone(state.phone);state.step=state.step+1;render();}
  });
}
function renderReview(){
  setBar();
  var rows=interactive.map(function(i){
    var b=F.blocks[i];
    return '<div class="review__row"><span class="k">'+esc(b.label)+'</span><span class="v">'+esc(displayValue(i))+'</span>'+
      '<button class="e" data-s="'+(i>=0?stepOfBlock(i):'')+'">ویرایش</button></div>';
  }).join('');
  app.innerHTML='<div class="card"><h2>پاسخ‌ها آماده ثبت است</h2>'+
    '<p class="lead">چک کنید؛ هر سطر را می‌توانید همین حالا ویرایش کنید.</p>'+
    '<div class="review">'+rows+
    '<div class="review__row"><span class="k">نام پاسخ‌دهنده</span><span class="v">'+esc(state.name)+'</span>'+
    '<button class="e" data-s="'+(TOTAL-2)+'">ویرایش</button></div>'+
    '<div class="review__row"><span class="k">موبایل</span><span class="v">'+esc(state.phone||'—')+'</span>'+
    '<button class="e" data-s="'+(TOTAL-2)+'">ویرایش</button></div></div>'+
    '<div class="err-msg" id="subErr"></div>'+
    '<div class="btnrow"><button class="btn btn--ghost" data-act="back" data-to="'+(TOTAL-2)+'">بازگشت و ویرایش</button>'+
    '<button class="btn btn--primary" id="confirmBtn">ثبت پاسخ‌ها</button></div></div>';
  app.querySelectorAll('.e').forEach(function(b2){
    b2.addEventListener('click',function(){state.step=Number(b2.getAttribute('data-s'))||0;render();});
  });
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=TOTAL-2;render();});
  document.getElementById('confirmBtn').addEventListener('click',function(){ submit(this); });
}
function stepOfBlock(blockIndex){
  var n=interactive.indexOf(blockIndex);
  return n>=0 ? n+1 : 0;
}
function submit(btnEl){
  if(state.submitting)return;
  state.submitting=true;btnEl.disabled=true;btnEl.textContent='در حال ثبت…';
  var answers=Object.keys(state.answers).map(function(k){return {index:Number(k),value:state.answers[k]};});
  fetch('/public/form/'+encodeURIComponent(F.slug)+'/submit',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({answers:answers,respondent_name:state.name,respondent_phone:state.phone||null,token:window.__FORM_TOKEN__||undefined})
  }).then(function(r){return r.json().then(function(j){return {status:r.status,body:j};});})
  .then(function(res){
    state.submitting=false;
    if(res.status===201){state.step=TOTAL-1;render();return;}
    var msg=(res.body&&res.body.message)||('ثبت نشد — کد '+res.status);
    var el=document.getElementById('subErr');
    if(el){el.className='err-msg show';el.textContent=msg;}else{alert(msg);}
    btnEl.disabled=false;btnEl.textContent='ثبت پاسخ‌ها';
  }).catch(function(){
    state.submitting=false;btnEl.disabled=false;
    var el=document.getElementById('subErr');
    if(el){el.className='err-msg show';el.textContent='ارتباط برقرار نشد — اینترنت را چک کنید و دوباره بزنید';}
    btnEl.textContent='ثبت پاسخ‌ها';
  });
}
function renderDone(){
  bar.style.width='100%';
  app.innerHTML='<div class="card done"><div class="big">✅</div>'+
    '<h2>پاسخ‌ها ثبت شد</h2><p class="lead">ممنون از وقتی که گذاشتید. اگر لازم باشد با شما تماس می‌گیریم.</p>'+
    '<p class="hint">مرکز جامع سنجش و اختلالات یادگیری — همه‌ی خدمات رایگان</p></div>';
}
function render(){
  /* جریان پیوسته — هر گام تازه به بالای صفحه برمی‌گردد (اسکرول نرم؛ کاهش-حرکت → بی‌درنگ) */
  if(state.step>0){try{window.scrollTo({top:0,behavior:REDUCED?'auto':'smooth'});}catch(_){window.scrollTo(0,0);}}
  if(state.step===0)return renderIntro();
  var nth=state.step-1;
  if(nth>=0&&nth<interactive.length)return renderBlock();
  if(state.step===TOTAL-2)return renderContact();
  if(state.step===TOTAL-1)return renderDone();
  state.step=0;render();
}
render();
})();
`;

function safeJsonEmbed(value: unknown): string {
  /* </ و U+2028/2029 داخل رشتهٔ JS می‌شکند — امن‌سازی استاندارد جاسازی JSON در <script> */
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

export function renderFormPage(opts: { form: FormDefinition }): string {
  const payload = {
    slug: opts.form.slug,
    title: opts.form.title,
    description: opts.form.description ?? '',
    blocks: opts.form.blocks
  };
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${opts.form.title.replace(/[<>&"]/g, '')}</title>
<meta name="robots" content="noindex, nofollow">
<!-- ۱.۲۷.۴۲ — وزیرمتن فقط خودی: @font-face در CSS همین صفحه از /assets/fonts می‌خواند -->
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="bar"><div class="bar__fill" id="bar"></div></div>
<div class="app" id="app"></div>
<script>window.__FORM__=${safeJsonEmbed(payload)};window.__FORM_TOKEN__='';</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}

export function renderFormNotFoundPage(): string {
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>فرم یافت نشد</title><meta name="robots" content="noindex, nofollow">
<!-- ۱.۲۷.۴۲ — وزیرمتن فقط خودی: @font-face در CSS همین صفحه از /assets/fonts می‌خواند -->
<style>${PAGE_STYLES}</style></head>
<body><div class="app"><div class="card done"><div class="big">🔍</div>
<h1>این فرم پیدا نشد یا هنوز منتشر نشده</h1>
<p class="lead">لینک را دوباره چک کنید یا با مرکز تماس بگیرید — همه‌ی خدمات رایگان است.</p>
</div></div></body></html>`;
}
