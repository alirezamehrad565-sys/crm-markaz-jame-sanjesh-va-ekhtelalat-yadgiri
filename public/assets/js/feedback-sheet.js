import { el, icon, openModal, toast } from './ui.js';

const CONSTRUCT_FINDINGS = {
  attention_exec: 'تمرکز و پیگیری کارها برای او سخت‌تر از هم‌سن‌هایش است.',
  externalizing: 'کنترل رفتار و رعایت قواعد برای او چالش‌برانگیز است.',
  internalizing: 'گاهی نگرانی یا غمِ بیشتری نسبت به هم‌سن‌هایش نشان می‌دهد.',
  language_comm: 'در فهمیدن و بیان کردن به کمک و صبر بیشتری نیاز دارد.',
  academic_learning: 'یادگیری مهارت‌های درسی (خواندن، نوشتن، حساب) کندتر پیش می‌رود.',
  motor_coord: 'هماهنگی حرکات و کار با دست‌ها به تمرین بیشتری نیاز دارد.',
  general_cog: 'برای یادگیری‌های جدید به زمان و تکرار بیشتری نیاز دارد.',
  social_adl: 'در مهارت‌های روزمره و دوست‌یابی به راهنمایی بیشتری نیاز دارد.'
};

const CONSTRUCT_STRENGTHS = {
  attention_exec: 'توانایی توجه و تمرکز خوبی دارد.',
  externalizing: 'در رفتار و رعایت قواعد وضعیت خوبی دارد.',
  internalizing: 'حال و احساس او در وضعیت خوبی است.',
  language_comm: 'زبان و توانایی بیان او در وضعیت مطلوبی است.',
  academic_learning: 'در یادگیری درس‌ها وضعیت خوبی دارد.',
  motor_coord: 'مهارت‌های حرکتی و هماهنگی او خوب است.',
  general_cog: 'توانایی فکری کلی او خوب است.',
  social_adl: 'مهارت‌های اجتماعی و خودیاری او خوب است.'
};

const LEVEL_PLAIN = {
  'مرزی': 'کمی نیاز به توجه دارد',
  'قابل‌توجه': 'نیاز به توجه و کمک بیشتر دارد',
  'هم‌گرای-بالا': 'به‌روشنی به توجه و کمک بیشتر نیاز دارد'
};

const PLAN_TOOL_PLAIN = {
  'ce-snap-iv-p-v1': 'پرسش‌نامهٔ توجه و بی‌قراری (خانواده)',
  'ce-snap-iv-t-v1': 'پرسش‌نامهٔ توجه و بی‌قراری (معلم)',
  'ce-sdq-p-v1': 'پرسش‌نامهٔ رفتار و حال کودک (خانواده)',
  'ce-sdq-t-v1': 'پرسش‌نامهٔ رفتار و حال کودک (معلم)',
  'ce-scared-p-v1': 'پرسش‌نامهٔ نگرانی و ترس‌ها',
  'ce-dcdq-v1': 'پرسش‌نامهٔ هماهنگی حرکتی',
  'ce-sld-read-v1': 'چک‌لیست مهارت خواندن',
  'ce-sld-wri-v1': 'چک‌لیست نوشتن و املا',
  'ce-sld-calc-v1': 'چک‌لیست ریاضی',
  'ce-asd-criteria-v1': 'چک‌لیست ارتباط و تعامل اجتماعی',
  'ce-speech-criteria-v1': 'چک‌لیست زبان و گفتار',
  'ce-odd-criteria-v1': 'چک‌لیست رفتار و لجبازی',
  'ce-probe-read-v1': 'آزمون کوتاه روان‌خوانی',
  'ce-probe-write-v1': 'آزمون کوتاه نوشتن',
  'ce-probe-calc-v1': 'آزمون کوتاه حساب',
  'ce-id-adapt-v1': 'پرسش‌نامهٔ مهارت‌های روزمره و سازگاری',
  'ce-anamnesis-v3': 'شرح‌حال جلسهٔ نخست'
};

const HOME_TIPS = [
  'تمرین‌ها را کوتاه و سرحال نگه دارید — هر روز در یک ساعت مشخص، بهتر از یک جلسهٔ طولانی است.',
  'دستورها را کوتاه و قدم‌به‌قدم بدهید؛ یک دستور در هر بار و همراه تماس چشمی.',
  'خواب کافی و برنامهٔ ثابت روزانه تأثیر مستقیمی بر توجه و حال کودک دارد.',
  'تلاش او را تشویق کنید، نه فقط نتیجه را — «خوشحالم که ادامه دادی».',
  'با معلم کلاس در تماس بمانید و پیشرفت‌های کوچک را دوطرفه خبر دهید.'
];

