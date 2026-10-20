/**
 * موتور چک‌لیست کاردرمانی (OT) — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// سرویس فلو دوفازی «شناسایی → مداخله»:
// ۱) گیت‌های شناسایی (ورودی مشترک: شرح‌حال / چک‌لیست رفتاری / وکسلر / ارزیابی مهارتی / نیاز ویژه)
// ۲) پروفایل چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی + ثبت جلسه (ارزیابی = مداخله، ادامه از نقطهٔ قبلی)
// ۳) نتیجهٔ نیاز ویژه — فعال‌سازی پروتکل مداخله (دروازهٔ فاز مداخله)
// RBAC هم‌الگوی موتور بالینی: مشاهده — مدیر/منشی/درمانگرِ مسئول؛ ثبت — مدیر یا درمانگرِ مسئول.

import type { AuthContext } from '@core/shared';
import { NEED_PROTOCOL_SUGGESTIONS, STUDENT_PROTOCOL_LABELS, type StudentProtocol } from '@core/shared';
import type { DbClient } from '@core/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type {
  GatesOutput,
  IdentificationGate,
  NeedsSummaryInput,
  NeedsSummaryResult,
  OtDomain,
  OtDomainProgress,
  OtProfile,
  OtPromptLevel,
  OtSessionSaveInput,
  OtSessionSaveResult,
  OtSkillState,
  OtSkillStatus
} from './types';
import { OT_DOMAINS, OT_DOMAIN_LABELS, OT_GATE_FRESH_MONTHS, OT_PROMPT_LEVEL_LABELS, OT_SKILL_STATUS_LABELS } from './types';

// ───────── سقف‌ها ─────────

export const OT_SKILL_NOTE_MAX = 300;
export const OT_FOCUS_MAX = 200;
export const OT_SUMMARY_MAX = 2000;
export const OT_HOMEWORK_MAX = 300;
export const NEEDS_TEXT_MAX = 4000;
export const NEEDS_PLAN_MAX = 300;

/** کلیدهای ابزار هر گیت شناسایی */
const ANAMNESIS_KEYS = ['ce-anamnesis-v2', 'anamnesis'];
const BEHAVIORAL_KEYS = ['sdq-parent', 'ce-sdq-t-v1', 'ce-snap-iv-p-v1', 'ce-snap-iv-t-v1', 'ce-scared-p-v1', 'ce-dcdq-v1'];
const WECHSLER_KEYS = ['ce-wechsler-w4-v1', 'wechsler'];

const NEEDS_EVENT_KEY = 'ce-needs-v1';
const OT_SESSION_EVENT_KEY = 'ce-ot-session-v1';

/** برچسب فارسی نیاز ویژه — هم‌قرارداد با special-needs/pure.ts */
const NEED_TYPE_LABELS: Record<string, string> = {
  dyslexia: 'نارساخوانی (دیس‌لکسی)',
  dysgraphia: 'نارسانویسی (دیس‌گرافی)',
  dyscalculia: 'نارساریاضی (دیس‌کالکولی)',
  adhd: 'بیش‌فعالی و کم‌توجهی',
  autism: 'طیف اتیسم',
  speech_language: 'اختلال زبانی و بیان',
  anxiety: 'اضطراب',
  motor_coordination: 'اختلال هماهنگی حرکتی',
  slow_learner: 'دیرآموز',
  intellectual_disability: 'ناتوانی هوشی',
  global_developmental_delay: 'تأخیر رشدی جهانی',
  social_communication: 'اختلال ارتباط اجتماعی (پراگماتیک)',
  tic: 'اختلال تیک',
  other: 'سایر'
};

interface StudentRow {
  id: string;
  first_name: string;
  last_name: string;
  owner_staff_id: string | null;
  protocol: string | null;
  case_status: string | null;
}

/** آخرین ثبت هر ابزار شناسایی — برای گیت تازگی‌آگاه */
interface SeenMetaRow {
  tool_key: string;
  last_at: string;
}

interface CoverageRow {
  domain: string;
  n: number;
}

