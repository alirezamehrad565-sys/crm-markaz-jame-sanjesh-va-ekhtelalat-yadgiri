/**
 * چک‌لیست کاردرمانی — فرانت
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// ot-checklist.js — چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی + نتیجهٔ نیاز ویژه + کارت پروتکل
// فلو دوفازی شناسایی → مداخله: ارزیابی مهارتی = ورودی مشترک شناسایی؛ حین ارزیابی مداخله هم انجام می‌شود؛
// جلسهٔ بعد از «نقطهٔ فعلی» هر حیطه ادامه پیدا می‌کند (اولین مهارتی که «بلد است» نشده).
// خط قرمز پلن §۱ هم‌چنان برقرار است: ثبت نیاز ویژه/پروتکل فقط تصمیم درمانگر است، نه موتور.

import { api } from './api.js';
import { el, icon, toast, toastError, formModal } from './ui.js';
import { fa, formatJalaliDateTime } from './format.js';

// ───────── دادهٔ ثابت سمت مرورگر (هم‌قرارداد با @core/shared و ot-engine) ─────────

export const OT_STATUS = {
  mastered: { label: 'بلد است', cls: 'badge--success', tone: 'ok' },
  with_help: { label: 'با کمک', cls: 'badge--warning', tone: 'warn' },
  not_yet: { label: 'هنوز نه', cls: 'badge--neutral', tone: 'diff' }
};

/** سطح راهنمای «با کمک» — هم‌قرارداد با OT_PROMPT_LEVELS در ot-engine */
export const OT_PROMPT_LEVELS = {
  verbal: 'راهنمای کلامی',
  gestural: 'ژستی / الگودهی',
  partial_physical: 'لمسی جزئی',
  full_physical: 'راهنمای فیزیکی کامل'
};

export const NEEDS_KEY = 'ce-needs-v1';
export const OT_SESSION_KEY = 'ce-ot-session-v1';

const NEED_TYPE_OPTIONS = [
  { value: 'dyslexia', label: 'نارساخوانی (دیس‌لکسی)' },
  { value: 'dysgraphia', label: 'نارسانویسی (دیس‌گرافی)' },
  { value: 'dyscalculia', label: 'نارساریاضی (دیس‌کالکولی)' },
  { value: 'adhd', label: 'بیش‌فعالی و کم‌توجهی' },
  { value: 'autism', label: 'طیف اتیسم' },
  { value: 'speech_language', label: 'اختلال زبانی و بیان' },
  { value: 'anxiety', label: 'اضطراب' },
  { value: 'motor_coordination', label: 'اختلال هماهنگی حرکتی' },
  { value: 'slow_learner', label: 'دیرآموز' },
  { value: 'intellectual_disability', label: 'ناتوانی هوشی' },
  { value: 'global_developmental_delay', label: 'تأخیر رشدی جهانی' },
  { value: 'social_communication', label: 'اختلال ارتباط اجتماعی (پراگماتیک)' },
  { value: 'tic', label: 'اختلال تیک' },
  { value: 'other', label: 'سایر' }
];

const PROTOCOL_OPTIONS = [
  { value: 'learning', label: 'پروتکل اختلال یادگیری' },
  { value: 'slow_learner', label: 'پروتکل دیرآموز' },
  { value: 'mental_ot', label: 'پروتکل کاردرمانی ذهنی' },
  { value: 'rehab', label: 'پروتکل توانبخشی ذهنی-جسمی' }
];

const PROTOCOL_LABELS = Object.fromEntries(PROTOCOL_OPTIONS.map((o) => [o.value, o.label]));

/** نگاشت پیش‌فرض نیاز→پروتکل */
const PROTOCOL_SUGGESTIONS = {
  dyslexia: { protocol: 'learning', secondary: null },
  dysgraphia: { protocol: 'learning', secondary: null },
  dyscalculia: { protocol: 'learning', secondary: null },
  adhd: { protocol: 'mental_ot', secondary: 'learning' },
  autism: { protocol: 'mental_ot', secondary: 'rehab' },
  speech_language: { protocol: 'mental_ot', secondary: null },
  anxiety: { protocol: 'mental_ot', secondary: null },
  motor_coordination: { protocol: 'mental_ot', secondary: 'rehab' },
  slow_learner: { protocol: 'slow_learner', secondary: 'mental_ot' },
  intellectual_disability: { protocol: 'slow_learner', secondary: 'rehab' },
  global_developmental_delay: { protocol: 'rehab', secondary: 'mental_ot' },
  social_communication: { protocol: 'mental_ot', secondary: null },
  tic: { protocol: 'mental_ot', secondary: null },
  other: null
};

