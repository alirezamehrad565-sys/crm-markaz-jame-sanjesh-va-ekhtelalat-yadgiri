/* student-narrative.js — تب «روایت بالینی» پروفایل دانش‌آموز (POLISH-3 M3 — ۱.۲۷.۲۶)
 *
 * نقد داستان‌محور (docs/PRODUCT-STORY-CRITIQUE.fa.md — سفر ۲): فرضیهٔ موتور، مصوبهٔ کمیته،
 * مسیر مداخله و نتیجهٔ پراپ هرکدام در جای جدا رندر می‌شدند و هیچ‌جا «روایت پیوستهٔ پرونده»
 * دیده نمی‌شد. این تب همان روایت است: خط زمان فقط‌خواندنی «از فرضیه تا نتیجه» با مُهر تاریخ.
 * منبع: GET /api/students/:id/clinical-narrative — تجمیع از دادهٔ موجود؛ بدون دادهٔ تازه،
 * بدون فرم و بدون ورودی کاربر. رندر با همان سیستم tl-* تب «تاریخچه» تا زبان بصری یکی بماند.
 */
import { api } from './api.js';
import { el, icon, emptyState, errorState, loadingState } from './ui.js';
import { fa, formatJalaliNumeric, tehranYmdOfIso } from './format.js';
import { CONFIDENCE_BADGE, PATH_STATUS_BADGE, PATH_STATUS_LABEL, DECISION_LABEL } from './clinical-content.js';

/* برچسب/بج وضعیت مصوبهٔ کمیته — هم‌تراز ماتریس committee در pure.ts */
const DECISION_STATUS_BADGE = {
  approved: 'badge--success',
  rejected: 'badge--error',
  deferred: 'badge--neutral',
  pending: 'badge--warning'
};
const DECISION_STATUS_LABEL = {
  approved: 'مصوب',
  rejected: 'ردشده',
  deferred: 'واگذارشده به بعد',
  pending: 'در انتظار مصوبه'
};
const MEETING_STATUS_LABEL = { planned: 'برنامه‌ریزی‌شده', held: 'برگزارشده', cancelled: 'لغوشده' };

const dayStamp = (at) => (at ? formatJalaliNumeric(tehranYmdOfIso(at)) : '—');
const round1 = (v) => Math.round((v ?? 0) * 10) / 10;

/* یک ردیف خط زمان — همان الگوی tl-item تب تاریخچه (دات آیکون‌دار + کارت) */
function narEvent({ at, tone, icon: iconName, title, time, badgeText, badgeClass, sub, body }) {
  return el('div', { class: 'tl-item' },
    el('div', { class: `tl-item__dot tl-item__dot--${tone}` }, icon(iconName, 17)),
    el('div', { class: 'tl-item__card' },
      el('div', { class: 'tl-item__head' },
        el('span', { class: 'tl-item__title' }, title),
        badgeText ? el('span', { class: `badge ${badgeClass}` }, badgeText) : null,
        el('span', { class: 'tl-item__time' }, time ?? dayStamp(at))),
      sub ? el('div', { class: 'tl-item__sub' }, sub) : null,
      body ? el('div', { class: 'tl-item__sub' }, body) : null));
}

/* اسنپ‌شات فرضیهٔ موتور: اعتماد + امتیاز + جمع معیارها + سه شاهد برتر */
function hypothesisBody(h) {
  const crit = h.criteriaSummary ?? {};
  const ev = (h.evidenceFa ?? []).slice(0, 3);
  return el('div', { style: { marginTop: 'var(--sp-2)' } },
    el('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', alignItems: 'center' } },
      h.confidence ? el('span', { class: `badge ${CONFIDENCE_BADGE[h.confidence] ?? 'badge--neutral'}` }, `اعتماد: ${h.confidence}`) : null,
      el('span', { class: 'badge badge--neutral' }, `امتیاز: ${fa(h.score ?? 0)}`),
      el('span', { class: 'badge badge--neutral' }, `معیارها: ${fa(crit.met ?? 0)} کامل · ${fa(crit.partial ?? 0)} نیمه · ${fa(crit.unknown ?? 0)} نامعلوم · ${fa(crit.notMet ?? 0)} نارده`)),
    ev.length ? el('div', { class: 'tl-item__sub', style: { marginTop: 'var(--sp-2)' } }, `شواهد: ${ev.join(' · ')}`) : null);
}