function simplifyReason(reasonFa) {
  return String(reasonFa ?? '')
    .replace(/\(§[^)]*\)/g, '')
    .replace(/§[\d.]+/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/[.\s]+$/, '');
}

function studentNameOf(student) {
  return [student?.firstName, student?.lastName].filter(Boolean).join(' ').trim() || 'دانش‌آموز';
}

export function buildFeedbackSheet({ student, formulation, plan, todayLabel = '—' }) {
  const constructs = Array.isArray(formulation?.constructs) ? formulation.constructs.filter(Boolean) : [];

  const strengthItems = constructs
    .filter((c) => c.level === 'پایین' && CONSTRUCT_STRENGTHS[c.key])
    .map((c) => ({ text: CONSTRUCT_STRENGTHS[c.key] }));
  if (strengthItems.length === 0) {
    strengthItems.push({ text: 'بر اساس اطلاعات فعلی، نقطهٔ قوت خاصی ثبت نشده است؛ با ادامهٔ جلسات نقاط قوت او را با هم تقویت می‌کنیم.', muted: true });
  }

  const findingItems = constructs
    .filter((c) => c.level !== 'پایین' && CONSTRUCT_FINDINGS[c.key])
    .map((c) => {
      const level = LEVEL_PLAIN[c.level] ? ` (${LEVEL_PLAIN[c.level]})` : '';
      return { text: `${CONSTRUCT_FINDINGS[c.key]}${level}` };
    });
  if (findingItems.length === 0) {
    findingItems.push({ text: 'در ارزیابی فعلی الگوی خاصی که نیاز به توجه داشته باشد ثبت نشده است.', muted: true });
  }

  const coreItems = (Array.isArray(plan?.items) ? plan.items : [])
    .filter((it) => it && it.priority === 'core' && PLAN_TOOL_PLAIN[it.toolKey])
    .slice(0, 4)
    .map((it) => {
      const reason = simplifyReason(it.reasonFa);
      return { text: reason ? `${PLAN_TOOL_PLAIN[it.toolKey]} — ${reason}` : PLAN_TOOL_PLAIN[it.toolKey] };
    });
  if (coreItems.length === 0) {
    coreItems.push({ text: 'برنامهٔ دقیق گام‌های بعدی در جلسهٔ بعد با شما مطرح می‌شود.', muted: true });
  }

  return {
    center: 'مرکز جامع سنجش و آموزش',
    title: 'برگهٔ بازخورد خانواده',
    studentName: studentNameOf(student),
    dateLabel: todayLabel || '—',
    intro: 'این برگه خلاصه‌ای ساده از ارزیابی کودک شماست؛ برای اطلاع و همراهی خانواده. تصمیم‌های تخصصی در جلسهٔ حضوری با شما بررسی می‌شود.',
    sections: [
      { key: 'strengths', title: '۱) نقاط قوت کودک', items: strengthItems },
      { key: 'findings', title: '۲) آنچه در ارزیابی دیده شد', items: findingItems },
      { key: 'steps', title: '۳) گام‌های بعدی', items: coreItems },
      { key: 'home', title: '۴) توصیه‌های خانه', items: HOME_TIPS.map((t) => ({ text: t })) }
    ]
  };
}

export function feedbackSheetTextOf(sheet) {
  const lines = [
    sheet.center,
    sheet.title,
    `دانش‌آموز: ${sheet.studentName}`,
    `تاریخ: ${sheet.dateLabel}`,
    '',
    sheet.intro,
    ''
  ];
  for (const s of sheet.sections) {
    lines.push(s.title);
    for (const it of s.items) lines.push(`• ${it.text}`);
    lines.push('');
  }
  return lines.join('\n').trim();
}