const PROTOCOL_SESSION_TYPE = {
  learning: 'مداخله فردی ۴۵ دقیقه',
  slow_learner: 'مداخله فردی ۴۵ دقیقه + خانواده‌محور',
  mental_ot: 'کاردرمانی ذهنی ۴۵ دقیقه',
  rehab: 'مداخله فردی ۴۵ دقیقه'
};

const PROTOCOL_STEPS = {
  learning: [
    ['مشاهده و ثبت', 'شرح‌حال، چک‌لیست‌های رفتاری و مشاهدهٔ کلاس'],
    ['ارزیابی تخصصی', 'پروب‌های خواندن/نوشتن/حساب + وکسلر + ملاک‌های DSM'],
    ['مداخله و جلسات', 'مسیر هدف با تمرین‌های بانک + جلسات فردی/گروهی'],
    ['پایش و گزارش', 'پروب دوره‌ای، بازسنجی ۴–۶ هفته و گزارش خانواده']
  ],
  slow_learner: [
    ['ارزیابی پایه', 'وکسلر + ارزیابی مهارتی ۷ حیطه‌ای — نقطهٔ شروع واقعی'],
    ['اهداف کوچک و واقع‌بینانه', 'هدف‌های قابل دستیابی دوره‌ای، نه مقایسه با هم‌سال'],
    ['تکرار ساخت‌یافته و چندحسی', 'تمرین‌های کوتاه با تکرار بیشتر و ورودی چندحسی'],
    ['تمرین روزانهٔ خانگی', 'تکلیف کوتاه روزانه از بانک تمرین + گزارش خانواده'],
    ['بازبینی دوره‌ای و جلسهٔ مشترک', 'جلسهٔ خانواده‌محور + آموزش آموزگاران']
  ],
  mental_ot: [
    ['پروفایل مهارتی', 'ارزیابی مهارتی ۷ حیطه‌ای — حین ارزیابی، مداخله هم انجام می‌شود'],
    ['پیشروی مهارت‌به‌مهارت', 'از نقطهٔ فعلی هر حیطه ادامه — جلسهٔ بعد از همان‌جا'],
    ['خانواده و آموزگاران', 'جلسهٔ خانواده‌محور + آموزش آموزگاران با گزارش پیشرفت حیطه‌ای'],
    ['بازسنجی حیطه‌ای', 'مقایسهٔ پروفایل با جلسهٔ اول — ۸ تا ۱۲ جلسه']
  ],
  // m162 — فلوی توانبخشی: ارزیابی عملکردی (خط پایهٔ عددی) → چک‌لیست مهارتی (نقطهٔ شروع هر حیطه،
  // اولویت با حیطه‌های پرچم‌دار خط پایه) → مداخلهٔ جلسه‌به‌جلسه از نقطهٔ ادامه → پیشرفت و بازسنجی.
  rehab: [
    ['ارزیابی پایه', 'شرح‌حال + ارزیابی عملکردی ذهنی — خط پایهٔ عددی شش حیطه با سطح راهنما (وکسلر و چک‌لیست‌های خانواده/معلم اختیاری)'],
    ['چک‌لیست مهارتی', 'نقطهٔ شروع هر حیطه از چک‌لیست مهارتی ۷ حیطه‌ای — اولویت پیمایش با حیطه‌های پرچم‌دار خط پایه'],
    ['مداخلهٔ جلسه‌به‌جلسه', 'ثبت جلسه از نقطهٔ ادامهٔ هر حیطه + سطح راهنما + تمرین خانگی — حیطه‌به‌حیطه'],
    ['پیشرفت و بازسنجی', 'روند جلسه‌به‌جلسه (تسلط تأییدشده + محوشدن راهنما) + بازسنجی خط پایه در ۸ تا ۱۲ جلسه']
  ]
};

/** چیپ پروتکل فعال — سربرگ تب تفسیر */
export function protocolChip(protocol) {
  if (!protocol || !PROTOCOL_LABELS[protocol]) return null;
  return el('span', { class: 'badge badge--accent proto-chip' }, icon('target', 13), PROTOCOL_LABELS[protocol]);
}