function pathEvents(p) {
  const events = [];
  // ① فرضیهٔ موتور + ساخت مسیر — نقطهٔ آغاز روایت
  events.push({
    at: p.createdAt,
    tone: 'accent',
    icon: 'compass',
    title: `مسیر مداخله: ${p.targetTitle}`,
    badgeText: PATH_STATUS_LABEL[p.status] ?? p.status,
    badgeClass: PATH_STATUS_BADGE[p.status] ?? 'badge--neutral',
    body: p.engineHypothesis
      ? hypothesisBody(p.engineHypothesis)
      : el('div', { class: 'tl-item__sub', style: { marginTop: 'var(--sp-2)' } }, 'هدف دستی درمانگر — بدون فرضیهٔ موتور (مسیر بدون اسنپ‌شات علمی ساخته شده است).')
  });
  // ② تصمیم درمانگر روی فرضیه
  if (p.decision) {
    events.push({
      at: p.decision.at,
      tone: p.decision.action === 'confirm' ? 'success' : p.decision.action === 'reject' ? 'error' : 'warning',
      icon: 'check',
      title: `تصمیم درمانگر: ${DECISION_LABEL[p.decision.action] ?? p.decision.action}`,
      sub: p.decision.byName ? `${p.decision.byName}` : null,
      body: p.decision.note ?? null
    });
  }
  // ③ جلسات مسیر — خلاصه (نه ردیف‌به‌ردیف؛ جزئیات در تب جلسات و تفسیر بالینی است)
  if (p.sessionsPlanned > 0) {
    events.push({
      at: p.lastSessionDoneAt ?? p.createdAt,
      tone: 'neutral',
      icon: 'calendar',
      title: `جلسات مسیر: ${fa(p.sessionsDone)} برگزارشده از ${fa(p.sessionsPlanned)}${p.sessionsSkipped ? ` — ${fa(p.sessionsSkipped)} رهاشده` : ''}`
    });
  }
  // ④ نتیجهٔ پراپ — «از فرضیه تا نتیجه» همین‌جا بسته می‌شود
  if (p.probeTrend && p.probeTrend.count > 0) {
    const t = p.probeTrend;
    const mastered = p.probeSummary?.masteredMetric;
    const dir = t.improved === true ? 'روند بهبود' : t.improved === false ? 'بدون بهبود' : '—';
    events.push({
      at: t.lastAt,
      tone: mastered ? 'success' : t.improved === true ? 'success' : t.improved === false ? 'warning' : 'neutral',
      icon: 'zap',
      title: `نتیجهٔ پراپ — ${t.metric}: ${fa(round1(t.last))}${t.unit ? ' ' + t.unit : ''}`,
      badgeText: mastered ? 'ملاک تسلط' : null,
      badgeClass: 'badge--success',
      body: el('div', { class: 'tl-item__sub', style: { marginTop: 'var(--sp-2)' } },
        `${fa(t.count)} سنجش از ${dayStamp(t.firstAt)} — ${dir}${t.first != null ? ` (اولین سنجش: ${fa(round1(t.first))})` : ''}${mastered ? ` · ملاک تسلط روی «${mastered}» گذرانده شد` : ''}`)
    });
  }
  return events;
}

function committeeEvent(c) {
  return {
    // مُهر روزمحور جلسهٔ کمیته — ساعت بی‌معناست، ترتیب روزها ملاک است
    at: `${c.meetingDate}T12:00:00Z`,
    tone: c.decisionStatus === 'approved' ? 'success' : c.decisionStatus === 'rejected' ? 'error' : c.decisionStatus === 'pending' ? 'warning' : 'neutral',
    icon: 'users',
    title: `مصوبهٔ کمیته: ${c.topic}`,
    badgeText: DECISION_STATUS_LABEL[c.decisionStatus] ?? c.decisionStatus,
    badgeClass: DECISION_STATUS_BADGE[c.decisionStatus] ?? 'badge--neutral',
    sub: `${c.meetingTitle} · ${MEETING_STATUS_LABEL[c.meetingStatus] ?? c.meetingStatus}`,
    body: c.decision ?? null
  };
}

export async function renderNarrativeTab(box, { student }) {
  box.replaceChildren(loadingState('روایت بالینی…'));
  let data;
  try {
    data = (await api.get(`/api/students/${student.id}/clinical-narrative`)).data ?? {};
  } catch (err) {
    box.replaceChildren(errorState(err, () => renderNarrativeTab(box, { student })));
    return;
  }
  const committee = data.committee ?? [];
  const paths = data.paths ?? [];
  if (committee.length === 0 && paths.length === 0) {
    // حالت خالی راهنما — پذیرش M3: بدون مسیر، روایت غیب نمی‌شود؛ راهِ ساختنش نشان داده می‌شود
    box.replaceChildren(el('div', { class: 'card' },
      el('div', { class: 'card__body' },
        emptyState({
          iconName: 'book',
          title: 'هنوز روایتی برای این پرونده ثبت نشده است',
          hint: 'روایت بالینی از سه قطعه ساخته می‌شود: فرضیهٔ موتور و مسیر مداخله (از تب «تفسیر بالینی»)، مصوبه‌های کمیته، و نتیجهٔ پراپ‌ها. با ساختن اولین مسیر مداخله، همین‌جا خط زمانِ «از فرضیه تا نتیجه» شکل می‌گیرد.'
        }))));
    return;
  }

  const events = [...committee.map(committeeEvent), ...paths.flatMap(pathEvents)]
    .filter((e) => e.at)
    .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0)); // قدیمی → جدید: خوانش داستان از فرضیه تا نتیجه

  const header = el('div', { class: 'card', style: { marginBottom: 'var(--sp-4)' } },
    el('div', { class: 'card__head' }, el('div', { class: 'card__title' }, icon('book', 16), 'روایت بالینی — از فرضیه تا نتیجه')),
    el('div', { class: 'card__body' },
      el('div', { class: 'cell-sub' }, `خط زمان فقط‌خواندنی پرونده — ${data.storyFrom ? `از ${formatJalaliNumeric(data.storyFrom)}` : ''}${data.storyTo ? ` تا ${formatJalaliNumeric(data.storyTo)}` : ''} · ${fa(paths.length)} مسیر مداخله · ${fa(committee.length)} مصوبهٔ کمیته`),
      el('div', { class: 'cell-sub', style: { marginTop: 'var(--sp-2)' } }, 'این روایت همان چیزی است که در گزارش اداره و گفت‌وگو با خانواده روایت می‌شود: تشخیص چگونه ساخته شد، چه تصمیمی گرفته شد، و چه نتیجه‌ای داده است.')));

  const list = el('div', { class: 'tl-list' }, ...events.map(narEvent));
  box.replaceChildren(header, list);
}
