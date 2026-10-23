import type { AuthContext } from '@core/shared';
import type { DbClient } from '@core/db';

export const CASE_EVENT_CATEGORIES = ['session', 'checklist', 'note'] as const;
export type CaseEventCategory = (typeof CASE_EVENT_CATEGORIES)[number];

export const CASE_EVENT_AUDIENCES = ['family', 'teacher', 'both'] as const;
export type CaseEventAudience = (typeof CASE_EVENT_AUDIENCES)[number];

export const CASE_EVENT_AUDIENCE_LABELS: Record<CaseEventAudience, string> = {
  family: 'خانواده',
  teacher: 'معلم کلاس',
  both: 'خانواده و معلم'
};

export const CASE_EVENT_CATEGORY_LABELS: Record<CaseEventCategory, string> = {
  session: 'جلسه',
  checklist: 'چک‌لیست',
  note: 'یادداشت'
};

export const CASE_EVENT_FIELD_TYPES = ['text', 'longtext', 'number', 'select', 'scale', 'single', 'heading'] as const;
export type CaseEventFieldType = (typeof CASE_EVENT_FIELD_TYPES)[number];

export interface CaseEventScoredOption {
  label: string;
  score: number;
}

export interface CaseEventSubscale {
  id: string;
  name: string;
  excludeFromTotal?: boolean;
  bands?: CaseEventBand[] | null;
}

export const CASE_EVENT_BAND_COLORS = ['ok', 'warn', 'danger'] as const;
export type CaseEventBandColor = (typeof CASE_EVENT_BAND_COLORS)[number];

export const CASE_EVENT_STATUSES = ['draft', 'completed', 'pending_family', 'cancelled'] as const;
export type CaseEventStatus = (typeof CASE_EVENT_STATUSES)[number];

export const CASE_EVENT_STATUS_LABELS: Record<CaseEventStatus, string> = {
  draft: 'پیش‌نویس',
  completed: 'ثبت‌شده',
  pending_family: 'در انتظار خانواده',
  cancelled: 'لغوشده'
};

export interface CaseEventField {
  key: string;
  label: string;
  type: CaseEventFieldType;
  options?: string[];
  scoredOptions?: CaseEventScoredOption[];
  scaleMax?: number;
  scaleLabels?: string[];
  required?: boolean;
  reverse?: boolean;
  critical?: boolean;
  criticalMin?: number;
  subscaleId?: string | null;
}

export interface CaseEventBand {
  max: number;
  label: string;
  color?: CaseEventBandColor | null;
  advice?: string | null;
}

export interface CaseEventAnalysis {
  score: number;
  band: string | null;
  answered: number;
  total: number;
  maxScore: number;
  subscaleScores?: CaseEventSubscaleScore[];
  flags?: CaseEventFlag[];
  interpretation?: string | null;
}

export interface CaseEventSubscaleScore {
  id: string;
  name: string;
  score: number;
  max: number;
  band: string | null;
  color?: CaseEventBandColor | null;
}

export interface CaseEventFlag {
  key: string;
  label: string;
  value: number;
}

export interface CaseEventTypeRecord {
  id: string;
  key: string;
  title: string;
  description: string | null;
  category: CaseEventCategory;
  icon: string | null;
  familyFillable: boolean;
  fields: CaseEventField[];
  bands: CaseEventBand[] | null;
  subscales: CaseEventSubscale[] | null;
  tags: string[];
  audience: CaseEventAudience;
  active: boolean;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseEventFileMeta {
  id: string;
  caseEventId: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  createdBy: string | null;
  createdAt: string;
}

export interface CaseEventRecord {
  id: string;
  eventTypeId: string;
  typeTitle: string;
  typeCategory: CaseEventCategory;
  typeIcon: string | null;
  typeBands: CaseEventBand[] | null;
  typeAudience: CaseEventAudience;
  typeFamilyFillable: boolean;
  studentId: string;
  staffId: string | null;
  staffName: string | null;
  appointmentId: string | null;
  occurredAt: string;
  status: CaseEventStatus;
  payload: Record<string, { value: string; label: string }> | null;
  analysis: CaseEventAnalysis | null;
  summary: string | null;
  fillExpiresAt: string | null;
  sentAt: string | null;
  sentCount: number;
  filledByChatId: string | null; // — «web:…» یا chatId یعنی فرم توسط خانواده/معلم پر شده (m172)
  createdAt: string;
  files?: CaseEventFileMeta[];
}

export interface CaseEventTypeInput {
  title: string;
  description?: string | null;
  category: CaseEventCategory;
  icon?: string | null;
  familyFillable?: boolean;
  fields: CaseEventField[];
  bands?: CaseEventBand[] | null;
  subscales?: CaseEventSubscale[] | null;
  tags?: string[] | null;
  audience?: CaseEventAudience | null;
}

export interface CaseEventInput {
  eventTypeId: string;
  studentId: string;
  appointmentId?: string | null;
  occurredAt?: string | null;
  values: Record<string, string | number | null>;
  draft?: boolean;
}

export interface NewCaseEventFileInput {
  filename: string;
  mimeType: string;
  contentB64: string;
}

export interface CaseEventFileContent extends CaseEventFileMeta {
  bytes: Uint8Array;
}

export interface CaseEventDeps {
  db: DbClient;
  audit: import('@core/audit').AuditWriter;
  logger: import('@core/logger').Logger;
  fillExpiryHours?: number;
  followups?: Pick<import('@domain/followups').FollowUpsService, 'createWithinTx'>;
  studentNameOf?: (studentId: string) => Promise<string | null>;
  publicBaseUrl?: string | null;
  now?: () => Date;
}

export interface CaseEventsService {
  listTypes(filters: { activeOnly?: boolean; category?: CaseEventCategory }): Promise<CaseEventTypeRecord[]>;
  getTypeById(id: string): Promise<CaseEventTypeRecord | null>;
  createType(input: CaseEventTypeInput, actor: AuthContext): Promise<CaseEventTypeRecord>;
  updateType(id: string, input: Partial<CaseEventTypeInput>, actor: AuthContext): Promise<CaseEventTypeRecord>;
  deactivateType(id: string, actor: AuthContext): Promise<boolean>;
  deleteType(id: string, actor: AuthContext): Promise<boolean>;