/** کارت پروتکل فاز مداخله — گام‌ها اطلاعاتی‌اند؛ اجرا با ابزار خودِ پروتکل */
export function protocolCard(protocol) {
  if (!protocol || !PROTOCOL_STEPS[protocol]) return null;
  return el('div', { class: 'card proto-card' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('target', 16), `پروتکل مداخله فعال — ${PROTOCOL_LABELS[protocol]}`),
      el('span', { class: 'badge badge--info' }, `نوع نوبت پیش‌فرض: ${PROTOCOL_SESSION_TYPE[protocol] ?? '—'}`)
    ),
    el('div', { class: 'card__body' },
      el('div', { class: 'clx-journey__steps' },
        ...PROTOCOL_STEPS[protocol].map(([title, hint], i) =>
          el('div', { class: 'clx-journey__step' },
            el('div', { class: 'clx-journey__head' }, el('strong', {}, `${fa(i + 1)} — ${title}`)),
            el('div', { class: 'cell-sub' }, hint)
          )
        )
      )
    )
  );
}

// ───────── نتیجهٔ نیاز ویژه — دروازهٔ فاز مداخله ─────────

/**
 * مودال ثبت نتیجهٔ نیاز ویژه: جمع‌بندی شواهد + نیاز نهایی + پروتکل (اصلی/پشتیبان) + اهداف.
 * ثبت = ساخت رویداد ce-needs-v1 + فعال شدن پروتکل روی پرونده (فاز مداخله).
 */
export function openNeedsModal({ student, gates, canDecide, refresh }) {
  if (!canDecide) { toast('ثبت نتیجهٔ نیاز ویژه فقط توسط مدیر یا درمانگرِ مسئول پرونده مجاز است'); return; }

  const doneCount = (gates?.gates ?? []).filter((g) => g.done).length;
  const incomplete = doneCount < 5;

  const evidencePrefill = (gates?.gates ?? [])
    .map((g) => `${g.label}: ${g.detail}`)
    .join('\n');

  // پیشنهاد پیش‌فرض نیاز→پروتکل — پاسخ سرور مرجع است؛ نقشهٔ محلی پشتیبان
  const suggestions = gates?.protocolSuggestions ?? PROTOCOL_SUGGESTIONS;

  formModal({
    title: 'نتیجهٔ نیاز ویژه — جمع‌بندی شناسایی',
    submitLabel: 'ثبت و فعال‌سازی پروتکل',
    fields: [
      ...(incomplete && gates
        ? [{
            type: 'heading',
            label: `${fa(doneCount)} از ${fa(5)} ورودی شناسایی کامل است — با ثبت، پرونده مستقیم وارد فاز مداخله می‌شود (مناسب پرونده‌های ارجاعی با سابقهٔ خارجی).`
          }]
        : []),
      {
        name: 'need_type', type: 'select', label: 'نیاز ویژهٔ نهایی', required: true, options: NEED_TYPE_OPTIONS, placeholder: 'انتخاب کنید…',
        onChange: (val, inputs) => {
          const sug = suggestions ? suggestions[val] : null; // — پیش‌پرکردن پیش‌فرض؛ تصمیم نهایی با درمانگر
          if (sug) {
            if (inputs.protocol) inputs.protocol.value = sug.protocol;
            if (inputs.protocol_secondary) inputs.protocol_secondary.value = sug.secondary ?? 'none';
          }
        }
      },
      { name: 'protocol', type: 'select', label: 'پروتکل مداخله', required: true, options: PROTOCOL_OPTIONS, placeholder: 'انتخاب کنید…' },
      { name: 'protocol_secondary', type: 'select', label: 'پروتکل پشتیبان (اختیاری)', options: [{ value: 'none', label: 'هیچ' }, ...PROTOCOL_OPTIONS] },
      { name: 'evidence', type: 'textarea', label: 'خلاصهٔ شواهد شناسایی (شرح‌حال / رفتاری / وکسلر / مهارتی)', rows: 3, value: evidencePrefill },
      { name: 'goals', type: 'textarea', label: 'اهداف کوچک دورهٔ اول', rows: 3 },
      { name: 'session_plan', type: 'text', label: 'برنامهٔ جلسات پیشنهادی', placeholder: 'مثلاً: هفته‌ای ۲ جلسهٔ فردی ۴۵ دقیقه' }
    ],
    onSubmit: async (vals) => {
      if (!vals.need_type) { toast('نیاز ویژهٔ نهایی را انتخاب کنید'); return false; }
      if (!vals.protocol) { toast('پروتکل مداخله را انتخاب کنید'); return false; }
      const secondary = vals.protocol_secondary && vals.protocol_secondary !== 'none' ? vals.protocol_secondary : null;
      try {
        await api.post(`/api/students/${student.id}/needs-summary`, {
          need_type: vals.need_type,
          protocol: vals.protocol,
          protocol_secondary: secondary,
          evidence: vals.evidence || null,
          goals: vals.goals || null,
          session_plan: vals.session_plan || null
        });
        toast('نتیجهٔ نیاز ویژه ثبت شد — پروتکل مداخله فعال شد', 'success');
        refresh();
        return true;
      } catch (err) { toastError(err); return false; }
    }
  });
}

