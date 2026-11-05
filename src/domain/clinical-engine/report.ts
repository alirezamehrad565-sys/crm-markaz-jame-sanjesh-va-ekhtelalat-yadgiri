// گزارش دوره‌ای طرح درمان: تجمیع خالص جلسات/کارت‌ها و پاراگراف خانواده.
// این فایل هیچ دسترسی به دیتابیس ندارد — service.ts رکوردها را می‌دهد و این‌جا فقط محاسبه و قالب است
// (گزارش read-only است و هیچ‌جا persist نمی‌شود).
import { faDigits } from '@core/shared';
import type {
  PathSessionRecord,
  PathwayReport,
  PathwayReportMonitoring,
  PathwayReportSession,
  PathwayReportSummary,
  InterventionPathRecord,
  PathProbeSeries,
  ReportParentVariant,
  ReportSchoolVariant
} from './types';

// ─── پاسخ عددی سه پرسش گزارش: تسلط؟ روند؟ تصمیم پیشنهادی؟ + دوز و وفاداری ───
export function buildMonitoring(
  metrics: PathProbeSeries[],
  summary: PathwayReportSummary,
  sessions: PathSessionRecord[]
): PathwayReportMonitoring {
  // سنجهٔ اصلی = پراپ با بیشترین داده — گزارش یک پاسخ روشن می‌دهد نه جدول
  const primary = [...metrics].sort((a, b) => b.count - a.count)[0] ?? null;
  const doseTotal = summary.sessionsDone + summary.sessionsSkipped + summary.sessionsPlanned;
  const fidelitySessions = sessions.filter((s) => s.status === 'done' && s.fidelity);
  const fidelityPct = fidelitySessions.length
    ? Math.round((fidelitySessions.reduce((acc, s) => acc + ((s.fidelity?.protocol ? 1 : 0) + (s.fidelity?.homework ? 1 : 0) + (s.fidelity?.parent ? 1 : 0)), 0) / (fidelitySessions.length * 3)) * 100)
    : null;
  return {
    metric: primary?.metric ?? null,
    points: primary?.count ?? 0,
    masteryPct: primary && primary.mastery.threshold > 0 && primary.latestValue != null
      ? Math.round((primary.latestValue / primary.mastery.threshold) * 100)
      : null,
    masteryAchieved: primary ? primary.mastery.achieved : null,
    slopePerSession: primary ? Math.round(primary.slope * 100) / 100 : null,
    trendKey: primary?.verdict.key ?? null,
    fourPointKey: primary?.monitor.fourPoint.key ?? null,
    decision: primary?.monitor.stall.key ?? null,
    decisionLabel: primary?.monitor.stall.label ?? null,
    dosePlanned: doseTotal,
    doseDone: summary.sessionsDone,
    doseAdherencePct: doseTotal > 0 ? Math.round((summary.sessionsDone / doseTotal) * 100) : null,
    fidelityPct
  };
}

// نتیجهٔ جلسه در پاراگراف خانواده کوتاه می‌ماند؛ متن کامل در جدول جلسات گزارش هست
const FAMILY_OUTCOME_MAX = 140;

function outcomeOf(r: PathSessionRecord): string | null {
  const t = r.outcome?.trim();
  return t ? t : null;
}

