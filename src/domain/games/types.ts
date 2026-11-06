// types.ts — بستر بک‌اند بازی (M1 / ۱.۲۵.۰۷) — قرارداد §۳ و §۴ نقشهٔ راه
import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { ProtocolSnapshot } from './protocol';

export type MetricFormula =
  | 'accuracy'
  | 'numline_error'
  | 'median_rt'
  | 'commission'
  | 'omission'
  | 'correct_go_pct'
  | 'correct_nogo_pct'
  | 'commission_pct'
  | 'omission_pct'
  | 'none';
export type MetricUnit = 'percent' | 'count' | 'ms' | 'score';
export type MetricSource = 'auto' | 'human';
export type EvidenceLevel = 'A' | 'B' | 'C';
export type PackageStatus = 'draft' | 'review' | 'published' | 'retired';
export type LinkState = 'parent_pre' | 'child_active' | 'child_done' | 'parent_gate' | 'parent_post' | 'closed';
export type SessionValidity = 'valid' | 'partial' | 'invalid';
export type MissionStatus = 'pending' | 'in_progress' | 'done' | 'expired';

export interface GameDose {
  days_per_week: number;
  minutes: number;
  max_missions_per_day: number;
  min_weeks: number;
}

/** دو حالت مستقل دفترچهٔ وظیفه — تمرین و ارزیابی هرگز تنظیمات/داده/گزارش مشترک ندارند */
export type PackageMode = 'training' | 'assessment';

/** ارجاع نسخه‌دار به پروتکل — ارزیابی بدون پروتکل نسخه‌دار انتشار نمی‌گیرد */
export interface PackageProtocolRef {
  id: string;
  version: string;
}

/** آیتم مأموریت داخل JSON بسته — کلیدهای پاسخ فقط همین‌جا می‌مانند و هرگز به کلاینت نمی‌روند */
export interface MissionItem {
  id: string;
  phase: 'train' | 'probe';
  type: 'choice' | 'numline' | 'touch_report';
  prompt?: string;
  options?: { label: string }[];
  /** گزینهٔ درست (اندیس) برای choice یا جای درست روی خط عددی برای numline */
  correct?: number;
  /** پاسخ درست لمسی برای touch_report (go=true / nogo=false) */
  correct_touch?: boolean;
  /** گسترهٔ خط عددی [min,max] */
  range?: [number, number];
  stim?: Record<string, unknown>;
  media?: { image?: string; audio?: string } | null;
}

export interface MissionConfig {
  id: string;
  game: string;
  goal: string;
  metric: string;
  /** سنجه‌های چندگانهٔ همان مأموریت (مثل چهار سنجهٔ گو/نوگو)؛ `metric` اولین و اصلی است */
  metrics?: string[];
  title?: string;
  /** کف اعتبار زمان واکنش (ms)؛ پیش‌فرض: touch_report=۱۵۰، بقیه=۲۰۰ (§۸) */
  rt_floor_ms?: number;
  probe?: { items: number; feedback: boolean; position: 'start' | 'end' };
  mastery?: { threshold: number | null; sessions?: number };
  items: MissionItem[];
}

/** قرارداد §۴ — بدنهٔ JSON بستهٔ محتوا */
export interface PackageBody {
  package_id: string;
  goals: string[];
  /** دو حالت مستقل (فاز ۱ بازطراحی) — ناموجود = training (سازگاری با بسته‌های قبلی) */
  mode?: PackageMode;
  /** ارجاع نسخه‌دار پروتکل — در ارزیابی اجباری است؛ در تمرین پیشنهادی */
  protocol?: PackageProtocolRef;
  /** کلید خاموشی سازگاری (فاز ۶) — فقط تمرین اثر دارد؛ پیش‌فرض فعال */
  adaptive_enabled?: boolean;
  age?: { min: number; max: number };
  mastery?: { threshold: number | null; sessions?: number };
  tone_rules?: string[];
  /** بستهٔ واجی: گیت جفت هم‌آوا فعال می‌شود (§۴ — هیچ تمایز شنیداری از جفت هم‌آوا) */
  pa_phonemic?: boolean;
  missions: MissionConfig[];
  parent_copy?: Record<string, unknown>;
}

export interface RegistryMetric {
  id: string;
  title_fa: string;
  unit: MetricUnit;
  higher_is_better: boolean;
  source: MetricSource;
  formula: MetricFormula;
}

export interface RegistryGoal {
  id: string;
  title_fa: string;
  package_id: string;
  metric_id: string;
  age_min: number | null;
  age_max: number | null;
}

export interface PackageUpsertInput {
  packageId: string;
  version: string;
  titleFa: string;
  evidenceLevel: EvidenceLevel;
  dose: GameDose;
  body: PackageBody;
}