// ───────── چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی ─────────

/**
 * کارت اصلی چک‌لیست ۷ حیطه‌ای — ارزیابی مهارتی حین مداخله.
 * profile خروجی GET /api/students/:id/ot/profile است؛ تغییرها محلی انباشته و
 * با «ثبت جلسه» یک‌جا POST می‌شوند (items + گزارش جلسه → تایم‌لاین).
 * m162 — فلوی مسیرآگاه: protocolLabel برچسب پروتکل در عنوان/مودال ثبت؛
 * priorityDomains (حیطه‌های پرچم‌دار خط پایهٔ عملکردی توانبخشی) بج «اولویت» می‌گیرند
 * و حیطهٔ فعال پیش‌فرض اولین اولویتِ ناتمام است — ترتیب «ارزیابی عملکردی اول،
 * چک‌لیست مهارتی دوم» در خود کارت دیده می‌شود.
 */
export function otChecklistCard({ student, profile, canDecide, refresh, scrollTarget = false, protocolLabel = 'کاردرمانی ذهنی', priorityDomains = [] }) {
  if (!profile) return null;

  // تغییرهای ثبت‌نشدهٔ این جلسه — skillId → {status, prevStatus, promptLevel}
  const pending = new Map();
  let activeDomain = null;
  // نمای پیمایش اولیه: ۳ مهارت نخستِ نمره‌نخوردهٔ حیطه — پیمایش ۸۴ آیتم در یک جلسه ممکن نیست
  let sweepMode = false;

  // m162 — حیطهٔ فعال پیش‌فرض: اولین حیطهٔ اولویت‌دارِ ناتمام؛ بعد اولین ناتمام؛ بعد حیطهٔ اول
  const prioritySet = new Set(priorityDomains);
  const firstPriorityIncomplete = profile.domains.find((d) => prioritySet.has(d.key) && d.scored < d.total);
  const firstPriority = profile.domains.find((d) => prioritySet.has(d.key));
  const hasResume = profile.domains.some((d) => d.resumeSkillId && d.scored > 0);
  const firstIncomplete = profile.domains.find((d) => d.scored < d.total);
  activeDomain = (firstPriorityIncomplete ?? firstPriority ?? firstIncomplete ?? profile.domains[0])?.key ?? null;

  function effectiveStatus(skill) {
    const p = pending.get(skill.skillId);
    return p ? p.status : skill.status;
  }

  /** رندر در جای ثابت — هر build، محتوای wrapper را عوض می‌کند (کارت stale نمی‌ماند) */
  const root = el('div', { class: 'ot-card-wrap' });

  function build() {
    const t = profile.totals;
    const pctOf = (d) => (d.total ? Math.round((d.mastered / d.total) * 100) : 0);

    // ── نوار خلاصهٔ ۷ حیطه ──
    const domainStrip = el('div', { class: 'ot-domains' },
      profile.domains.map((d) => {
        const pend = [...pending.keys()].filter((sid) => d.skills.some((s) => s.skillId === sid)).length;
        const isPriority = prioritySet.has(d.key); // m162 — حیطهٔ پرچم‌دار خط پایهٔ عملکردی
        return el('button', {
          class: `ot-domain-chip${activeDomain === d.key ? ' is-active' : ''}${isPriority ? ' is-priority' : ''}`,
          onclick: () => { activeDomain = d.key; build(); },
          title: `${d.title} — ${fa(d.mastered)} از ${fa(d.total)} تسلط تأییدشده${isPriority ? ' — اولویت از خط پایهٔ عملکردی' : ''}`
        },
          el('span', { class: 'ot-domain-chip__title' }, d.title),
          el('span', { class: 'ot-domain-chip__nums' }, `${fa(d.mastered)}/${fa(d.total)}`),
          el('span', { class: 'ot-progress' }, el('span', { class: 'ot-progress__fill', style: { width: `${pctOf(d)}%` } })),
          isPriority ? el('span', { class: 'ot-domain-chip__prio', title: 'حیطهٔ پرچم‌دار خط پایهٔ عملکردی — اولویت پیمایش و مداخله' }, '★') : null,
          pend > 0 ? el('span', { class: 'ot-domain-chip__pend' }, `+${fa(pend)}`) : null
        );
      })
    );

    const totalsLine = el('div', { class: 'ot-totals' },
      el('span', { class: 'badge badge--info' }, `پیمایش: ${fa(t.scored)} از ${fa(t.total)} مهارت`),
      el('span', { class: 'badge badge--success' }, `تسلط تأییدشده: ${fa(t.mastered)}`),
      t.masteredPending > 0 ? el('span', { class: 'badge badge--warning', title: 'یک جلسه «بلد است» — جلسهٔ دوم برای تأیید تسلط لازم است (m91)' }, `در انتظار تأیید دوم: ${fa(t.masteredPending)}`) : null,
      t.withHelp > 0 ? el('span', { class: 'badge badge--warning' }, `با کمک: ${fa(t.withHelp)}`) : null,
      t.secondarySkills > 0 ? el('span', { class: 'badge badge--neutral', title: 'مهارت‌های هم‌سازه که در شمارش پیشرفت دوباره شمرده نمی‌شوند (m91)' }, `مهارت مکمل: ${fa(t.secondarySkills)}`) : null,
      t.sessions > 0 ? el('span', { class: 'cell-sub' }, `${fa(t.sessions)} جلسه ثبت‌شده${t.lastSessionAt ? ` — آخرین: ${formatJalaliDateTime(t.lastSessionAt)}` : ''}`) : el('span', { class: 'cell-sub' }, 'هنوز جلسه‌ای ثبت نشده — ارزیابی و مداخله از همین‌جا شروع می‌شود'),
      // m162 — اولویت پیمایش از خط پایهٔ عملکردی (فلوی توانبخشی: ارزیابی اول، چک‌لیست دوم)
      priorityDomains.length ? el('span', { class: 'cell-sub ot-priority-hint' }, icon('target', 13), 'اولویت پیمایش از خط پایهٔ عملکردی: ', el('b', {}, priorityDomains.map((k) => profile.domains.find((d) => d.key === k)?.title ?? k).join('، '))) : null,
      hasResume ? el('span', { class: 'cell-sub ot-resume-hint' }, icon('bookmark', 13), 'جلسهٔ بعد از نقطه‌های نشانه‌دار ادامه پیدا می‌کند — تسلط با دو جلسهٔ پیاپی «بلد است» تأیید می‌شود') : null
    );

    // ── ردیف‌های مهارت حیطهٔ فعال ──
    const d = profile.domains.find((x) => x.key === activeDomain) ?? profile.domains[0];
    // نمای پیمایش اولیه: ۳ مهارت نخستِ نمره‌نخوردهٔ این حیطه + هر مورد در انتظار ثبت همین جلسه
    let visibleSkills = d.skills;
    if (sweepMode) {
      const unscored = d.skills.filter((s) => !s.status && !pending.has(s.skillId)).slice(0, 3);
      const pendingOnes = d.skills.filter((s) => pending.has(s.skillId) || (s.status && !unscored.some((u) => u.skillId === s.skillId)));
      visibleSkills = [...unscored, ...pendingOnes];
    }
    const skillsBlock = el('div', { class: 'ot-skills' },
      visibleSkills.map((s) => {
        const eff = effectiveStatus(s);
        const isResume = d.resumeSkillId === s.skillId && canDecide;
        const st = eff ? OT_STATUS[eff] : null;
        const pendingNow = pending.has(s.skillId);
        const pendingEntry = pending.get(s.skillId);
        const masteredPendingBadge = !pendingNow && s.status === 'mastered' && !s.masteryConfirmed;

        return el('div', { class: `ot-skill${isResume ? ' is-resume' : ''}${pendingNow ? ' is-pending' : ''}` },
          el('div', { class: 'ot-skill__num' }, fa(s.ord)),
          el('div', { class: 'ot-skill__main' },
            el('div', { class: 'ot-skill__title' },
              el('span', {}, s.title),
              isResume ? el('span', { class: 'badge badge--accent ot-resume-badge' }, icon('bookmark', 11), 'نقطهٔ ادامه') : null,
              pendingNow ? el('span', { class: 'badge badge--info ot-pend-badge' }, 'این جلسه') : null,
              masteredPendingBadge ? el('span', { class: 'badge badge--warning', title: 'قاعدهٔ تسلط دوجلسه‌ای — جلسهٔ بعدی هم «بلد است» باشد تا تأیید شود' }, 'بلد است — جلسهٔ دوم برای تأیید') : null,
              s.isPrimary === false ? el('span', { class: 'badge badge--neutral', title: 'هم‌سازهٔ مهارت دیگری است — در شمارش پیشرفت دوباره شمرده نمی‌شود' }, 'مکمل') : null,
              s.expectedAge ? el('span', { class: 'badge badge--neutral', title: 'بازهٔ سنی موردانتظار — مرجع رشدی، نه ملاک قبولی (m91)' }, `سن معمول: ${s.expectedAge}`) : null
            ),
            el('div', { class: 'ot-skill__crit' }, `معیار قبولی: ${s.criterion}`),
            !pendingNow && s.status === 'with_help' && s.promptLevel
              ? el('div', { class: 'ot-skill__note' }, `سطح راهنما: ${OT_PROMPT_LEVELS[s.promptLevel] ?? s.promptLevel}`)
              : null,
            s.latestNote ? el('div', { class: 'ot-skill__note' }, `یادداشت: ${s.latestNote}`) : null,
            // انتخابگر سطح راهنما — فقط وقتی «با کمک» همین جلسه ثبت می‌شود
            pendingNow && pendingEntry.status === 'with_help'
              ? el('div', { class: 'ot-skill__prompt' },
                  el('span', { class: 'cell-sub' }, 'سطح راهنما:'),
                  el('select', {
                    class: 'select ot-prompt-select',
                    onchange: (e) => {
                      pendingEntry.promptLevel = e.target.value;
                    }
                  }, ...Object.entries(OT_PROMPT_LEVELS).map(([k, lbl]) =>
                    el('option', { value: k, selected: (pendingEntry.promptLevel ?? 'verbal') === k ? true : null }, lbl)
                  ))
                )
              : null
          ),
          canDecide
            ? el('div', { class: 'ot-skill__seg' },
                ...Object.entries(OT_STATUS).map(([key, meta]) =>
                  el('button', {
                    class: `ot-seg__btn ot-seg__btn--${meta.tone}${eff === key ? ' is-picked' : ''}`,
                    title: `${meta.label} — ${s.title}`,
                    onclick: () => {
                      if (eff === key) {
                        pending.delete(s.skillId);
                      } else {
                        pending.set(s.skillId, {
                          status: key,
                          prevStatus: s.status,
                          promptLevel: key === 'with_help' ? (s.promptLevel ?? 'verbal') : null
                        });
                      }
                      build();
                    }
                  }, meta.label)
                )
              )
            : el('span', { class: `badge ${st?.cls ?? 'badge--neutral'}` }, st?.label ?? 'نمره‌نخورده')
        );
      })
    );

    // ── نوار ثبت جلسه ──
    const saveBar = canDecide
      ? el('div', { class: 'ot-savebar' },
          el('span', { class: 'cell-sub' },
            pending.size > 0
              ? `${fa(pending.size)} وضعیت برای ثبت در جلسهٔ ${protocolLabel} آماده است`
              : 'وضعیت مهارت‌ها را حین کار با کودک بزنید — سپس جلسه را ثبت کنید'),
          el('button', {
            class: 'btn btn--primary btn--sm',
            disabled: pending.size === 0 ? true : null,
            onclick: () => openSessionSaveModal(d)
          }, icon('save', 14), 'ثبت جلسه')
        )
      : null;

    const card = el('div', { class: 'card ot-card', id: scrollTarget ? 'ot-checklist-anchor' : null },
      el('div', { class: 'card__head' },
        el('div', { class: 'card__title' }, icon('puzzle', 16), 'چک‌لیست مهارتی — پایش جلسه به جلسه'),
        el('span', { class: 'badge badge--accent' }, protocolLabel),
        el('span', { class: 'badge badge--neutral' }, 'حین ارزیابی، مداخله هم انجام می‌شود'),
        canDecide
          ? el('button', {
              class: `btn btn--sm ${sweepMode ? 'btn--primary' : 'btn--ghost'}`,
              title: 'پیمایش اولیه — ۳ مهارت نخستِ نمره‌نخوردهٔ هر حیطه؛ کامل‌کردن ملاک گیت (حداقل ۳ نمره در هر ۷ حیطه) در ۲-۳ جلسه',
              onclick: () => { sweepMode = !sweepMode; build(); }
            }, sweepMode ? 'پیمایش اولیه: روشن' : 'پیمایش اولیه')
          : null
      ),
      el('div', { class: 'card__body' },
        domainStrip,
        totalsLine,
        el('div', { class: 'ot-domain-head' },
          el('strong', {}, d.title),
          el('span', { class: 'cell-sub' }, sweepMode
            ? 'نمای پیمایش اولیه — ۳ مهارت نخستِ نمره‌نخوردهٔ این حیطه'
            : d.resumeSkillId
              ? 'از مهارت نشانه‌دار («نقطهٔ ادامه») پیش بروید'
              : 'این حیطه کامل شده است')
        ),
        skillsBlock,
        saveBar
      )
    );
    root.replaceChildren(card);
    return root;
  }

  /** مودال پایان جلسه: تمرکز + خلاصه + تکلیف → POST یک‌جا */
  function openSessionSaveModal(domain) {
    const items = [...pending.entries()].map(([skillId, v]) => ({
      skill_id: skillId,
      status: v.status,
      prompt_level: v.status === 'with_help' ? (v.promptLevel ?? 'verbal') : null
    }));
    const mastered = items.filter((i) => i.status === 'mastered').length;
    const withHelp = items.filter((i) => i.status === 'with_help').length;
    formModal({
      title: `ثبت جلسهٔ ${protocolLabel} — ${fa(items.length)} مهارت (${fa(mastered)} بلد است${withHelp > 0 ? `، ${fa(withHelp)} با کمک` : ''})`,
      submitLabel: 'ثبت جلسه',
      fields: [
        ...(withHelp > 0
          ? [{
              type: 'heading',
              label: `${fa(withHelp)} مهارت «با کمک» است — سطح راهنمای هرکدام در فهرست انتخاب شده؛ تسلط فقط با دو جلسهٔ پیاپی «بلد است» تأیید می‌شود.`
            }]
          : []),
        { name: 'focus', type: 'text', label: 'حیطه‌های تمرکز این جلسه', placeholder: `مثلاً: ${domain.title}` },
        { name: 'summary', type: 'textarea', label: 'خلاصهٔ جلسه و واکنش کودک', rows: 3 },
        { name: 'homework', type: 'text', label: 'تمرین خانگی پیشنهادی' }
      ],
      onSubmit: async (vals) => {
        try {
          const res = await api.post(`/api/students/${student.id}/ot/sessions`, {
            items,
            focus: vals.focus || null,
            summary: vals.summary || null,
            homework: vals.homework || null
          });
          const confirmed = res.data?.masteryConfirmed ?? 0;
          toast(
            confirmed > 0
              ? `${res.data?.summary ?? `جلسه ثبت شد — ${fa(items.length)} مهارت`} (تسلط تأییدشده: ${fa(confirmed)})`
              : res.data?.summary ?? `جلسه ثبت شد — ${fa(items.length)} مهارت`,
            'success'
          );
          pending.clear();
          refresh();
          return true;
        } catch (err) { toastError(err); return false; }
      }
    });
  }

  build();
  return root;
}

