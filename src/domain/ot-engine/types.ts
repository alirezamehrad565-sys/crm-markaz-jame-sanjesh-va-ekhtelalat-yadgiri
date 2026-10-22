import type { StudentProtocol } from '@core/shared';

export const OT_DOMAINS = ['gross', 'fine', 'visual', 'auditory', 'cognitive', 'adl', 'social'] as const;

export type OtDomain = (typeof OT_DOMAINS)[number];

export const OT_DOMAIN_LABELS: Record<OtDomain, string> = {
  gross: 'حرکات درشت',
  fine: 'حرکات ظریف',
  visual: 'ادراک دیداری',
  auditory: 'ادراک شنیداری',
  cognitive: 'توجه و مهارت‌های ذهنی',
  adl: 'خودیاری و زندگی روزمره',
  social: 'مهارت‌های اجتماعی-هیجانی و بازی'
};

export const OT_SKILL_STATUSES = ['mastered', 'with_help', 'not_yet'] as const;

export type OtSkillStatus = (typeof OT_SKILL_STATUSES)[number];

export const OT_SKILL_STATUS_LABELS: Record<OtSkillStatus, string> = {
  mastered: 'بلد است',
  with_help: 'با کمک',
  not_yet: 'هنوز نه'
};

export const OT_PROMPT_LEVELS = ['verbal', 'gestural', 'partial_physical', 'full_physical'] as const;

export type OtPromptLevel = (typeof OT_PROMPT_LEVELS)[number];

export const OT_PROMPT_LEVEL_LABELS: Record<OtPromptLevel, string> = {
  verbal: 'راهنمای کلامی',
  gestural: 'ژستی / الگودهی',
  partial_physical: 'لمسی جزئی',
  full_physical: 'راهنمای فیزیکی کامل'
};

export const OT_GATE_FRESH_MONTHS = 12;

export interface OtSkillRow {
  id: string;
  domain: string;
  ord: number;
  title: string;
  criterion: string;
  expectedAge: string | null;
  skillGroup: string | null;
  isPrimary: boolean;
}

export interface OtSkillState {
  skillId: string;
  ord: number;
  title: string;
  criterion: string;
  status: OtSkillStatus | null;
  firstStatus: OtSkillStatus | null;
  masteryConfirmed: boolean;
  promptLevel: OtPromptLevel | null;
  expectedAge: string | null;
  skillGroup: string | null;
  isPrimary: boolean;
  latestAt: string | null;
  latestNote: string | null;
  sessions: number;
}

export interface OtDomainProgress {
  key: OtDomain;
  title: string;
  skills: OtSkillState[];
  resumeSkillId: string | null;
  mastered: number;
  masteredPending: number;
  withHelp: number;
  notYet: number;
  scored: number;
  total: number;
  totalAll: number;
}

export interface OtProfile {
  domains: OtDomainProgress[];
  totals: {
    scored: number;
    total: number;
    mastered: number;
    masteredPending: number;
    withHelp: number;
    notYet: number;
    secondarySkills: number;
    sessions: number;
    lastSessionAt: string | null;
  };
}

export interface OtProgressSessionEntry {
  sessionId: string;
  ord: number;
  occurredAt: string;
  total: number;
  mastered: number;
  withHelp: number;
  notYet: number;
  confirmedNew: number;
  prompts: Record<string, number>;
  domains: { key: OtDomain; mastered: number; withHelp: number; notYet: number }[];
}

export interface OtProgressBaselineEntry {
  key: string;
  label: string;
  valueFa: string;
  band: string;
  color: string;
  prompt: string;
}

export interface OtProgressOutput {
  sessions: OtProgressSessionEntry[];
  baseline: OtProgressBaselineEntry[] | null;
  baselineSummary: string | null;
  baselineAt: string | null;
  summary: {
    sessions: number;
    confirmedMastered: number;
    withHelp: number;
    lastAt: string | null;
  };
}

export interface IdentificationGate {
  key: 'anamnesis' | 'behavioral' | 'wechsler' | 'skills' | 'needs';
  ord: number;
  label: string;
  hint: string;
  done: boolean;
  detail: string;
}

export interface GatesOutput {
  phase: 'identification' | 'intervention';
  protocol: StudentProtocol | null;
  gates: IdentificationGate[];
  otCoverage: {
    scored: number;
    total: number;
    domainsCovered: number;
    domainsMin3: number;
    domainTitles: string[];
  };
  protocolSuggestions: Record<string, { protocol: StudentProtocol; secondary: StudentProtocol | null } | null>;
  pathway: string | null;
}

export interface OtSessionSaveInput {
  items: { skillId: string; status: OtSkillStatus; note?: string | null; promptLevel?: OtPromptLevel | null }[];
  focus?: string | null;
  summary?: string | null;
  homework?: string | null;
  appointmentId?: string | null;
}

export interface OtSessionSaveResult {
  sessionId: string;
  saved: number;
  masteryConfirmed: number;
  summary: string;
}

export interface NeedsSummaryInput {
  needType: string;
  protocol: StudentProtocol;
  protocolSecondary?: StudentProtocol | null;
  evidence?: string | null;
  goals?: string | null;
  sessionPlan?: string | null;
}

export interface NeedsSummaryResult {
  protocol: StudentProtocol;
  needType: string;
  needTypeLabel: string;
  eventId: string;
}