interface OtProgressRow {
  id: string;
  student_id: string;
  skill_id: string;
  status: string;
  note: string | null;
  prompt_level: string | null;
  session_id: string | null;
  occurred_at: string;
  created_at: string;
}

interface EventTypeRow {
  id: string;
  key: string;
}

interface OtEngineDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  now?: () => Date;
}

function parseText(v: string | null | undefined, max: number): string | null {
  const t = v?.trim();
  return t ? t.slice(0, max) : null;
}

/** تازگی ثبت — پنجرهٔ ۱۲ ماه (داوری روانشناسی P0-4) */
function isFresh(lastAt: string | undefined, nowFn: () => Date): boolean {
  if (!lastAt) return false;
  const t = Date.parse(lastAt.includes('T') ? lastAt : `${lastAt.replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return false;
  return nowFn().getTime() - t <= OT_GATE_FRESH_MONTHS * 30 * 24 * 3600 * 1000;
}

export function createOtEngineService(deps: OtEngineDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('ot-engine');
  const now = deps.now ?? (() => new Date());
  const iso = () => now().toISOString();

  // ───────── RBAC — هم‌الگوی موتور بالینی ─────────

  async function loadStudent(studentId: string): Promise<StudentRow> {
    const row = await db.queryOne<StudentRow>(
      `SELECT id, first_name, last_name, owner_staff_id, protocol, case_status FROM students WHERE id = ?`,
      [studentId]
    );
    if (!row) throw new NotFoundError('دانش‌آموز');
    return row;
  }

  function assertCanView(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager' || actor.role === 'secretary') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('این بخش فقط برای مدیر، منشی یا درمانگرِ مسئول پرونده قابل مشاهده است');
  }

  function assertCanWrite(student: StudentRow, actor: AuthContext): void {
    if (actor.role === 'manager') return;
    if (actor.role === 'therapist' && student.owner_staff_id === actor.staffId) return;
    throw new ForbiddenError('ثبت فقط توسط مدیر یا درمانگرِ مسئول پرونده مجاز است');
  }

  // ───────── دادهٔ پایه ─────────

  async function loadSeenToolMeta(studentId: string): Promise<Map<string, string>> {
    // تجمیع در SQL — بدون LIMIT خطرناک؛ آخرین ثبت هر ابزار مبنای تازگی است
    const rows = await db.query<SeenMetaRow>(
      `SELECT t.key AS tool_key, MAX(e.occurred_at) AS last_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ? AND e.status = 'completed' AND e.deleted_at IS NULL
        GROUP BY t.key
        LIMIT 500`,
      [studentId]
    );
    return new Map(rows.map((r) => [r.tool_key, r.last_at]));
  }

  async function loadOtCoverage(studentId: string): Promise<{ scored: number; total: number; domainsCovered: number; domainsMin3: number; domainTitles: string[] }> {
    const rows = await db.query<CoverageRow>(
      `SELECT t.domain, COUNT(DISTINCT p.skill_id) AS n
         FROM ot_progress p
         JOIN ot_skills t ON t.id = p.skill_id
        WHERE p.student_id = ?
        GROUP BY t.domain`,
      [studentId]
    );
    const byDomain = new Map(rows.map((r) => [r.domain, r.n]));
    const covered: string[] = [];
    let scored = 0;
    let domainsMin3 = 0;
    for (const d of OT_DOMAINS) {
      const n = byDomain.get(d) ?? 0;
      scored += n;
      if (n > 0) covered.push(OT_DOMAIN_LABELS[d]);
      if (n >= 3) domainsMin3 += 1;
    }
    // فقط مهارت‌های primary در شمارش کل
    const totalRow = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM ot_skills WHERE COALESCE(is_primary, 1) = 1`
    );
    return { scored, total: totalRow?.n ?? 0, domainsCovered: covered.length, domainsMin3, domainTitles: covered };
  }

  function clampProtocol(v: string | null): StudentProtocol | null {
    return v && v in STUDENT_PROTOCOL_LABELS ? (v as StudentProtocol) : null;
  }

  // ───────── ۱) گیت‌های شناسایی ─────────

  /** محاسبهٔ گیت‌ها — هم برای API و هم برای snapshot هنگام ثبت نیاز ویژه */
  async function computeGates(student: StudentRow): Promise<GatesOutput> {
    const [seen, otCoverage] = await Promise.all([loadSeenToolMeta(student.id), loadOtCoverage(student.id)]);
    const protocol = clampProtocol(student.protocol);

    /** شمار ابزارهای ثبت‌شدهٔ تازه (۱۲ ماه اخیر) */
    const freshCount = (keys: string[]) => keys.filter((k) => isFresh(seen.get(k), now)).length;
    /** شمار کل ثبت‌ها بدون توجه به تازگی — برای پیام «کهنه» */
    const rawCount = (keys: string[]) => keys.filter((k) => seen.has(k)).length;

    const nAnam = freshCount(ANAMNESIS_KEYS);
    const nAnamRaw = rawCount(ANAMNESIS_KEYS);
    const nBehav = freshCount(BEHAVIORAL_KEYS);
    const nWisc = freshCount(WECHSLER_KEYS);
    const nWiscRaw = rawCount(WECHSLER_KEYS);
    const domCovered = otCoverage.domainsCovered;
    const domMin3 = otCoverage.domainsMin3;

    const staleNote = ` — کهنه است (بیش از ${'۱۲'} ماه؛ بازثبت لازم)`;

    const gates: IdentificationGate[] = [
      {
        key: 'anamnesis',
        label: 'شرح‌حال و گفت‌وگوی اول',
        hint: 'فرم «گفت‌وگوی اول» با خانواده — پایهٔ همهٔ تصمیم‌ها',
        done: nAnam > 0,
        detail: nAnam > 0 ? 'ثبت شده' : nAnamRaw > 0 ? `ثبت شده اما${staleNote}` : 'هنوز ثبت نشده'
      },
      {
        key: 'behavioral',
        label: 'چک‌لیست‌های رفتاری (حداقل ۲ تازه)',
        hint: 'SNAP-IV والد و معلم، SDQ، SCARED، DCDQ — با بله ارسال می‌شود؛ پنجرهٔ اعتبار ۱۲ ماه',
        done: nBehav >= 2,
        detail: nBehav > 0 ? `${nBehav} چک‌لیست معتبر در ۱۲ ماه اخیر` : nBehav === 0 && rawCount(BEHAVIORAL_KEYS) > 0 ? 'ثبت شده اما خارج از پنجرهٔ ۱۲ ماه' : 'هنوز ثبت نشده'
      },
      {
        key: 'wechsler',
        label: 'آزمون هوش وکسلر ۴',
        hint: 'فرم نتایج وکسلر — خروجی موتور تحلیل در فیلد engine_output؛ زیر ۶ سال WPPSI/Leiter',
        done: nWisc > 0,
        detail: nWisc > 0 ? 'ثبت شده' : nWiscRaw > 0 ? `ثبت شده اما${staleNote}` : 'هنوز ثبت نشده'
      },
      {
        key: 'skills',
        label: 'ارزیابی مهارتی — چک‌لیست ۷ حیطه‌ای',
        hint: 'حین جلسات کاردرمانی ذهنی — ملاک: حداقل ۳ نمره در هر ۷ حیطه (نزدیک سن + پایین‌تر + بالاتر)',
        done: domCovered >= 7 && domMin3 >= 7,
        detail: `${otCoverage.scored} مهارت نمره‌گرفته — ${domMin3} حیطه از ۷ با حداقل ۳ نمره`
      },
      {
        key: 'needs',
        label: 'نتیجهٔ نیاز ویژه (دروازهٔ مداخله)',
        hint: 'جمع‌بندی شواهد + انتخاب پروتکل مداخله — پرونده وارد فاز مداخله می‌شود',
        done: protocol !== null,
        detail: protocol ? `پروتکل فعال: ${STUDENT_PROTOCOL_LABELS[protocol]}` : 'پس از چهار ورودی دیگر'
      }
    ];

    return {
      phase: protocol ? 'intervention' : 'identification',
      protocol,
      gates,
      otCoverage,
      protocolSuggestions: NEED_PROTOCOL_SUGGESTIONS
    };
  }

  async function getGates(studentId: string, actor: AuthContext): Promise<GatesOutput> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);
    return computeGates(student);
  }

  // ───────── ۲) پروفایل چک‌لیست ۷ حیطه‌ای ─────────

  async function getOtProfile(studentId: string, actor: AuthContext): Promise<OtProfile> {
    const student = await loadStudent(studentId);
    assertCanView(student, actor);

    const [skillRows, progressRows, sessionCount] = await Promise.all([
      db.query<{ id: string; domain: string; ord: number; title: string; criterion: string; expected_age: string | null; skill_group: string | null; is_primary: number }>(
        `SELECT id, domain, ord, title, criterion, expected_age, skill_group, is_primary FROM ot_skills`
      ),
      db.query<OtProgressRow>(
        `SELECT id, student_id, skill_id, status, note, prompt_level, session_id, occurred_at, created_at
           FROM ot_progress WHERE student_id = ?
          ORDER BY occurred_at ASC, created_at ASC, rowid ASC`,
        [studentId]
      ),
      db.queryOne<{ n: number; last: string | null }>(
        `SELECT COUNT(DISTINCT session_id) AS n, MAX(occurred_at) AS last FROM ot_progress WHERE student_id = ?`,
        [studentId]
      )
    ]);

    /** رکورد وضعیت برای قاعدهٔ تسلط دوجلسه‌ای */
    interface Rec {
      status: OtSkillStatus;
      sessionKey: string;
      at: string;
      note: string | null;
      prompt: OtPromptLevel | null;
    }

    const recsBySkill = new Map<string, Rec[]>();
    for (const r of progressRows) {
      if (!(r.status in OT_SKILL_STATUS_LABELS)) continue; // ردیف نامعتبر — نادیده (D7)
      const rec: Rec = {
        status: r.status as OtSkillStatus,
        sessionKey: r.session_id ?? `raw:${r.id}`,
        at: r.occurred_at,
        note: r.note,
        prompt: r.prompt_level && r.prompt_level in OT_PROMPT_LEVEL_LABELS ? (r.prompt_level as OtPromptLevel) : null
      };
      const list = recsBySkill.get(r.skill_id);
      if (list) list.push(rec);
      else recsBySkill.set(r.skill_id, [rec]);
    }

    const skillById = new Map(skillRows.map((s) => [s.id, s]));
    void skillById; // رزرو برای گزارش‌های آینده
    const domains: OtDomainProgress[] = [];

    for (const d of OT_DOMAINS) {
      const skills = skillRows
        .filter((s) => s.domain === d)
        .sort((a, b) => a.ord - b.ord)
        .map<OtSkillState>((s) => {
          const list = recsBySkill.get(s.id) ?? [];
          const last = list.length > 0 ? list[list.length - 1] : null;
          // قاعدهٔ تسلط دوجلسه‌ای: آخرین جلسه «بلد است» + آخرین رکورد از جلسهٔ متفاوتِ قبلی هم «بلد است»
          let masteryConfirmed = false;
          if (last && last.status === 'mastered') {
            for (let i = list.length - 2; i >= 0; i--) {
              if (list[i].sessionKey !== last.sessionKey) {
                masteryConfirmed = list[i].status === 'mastered';
                break;
              }
            }
          }
          let promptLevel: OtPromptLevel | null = null;
          for (let i = list.length - 1; i >= 0; i--) {
            if (list[i].prompt) { promptLevel = list[i].prompt; break; }
          }
          return {
            skillId: s.id,
            ord: s.ord,
            title: s.title,
            criterion: s.criterion,
            status: last?.status ?? null,
            firstStatus: list.length > 0 ? list[0].status : null,
            masteryConfirmed,
            promptLevel,
            expectedAge: s.expected_age ?? null,
            skillGroup: s.skill_group ?? null,
            isPrimary: (s.is_primary ?? 1) === 1,
            latestAt: last?.at ?? null,
            latestNote: last?.note ?? null,
            sessions: new Set(list.map((r) => r.sessionKey)).size
          };
        });

      // نقطهٔ ادامه = اولین مهارتِ primary بدون تسلط دوجلسه‌ای
      const firstNotConfirmed = skills.find((s) => s.isPrimary && !(s.status === 'mastered' && s.masteryConfirmed));
      const primary = skills.filter((s) => s.isPrimary);
      domains.push({
        key: d,
        title: OT_DOMAIN_LABELS[d],
        resumeSkillId: firstNotConfirmed?.skillId ?? null,
        mastered: primary.filter((s) => s.status === 'mastered' && s.masteryConfirmed).length,
        masteredPending: primary.filter((s) => s.status === 'mastered' && !s.masteryConfirmed).length,
        withHelp: primary.filter((s) => s.status === 'with_help').length,
        notYet: primary.filter((s) => s.status === 'not_yet').length,
        scored: primary.filter((s) => s.status !== null).length,
        total: primary.length,
        totalAll: skills.length,
        skills
      });
    }

    const totals = domains.reduce(
      (acc, d) => ({
        scored: acc.scored + d.scored,
        total: acc.total + d.total,
        mastered: acc.mastered + d.mastered,
        masteredPending: acc.masteredPending + d.masteredPending,
        withHelp: acc.withHelp + d.withHelp,
        notYet: acc.notYet + d.notYet
      }),
      { scored: 0, total: 0, mastered: 0, masteredPending: 0, withHelp: 0, notYet: 0 }
    );

    const secondarySkills = skillRows.filter((s) => (s.is_primary ?? 1) !== 1).length;

    return {
      domains,
      totals: {
        ...totals,
        secondarySkills,
        sessions: sessionCount?.n ?? 0,
        lastSessionAt: sessionCount?.last ?? null
      }
    };
  }

  // ───────── ثبت جلسهٔ کاردرمانی ذهنی ─────────

  async function saveOtSession(studentId: string, input: OtSessionSaveInput, actor: AuthContext): Promise<OtSessionSaveResult> {
    const student = await loadStudent(studentId);
    assertCanWrite(student, actor);

    // حذف تکراری — آخرین وضعیت هر مهارت ملاک است؛ سطح راهنما فقط برای «با کمک» معنا دارد
    const bySkill = new Map<string, { status: OtSkillStatus; note: string | null; promptLevel: OtPromptLevel | null }>();
    for (const it of input.items) {
      const prompt = it.status === 'with_help' && it.promptLevel && it.promptLevel in OT_PROMPT_LEVEL_LABELS
        ? it.promptLevel
        : null;
      bySkill.set(it.skillId, {
        status: it.status,
        note: parseText(it.note, OT_SKILL_NOTE_MAX),
        promptLevel: prompt
      });
    }

    const ids = [...bySkill.keys()];
    if (ids.length === 0) throw new ValidationError('حداقل یک مهارت با وضعیت لازم است');

    // اعتبارسنجی شناسهٔ مهارت‌ها
    const validRows = await db.query<{ id: string }>(
      `SELECT id FROM ot_skills WHERE id IN (${ids.map(() => '?').join(', ')})`,
      ids
    );
    const valid = new Set(validRows.map((r) => r.id));
    const unknown = ids.filter((x) => !valid.has(x));
    if (unknown.length > 0) throw new ValidationError(`شناسهٔ مهارت نامعتبر: ${unknown[0]}`);

    // قاعدهٔ تسلط دوجلسه‌ای: «بلد است» این جلسه فقط اگر جلسهٔ قبل هم «بلد است» بود تأیید می‌شود
    const prevRows = await db.query<{ skill_id: string; status: string }>(
      `SELECT skill_id, status
         FROM ot_progress
        WHERE student_id = ? AND skill_id IN (${ids.map(() => '?').join(', ')})
        ORDER BY occurred_at ASC, created_at ASC, rowid ASC`,
      [studentId, ...ids]
    );
    const prevLatest = new Map<string, string>();
    for (const r of prevRows) prevLatest.set(r.skill_id, r.status); // آخرین ردیف هر مهارت
    const masteryConfirmed = ids.filter((id) => {
      const item = bySkill.get(id)!;
      return item.status === 'mastered' && prevLatest.get(id) === 'mastered';
    }).length;

    const sessionId = crypto.randomUUID();
    const occurredAt = iso();
    const mastered = [...bySkill.values()].filter((v) => v.status === 'mastered').length;
    const withHelp = [...bySkill.values()].filter((v) => v.status === 'with_help').length;
    const notYet = bySkill.size - mastered - withHelp;

    const focus = parseText(input.focus, OT_FOCUS_MAX);
    const summaryText = parseText(input.summary, OT_SUMMARY_MAX);
    const homework = parseText(input.homework, OT_HOMEWORK_MAX);

    const payload: Record<string, { value: string; label: string }> = {};
    if (focus) payload.focus = { value: focus, label: 'حیطه‌های تمرکز' };
    if (summaryText) payload.summary = { value: summaryText, label: 'خلاصهٔ جلسه' };
    if (homework) payload.homework = { value: homework, label: 'تمرین خانگی' };

    let timelineSummary = focus
      ? `جلسهٔ کاردرمانی ذهنی — ${bySkill.size} مهارت ثبت شد (${mastered} بلد، ${withHelp} با کمک، ${notYet} هنوز نه) — تمرکز: ${focus}`
      : `جلسهٔ کاردرمانی ذهنی — ${bySkill.size} مهارت ثبت شد (${mastered} بلد، ${withHelp} با کمک، ${notYet} هنوز نه)`;
    if (masteryConfirmed > 0) timelineSummary += ` — ${masteryConfirmed} تسلط دوجلسه‌ای تأیید شد`;

    // نوع رویداد گزارش جلسه
    const typeRow = await db.queryOne<EventTypeRow>(
      `SELECT id, key FROM case_event_types WHERE key = ? AND active = 1`,
      [OT_SESSION_EVENT_KEY]
    );

    await db.transaction(async (tx) => {
      for (const [skillId, v] of bySkill) {
        await tx.execute(
          `INSERT INTO ot_progress (id, student_id, skill_id, status, note, prompt_level, session_id, appointment_id, staff_id, occurred_at, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [crypto.randomUUID(), studentId, skillId, v.status, v.note, v.promptLevel, sessionId, input.appointmentId ?? null, actor.staffId, occurredAt, iso()]
        );
      }
      if (typeRow) {
        await tx.execute(
          `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                    status, payload, analysis, summary, fill_token, fill_expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
          [
            crypto.randomUUID(),
            typeRow.id,
            studentId,
            actor.staffId,
            input.appointmentId ?? null,
            occurredAt,
            JSON.stringify(payload),
            timelineSummary.slice(0, 300),
            actor.staffId,
            iso(),
            iso()
          ]
        );
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'ot.session.saved',
        resourceType: 'student',
        resourceId: studentId,
        changes: {
          session_id: { from: null, to: sessionId },
          skills: { from: null, to: bySkill.size }
        }
      });
    });

    log.info('ot session saved', { studentId, sessionId, skills: bySkill.size, masteryConfirmed });
    return { sessionId, saved: bySkill.size, masteryConfirmed, summary: timelineSummary };
  }

  // ───────── ۳) نتیجهٔ نیاز ویژه — دروازهٔ فاز مداخله ─────────

  async function setNeeds(studentId: string, input: NeedsSummaryInput, actor: AuthContext): Promise<NeedsSummaryResult> {
    const student = await loadStudent(studentId);
    assertCanWrite(student, actor);

    const needTypeLabel = NEED_TYPE_LABELS[input.needType];
    if (!needTypeLabel) throw new ValidationError('نیاز ویژهٔ انتخابی معتبر نیست');

    const secondary = input.protocolSecondary ?? null;
    if (secondary === input.protocol) throw new ValidationError('پروتکل پشتیبان نمی‌تواند با پروتکل اصلی یکی باشد');

    const protocolLabel = STUDENT_PROTOCOL_LABELS[input.protocol];
    const secondaryLabel = secondary ? STUDENT_PROTOCOL_LABELS[secondary] : null;

    const evidence = parseText(input.evidence, NEEDS_TEXT_MAX);
    const goals = parseText(input.goals, NEEDS_TEXT_MAX);
    const sessionPlan = parseText(input.sessionPlan, NEEDS_PLAN_MAX);

    const payload: Record<string, { value: string; label: string }> = {};
    if (evidence) payload.evidence = { value: evidence, label: 'خلاصهٔ شواهد' };
    payload.need_type = { value: needTypeLabel, label: 'نیاز ویژهٔ نهایی' };
    payload.protocol = { value: protocolLabel, label: 'پروتکل مداخله' };
    if (secondaryLabel) payload.protocol_secondary = { value: secondaryLabel, label: 'پروتکل پشتیبان' };
    if (goals) payload.goals = { value: goals, label: 'اهداف کوچک دورهٔ اول' };
    if (sessionPlan) payload.session_plan = { value: sessionPlan, label: 'برنامهٔ جلسات' };

    // snapshot وضعیت گیت‌ها هنگام تصمیم — کیفیت شواهد پشت انتخاب درمانگر مستند می‌ماند
    const gatesSnapshot = await computeGates(student);
    payload.gates_snapshot = {
      value: JSON.stringify({
        phase: gatesSnapshot.phase,
        gates: gatesSnapshot.gates.map((g) => ({ key: g.key, done: g.done, detail: g.detail })),
        otCoverage: gatesSnapshot.otCoverage
      }),
      label: 'وضعیت گیت‌ها هنگام ثبت'
    };

    const typeRow = await db.queryOne<EventTypeRow>(
      `SELECT id, key FROM case_event_types WHERE key = ? AND active = 1`,
      [NEEDS_EVENT_KEY]
    );

    const eventId = crypto.randomUUID();
    const occurredAt = iso();
    const timelineSummary = `نتیجهٔ نیاز ویژه: ${needTypeLabel} — پروتکل: ${protocolLabel}${secondaryLabel ? ` (پشتیبان: ${secondaryLabel})` : ''}`;

    await db.transaction(async (tx) => {
      if (typeRow) {
        await tx.execute(
          `INSERT INTO case_events (id, event_type_id, student_id, staff_id, appointment_id, occurred_at,
                                    status, payload, analysis, summary, fill_token, fill_expires_at, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, NULL, ?, 'completed', ?, NULL, ?, NULL, NULL, ?, ?, ?)`,
          [eventId, typeRow.id, studentId, actor.staffId, occurredAt, JSON.stringify(payload), timelineSummary.slice(0, 300), actor.staffId, iso(), iso()]
        );
      }
      await tx.execute(`UPDATE students SET protocol = ? WHERE id = ?`, [input.protocol, studentId]);
      // گذار خودکار وضعیت پرونده (فاز بهبود §۱۰.۲): ثبت نیاز ویژه یعنی ورود عملی به فاز مداخله —
      // وضعیت‌های پیشرفته‌تر (monitoring/archived) دست‌نخورده می‌مانند تا تصمیم انسانی بی‌اثر نشود
      const prevStatus = student.case_status ?? null;
      if (prevStatus !== 'in_intervention' && prevStatus !== 'monitoring' && prevStatus !== 'archived') {
        await tx.execute(`UPDATE students SET case_status = 'in_intervention' WHERE id = ?`, [studentId]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'student.case_status.changed',
          resourceType: 'student',
          resourceId: studentId,
          changes: { case_status: { from: prevStatus, to: 'in_intervention' } }
        });
      }
      await audit.logInTransaction(tx, {
        actorId: actor.staffId,
        action: 'student.protocol.changed',
        resourceType: 'student',
        resourceId: studentId,
        changes: {
          protocol: { from: student.protocol, to: input.protocol },
          need_type: { from: null, to: input.needType }
        }
      });
    });

    log.info('needs recorded — protocol active', { studentId, protocol: input.protocol, needType: input.needType });
    return { protocol: input.protocol, needType: input.needType, needTypeLabel, eventId: typeRow ? eventId : '' };
  }

  return { getGates, getOtProfile, saveOtSession, setNeeds };
}

export type OtEngineService = ReturnType<typeof createOtEngineService>;
