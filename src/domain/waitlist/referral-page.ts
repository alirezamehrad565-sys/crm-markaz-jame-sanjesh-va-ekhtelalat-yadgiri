/* referral-page.ts — صفحهٔ تعاملی «معرفی به مرکز» (v1.27.33 — REFERRAL-DESIGN.md؛ بازطراحی ۱.۲۷.۳۶)
 *
 * صفحهٔ عمومی بدون لاگین، سمت سرور رندر می‌شود (الگوی family-sheet: no-store + noindex) —
 * یک فایل خودکفا: HTML + CSS + JS همه inline است تا به هیچ باندل/کش وابسته نباشد و روی
 * هر مرورگری حتی موبایل خانواده باز شود. CSP این مسیر فقط inline خودش را اجازه می‌دهد.
 *
 * جریان (۱.۲۷.۴۲ — خواست کارفرما): خوش‌آمد با افکت تایپ → نقش معرف → مشخصات تماس →
 * مدرسه/پایه/کلاس → شاخهٔ خانواده: نام کودک → تولد → دغدغه → ارزیابی قبلی → نکات → مرور → ثبت؛
 * شاخهٔ معلم: سه صفحهٔ آگاهی → ثبت دسته‌ای → مرور → ثبت.
 * ۱.۲۷.۴۲ — «فرم تکمیلی خانواده (وضعیت خانواده)» حذف شد (خواست کارفرما: جایش در نقش معلم مدرسه بود،
 * نه ولی دانش‌آموز؛ کارفرما آن را حذف کرد — مقادیر schema اختیاری‌اند و ثبت قدیمی دست‌نخورده می‌ماند).
 * UI/UX: دکمه‌های هم‌اندازه (flex-basis صفر + ارتفاع یکسان)، انتخاب‌گرها با تیک، متن‌های انسانی و گرم.
 * رعایت prefers-reduced-motion؛ هیچ تشخیصی در فرم انجام نمی‌شود — فرم فقط معرفی است.
 */

export interface ReferralPageOpts {
  token?: string | null;
}

/* فقط کاراکترهای امن توکن — هیچ چیز دیگری از کوئری به HTML/JS نمی‌رسد */
function safeToken(raw: string | null | undefined): string {
  return (raw ?? '').replace(/[^A-Za-z0-9._:\-]/g, '').slice(0, 200);
}