export function summarizeSessions(sessions: PathSessionRecord[]): PathwayReportSummary {
  let sessionsDone = 0;
  let sessionsSkipped = 0;
  let sessionsPlanned = 0;
  let cardsTotal = 0;
  let cardsDone = 0;
  let probeCardsPlanned = 0;
  let probeCardsDone = 0;
  let doneWithOutcome = 0;
  let doneDateFirst: string | null = null;
  let doneDateLast: string | null = null;

  for (const s of sessions) {
    if (s.status === 'done') sessionsDone += 1;
    else if (s.status === 'skipped') sessionsSkipped += 1;
    else sessionsPlanned += 1;
    for (const it of s.items) {
      cardsTotal += 1;
      if (it.done) cardsDone += 1;
      if (it.type === 'probe') {
        probeCardsPlanned += 1;
        if (it.done) probeCardsDone += 1;
      }
    }
    if (s.status !== 'done') continue;
    if (outcomeOf(s)) doneWithOutcome += 1;
    // done_at مهرِ ملاک گزارش است؛ رکورد بدون آن (دادهٔ قدیمی خراب) در بازهٔ اول/آخر حساب نمی‌شود
    if (!s.doneAt) continue;
    if (!doneDateFirst || s.doneAt < doneDateFirst) doneDateFirst = s.doneAt;
    if (!doneDateLast || s.doneAt > doneDateLast) doneDateLast = s.doneAt;
  }

  // مرتب‌سازی برای اولین/آخرین نتیجه بر اساس مهر زمانیِ انجام — نه ترتیب برنامه
  const doneOrdered = sessions
    .filter((s) => s.status === 'done' && s.doneAt)
    .sort((a, b) => (a.doneAt as string).localeCompare(b.doneAt as string));
  const firstOutcome = doneOrdered.length ? outcomeOf(doneOrdered[0]) : null;
  const latestOutcome = doneOrdered.length ? outcomeOf(doneOrdered[doneOrdered.length - 1]) : null;

  return {
    sessionsTotal: sessions.length,
    sessionsDone,
    sessionsSkipped,
    sessionsPlanned,
    outcomeCoverage: sessionsDone > 0 ? doneWithOutcome / sessionsDone : null,
    cardsTotal,
    cardsDone,
    cardsDonePct: cardsTotal > 0 ? Math.round((cardsDone / cardsTotal) * 100) : null,
    probeCardsPlanned,
    probeCardsDone,
    firstOutcome,
    latestOutcome,
    doneDateFirst,
    doneDateLast
  };
}

function sessionToReport(s: PathSessionRecord): PathwayReportSession {
  return {
    ord: s.ord,
    title: s.title,
    status: s.status,
    goal: s.plan,
    criterion: s.criterion,
    outcome: outcomeOf(s),
    doneAt: s.doneAt,
    cards: s.items,
    cardsDone: s.items.filter((it) => it.done).length,
    cardsTotal: s.items.length
  };
}

// پاراگراف «خلاصه برای خانواده»: قطعی و بدون LLM؛ فقط قالب رشته با اعداد واقعی،
// بی‌اصطلاح فنی و محترمانه — همان چیزی که می‌شود مستقیم برای والد خواند.
// وقتی بازهٔ مشخصی خواسته شده و هیچ جلسه‌ای در آن نبوده، پیامِ «شروع نشده» گمراه‌کننده است — پیام دوره‌ای می‌دهد.
export function familySummaryParagraph(
  summary: PathwayReportSummary,
  hasPeriod = false
): string {
  const parts: string[] = [];
  if (summary.sessionsDone > 0) {
    let first = `در این دوره ${faDigits(summary.sessionsDone)} جلسه برگزار شد`;
    if (summary.sessionsSkipped > 0) {
      first += `؛ ${faDigits(summary.sessionsSkipped)} جلسه هم برنامه‌ریزی شده بود اما اجرا نشد`;
    }
    parts.push(`${first}.`);
    if (summary.cardsTotal > 0) {
      const pct = summary.cardsDonePct;
      parts.push(
        `از ${faDigits(summary.cardsTotal)} تمرین و کارت برنامه، ${faDigits(summary.cardsDone)} کارت انجام شد` +
          (pct != null ? ` (${faDigits(pct)}٪)` : '') + '.'
      );
      if (summary.probeCardsPlanned > 0) {
        parts.push(
          `سنجش کوتاه پیشروی در ${faDigits(summary.probeCardsPlanned)} نقطهٔ برنامه‌ریزی‌شده ثبت شد` +
            (summary.probeCardsDone > 0 ? ` و ${faDigits(summary.probeCardsDone)} مورد آن انجام شده است.` : '.')
        );
      }
    } else {
      parts.push('در جلسات این دوره کارت تمرینی ثبت نشده بود.');
    }
    const latest = summary.latestOutcome?.trim().slice(0, FAMILY_OUTCOME_MAX);
    if (latest) parts.push(`آخرین نتیجه‌ای که درمانگر ثبت کرده است: «${latest}».`);
  } else if (hasPeriod) {
    parts.push('در این بازه جلسه‌ای برگزار نشده است.');
    if (summary.sessionsSkipped > 0) {
      parts.push(`${faDigits(summary.sessionsSkipped)} جلسهٔ برنامه‌ریزی‌شدهٔ این دوره اجرا نشده و در جلسهٔ بعد جبران می‌شود.`);
    }
  } else if (summary.sessionsPlanned > 0 || summary.sessionsSkipped > 0) {
    parts.push('در این دوره هنوز جلسه‌ای انجام نشده است.');
    if (summary.sessionsPlanned > 0) {
      parts.push(`${faDigits(summary.sessionsPlanned)} جلسه در برنامهٔ درمان ثبت شده و منتظر اجراست.`);
    }
    if (summary.sessionsSkipped > 0) {
      parts.push(`${faDigits(summary.sessionsSkipped)} جلسه هم اجرا نشده و در جلسهٔ بعد جبران می‌شود.`);
    }
  } else {
    parts.push('برای این طرح درمان هنوز جلسه‌ای ثبت نشده است.');
    parts.push('پس از برگزاری جلسات، خلاصهٔ پیشرفت به‌طور خودکار همین‌جا نوشته می‌شود.');
  }
  return parts.join(' ');
}