async function copyText(text, okMsg) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = el('textarea', { style: { position: 'fixed', opacity: '0' } }, text);
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(okMsg, 'success');
  } catch {
    toast('کپی ممکن نشد — متن را دستی انتخاب کنید');
  }
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function printFeedbackSheet(sheet) {
  const html = `<!doctype html>
<html lang="fa" dir="rtl"><head><meta charset="utf-8" />
<title>${esc(sheet.title)}</title>
<style>
  body { margin: 0; background: #fff; color: #12384f; font-family: Vazirmatn, Tahoma, sans-serif; }
  .sheet { max-width: 720px; margin: 0 auto; padding: 28px 32px; line-height: 2; }
  .head { text-align: center; border-bottom: 2px solid #12384f; padding-bottom: 12px; margin-bottom: 14px; }
  .head .center { font-size: 17px; font-weight: 700; }
  .head .title { font-size: 14px; margin-top: 2px; }
  .meta { font-size: 13px; margin-top: 6px; }
  .intro { font-size: 12.5px; color: #444; margin: 0 0 16px; }
  h2 { font-size: 14.5px; margin: 16px 0 6px; }
  ul { margin: 0 0 8px; padding-inline-start: 20px; }
  li { font-size: 13.5px; margin: 3px 0; }
</style></head><body><div class="sheet">
<div class="head">
  <div class="center">${esc(sheet.center)}</div>
  <div class="title">${esc(sheet.title)}</div>
  <div class="meta">دانش‌آموز: ${esc(sheet.studentName)} · تاریخ: ${esc(sheet.dateLabel)}</div>
</div>
<p class="intro">${esc(sheet.intro)}</p>
${sheet.sections.map((s) => `<h2>${esc(s.title)}</h2><ul>${s.items.map((it) => `<li>${esc(it.text)}</li>`).join('')}</ul>`).join('')}
</div></body></html>`;
  const win = window.open('', '_blank', 'width=760,height=860');
  if (!win) {
    toast('پنجرهٔ چاپ باز نشد — مسدودکنندهٔ پاپ‌آپ را بررسی کنید');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export function openFeedbackSheetModal({ student, formulation, plan, todayLabel }) {
  const sheet = buildFeedbackSheet({ student, formulation, plan, todayLabel });

  const row = (it) => el('li', {
    style: {
      margin: '3px 0',
      fontSize: 'var(--fs-sm)',
      lineHeight: 'var(--lh-relaxed)', /* ۱٫۹ جادویی → توکن (الگوی S7-16) */
      color: it.muted ? 'var(--ink-2)' : 'var(--ink)' /* fallbackهای مرده حذف (S4-20) */
    }
  }, it.text);

  const section = (s) => el('div', { style: { margin: '0 0 var(--sp-3)' } },
    el('div', {
      style: { fontWeight: 700, fontSize: 'var(--fs-sm)', margin: '0 0 4px', color: 'var(--ink)' }
    }, s.title),
    el('ul', { style: { margin: 0, paddingInlineStart: '18px' } }, s.items.map(row)));

  const preview = el('div', {
    style: {
      maxHeight: '58vh', overflowY: 'auto', border: '1px solid var(--line)',
      borderRadius: 'var(--radius-md)', padding: 'var(--sp-4)', background: 'var(--surface)'
    }
  },
    el('div', { style: { textAlign: 'center', borderBottom: '2px solid var(--ink)', paddingBottom: '10px', marginBottom: '10px' } },
      el('div', { style: { fontWeight: 700, fontSize: 'var(--fs-md)' } }, sheet.center),
      el('div', { style: { fontSize: 'var(--fs-sm)', color: 'var(--ink-2)' } }, sheet.title),
      el('div', { class: 'cell-sub', style: { marginTop: '4px' } }, `دانش‌آموز: ${sheet.studentName} · تاریخ: ${sheet.dateLabel}`)),
    el('div', { class: 'cell-sub', style: { marginBottom: '10px' } }, sheet.intro),
    ...sheet.sections.map(section));

  openModal({
    title: el('span', { style: { display: 'inline-flex', alignItems: 'center', gap: '7px' } }, icon('printer', 17), sheet.title),
    wide: true,
    body: preview,
    actions: [
      (close) => el('button', {
        class: 'btn btn--soft',
        onclick: () => copyText(feedbackSheetTextOf(sheet), 'برگهٔ بازخورد کپی شد')
      }, icon('copy', 15), 'کپی متن'),
      (close) => el('button', {
        class: 'btn btn--primary',
        onclick: () => printFeedbackSheet(sheet)
      }, icon('printer', 15), 'چاپ'),
      (close) => el('button', { class: 'btn btn--ghost', onclick: close }, 'بستن')
    ]
  });
}