const PAGE_STYLES = `
/* ۱.۲۷.۴۶ — هماهنگ با سایت (خواست کارفرما: زبان رنگی و گوشه‌های گرد خود سایت):
   آینهٔ توکن‌های base.css — کرم گرم #F7F3EA · سطح #FFFDF8 · آبی #0D72A8 · کهربایی #D89428 ·
   گردی Tier: کارت ۲۲ / درونی ۱۴ / کنترل ۱۰ / دکمه و پیل قرصی ۹۹۹ */
:root{--bg:#F7F3EA;--card:#FFFDF8;--ink:#171B20;--muted:#4F565C;--brand:#0D72A8;--brand-soft:#E7F1F8;
--ok:#267A54;--warn:#D89428;--err:#B8403A;--line:#D0CABB;--r:22px;--r-md:14px;--r-sm:10px}
*{box-sizing:border-box}
/* ۱.۲۷.۴۲ — فونت وزیر متن باندل‌شدهٔ خودی؛ پیش‌تر فقط CDN بود که آفلاین/کندی می‌شکست و Tahoma می‌نشست */
@font-face{font-family:Vazirmatn;src:url('/assets/fonts/Vazirmatn-Variable.woff2') format('woff2');
font-weight:100 900;font-style:normal;font-display:swap}
html,body{margin:0;padding:0}
/* ۱.۲۷.۴۰ — پس‌زمینهٔ گرادینتی سه‌لایه با دو هالهٔ رنگی ثابت (خواست کارفرما) — بدون تصویر، بدون لود اضافه */
body{color:var(--ink);font-family:Vazirmatn,Tahoma,'Segoe UI',sans-serif;
font-size:16px;line-height:1.9;direction:rtl;
background:radial-gradient(640px 340px at 88% -6%,rgba(13,114,168,.14),transparent 66%),
radial-gradient(560px 320px at 6% 104%,rgba(216,148,40,.12),transparent 66%),
radial-gradient(420px 260px at 10% -4%,rgba(13,114,168,.08),transparent 64%),
linear-gradient(168deg,#F7F3EA 0%,#FBF7EE 46%,#F7F3EA 100%);
background-attachment:fixed}
.bar{position:fixed;top:0;right:0;left:0;height:5px;background:rgba(13,114,168,.16);z-index:5}
.bar__fill{height:100%;width:0;background:linear-gradient(90deg,#0D72A8,#3E9BC9);transition:width .3s ease}
.app{max-width:560px;margin:0 auto;padding:24px 16px;min-height:100dvh;
display:flex;flex-direction:column;justify-content:safe center}
.card{background:linear-gradient(180deg,#FFFDF8,#FBF8F1);border:1px solid rgba(208,202,187,.9);
border-radius:var(--r);padding:24px;box-shadow:0 10px 30px -14px rgba(13,114,168,.16),0 2px 8px rgba(23,27,32,.05)}
.step-no{color:var(--muted);font-size:13px;margin-bottom:8px}
h1{font-size:20px;margin:0 0 6px}
h2{font-size:19px;margin:0 0 10px}
p.lead{color:var(--muted);margin:0 0 18px;font-size:14.5px}
.welcome-text{font-size:17px;line-height:2.2;min-height:170px;white-space:pre-wrap}
.caret{display:inline-block;width:2px;height:1.15em;background:var(--brand);vertical-align:-0.2em;
animation:blink 1s steps(1) infinite;margin-inline-start:2px}
@keyframes blink{50%{opacity:0}}
/* ۱.۲۷.۳۶ — دکمه‌های هم‌اندازه: flex-basis صفر یعنی «ادامه» و «بازگشت» همیشه هم‌پهنا؛
   min-height مشترک یعنی هم‌قد — فارغ از طول متن */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;border:none;cursor:pointer;
border-radius:999px;padding:12px 22px;font-family:inherit;font-size:15.5px;font-weight:700;width:100%;
min-height:52px}
/* ۱.۲۷.۴۰ — دکمهٔ اصلی گرادینتی؛ لبهٔ برجسته با سایهٔ رنگ برند */
.btn--primary{background:linear-gradient(135deg,#0D72A8 0%,#0A5D8A 100%);color:#fff;
box-shadow:0 8px 20px -8px rgba(13,114,168,.5)}
.btn--primary:hover{filter:brightness(1.07)}
.btn--primary:disabled{opacity:.45;cursor:not-allowed;filter:none;box-shadow:none}
.btn--ghost{background:rgba(255,255,255,.85);color:var(--brand);border:1.5px solid var(--brand)}
.btn--sm{width:auto;min-height:44px;padding:9px 16px;font-size:14px}
.btnrow{display:flex;gap:10px;margin-top:20px}
.btnrow .btn{flex:1 1 0}
.choice{display:flex;align-items:flex-start;gap:12px;background:rgba(255,255,255,.92);border:2px solid var(--line);
border-radius:var(--r);padding:16px 18px;cursor:pointer;transition:border-color .15s,background .15s,box-shadow .15s;
text-align:start;width:100%;font-family:inherit;position:relative}
.choice:hover{border-color:var(--brand);box-shadow:0 6px 16px -8px rgba(13,114,168,.25)}
/* ۱.۲۷.۴۰ — انتخاب با گرادینت ملایم دو رنگ برند */
.choice.sel{border-color:var(--brand);background:linear-gradient(135deg,#E7F1F8,#F2F8FC);
box-shadow:0 8px 22px -10px rgba(13,114,168,.3)}
.choice.sel .no{background:linear-gradient(135deg,#0D72A8,#0A5D8A);color:#fff}
.choice.sel::after{content:'✓';position:absolute;top:10px;left:14px;color:var(--brand);
font-weight:800;font-size:16px}
.choice b{display:block;font-size:16px;margin-bottom:2px}
.choice span.d{color:var(--muted);font-size:13.5px}
.choice .no{flex:none;width:28px;height:28px;border-radius:50%;background:var(--brand-soft);
color:var(--brand);text-align:center;line-height:28px;font-weight:800;font-size:13px}
/* ۱.۲۷.۳۶ — ردیف کارت‌ها با ارتفاع یکسان (بلندترین محتوا معیار همه است) */
.choices{display:grid;gap:12px;grid-auto-rows:1fr}
label.f{display:block;font-weight:700;margin:0 0 6px}
input.i,select.i,textarea.i{width:100%;border:1.5px solid var(--line);border-radius:var(--r-sm);padding:11px 14px;
font-family:inherit;font-size:15.5px;background:#fff;color:var(--ink)}
input.i:focus,select.i:focus,textarea.i:focus{outline:none;border-color:var(--brand);box-shadow:0 0 0 3px rgba(13,114,168,.14)}
textarea.i{min-height:110px;resize:vertical}
.field{margin-bottom:16px}
.err-msg{color:var(--err);font-size:13.5px;margin-top:4px;display:none}
.err-msg.show{display:block}
.hint{color:var(--muted);font-size:13px;margin-top:4px}
/* ۱.۲۷.۴۰ — نشان «رایگان» گرادینتی */
.badge-free{display:inline-block;background:linear-gradient(135deg,#E3F2EA,#EEF8F2);color:#1E6B44;
border-radius:999px;padding:4px 14px;font-size:13.5px;font-weight:700;margin-bottom:14px}
.review{border:1px solid var(--line);border-radius:var(--r-md);overflow:hidden;margin-top:6px;background:rgba(255,253,248,.9)}
.review__row{display:flex;align-items:flex-start;gap:8px;padding:10px 14px;border-bottom:1px solid var(--line)}
.review__row:last-child{border-bottom:none}
.review__row .k{color:var(--muted);font-size:13px;min-width:110px;padding-top:2px}
.review__row .v{flex:1;font-size:14.5px}
.review__row .e{background:none;border:none;color:var(--brand);cursor:pointer;font-family:inherit;
font-size:13px;font-weight:700;padding:2px 4px}
.overlay{position:fixed;inset:0;background:rgba(15,23,42,.5);z-index:10;display:flex;
align-items:center;justify-content:center;padding:16px}
.modal{background:#FFFDF8;border-radius:var(--r-md);max-width:480px;width:100%;max-height:85vh;overflow:auto;padding:22px}
.aware{font-size:15.5px;line-height:2.2}
.aware ul{padding-inline-start:20px;color:var(--muted)}
/* ۱.۲۷.۴۰ — لینک راهنما و نوار یادداشت با پس‌زمینهٔ گرادینتی ملایم */
.guide-link{display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#E7F1F8,#EFF7FC);
color:#0B5D8C;border-radius:var(--r-md);padding:10px 14px;font-size:13.5px;font-weight:700;text-decoration:none;margin-top:14px}
.guide-link:active{opacity:.85}
.note{background:linear-gradient(135deg,#E7F1F8,#EFF7FC);border-radius:var(--r-md);padding:12px 14px;font-size:13.5px;
color:#0B5D8C;margin-top:14px}
.rowcard{border:1.5px solid var(--line);border-radius:var(--r-md);padding:14px;margin-bottom:12px;position:relative;
background:rgba(255,255,255,.92)}
.rowcard .rm{position:absolute;top:10px;left:10px;background:none;border:none;color:var(--err);
cursor:pointer;font-family:inherit;font-size:13px;font-weight:700}
/* ۱.۲۷.۳۶ — پیل‌های هم‌اندازه و لمس‌پذیر (حداقل ۴۴px) */
.pills{display:flex;flex-wrap:wrap;gap:10px}
.pill{border:1.5px solid var(--line);background:#fff;border-radius:999px;padding:9px 18px;
cursor:pointer;font-family:inherit;font-size:14px;min-height:44px;display:inline-flex;align-items:center}
/* ۱.۲۷.۴۰ — پیل انتخاب‌شده گرادینتی */
.pill.sel{border-color:var(--brand);background:linear-gradient(135deg,#E7F1F8,#F2F8FC);color:var(--brand);
font-weight:700;box-shadow:0 4px 12px -6px rgba(13,114,168,.35)}
.done{text-align:center}
.done .big{font-size:46px;margin-bottom:6px}
.switch-row{display:flex;align-items:center;justify-content:space-between;gap:10px;
border:1.5px solid var(--line);border-radius:var(--r-md);padding:12px 14px}
/* ۱.۲۷.۳۵ — افکت فید و جریان پیوسته؛ کاهش-حرکت رعایت می‌شود */
.app>.card{animation:fadein .3s ease}
@keyframes fadein{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
.choice,.btn,.pill{transition:transform .12s ease,border-color .15s,background .15s,box-shadow .15s}
.choice:active,.pill:active{transform:scale(.98)}
input.i:focus-visible,select.i:focus-visible,textarea.i:focus-visible,button:focus-visible{outline:2px solid var(--brand);outline-offset:2px}
@media (prefers-reduced-motion: reduce){.caret{animation:none}.bar__fill{transition:none}.app>.card{animation:none}.choice,.btn,.pill{transition:none}}
`;