export function buildPathwayReport(
  path: InterventionPathRecord,
  sessions: PathSessionRecord[],
  period: { from: string | null; to: string | null },
  metrics: PathProbeSeries[] = [] // پراپ‌های مسیر برای پاسخ عددی سه پرسش
): PathwayReport {
  const summary = summarizeSessions(sessions);
  const hasPeriod = Boolean(period.from || period.to);
  const monitoring = buildMonitoring(metrics, summary, sessions); // 
  return {
    pathway: {
      id: path.id,
      studentId: path.studentId,
      studentName: path.studentName,
      targetKey: path.targetKey,
      targetTitle: path.targetTitle,
      status: path.status,
      templateTitle: path.templateTitle,
      createdAt: path.createdAt,
      reassessAt: path.reassessAt
    },
    period: { from: period.from, to: period.to },
    summary,
    sessions: sessions.map(sessionToReport),
    monitoring, // 
    parent: parentVariantOf(path, summary, monitoring), // سه گزارش از یک داده
    school: schoolVariantOf(path, summary, monitoring, sessions), // 
    familySummary: familySummaryParagraph(summary, hasPeriod)
  };
}

// ─── سه گزارش متفاوت از یک داده — هیچ ورودی دستی جدیدی لازم نیست ───
// (شکل واریانت‌ها در types.ts — ReportParentVariant / ReportSchoolVariant)

export function parentVariantOf(
  path: InterventionPathRecord,
  summary: PathwayReportSummary,
  monitoring: PathwayReportMonitoring
): ReportParentVariant {
  const name = path.studentName;
  const paragraphs: string[] = [];
  if (summary.sessionsDone > 0) {
    paragraphs.push(`${name} در این دوره ${faDigits(summary.sessionsDone)} جلسه از برنامهٔ تمرین را انجام داده است.`);
  } else {
    paragraphs.push(`برای ${name} هنوز جلسه‌ای از برنامهٔ تمرین اجرا نشده است؛ به‌زودی جلسات آغاز می‌شود.`);
  }
  if (summary.cardsTotal > 0) {
    paragraphs.push(`از تمرین‌های برنامه‌ریزی‌شده، ${faDigits(summary.cardsDone)} کارت انجام شده است` + (summary.cardsDonePct != null ? ` (حدود ${faDigits(summary.cardsDonePct)} درصد).` : '.'));
  }
  if (monitoring.masteryPct != null) {
    paragraphs.push(monitoring.masteryAchieved
      ? `خبر خوب: در آخرین سنجش، عملکرد ${name} به هدف تعیین‌شده رسیده است.`
      : `در آخرین سنجش، عملکرد ${name} به حدود ${faDigits(monitoring.masteryPct)} درصد هدف رسیده است — مسیر پیشرفت ادامه دارد.`);
  }
  if (summary.latestOutcome) {
    paragraphs.push(`آخرین نتیجهٔ ثبت‌شدهٔ درمانگر: «${summary.latestOutcome.slice(0, 140)}».`);
  }
  const decisionTip: Record<string, string> = {
    continue: 'پیشرفت خوب است — همین برنامهٔ تمرین در خانه هم به همان شکل ادامه یابد.',
    dose: 'پیشنهاد ما: مقدار و تناوب تمرین در خانه کمی بیشتر شود (مثلاً هر روز ده دقیقه).',
    change: 'پیشنهاد ما: روش تمرین کمی تغییر می‌کند — در جلسهٔ بعد با شما هماهنگ می‌شود.',
    none: 'هدف فعلی برآورده شده است — برنامهٔ تازه با هدف‌های بالاتر تنظیم می‌شود.'
  };
  const tips = [
    monitoring.decision ? (decisionTip[monitoring.decision] ?? 'تمرین‌ها را کوتاه اما هر روز و بدون وقفه ادامه دهید.') : 'تمرین‌ها را کوتاه اما هر روز و بدون وقفه ادامه دهید.',
    'موفقیت‌های کوچک را ببینید و تشویق کنید — تشویق شما مهم‌ترین سوخت تمرین است.',
    monitoring.fidelityPct != null && monitoring.fidelityPct < 100
      ? 'شرکت در جلسات و هماهنگی با درمانگر را کامل نگه دارید؛ پیوستگی خانواده اثر درمان را چند برابر می‌کند.'
      : 'اگر پرسشی دربارهٔ تمرین‌ها دارید، پیش از جلسهٔ بعد با مرکز در تماس باشید.'
  ];
  return { headline: `گزارش پیشرفت ${name} — برای خانواده`, paragraphs, tips };
}

