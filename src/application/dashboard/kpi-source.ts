/**
 * ۱.۲۷.۸۰ (architecture-001 — sdt157) — تجمیع KPI داشبورد از لایهٔ مسیریابی به سرویس منتقل شد
 * (change_boundary یافتهٔ ممیزی؛ done_when: createApp هندلر چندخطی منطق‌دار ندارد).
 * منطق عیناً از api-routing/index.ts (بخش «فاز F») منتقل شده است: همان ۱۱ منبع موازی، همان
 * گارد نقش‌ها (درمانگر فقط‌خواندنی؛ دفتر؛ مدیر) و همان قرارداد «شکست تک‌بخشی → null» (part()).
 * ۱.۲۷.۸۴ (architecture-006): تابلوی پیشرفت دیگر با بازسازی Request صدا زده نمی‌شود —
 * ورودی خالص scoringBoardForEnv از هستهٔ مشترک @core/scoring مستقیم خوانده می‌شود (actor همین‌جا
 * احراز شده است؛ بوک‌مارک نشست فقط متعلق به مسیر HTTP /api/scoring است نه محاسبهٔ KPI).
 */
import { DashboardSummaryQuerySchema, DashboardTodayQuerySchema } from '@core/shared';
import type { AppBindings, AuthContext } from '@core/shared';
import { scoringBoardForEnv } from '@core/scoring/scoring.js';
import type { DashboardService } from './service';
import type { KnowledgeService } from '@domain/knowledge';
import type { AnnouncementService } from '@domain/announcements';
import type { WaitlistService } from '@domain/waitlist';
import type { AppointmentService } from '@domain/appointment-core';
import type { FollowUpsService } from '@domain/followups';
import type { ClinicalEngineService } from '@domain/clinical-engine';

export interface DashboardKpiDeps {
  dashboard: DashboardService;
  knowledge: KnowledgeService;
  announcements: AnnouncementService;
  waitlist: WaitlistService;
  appointments: AppointmentService;
  followups: FollowUpsService;
  clinicalEngine: ClinicalEngineService;
}

/** پرس‌وجوی خام مسیر (پیش از اعتبارسنجی — اسکیما درون سرویس parse می‌شود، همان پیش‌فرض‌های قبلی) */
export interface DashboardKpiQuery {
  date?: string;
  from: string;
  to: string;
  apptFrom?: string;
  apptTo?: string;
}

/** زمینهٔ فراخوانی که بازسازی Request برای scoring لازم دارد (url/headers/env از context می‌آید) */
export interface DashboardKpiCall {
  url: string;
  headers: Headers;
  env: AppBindings;
}

export interface DashboardKpiService {
  getKpis(
    actor: AuthContext,
    query: DashboardKpiQuery,
    call: DashboardKpiCall
  ): Promise<{
    today: unknown;
    summary: unknown;
    goal: unknown;
    scoring: unknown;
    me: unknown;
    knowledge: unknown;
    announcements: unknown;
    waitlist: unknown;
    dayAppts: unknown;
    followups: unknown;
    validation: unknown;
  }>;
}

export function createDashboardKpiService(deps: DashboardKpiDeps): DashboardKpiService {
  const { dashboard } = deps;

  async function getKpis(
    actor: AuthContext,
    query: DashboardKpiQuery,
    call: DashboardKpiCall
  ): Promise<{
    today: unknown;
    summary: unknown;
    goal: unknown;
    scoring: unknown;
    me: unknown;
    knowledge: unknown;
    announcements: unknown;
    waitlist: unknown;
    dayAppts: unknown;
    followups: unknown;
    validation: unknown;
  }> {
    const role = actor.role;
    const isTherapist = role === 'therapist';
    const isOffice = role === 'manager' || role === 'secretary';
    const isManager = role === 'manager';

    const date = DashboardTodayQuerySchema.parse({ date: query.date || undefined }).date;
    const range = DashboardSummaryQuerySchema.parse({
      from: query.from || '',
      to: query.to || ''
    });

    const part = <T>(p: Promise<T>): Promise<T | null> => p.catch(() => null);

    const scoringP = part(scoringBoardForEnv(call.env as unknown as { DB: unknown }, 'month'));

    const [today, summary, goal, scoring, me, knowledge, announcements, waitlist, dayAppts, followups, validation] =
      await Promise.all([
        isTherapist ? Promise.resolve(null) : part(dashboard.getTodayCards(date)),
        isTherapist ? Promise.resolve(null) : part(dashboard.getPeriodSummary(range.from, range.to)),
        isOffice ? part(dashboard.getScreeningGoal()) : Promise.resolve(null),
        scoringP,
        part(dashboard.getMyStats(actor.staffId)),
        part(deps.knowledge.listPublished()),
        part(deps.announcements.listPanel()),
        isOffice ? part(deps.waitlist.list({})) : Promise.resolve(null),
        isOffice
          ? part(deps.appointments.list({ from: query.apptFrom || undefined, to: query.apptTo || undefined }))
          : Promise.resolve(null),
        isOffice ? part(deps.followups.list({ group: 'open' }, actor)) : Promise.resolve(null),
        isManager
          ? part(
              Promise.all([
                part(deps.clinicalEngine.getValidationKpis(actor)),
                part(deps.clinicalEngine.listCaseAudits(actor, null))
              ]).then(([k, a]) => (k ? { kpis: k, audits: a ?? [] } : null))
            )
          : actor.role === 'therapist'
            ? /* M6 POLISH-3 (۱.۲۷.۲۹) — نمای فقط‌خواندنی درمانگر: حسابرسی پرونده‌های خودش (KPIهای دفتر نمی‌آید) */
              part(deps.clinicalEngine.listCaseAudits(actor, null).then((a) => ({ kpis: null, audits: a ?? [] })))
            : Promise.resolve(null)
      ]);

    return { today, summary, goal, scoring, me, knowledge, announcements, waitlist, dayAppts, followups, validation };
  }

  return { getKpis };
}