export interface PackageRecord {
  id: string;
  version: string;
  titleFa: string;
  evidenceLevel: EvidenceLevel;
  dose: GameDose;
  status: PackageStatus;
  body: PackageBody;
  reviewedBy: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface PrescriptionCreateInput {
  childId: string;
  packageId: string;
  packageVersion: string;
  goalId: string;
  pathwayId?: string | null;
  doseOverride?: Partial<GameDose> | null;
  suggestedBy?: 'recommender' | 'therapist';
}

export interface PrescriptionRecord {
  id: string;
  childId: string;
  packageId: string;
  packageVersion: string;
  goalId: string;
  pathwayId: string | null;
  doseOverride: Partial<GameDose> | null;
  suggestedBy: 'recommender' | 'therapist';
  approvedBy: string;
  status: string;
  createdAt: string;
}

export interface MissionScheduleInput {
  prescriptionId: string;
  missionRef: string;
  scheduledFor: string; // YYYY-MM-DD
}

export interface MissionRecord {
  id: string;
  prescriptionId: string;
  scheduledFor: string;
  missionRef: string;
  status: MissionStatus;
}

/** نمای آیتم برای کلاینت — بدون هیچ کلید پاسخ (§۵) */
export interface ItemView {
  id: string;
  phase: 'train' | 'probe';
  type: MissionItem['type'];
  prompt?: string;
  options?: { label: string }[];
  range?: [number, number];
  stim?: Record<string, unknown>;
  media?: { image?: string; audio?: string } | null;
}

export interface AttemptDraftInput {
  item_id: string;
  response: unknown;
  rt_ms?: number | null;
  idem_key: string;
}

export interface AttemptFeedback {
  recorded: boolean;
  phase: 'train' | 'probe';
  /** فقط برای آیتم آموزشی؛ آیتم پروب هیچ بازخوردی نمی‌گیرد (§۵) */
  correct?: boolean;
  answer_display?: string | null;
  message?: string | null;
  replay_audio?: boolean;
}

/** راهنمای شروع بازی کودک — فقط از آیتم‌های آموزشی ساخته می‌شود و هیچ ردی از پروب ندارد (M2) */
export interface PlayHint {
  go: { label: string; stim: Record<string, unknown> };
  nogo: { label: string; stim: Record<string, unknown> } | null;
}

export interface PublicStateView {
  state: LinkState | 'expired' | 'revoked';
  missionRef: string;
  missionTitle: string;
  packageTitle: string;
  expiresAt: string;
  validity?: SessionValidity;
  adherenceConfirmed?: boolean;
  /** فقط در child_active: نوع‌بازی برای بارگیری ماژول زمان‌اجرای کودک (M2) */
  playGame?: string;
  /** فقط در child_active: راهنمای «این هدف است / این نه» از آیتم‌های آموزشی (M2) */
  playHint?: PlayHint | null;
  /** فقط در child_active: اسنپ‌شات پروتکل (فاز ۱ بازطراحی) — کلاینت پارامتر را فقط از این می‌خواند، هاردکد ممنوع */
  playProtocol?: ProtocolSnapshot;
}

export interface LinkIssueOutcome {
  jti: string;
  token: string;
  url: string;
  expiresAt: string;
}

export interface SessionMetricOutcome {
  metricId: string;
  value: number;
  unit: MetricUnit;
  probeCount: number;
  injected: boolean;
}

/** تزریق پراپ به مسیر مداخله — قرارداد «نه وابستگی ماژولی domain→domain» (هم‌الگوی formulationOt) */
export interface PathProbeInjector {
  (
    pathId: string,
    input: { metric: string; value: number; unit?: string | null; sessionId?: string | null; takenAt?: string | null; note?: string | null },
    actor: AuthContext
  ): Promise<unknown>;
}

export interface GamesDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** آدرس عمومی سایت برای ساختن لینک /m/… (همان publicBaseUrl کل سامانه) */
  publicBaseUrl?: string | null;
  now?: () => Date;
  /** حداکثر عمر لینک (ساعت) — پیش‌فرض ۱۲ طبق §۶ */
  linkTtlHours?: number;
  /** تزریق addPathProbe موتور بالینی؛ نبودش = پراپ فقط در game_sessions می‌ماند */
  injectPathProbe?: PathProbeInjector;
}

export interface GamesService {
  // رجیستری (پرسنلی)
  upsertMetric(input: { id: string; titleFa: string; unit: MetricUnit; higherIsBetter: boolean; source: MetricSource; formula: MetricFormula }, actor: AuthContext): Promise<RegistryMetric>;
  listMetrics(): Promise<RegistryMetric[]>;
  upsertGoal(input: { id: string; titleFa: string; packageId: string; metricId: string; ageMin?: number | null; ageMax?: number | null }, actor: AuthContext): Promise<RegistryGoal>;
  listGoals(): Promise<RegistryGoal[]>;
  upsertPackage(input: PackageUpsertInput, actor: AuthContext): Promise<PackageRecord>;
  listPackages(status?: PackageStatus): Promise<PackageRecord[]>;
  publishPackage(packageId: string, version: string, reviewedByStaffId: string | null, actor: AuthContext): Promise<PackageRecord>;

  // تجویز و مأموریت (پرسنلی)
  createPrescription(input: PrescriptionCreateInput, actor: AuthContext): Promise<PrescriptionRecord>;
  listPrescriptions(childId?: string): Promise<PrescriptionRecord[]>;
  setPrescriptionStatus(id: string, action: 'pause' | 'resume' | 'stop' | 'complete', actor: AuthContext): Promise<PrescriptionRecord>;
  scheduleMission(input: MissionScheduleInput, actor: AuthContext): Promise<MissionRecord>;
  listMissions(prescriptionId: string): Promise<MissionRecord[]>;
  issueLink(missionId: string, actor: AuthContext): Promise<LinkIssueOutcome>;
  revokeLink(jti: string, actor: AuthContext): Promise<{ ok: true }>;
  getSessionDetail(missionId: string): Promise<{ sessions: unknown[]; attempts: unknown[] }>;

  // زنجیرهٔ عمومی با توکن — بدون احراز هویت (§۵ و §۶)
  getState(token: string): Promise<PublicStateView>;
  start(token: string): Promise<PublicStateView>;
  nextItem(token: string): Promise<{ item: ItemView | null; progress: { done: number; total: number } }>;
  submitAttempt(token: string, draft: AttemptDraftInput): Promise<AttemptFeedback>;
  finish(token: string): Promise<{ state: PublicStateView; metrics: SessionMetricOutcome[] }>;
  parentGate(token: string, solve: boolean): Promise<PublicStateView>;
  confirm(token: string): Promise<PublicStateView>;
}