const PAGE_SCRIPT = `
(function(){
'use strict';
var TOKEN = window.__REFERRAL_TOKEN__ || '';
var app = document.getElementById('app');
var bar = document.getElementById('bar');
var REDUCED = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
var GRADES = ['پیش‌دبستانی','اول دبستان','دوم دبستان','سوم دبستان','چهارم دبستان','پنجم دبستان','ششم دبستان'];
/* ۱.۲۷.۳۶ — گزینهٔ «مشکوک به اتیسم» حذف شد (خواست کارفرما)؛ مقدار autism در داده‌های قبلی باقی است */
/* ۱.۲۷.۴۲ — متن‌های کارفرما؛ «تأخیر گفتار و زبان» از گزینه‌های فرم حذف و «مشکلات رفتاری هیجانی» نشست
   (مقدار speech در داده‌های قبلی و برچسب‌های پذیرش باقی است) */
var CONCERNS = [
  {v:'delayed', t:'دیرآموزی', d:'یادگیری کندتر از هم‌سن‌وسال‌ها — ولی یاد می‌گیره'},
  {v:'learning_disorder', t:'اختلال یادگیری', d:'سختی در خواندن، نوشتن یا حساب'},
  {v:'intellectual', t:'مشکوک به کم‌توانی ذهنی', d:'تأخیر جدی در یادگیری و مهارت‌های روزمره'},
  {v:'behavioral', t:'مشکلات رفتاری هیجانی', d:'مثل بیش‌فعالی و تکانشگری، ترس، اضطراب و…'},
  {v:'other', t:'سایر', d:'هر دغدغه‌ی دیگری دارید…'}
];
var TEACH_CATS = ['delayed','learning_disorder','intellectual'];
var TEACH_CAT_LABELS = {delayed:'دیرآموز', learning_disorder:'اختلال یادگیری', intellectual:'مشکوک به کم‌توانی'};
/* ۱.۲۷.۴۶ — دو فیلد وضعیت خانواده از مسیر معلم (خواست کارفرما): همکاری خانواده + سطح مالی‌فرهنگی؛
   همان مقیاس سه‌گانهٔ صندوق ورودی (low/mid/high) تا بج‌ها و KPI مستقیم بخواند
   (کامنت درون HTML سرو می‌شود — واژهٔ ممنوعِ پین قدیمی در آن آورده نشود) */
var FC_LEVELS = [{v:'low',t:'کم'},{v:'mid',t:'متوسط'},{v:'high',t:'زیاد'}];
var LIV_LEVELS = [{v:'low',t:'کم‌برخوردار'},{v:'mid',t:'متوسط'},{v:'high',t:'برخوردار'}];
var FC_T = {low:'کم', mid:'متوسط', high:'زیاد'};
var LIV_T = {low:'کم‌برخوردار', mid:'متوسط', high:'برخوردار'};
function famPills(list, kind, val, i){
  return list.map(function(l){
    return '<button class="pill '+kind+(val===l.v?' sel':'')+'" data-i="'+i+'" data-'+kind+'="'+l.v+'">'+l.t+'</button>';
  }).join('');
}
var CAT_LABELS = {delayed:'دیرآموزی', learning_disorder:'اختلال یادگیری', intellectual:'مشکوک به کم‌توانی ذهنی', behavioral:'مشکلات رفتاری هیجانی', speech:'تأخیر گفتار و زبان', autism:'مشکوک به طیف اتیسم', other:'سایر'};
var AWARE = [
  /* ۱.۲۷.۳۸ — بازنویسی محاوره‌ای و مفصل‌تر؛ بدون تذکر تکراری «تشخیص» به خواست کارفرما،
     با لینک فایل راهنمای عمومی هر دسته (/public/guide/<slug>) برای توضیحات بیشتر */
  {t:'دیرآموز کیه؟', g:'delayed', b:'دیرآموز یعنی بچه‌ای که به صورت محسوس تو عملکردش در همه حیطه‌ها با همسالان خودش تفاوت مشهود داره، یادگیریش از بچه‌های هم‌سن‌وسالش کندتر پیش می‌ره — ولی این یعنی «کُند»، به معنی نمی‌تونه نیست. این بچه‌ها با توضیح ساده‌تر، تمرین بیشتر و کمی صبر، همون مسیر بقیه رو طی می‌کنن؛ فقط با گام‌های کوچیک‌تر اما متعددتری لازم دارن. توی کلاس معمولاً دیرتر شروع می‌کنه به خوندن و نوشتن، واژه‌های جدید رو دیرتر می‌فهمه و وقتی درس کمی سخت می‌شه زود خسته می‌شه و انگیزه‌ش می‌افته. چیزی که بیشتر از هرچیزی لازم داره تجربهٔ موفقیت‌ه: تکلیف کوچیک‌تر، تشویق واقعی، و اینکه کسی بهش نگاه نکنه که «بی‌استعداده». اگه توی کلاس یا خونه‌تون چنین بچه‌ای دارید، معرفی‌کردنش اولین قدم کمکِ واقعیه به اونه.'},
  {t:'اختلال یادگیری چیه؟', g:'learning-disorder', b:'اختلال یادگیری یعنی بچه از نظر هوش و فهم کاملاً عادیه — توی بازی، گفت‌وگو و درک ماجراها اصلاً از بقیه کم نمیاره حتی بهتره — ولی توی یکی از مهارت‌های درسی گیر می‌کنه: خوندن (کلمه‌ها رو جابه‌جا، برعکس یا با غلط‌های تکراری می‌خونه)، نوشتن (خیلی کند می‌نویسه، دست‌خطش ناخواناست) یا حساب (جدول ضرب نمی‌چسبه، جمعِ ذهنی براش سخته). نکتهٔ مهم: این بچه «تنبل» یا بی‌دقت نیست؛ مغزش فقط یه مسیر رو متفاوت پردازش می‌کنه. با روش چندحسی (دیداری + شنیداری + دست‌ورزی) همین بچه‌ها معمولاً به هم‌ترازی در یادگیری می‌رسن. هرچی زودتر معرفی بشن، اقدامات مؤثرتری می‌شه براشون انجام داد و اعتمادبه‌نفسی‌شون کمتر آسیب می‌بینه.'},
  {t:'نشونه‌های کم‌توانی ذهنی چیه؟', g:'intellectual', b:'نشانهٔ اصلی تأخیرِ هم‌زمان در چند حوزه‌ست، نه فقط درس: یادگیری مطالب پایه (شکل‌ها، رنگ‌ها و اعداد خیلی دیر می‌چسبن)، مهارت‌های روزمره (پوشیدن لباس، غذا خوردن مستقل، بازی با قواعد)، و گاهی گفتار. این بچه‌ها محیط آرام‌تر، تکرار بیشتر و انتظارِ واقع‌بینانه لازم دارن — و پشتیبانی تخصصی. اگه بچه‌ای توی چندتا از این زمینه‌ها هم‌زمان عقب‌تر از هم‌سن‌هاشه، معرفی‌ش کمک می‌کنه زودتر مسیر آموزشی مناسبش پیدا بشه. شاید نیازه که مجدد ارزیابی و جای‌دهی بشه: چه همون مدرسه با برنامهٔ فردی، چه مدرسهٔ استثنایی. برای خانواده هم خیلی مهمه که بدونن از بچه چه انتظاری داشته باشن و خونه رو چطور برای یادگیری آماده کنن.'}
];
var state = {
  step: 0, role: null, refName: '', refPhone: '',
  school: '', schoolName: '', grade: '', klass: '',
  childName: '', childBirth: '', concern: null, concernText: '',
  priorEval: null, priorEvalNote: '',
  rows: [], awareIdx: 0, meta: null, submitting: false
};
function esc(s){return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function normDigits(s){return String(s==null?'':s).replace(/[۰-۹]/g,function(d){return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}).replace(/[٠-٩]/g,function(d){return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d));});}
function normPhone(s){var v = normDigits(s).replace(/[\\s\\-().]/g,'');if(v.indexOf('+98')===0){v='0'+v.slice(3);}else if(v.indexOf('98')===0&&v.length===12){v='0'+v.slice(2);}return v;}
function validPhone(s){return /^09\\d{9}$/.test(normPhone(s));}
function familyTotal(){return 11;}
function teachTotal(){return 10;}
function total(){return state.role==='teacher'?teachTotal():familyTotal();}
function setBar(){var t=total();var pct=Math.round(Math.min(state.step,t-1)/(t-1)*100);bar.style.width=pct+'%';}
function stepNo(){var t=total();return 'گام '+(state.step+1)+' از '+t;}
function esc2(v){return v?esc(v):'ثبت نشده';}

/* ─── افکت تایپ خوش‌آمد (reduced-motion → بی‌درنگ) ─── */
function typeInto(node, text, done){
  if(REDUCED){node.textContent=text;done();return;}
  var i=0;var caret=document.createElement('span');caret.className='caret';
  node.textContent='';node.appendChild(caret);
  var skip=function(){clearInterval(timer);node.textContent=text;node.appendChild(caret);caret.style.display='none';done();};
  var timer=setInterval(function(){
    i++;node.textContent=text.slice(0,i);node.appendChild(caret);
    if(i>=text.length){clearInterval(timer);caret.style.display='none';done();}
  },26);
  app.addEventListener('click',skip,{once:true});
}

/* ─── مدارس همکار (بدون لاگین — فقط نام مدرسه و کلاس‌ها) ─── */
function loadMeta(cb){
  if(state.meta){cb(state.meta);return;}
  fetch('/public/partner-schools').then(function(r){return r.json();}).then(function(res){
    state.meta=(res&&res.data)||{schools:[],classes:[]};cb(state.meta);
  }).catch(function(){state.meta={schools:[],classes:[]};cb(state.meta);});
}

function btnRow(nextLabel, onOk, okId, backTo, disabled){
  var back = backTo===null?'':('<button class="btn btn--ghost" data-act="back" data-to="'+backTo+'">بازگشت</button>');
  return '<div class="btnrow">'+back+
    '<button class="btn btn--primary" id="'+okId+'" '+(disabled?'disabled':'')+'>'+nextLabel+'</button></div>';
}
function fieldErr(id, show, msg){
  var el=document.getElementById(id);if(!el)return;
  el.className= show?'err-msg show':'err-msg';
  if(msg)el.textContent=msg;
}

/* ─── صفحات ─── */
function renderWelcome(){
  setBar();
  app.innerHTML='<div class="card"><div class="badge-free">همه‌ی خدمات مرکز رایگانه</div>'+
    '<div class="welcome-text" id="wt"></div>'+
    '<div class="btnrow" id="wb" style="visibility:hidden">'+
    '<button class="btn btn--primary" id="startBtn">شروع</button></div></div>';
  var text='سلام! به مرکز جامع سنجش و اختلالات یادگیری خوش اومدید.\\nهمه‌ی خدمات ما رایگانه. قراره توی چند دقیقه اطلاعات لازم رو بگیریم تا اسم فرزندتون یا دانش‌آموزتون به لیست انتظار ارزیابی اضافه بشه.\\nهر وقت آماده بودید، دکمه‌ی «شروع» رو بزنید.';
  typeInto(document.getElementById('wt'), text, function(){
    document.getElementById('wb').style.visibility='visible';
  });
  document.getElementById('startBtn').addEventListener('click', function(){state.step=1;render();});
}

function renderRole(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>شما کدام‌یک هستید؟</h2>'+
    '<p class="lead">بر اساس همین انتخاب، فرم برای شما کوتاه یا بلند می‌شه.</p>'+
    '<div class="choices">'+
    '<button class="choice" id="rFamily"><span class="no">۱</span><b>پدر یا مادر دانش‌آموز</b><span class="d">می‌خوام فرزندم رو به مرکز معرفی کنم</span></button>'+
    '<button class="choice" id="rTeacher"><span class="no">۲</span><b>معلم همکار ما</b><span class="d">می‌خوام دانش‌آموزهای کلاسم رو معرفی کنم</span></button>'+
    '</div></div>';
  var pick=function(role){
    state.role=role;state.step=2;render();
  };
  document.getElementById('rFamily').addEventListener('click',function(){pick('family');});
  document.getElementById('rTeacher').addEventListener('click',function(){pick('teacher');});
}

function renderContact(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>خودتان را معرفی کنید</h2><p class="lead">اسم و شماره‌ای که راحت بشود با شما حرف زد.</p>'+
    '<div class="field"><label class="f" for="rn">نام و نام خانوادگی شما</label>'+
    '<input class="i" id="rn" autocomplete="name">'+
    '<div class="err-msg" id="rnErr">نام رو کامل بنویسید — دست‌کم دو حرف</div></div>'+
    '<div class="field"><label class="f" for="rp">شماره موبایل</label>'+
    '<input class="i" id="rp" inputmode="tel" dir="ltr" placeholder="09xxxxxxxxx">'+
    '<div class="err-msg" id="rpErr">شماره موبایل ۱۱ رقم است و با ۰۹ شروع می‌شه</div></div>'+
    btnRow('ادامه','',null,1)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=1;render();});
  var rn=document.getElementById('rn');
  var rp=document.getElementById('rp');
  rn.value=state.refName;
  rp.value=state.refPhone;
  rn.addEventListener('input',function(e){state.refName=e.target.value;});
  rp.addEventListener('input',function(e){state.refPhone=e.target.value;});
  var nx=app.querySelector('.btnrow .btn--primary');
  nx.addEventListener('click',function(){
    var ok1=state.refName.trim().length>=2;
    var ok2=validPhone(state.refPhone);
    fieldErr('rnErr',!ok1);
    fieldErr('rpErr',!ok2);
    if(ok1&&ok2){state.refPhone=normPhone(state.refPhone);state.step=3;render();}
  });
}

function renderSchool(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>'+(state.role==='teacher'?'مدرسه‌ی خودتان':'کودک شما در کدوم مدرسه‌ی همکار ما درس می‌خونه؟')+'</h2>'+
    '<p class="lead">فقط مدارس همکار ما در فهرست هستن — اگر نبود، اسمش رو دستی بنویسید؛ مشکلی نیست.</p>'+
    '<div class="field"><label class="f" for="sc">مدرسه</label>'+
    '<select class="i" id="sc"><option value="">در حال بارگذاری…</option></select>'+
    '<input class="i" id="scT" style="display:none;margin-top:8px" placeholder="اسم مدرسه را بنویسید" value="'+esc(state.schoolName)+'">'+
    '</div>'+
    '<div class="field"><label class="f" for="gr">پایه</label><select class="i" id="gr">'+
    '<option value="">انتخاب کنید</option>'+
    GRADES.map(function(g){return '<option value="'+g+'"'+(state.grade===g?' selected':'')+'>'+g+'</option>';}).join('')+
    '</select></div>'+
    '<div class="field"><label class="f" for="kl">کلاس (اختیاری)</label><select class="i" id="kl">'+
    '<option value="">انتخاب کنید</option></select></div>'+
    btnRow('ادامه','',null,2)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=2;render();});
  /* ۱.۲۷.۳۶ — وصلهٔ اشکال قدیمی: پایه هم به state بسته نمی‌شد */
  document.getElementById('gr').addEventListener('change',function(e){state.grade=e.target.value;});
  loadMeta(function(meta){
    var sc=document.getElementById('sc');var scT=document.getElementById('scT');
    if(!sc)return;
    if(!meta.schools.length){sc.style.display='none';scT.style.display='block';state.school='';}
    else{
      sc.innerHTML='<option value="">انتخاب کنید</option>'+meta.schools.map(function(s){
        return '<option value="'+esc(s.id)+'"'+(state.school===s.id?' selected':'')+'>'+esc(s.name)+'</option>';
      }).join('');
      sc.addEventListener('change',function(e){
        state.school=e.target.value;
        var sel=meta.schools.filter(function(s){return s.id===state.school;})[0];
        state.schoolName=sel?sel.name:scT.value.trim();
        fillClasses(meta);
      });
      var cur=meta.schools.filter(function(s){return s.id===state.school;})[0];
      if(cur){state.schoolName=cur.name;fillClasses(meta);}
    }
    scT.addEventListener('input',function(e){state.schoolName=e.target.value.trim();state.school='';});
    function fillClasses(m){
      var kl=document.getElementById('kl');
      var cs=m.classes.filter(function(c){return c.schoolId===state.school;});
      kl.innerHTML='<option value="">انتخاب کنید</option>'+cs.map(function(c){
        return '<option value="'+esc(c.name)+'"'+(state.klass===c.name?' selected':'')+'>'+esc(c.name)+'</option>';
      }).join('');
      /* ۱.۲۷.۳۶ — وصلهٔ اشکال قدیمی: انتخاب کلاس به state بسته نمی‌شد و ثبت نمی‌گشت */
      kl.addEventListener('change',function(e){state.klass=e.target.value;});
    }
  });
  app.querySelector('.btnrow .btn--primary').addEventListener('click',function(){
    if(!state.schoolName && state.school){var m=state.meta||{schools:[]};var sel=m.schools.filter(function(s){return s.id===state.school;})[0];state.schoolName=sel?sel.name:'';}
    if(state.role==='teacher' && !state.schoolName){/* معلم بدون مدرسه در فهرست — اجازه با ثبت دستی */}
    state.step=4;render();
  });
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه';
}

function renderChildName(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>اسم کودک چیست؟</h2>'+
    '<p class="lead">همان‌طور که صدايش می‌کنید بنویسید.</p>'+
    '<div class="field"><label class="f" for="cn">نام و نام خانوادگی کودک</label>'+
    '<input class="i" id="cn" value="'+esc(state.childName)+'">'+
    '<div class="err-msg" id="cnErr">اسم کودک را کامل بنویسید — دست‌کم دو حرف</div></div>'+
    btnRow('ادامه','',null,3)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=3;render();});
  /* ۱.۲۷.۳۶ — وصلهٔ اشکال قدیمی (از v1.۲۷.۳۳): input نام کودک به state بسته نمی‌شد و گام جلو نمی‌رفت */
  document.getElementById('cn').addEventListener('input',function(e){state.childName=e.target.value;});
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه';
  nx.addEventListener('click',function(){
    var ok=state.childName.trim().length>=2;fieldErr('cnErr',!ok);
    if(ok){state.childName=state.childName.trim();state.step=5;render();}
  });
}

function renderChildBirth(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>تاریخ تولد کودک</h2><p class="lead">اگر بلدید بنویسید — اگر نه، خالی بگذارید ما تو ارزیابی خودمون چک میکنیم.</p>'+
    '<div class="field"><label class="f" for="cb">تاریخ تولد (شمسی — مثل ۱۳۹۸/۰۵/۱۲)</label>'+
    '<input class="i" id="cb" inputmode="numeric" value="'+esc(state.childBirth)+'">'+
    '<div class="hint">اختیاری است</div></div>'+
    btnRow('ادامه','',null,4)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=4;render();});
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه';
  nx.addEventListener('click',function(){
    state.childBirth=document.getElementById('cb').value.trim();
    state.step=6;render();
  });
}

function renderConcern(){
  setBar();
  var cards=CONCERNS.map(function(c,i){
    return '<button class="choice'+(state.concern===c.v?' sel':'')+'" data-c="'+c.v+'">'+
      '<span class="no">'+(i+1)+'</span><b>'+c.t+'</b><span class="d">'+c.d+'</span></button>';
  }).join('');
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>دغدغه‌ی اصلی شما چیه؟</h2><p class="lead">لازم نیست دقیق باشد — نگرانی‌تان رو همان‌طور که هست بنویسید.</p>'+
    '<div class="choices">'+cards+'</div>'+
    '<div class="err-msg" id="ccErr">یکی از گزینه‌ها را انتخاب کنید</div>'+
    btnRow('ادامه','',null,5)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=5;render();});
  app.querySelectorAll('[data-c]').forEach(function(b){
    b.addEventListener('click',function(){
      state.concern=b.getAttribute('data-c');
      app.querySelectorAll('[data-c]').forEach(function(x){x.classList.remove('sel');});
      b.classList.add('sel');
    });
  });
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه';
  nx.addEventListener('click',function(){
    if(!state.concern){fieldErr('ccErr',true);return;}
    state.step=7;render();
  });
}

function renderPrior(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>قبلاً جایی ارزیابی یا تشخیص داشته؟</h2>'+
    '<div class="pills" id="pe">'+
    '<button class="pill'+(state.priorEval===true?' sel':'')+'" data-v="1">بله</button>'+
    '<button class="pill'+(state.priorEval===false?' sel':'')+'" data-v="0">خیر</button>'+
    '</div>'+
    '<div class="field" id="pen" style="display:'+(state.priorEval===true?'block':'none')+';margin-top:12px">'+
    '<label class="f" for="penote">کجا و چه نتیجه‌ای؟ (اختیاری)</label>'+
    '<input class="i" id="penote" value="'+esc(state.priorEvalNote)+'"></div>'+
    btnRow('ادامه','',null,6)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=7;render();});
  app.querySelectorAll('#pe .pill').forEach(function(p){
    p.addEventListener('click',function(){
      state.priorEval=p.getAttribute('data-v')==='1';
      app.querySelectorAll('#pe .pill').forEach(function(x){x.classList.remove('sel');});
      p.classList.add('sel');
      document.getElementById('pen').style.display=state.priorEval===true?'block':'none';
    });
  });
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه';
  nx.addEventListener('click',function(){
    state.priorEvalNote=document.getElementById('penote').value.trim();
    state.step=8;render();
  });
}

function renderNotes(){
  setBar();
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>نکته‌ای هست که به ارزیابی کمک کند؟</h2><p class="lead">اختیاری است — هر چیزی که فکر می‌کنید باید بدونیم.</p>'+
    '<div class="field"><textarea class="i" id="ct">'+esc(state.concernText)+'</textarea></div>'+
    btnRow('ادامه به مرور نهایی','',null,7)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=7;render();});
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه به مرور نهایی';
  nx.addEventListener('click',function(){
    state.concernText=document.getElementById('ct').value.trim();
    state.step=9;render();
  });
}

function familyChildren(){
  return [{
    first_name: state.childName,
    birth_date_text: state.childBirth || null,
    school_text: state.schoolName || null,
    grade_text: state.grade || null,
    class_text: state.klass || null,
    concern_category: state.concern,
    concern_tags: [],
    concern_text: state.concernText || null,
    prior_eval: state.priorEval===true?true:state.priorEval===false?false:null,
    prior_eval_note: state.priorEvalNote || null
  }];
}

/* ─── مودال مرور نهایی (Typeform-style) — خانواده ─── */
function renderReview(){
  setBar();
  var rows=[
    {k:'نام کودک', v:esc(state.childName), s:4},
    {k:'تاریخ تولد', v:esc2(state.childBirth), s:5},
    {k:'مدرسه', v:esc2(state.schoolName), s:3},
    {k:'پایه', v:esc2(state.grade), s:3},
    {k:'کلاس', v:esc2(state.klass), s:3},
    {k:'دغدغه اصلی', v:CAT_LABELS[state.concern]||'', s:6},
    {k:'ارزیابی قبلی', v:state.priorEval===true?'بله'+(state.priorEvalNote?' — '+esc(state.priorEvalNote):''):'خیر', s:7},
    {k:'نکات', v:esc2(state.concernText), s:8},
    {k:'معرف', v:esc(state.refName)+' — '+esc(state.refPhone), s:2}
  ].map(function(r){
    return '<div class="review__row"><span class="k">'+r.k+'</span><span class="v">'+r.v+'</span>'+
      '<button class="e" data-s="'+r.s+'">ویرایش</button></div>';
  }).join('');
  app.innerHTML='<div class="card">'+
    '<h2>این اطلاعات به لیست انتظار اضافه میشه</h2>'+
    '<p class="lead">یک نگاه بیندازید؛ هر سطر رو همین‌جا می‌شه اصلاح کرد.</p>'+
    '<div class="review">'+rows+'</div>'+
    '<div class="err-msg" id="subErr"></div>'+
    '<div class="btnrow"><button class="btn btn--ghost" data-act="back">بازگشت و ویرایش</button>'+
    '<button class="btn btn--primary" id="confirmBtn">تأیید و افزودن به لیست انتظار</button></div></div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=8;render();});
  app.querySelectorAll('.e').forEach(function(b){
    b.addEventListener('click',function(){state.step=Number(b.getAttribute('data-s'));render();});
  });
  document.getElementById('confirmBtn').addEventListener('click',function(){
    submit({role:'family', children:familyChildren()}, this);
  });
}

function submit(payload, btnEl){
  if(state.submitting)return;
  state.submitting=true;btnEl.disabled=true;btnEl.textContent='در حال ثبت…';
  fetch('/public/referrals',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
    .then(function(r){return r.json().then(function(j){return {status:r.status, body:j};});})
    .then(function(res){
      state.submitting=false;
      if(res.status===201){state.step=total()-1;render();return;}
      var msg=(res.body&&res.body.message)||('ثبت نشد — کد '+res.status);
      var el=document.getElementById('subErr');
      if(el){el.className='err-msg show';el.textContent=msg;}
      else{alert(msg);}
      btnEl.disabled=false;btnEl.textContent=state.role==='teacher'?'ثبت همه در لیست انتظار':'تأیید و افزودن به لیست انتظار';
    })
    .catch(function(){
      state.submitting=false;btnEl.disabled=false;
      var el=document.getElementById('subErr');
      if(el){el.className='err-msg show';el.textContent='ارتباط برقرار نشد — اینترنت رو چک کنید و دوباره بزنید';}
      btnEl.textContent=state.role==='teacher'?'ثبت همه در لیست انتظار':'تأیید و افزودن به لیست انتظار';
    });
}

/* ─── سه صفحه آگاهی معلم ─── */
function renderAware(){
  setBar();
  var a=AWARE[state.awareIdx];
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<div class="badge-free">صفحه آگاهی '+ (state.awareIdx+1) +' از '+AWARE.length+'</div>'+
    '<h2>'+a.t+'</h2><p class="aware">'+a.b+'</p>'+
    /* ۱.۲۷.۳۸ — جای تذکر تکراری «تشخیص»، لینک فایل راهنمای عمومی برای توضیحات بیشتر */
    '<a class="guide-link" href="/public/guide/'+a.g+'" target="_blank" rel="noopener">📄 فایل راهنمای کامل‌تر این دسته</a>'+
    btnRow(state.awareIdx===AWARE.length-1?'رفتن به ثبت ارجاع‌ها':'ادامه','',null,state.awareIdx===0?3:state.awareIdx+3)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){
    if(state.awareIdx===0){state.step=3;}else{state.awareIdx--;}
    render();
  });
  var nx=app.querySelector('.btnrow .btn--primary');
  nx.textContent=state.awareIdx===AWARE.length-1?'رفتن به ثبت ارجاع‌ها':'ادامه';
  nx.addEventListener('click',function(){
    if(state.awareIdx<AWARE.length-1){state.awareIdx++;state.step=4+state.awareIdx;render();}
    else{state.step=7;render();}
  });
}

/* ─── ثبت دسته‌ای معلم ─── */
function rowCardHtml(r, i){
  var cats=TEACH_CATS.map(function(c){
    return '<button class="pill'+(r.cat===c?' sel':'')+'" data-i="'+i+'" data-cat="'+c+'">'+TEACH_CAT_LABELS[c]+'</button>';
  }).join('');
  return '<div class="rowcard" data-i="'+i+'">'+
    '<button class="rm" data-rm="'+i+'">حذف</button>'+
    '<div class="pills" style="margin-bottom:10px">'+cats+'</div>'+
    '<div class="field"><label class="f">نام و نام خانوادگی دانش‌آموز</label>'+
    '<input class="i rn" value="'+esc(r.name)+'"></div>'+
    '<div class="field"><label class="f">شماره موبایل والد</label>'+
    '<input class="i rp" inputmode="tel" dir="ltr" placeholder="09xxxxxxxxx" value="'+esc(r.phone)+'">'+
    '<div class="err-msg">شماره موبایل ۱۱ رقم است و با ۰۹ شروع می‌شه</div></div>'+
    '<div class="field"><label class="f">همکاری خانواده</label>'+
    '<div class="pills">'+famPills(FC_LEVELS,'fcp',r.coop,i)+'</div>'+
    '<div class="hint">ارتباط و همراهی خانواده با پیگیری‌های مدرسه و مرکز</div></div>'+
    '<div class="field"><label class="f">سطح مالی و فرهنگی خانواده</label>'+
    '<div class="pills">'+famPills(LIV_LEVELS,'lvp',r.liv,i)+'</div>'+
    '<div class="hint">ارزیابی کلی شما به‌عنوان معلم کلاس — برای اولویت خدمات رایگان</div></div></div>';
}

function renderBatch(){
  setBar();
  if(state.rows.length===0)state.rows=[{cat:null,name:'',phone:'',coop:null,liv:null}];
  app.innerHTML='<div class="card"><div class="step-no">'+stepNo()+'</div>'+
    '<h2>ثبت ارجاع‌های کلاس شما</h2>'+
    '<p class="lead">برای هر دانش‌آموز دسته رو انتخاب کنید، اسمش و شماره‌ی والدش رو بنویسید و وضعیت خانواده‌ش رو از نظر همکاری و سطح مالی‌فرهنگی مشخص کنید.</p>'+
    '<div id="rows">'+state.rows.map(rowCardHtml).join('')+'</div>'+
    '<button class="btn btn--ghost btn--sm" id="addRow">+ افزودن دانش‌آموز دیگر</button>'+
    '<div class="err-msg" id="bErr" style="margin-top:10px"></div>'+
    btnRow('ادامه به مرور نهایی','',null,6)+
    '</div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=6;state.awareIdx=AWARE.length-1;render();});
  bindBatch();
  document.getElementById('addRow').addEventListener('click',function(){
    state.rows.push({cat:null,name:'',phone:'',coop:null,liv:null});
    document.getElementById('rows').insertAdjacentHTML('beforeend',rowCardHtml({cat:null,name:'',phone:'',coop:null,liv:null},state.rows.length-1));
    bindBatch();
  });
  var nx=app.querySelector('.btnrow .btn--primary');nx.textContent='ادامه به مرور نهایی';
  nx.addEventListener('click',function(){
    var inputs=document.querySelectorAll('#rows .rowcard');
    var ok=true;
    inputs.forEach(function(card,i){
      var r=state.rows[i];if(!r)return;
      r.name=card.querySelector('.rn').value.trim();
      r.phone=normPhone(card.querySelector('.rp').value.trim());
      var em=card.querySelector('.err-msg');
      if(!r.name||r.name.length<2||!validPhone(r.phone)||!r.coop||!r.liv){ok=false;if(em)em.className='err-msg show';}
      else if(em)em.className='err-msg';
    });
    var be=document.getElementById('bErr');
    if(!ok){be.className='err-msg show';be.textContent='برای هر دانش‌آموز، نام و شماره والد به‌همراه «همکاری خانواده» و «سطح مالی و فرهنگی خانواده» را کامل کنید';return;}
    be.className='err-msg';
    state.step=8;render();
  });
}

function bindBatch(){
  app.querySelectorAll('#rows .rowcard').forEach(function(card){
    var i=Number(card.getAttribute('data-i'));
    var r=state.rows[i];if(!r)return;
    card.querySelectorAll('.pill').forEach(function(p){
      p.addEventListener('click',function(){
        r.cat=p.getAttribute('data-cat');
        card.querySelectorAll('.pill').forEach(function(x){x.classList.remove('sel');});
        p.classList.add('sel');
      });
    });
    card.querySelector('.rn').addEventListener('input',function(e){r.name=e.target.value;});
    card.querySelector('.rp').addEventListener('input',function(e){r.phone=e.target.value;});
    /* ۱.۲۷.۴۶ — دو فیلد وضعیت خانواده: انتخاب پیل = ثبت در ردیف همان دانش‌آموز */
    card.querySelectorAll('.fcp').forEach(function(p){
      p.addEventListener('click',function(){
        r.coop=p.getAttribute('data-fcp');
        card.querySelectorAll('.fcp').forEach(function(x){x.classList.remove('sel');});
        p.classList.add('sel');
      });
    });
    card.querySelectorAll('.lvp').forEach(function(p){
      p.addEventListener('click',function(){
        r.liv=p.getAttribute('data-lvp');
        card.querySelectorAll('.lvp').forEach(function(x){x.classList.remove('sel');});
        p.classList.add('sel');
      });
    });
    var rm=card.querySelector('.rm');
    if(rm)rm.addEventListener('click',function(){
      state.rows.splice(i,1);render();
    });
  });
}

/* ─── مودال مرور معلم ─── */
function renderTeachReview(){
  setBar();
  var rows=state.rows.map(function(r,i){
    return '<div class="review__row"><span class="k">'+(i+1)+'. '+TEACH_CAT_LABELS[r.cat]+'</span>'+
      '<span class="v">'+esc(r.name)+' — '+esc(r.phone)+
      '<br><small style="color:var(--muted)">همکاری: '+FC_T[r.coop]+' · مالی‌فرهنگی: '+LIV_T[r.liv]+'</small></span></div>';
  }).join('');
  app.innerHTML='<div class="card"><h2>همه چیز آماده ثبت است</h2>'+
    '<p class="lead">'+fa(state.rows.length)+' دانش‌آموز به لیست انتظار اضافه میشه. یک نگاه بیندازید:</p>'+
    '<div class="review">'+rows+'</div>'+
    '<div class="err-msg" id="subErr"></div>'+
    '<div class="btnrow"><button class="btn btn--ghost" data-act="back">بازگشت و ویرایش</button>'+
    '<button class="btn btn--primary" id="confirmBtn">ثبت همه در لیست انتظار</button></div></div>';
  document.querySelector('[data-act="back"]').addEventListener('click',function(){state.step=7;render();});
  document.getElementById('confirmBtn').addEventListener('click',function(){
    var payload={
      role:'teacher',
      referrer_name:state.refName, referrer_phone:state.refPhone,
      school_text:state.schoolName||null, grade_text:state.grade||null, class_text:state.klass||null,
      token:TOKEN||undefined,
      children:state.rows.map(function(r){
        /* ۱.۲۷.۴۶ — دو فیلد وضعیت خانواده در payload هر کودک (اسکیما: الزام مسیر معلم) */
        return {first_name:r.name, guardian_phone:r.phone, concern_category:r.cat, concern_tags:[], concern_text:null,
                family_cooperation:r.coop, family_liv:r.liv};
      })
    };
    submit(payload, this);
  });
}

function fa(n){var d='۰۱۲۳۴۵۶۷۸۹';return String(n).replace(/\\d/g,function(x){return d[Number(x)];});}

function renderDone(){
  bar.style.width='100%';
  var fam=state.role!=='teacher';
  app.innerHTML='<div class="card done"><div class="big">'+(fam?'🎉':'🙏')+'</div>'+
    '<h2>'+(fam?'خوش‌آمد! اسمتون توی لیست انتظار ثبت شد':'ممنون از معرفی‌تون!')+'</h2>'+
    '<p class="lead">'+(fam?'همکاران ما برای وقت‌گیری تماس می‌گیرن. یادتون باشه همه‌ی خدمات مرکز رایگانه.':'اسم دانش‌آموزها به لیست انتظار اضافه شد. تیم ما برای تماس با خانواده‌ها اقدام می‌کنه.')+'</p>'+
    '<p class="hint">مرکز جامع سنجش و اختلالات یادگیری — همه‌ی خدمات رایگانه</p></div>';
}

function render(){
  /* ۱.۲۷.۳۵ — جریان پیوسته: هر گام تازه به بالای صفحه برمی‌گردد */
  try{window.scrollTo({top:0,behavior:'smooth'});}catch(_){window.scrollTo(0,0);}
  var s=state.step;
  if(s===0)return renderWelcome();
  if(s===1)return renderRole();
  if(s===2)return renderContact();
  if(s===3)return renderSchool();
  if(state.role==='family'){
    if(s===4)return renderChildName();
    if(s===5)return renderChildBirth();
    if(s===6)return renderConcern();
    if(s===7)return renderPrior();
    if(s===8)return renderNotes();
    if(s===9)return renderReview();
    if(s===10)return renderDone();
  }else{
    if(s===4||s===5||s===6)return renderAware();
    if(s===7)return renderBatch();
    if(s===8)return renderTeachReview();
    if(s===9)return renderDone();
  }
  state.step=0;render();
}

render();
})();
`;

export function renderReferralPage(opts: ReferralPageOpts = {}): string {
  const token = safeToken(opts.token);
  return `<!doctype html>
<html lang="fa" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>معرفی به مرکز — جامع سنجش و اختلالات یادگیری</title>
<meta name="robots" content="noindex, nofollow">
<!-- ۱.۲۷.۴۲ — وزیرمتن فقط خودی: فایل متغیر باندل‌شده از همان مبدا سرو می‌شود (بدون CDN بیرونی) -->
<style>${PAGE_STYLES}</style>
</head>
<body>
<div class="bar"><div class="bar__fill" id="bar"></div></div>
<div class="app" id="app"></div>
<script>window.__REFERRAL_TOKEN__=${JSON.stringify(token)};</script>
<script>${PAGE_SCRIPT}</script>
</body>
</html>`;
}