  listEventsByStudent(studentId: string, filters?: { limit?: number }): Promise<CaseEventRecord[]>;
  listEventsByAppointment(appointmentId: string): Promise<CaseEventRecord[]>;
  listEventsByAppointments(appointmentIds: string[]): Promise<Map<string, CaseEventRecord[]>>;
  getEventById(id: string): Promise<CaseEventRecord | null>;
  createEvent(input: CaseEventInput, actor: AuthContext): Promise<CaseEventRecord>;
  createSensoryChipEvent(studentId: string, input: { levels: Record<string, unknown> }, actor: AuthContext): Promise<CaseEventRecord>;
  createReadCoreEvent(studentId: string, input: { levels: Record<string, unknown> }, actor: AuthContext): Promise<CaseEventRecord>;
  createProbeEvent(studentId: string, input: { area: string; values: Record<string, unknown> }, actor: AuthContext): Promise<CaseEventRecord>;
  createRehabFxEvent(studentId: string, input: { values: Record<string, unknown> }, actor: AuthContext): Promise<CaseEventRecord>;
  updateEvent(id: string, input: { values?: Record<string, string | number | null>; summary?: string }, actor: AuthContext): Promise<CaseEventRecord>;
  finalizeEvent(id: string, actor: AuthContext): Promise<CaseEventRecord>;
  cancelEvent(id: string, actor: AuthContext): Promise<CaseEventRecord>;
  deleteEvent(id: string, actor: AuthContext): Promise<void>;

  addEventFile(eventId: string, input: NewCaseEventFileInput, actor: AuthContext): Promise<CaseEventFileMeta>;
  listEventFiles(eventId: string): Promise<CaseEventFileMeta[]>;
  getEventFile(eventId: string, fileId: string): Promise<CaseEventFileContent>;
  deleteEventFile(eventId: string, fileId: string, actor: AuthContext): Promise<void>;

  guardianChats(studentId: string): Promise<string[]>;
  teacherChats(studentId: string): Promise<string[]>;

  suggestTypesForStudent(studentId: string): Promise<ChecklistSuggestion[]>;
  listPendingChecklists(): Promise<PendingChecklist[]>;
  sendChecklistLink(eventId: string, input: { audience?: CaseEventAudience | null; note?: string | null; teacherName?: string | null; teacherId?: string | null }, actor: AuthContext): Promise<{ sent: number; targets: string[]; link: string | null }>;
  issueTeacherFillLink(eventId: string, input: { teacherName?: string | null; teacherId?: string | null }, actor: AuthContext): Promise<{ link: string; teacherName: string }>;
  setSendObserver(fn: SendObserver | null): void;
  setFillObserver(fn: FillObserver | null): void;
  assertFamilyChat(studentId: string, chatId: string): Promise<boolean>;
  verifyFillToken(id: string, token: string): Promise<boolean>;
  mintFillLink(id: string, publicBaseUrl: string): Promise<string | null>;
  listPackageComponentTypes(typeId: string): Promise<CaseEventTypeRecord[] | null>;
  fillByFamily(id: string, input: { values: Record<string, number | string>; sourceChatId: string | null; viaWeb: boolean }, actor: AuthContext): Promise<CaseEventRecord>;
}

export interface ChecklistSuggestion {
  type: CaseEventTypeRecord;
  matched: { id: string; name: string }[];
  score: number;
}

export interface PendingChecklist {
  id: string;
  studentId: string;
  studentName: string;
  typeId: string;
  typeTitle: string;
  typeIcon: string | null;
  typeAudience: CaseEventAudience;
  occurredAt: string;
  fillExpiresAt: string | null;
  sentAt: string | null;
  sentCount: number;
  expired: boolean;
}

export interface SendObserverInput {
  studentId: string;
  chats: string[];
  template: 'bot_checklist_link' | 'bot_teacher_package_link';
  vars: import('@core/shared').TemplateVars;
  dedupBase: string;
}
export type SendObserver = (input: SendObserverInput) => Promise<number>;

export interface FillObserverInput {
  eventId: string;
  studentId: string;
  staffId: string | null;   // — درمانگر ثبت‌کننده (گیرندهٔ اعلان نتیجه)
  formTitle: string;
  score: number | null;
  band: string | null;
  teacherName: string | null; // — «پاسخ معلم» اگر گیرنده معلم بود
  via: 'web' | 'bot';
}
export type FillObserver = (input: FillObserverInput) => Promise<void>;