// ───────── m162 — پنل پیشرفت جلسه به جلسه ─────────

/**
 * پنل «پیشرفت جلسه به جلسه» — داوری عینی روند مداخله (موج m162).
 * progress خروجی GET /api/students/:id/ot/progress است (واکشی در load مشترک — GET رشد نمی‌کند):
 *  · تایم‌لاین جلسات: نوار انباشتهٔ بلد/با کمک/هنوز نه در هر جلسه + تسلط تأییدشدهٔ جدید
 *  · منحنی محوشدن راهنما: توزیع سطح راهنمای «با کمک» هر جلسه
 *  · خط پایهٔ عملکردی (توانبخشی): شش حیطهٔ ce-rehab-fx-v1 با باند و سطح راهنما — مرجع مقایسه
 * بدون جلسه → حالت خالی؛ بدون progress (خطای واکشی) → null.
 */
export function otProgressPanel({ progress, protocolLabel = 'کاردرمانی ذهنی' }) {
  if (!progress) return null;
  const { sessions, baseline, baselineSummary, baselineAt, summary } = progress;
  const faNum = (n) => fa(n);

  // ── نوار انباشتهٔ یک جلسه — سه پاره با flex-grow بر حسب شمار ──
  const trendBar = (s) => el('div', { class: 'ot-trend__bar', role: 'img', 'aria-label': `${fa(s.mastered)} بلد، ${fa(s.withHelp)} با کمک، ${fa(s.notYet)} هنوز نه` },
    s.mastered > 0 ? el('span', { class: 'is-ok', style: { flex: String(s.mastered) } }) : null,
    s.withHelp > 0 ? el('span', { class: 'is-warn', style: { flex: String(s.withHelp) } }) : null,
    s.notYet > 0 ? el('span', { class: 'is-diff', style: { flex: String(s.notYet) } }) : null
  );

  // خط راهنمای جلسه — توزیع سطح راهنمای «با کمک» (منحنی محوشدن راهنما)
  const promptLine = (s) => {
    const parts = Object.entries(OT_PROMPT_LEVELS)
      .filter(([k]) => (s.prompts?.[k] ?? 0) > 0)
      .map(([k, lbl]) => `${lbl} ${fa(s.prompts[k])}`);
    if (!parts.length) return null;
    return el('div', { class: 'ot-trend__prompts' }, icon('compass', 12), `راهنمای این جلسه: ${parts.join(' · ')}`);
  };

  const sessionRows = sessions.map((s) => el('div', { class: 'ot-trend__row' },
    el('div', { class: 'ot-trend__label' },
      el('strong', {}, `جلسهٔ ${faNum(s.ord)}`),
      el('span', {}, formatJalaliDateTime(s.occurredAt))),
    trendBar(s),
    el('div', { class: 'ot-trend__nums' },
      `${fa(s.mastered)} بلد · ${fa(s.withHelp)} با کمک · ${fa(s.notYet)} هنوز نه`,
      s.confirmedNew > 0 ? el('span', { class: 'badge badge--success ot-trend__confirm' }, `تسلط جدید: ${fa(s.confirmedNew)}`) : null),
    promptLine(s)
  ));

  // ── خط پایهٔ عملکردی — شش حیطه با باند رنگی و سطح راهنما (مرجع مقایسه) ──
  const BAND_CLS = { ok: 'badge--success', warn: 'badge--warning', danger: 'badge--error' };
  const baselineBlock = baseline?.length
    ? el('div', { class: 'ot-baseline' },
        el('div', { class: 'clx-sub__title' },
          'خط پایهٔ عملکردی',
          baselineAt ? el('span', { class: 'cell-sub' }, formatJalaliDateTime(baselineAt)) : null),
        baselineSummary ? el('div', { class: 'cell-sub' }, baselineSummary) : null,
        el('div', { class: 'ot-baseline__strip' },
          ...baseline.map((b) => el('span', { class: `ot-baseline__chip` , title: `${b.valueFa} — ${b.band} · سطح راهنما: ${b.prompt}` },
            el('span', { class: 'ot-baseline__label' }, b.label),
            el('span', { class: 'ot-baseline__value' }, b.valueFa),
            el('span', { class: `badge ${BAND_CLS[b.color] ?? 'badge--neutral'} ot-baseline__band` }, b.band))))
      )
    : null;

  const emptyBlock = sessions.length === 0
    ? el('div', { class: 'cell-sub ot-trend__empty' },
        icon('clipboard', 14),
        `هنوز جلسه‌ای ثبت نشده است — پس از ثبت اولین جلسهٔ ${protocolLabel} از چک‌لیست مهارتی، روند پیشرفت (تسلط تأییدشده، محوشدن راهنما و مقایسه با خط پایه) همین‌جا می‌نشیند.`)
    : null;

  return el('div', { class: 'card ot-progress-panel' },
    el('div', { class: 'card__head' },
      el('div', { class: 'card__title' }, icon('trendingUp', 16), 'پیشرفت جلسه به جلسه'),
      summary.sessions > 0 ? el('span', { class: 'badge badge--info' }, `${fa(summary.sessions)} جلسه`) : null,
      summary.sessions > 0 ? el('span', { class: 'badge badge--success' }, `تسلط تأییدشده: ${fa(summary.confirmedMastered)}`) : null,
      summary.withHelp > 0 ? el('span', { class: 'badge badge--warning' }, `با کمک: ${fa(summary.withHelp)}`) : null
    ),
    el('div', { class: 'card__body' },
      baselineBlock,
      emptyBlock ?? el('div', { class: 'ot-trend' }, ...sessionRows),
      sessions.length > 0 && baselineBlock
        ? el('div', { class: 'cell-sub ot-trend__note' }, icon('compass', 12), ' مقایسهٔ روند با خط پایه: بهبود پایدار یعنی تسلط‌های تأییدشده در حیطه‌های پرچم‌دار خط پایه رشد کند و سطح راهنمای «با کمک» جلسه‌به‌جلسه کم شود.')
        : null
    )
  );
}