export function schoolVariantOf(
  path: InterventionPathRecord,
  summary: PathwayReportSummary,
  monitoring: PathwayReportMonitoring,
  sessions: PathSessionRecord[]
): ReportSchoolVariant {
  const name = path.studentName;
  const performance: string[] = [
    `${name} در برنامهٔ مداخلهٔ «${path.targetTitle}» قرار دارد` + (path.goal ? ` با هدف: «${path.goal}».` : '.'),
    `تاکنون ${faDigits(summary.sessionsDone)} جلسه از ${faDigits(summary.sessionsDone + summary.sessionsSkipped + summary.sessionsPlanned)} جلسهٔ برنامه‌ریزی‌شده برگزار شده است` + (monitoring.doseAdherencePct != null ? ` (پایبندی ${faDigits(monitoring.doseAdherencePct)} درصد).` : '.')
  ];
  if (monitoring.trendKey) {
    const trendFa: Record<string, string> = {
      improving: 'روند عملکرد صعود روشن دارد',
      gradual: 'روند عملکرد صعود آرام اما پیوسته دارد',
      plateau: 'عملکرد در حال حاضر تقریباً ثابت است',
      insufficient: 'دادهٔ سنجش هنوز برای قضاوت روند کافی نیست',
      slight_decline: 'افت خفیف در سنجش‌ها دیده می‌شود',
      regressed: 'افت روشن در سنجش‌ها دیده می‌شود'
    };
    performance.push(`${trendFa[monitoring.trendKey] ?? monitoring.trendKey}` + (monitoring.points ? ` (${faDigits(monitoring.points)} سنجش کوتاه روی سنجهٔ «${monitoring.metric}»).` : '.'));
  }
  if (summary.cardsTotal > 0) {
    performance.push(`انجام تکالیف جلسات: ${faDigits(summary.cardsDone)} از ${faDigits(summary.cardsTotal)} کارت تمرینی تکمیل شده است.`);
  }
  const actions: string[] = [];
  const decisionAction: Record<string, string> = {
    continue: 'همکاری فعلی ادامه یابد؛ همان سنجش کوتاه هفتگی در کلاس تکرار شود.',
    dose: 'تناوب تمرین کوتاه در کلاس بیشتر شود (دو نوبت کوتاه در روز به‌جای یک نوبت بلند).',
    change: 'جلسهٔ مشترک معلم و درمانگر برای بازنگری روش مداخله برگزار شود.',
    none: 'هدف فعلی برآورده شده است — برای تعیین هدف بعدی با مرکز هماهنگ شود.'
  };
  if (monitoring.decision) actions.push(decisionAction[monitoring.decision] ?? 'هماهنگی هفتگی خانه-مدرسه ادامه یابد.');
  actions.push('سنجهٔ کوتاه همان تمرین مرکز (مثلاً واژهٔ درست در دقیقه) هفته‌ای یک‌بار در کلاس ثبت شود تا مقایسه ممکن بماند.');
  actions.push(monitoring.fidelityPct != null && monitoring.fidelityPct < 100
    ? 'پیوستگی اجرای تمرین‌ها بین جلسات تقویت شود — یادآوری تکلیف در کلاس اثر مستقیم دارد.'
    : 'تکالیف تمرین خانگی از بانک تمرین مرکز تأمین می‌شود؛ پیشنهادها را در برنامهٔ شب دانش‌آموز بگنجانید.');
  const lastOutcome = sessions.filter((s) => s.status === 'done' && s.outcome).pop()?.outcome?.trim();
  if (lastOutcome) actions.push(`آخرین مشاهدهٔ جلسهٔ مداخله برای هماهنگی کلاس: «${lastOutcome.slice(0, 160)}».`);
  return { headline: `گزارش همکاری با مدرسه — ${name}`, performance, actions };
}
