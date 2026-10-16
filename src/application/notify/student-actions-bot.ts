/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — بات اقدامات دانش‌آموز
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// جریان «دانش‌آموزمحور» بات:
// الف) همکاران مرکز (درمانگر/مدیر/منشی): «دانش‌آموزان فعال» → دکمهٔ نام → منوی اقدام:
// ارسال تکلیف / پیام به خانواده / تمرین‌های او / نوبت‌های او
// ب) معلم مدرسه: «فعالیت کلاس» — تکلیف‌های باز و تازهٔ دانش‌آموزان کلاس (فقط‌خواندنی)
// state در bot_menu_state با flow='stu' (فهرست دانش‌آموزان + تمرین‌ها) و flow='stu_msg'
// (فرم دو مرحله‌ای پیام خانواده). گیت دولایه: شروع + اجرا هر دو دوباره چک می‌شوند.

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import type { InlineButton, NotifyService } from '@core/notify';
import { EXB_PAGE_SIZE, faDigits, jalaliFullLabel, tehranTimeLabel, tehranYmdOf } from '@core/shared';
import { truncateLabel } from '@domain/exercise-bank';
import type { ExerciseBankService } from '@domain/exercise-bank';
import type { SettingsService } from '@app/settings';
import { renderTemplate } from '@core/notify';

/** حداکثر نام دانش‌آموز در فهرست همکاران (صفحه‌بندی ۶تایی روی همان) */
export const STU_LIST_LIMIT = 30;
const STU_PAGE_SIZE = 6;
/** سقف نویسهٔ پیام خانواده */
export const FAMILY_MSG_MAX = 500;
const FAMILY_MSG_MIN = 2;

export interface StuBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  settings: SettingsService;
  exerciseBank: ExerciseBankService | null;
  /** — آدرس عمومی سامانه برای لینک دانلود کاربرگ (خالی = پیام بدون لینک) */
  publicBaseUrlEnv: string | null;
  now?: () => Date;
}

/** بازیگر بات برای ثبت تکلیف/audit */
const STU_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

export interface StuListItem {
  id: string;
  name: string;
}

interface StuState {
  v: 1;
  flow: 'stu';
  /** فهرست دانش‌آموزان آخرین نمای فهرست — اندیس callback به این اشاره می‌کند */
  students: StuListItem[];
  /** تمرین‌های آخرین نمای «ارسال تکلیف» */
  exercises?: { id: string; title: string }[];
}

export interface StuMsgState {
  v: 1;
  flow: 'stu_msg';
  step: 'body';
  studentId: string;
  studentName: string;
  body?: string;
}

export interface StuBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

const HW_STATUS_LABELS: Record<string, string> = {
  assigned: 'باز',
  done: 'انجام‌شده',
  cancelled: 'لغوشده'
};

const CASE_LABELS: Record<string, string> = {
  identified: 'شناسایی‌شده',
  awaiting_assessment: 'در انتظار ارزیابی',
  in_intervention: 'در مداخله',
  monitoring: 'پایش',
  archived: 'بایگانی'
};

export async function readStuMsgState(db: DbClient, chatId: string): Promise<StuMsgState | null> {
  const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload) as StuMsgState;
    return parsed && parsed.v === 1 && parsed.flow === 'stu_msg' ? parsed : null;
  } catch {
    return null;
  }
}

async function writeState(db: DbClient, chatId: string, state: StuState | StuMsgState, now: () => Date): Promise<void> {
  await db.execute(
    `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [chatId, JSON.stringify(state), now().toISOString()]
  );
}

export async function clearStuState(db: DbClient, chatId: string): Promise<void> {
  await db.execute(`DELETE FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
}

export function createStudentActionsBot(deps: StuBotDeps) {
  const { db, audit, logger, notify, settings, exerciseBank } = deps;
  const log = logger.child('stu-bot');
  const now = deps.now ?? (() => new Date());

  // ───────── گیت + دامنه ─────────

  interface Owner {
    kind: 'staff' | 'class';
    refId: string;
    role: string | null;
  }

  async function resolveOwner(chatId: string): Promise<Owner | null> {
    const row = await db.queryOne<{ kind: string; ref_id: string; role: string | null }>(
      `SELECT 'staff' AS kind, l.staff_id AS ref_id, COALESCE(s.role_ext, s.role) AS role
         FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
        WHERE l.chat_id = ? AND l.status = 'linked'
       UNION ALL
       SELECT 'class' AS kind, class_id AS ref_id, NULL AS role
         FROM class_bot_links
        WHERE chat_id = ? AND status = 'linked'
       LIMIT 1`,
      [chatId, chatId]
    );
    return row ? { kind: row.kind as 'staff' | 'class', refId: row.ref_id, role: row.role } : null;
  }

  /** گیت همکاران مرکز — ناظر اداره محروم (بدون دادهٔ اسم‌دار) */
  async function staffGate(chatId: string): Promise<Owner | null> {
    const owner = await resolveOwner(chatId);
    if (!owner || owner.kind !== 'staff') return null;
    if (owner.role === 'supervisor') return null;
    return owner;
  }

  /** دامنهٔ فهرست: درمانگر = دانش‌آموزان جلسات خودش + پرونده‌های تحت مسئولیت؛ مدیر/منشی = همهٔ فعال (سقف ۳۰) */
  async function scopedStudents(owner: Owner): Promise<StuListItem[]> {
    if (owner.role === 'therapist') {
      return db.query<StuListItem>(
        `SELECT DISTINCT s.id, s.first_name || ' ' || s.last_name AS name
           FROM students s
          WHERE s.active = 1 AND (
                EXISTS (
                  SELECT 1 FROM appointment_students ax
                    JOIN appointments a ON a.id = ax.appointment_id
                   WHERE a.staff_id = ? AND ax.student_id = s.id
                )
                OR s.owner_staff_id = ?
              )
          ORDER BY s.last_name, s.first_name
          LIMIT ?`,
        [owner.refId, owner.refId, STU_LIST_LIMIT]
      );
    }
    return db.query<StuListItem>(
      `SELECT id, first_name || ' ' || last_name AS name
         FROM students WHERE active = 1
        ORDER BY last_name, first_name
        LIMIT ?`,
      [STU_LIST_LIMIT]
    );
  }

  async function readStuState(chatId: string): Promise<StuState | null> {
    const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.payload) as StuState;
      return parsed && parsed.v === 1 && parsed.flow === 'stu' ? parsed : null;
    } catch {
      return null;
    }
  }

  const STALE: StuBotReply = {
    text: '⏳ این منو قدیمی است — دکمهٔ «دانش‌آموزان فعال» را دوباره بزنید.',
    buttons: [[{ text: '👥 دانش‌آموزان فعال', callbackData: 'stu:list' }]]
  };

  /** چت‌های ولیّ یک دانش‌آموز — bot_links + prefs (الگوی /) */
  async function guardianChats(studentId: string): Promise<string[]> {
    const linkRows = await db.query<{ chat_id: string }>(
      `SELECT DISTINCT chat_id FROM bot_links
        WHERE student_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
      [studentId]
    );
    const prefRows = await db.query<{ chat_id: string }>(
      `SELECT chat_id FROM notification_prefs
        WHERE student_id = ? AND chat_id IS NOT NULL AND channel = 'bale'`,
      [studentId]
    );
    return [...new Set([...linkRows.map((r) => r.chat_id), ...prefRows.map((r) => r.chat_id)])];
  }

  async function openAssignmentCount(studentId: string): Promise<number> {
    const row = await db.queryOne<{ n: number }>(
      `SELECT COUNT(*) AS n FROM exercise_assignments WHERE student_id = ? AND status = 'assigned'`,
      [studentId]
    );
    return row?.n ?? 0;
  }

  // ───────── نماها ─────────

  /** «دانش‌آموزان فعال» — فهرست دکمه‌ای برای همکاران مرکز — صفحه‌بندی کامل (الگوی بانک تمرین) */
  async function list(chatId: string, page = 1): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) {
      return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    }
    const students = await scopedStudents(owner);
    if (students.length === 0) {
      return {
        text: [
          '👥 هنوز دانش‌آموزی به شما مرتبط نیست.',
          '',
          '• درمانگر: با ثبت جلسه، دانش‌آموزان شما این‌جا می‌آیند.',
          '• مدیر/منشی: با ثبت پروندهٔ فعال، فهرست ساخته می‌شود.'
        ].join('\n'),
        buttons: null
      };
    }
    await writeState(db, chatId, { v: 1, flow: 'stu', students }, now);
    const total = students.length;
    const totalPages = Math.max(1, Math.ceil(total / STU_PAGE_SIZE));
    const cur = Math.min(Math.max(1, page), totalPages);
    const startIdx = (cur - 1) * STU_PAGE_SIZE;
    const rows: InlineButton[][] = students.slice(startIdx, startIdx + STU_PAGE_SIZE).map((s, i) => [
      { text: truncateLabel(s.name, 28), callbackData: `stu:menu:${startIdx + i}` }
    ]);
    const nav: InlineButton[] = [];
    if (cur > 1) nav.push({ text: '▶ بعدی', callbackData: `stu:list:${cur - 1}` });
    if (cur < totalPages) nav.push({ text: '◀ قبلی', callbackData: `stu:list:${cur + 1}` });
    if (nav.length > 0) rows.push(nav);
    const note = totalPages > 1 ? `\n\nصفحهٔ ${faDigits(String(cur))} از ${faDigits(String(totalPages))}` : '';
    log.info('stu.list', { by: owner.refId, count: total, page: cur });
    return {
      text: `👥 دانش‌آموزان فعال (${faDigits(String(total))} نفر)\n\nروی نام بزنید تا منوی اقدام باز شود:${note}`,
      buttons: rows
    };
  }

  /** منوی اقدام دانش‌آموز — خلاصهٔ پرونده + چهار دکمه */
  async function menu(chatId: string, idx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[idx];
    if (!stu) return STALE;

    const profile = await db.queryOne<{
      grade: string | null;
      case_status: string | null;
      class_name: string | null;
      school_name: string | null;
    }>(
      `SELECT s.grade, s.case_status, c.name AS class_name, sc.name AS school_name
         FROM students s
         LEFT JOIN classes c ON c.id = s.class_id
         LEFT JOIN schools sc ON sc.id = c.school_id
        WHERE s.id = ?`,
      [stu.id]
    );
    const openCount = exerciseBank ? await openAssignmentCount(stu.id) : 0;

    const lines = [`👤 ${stu.name}`];
    if (profile?.class_name) {
      lines.push(`🏫 کلاس: ${profile.class_name}${profile.school_name ? ` — ${profile.school_name}` : ''}`);
    }
    if (profile?.grade) lines.push(`🎓 پایه: ${profile.grade}`);
    if (profile?.case_status) {
      lines.push(`📋 وضعیت پرونده: ${CASE_LABELS[profile.case_status] ?? profile.case_status}`);
    }
    lines.push(`📚 تکلیف باز: ${faDigits(String(openCount))}`);

    return {
      text: lines.join('\n'),
      buttons: [
        [{ text: '📤 ارسال تکلیف', callbackData: `stu:send:${idx}:1` }],
        [
          { text: '✉️ پیام به خانواده', callbackData: `stu:msg:${idx}` },
          { text: '📚 تمرین‌های او', callbackData: `stu:hw:${idx}` }
        ],
        [
          { text: '🗓 نوبت‌های او', callbackData: `stu:appts:${idx}` },
          { text: '📋 رویداد/گزارش', callbackData: `stu:tl:${idx}` }
        ],
        // نمای چرخهٔ پرونده: تاریخچه + چک‌لیست‌های او
        [
          { text: '🕘 تاریخچه', callbackData: `stu:hist:${idx}` },
          { text: '📝 چک‌لیست‌های او', callbackData: `stu:ckl:${idx}` }
        ],
        [{ text: '↩ بازگشت به فهرست', callbackData: 'stu:list' }]
      ]
    };
  }

  /** فهرست تمرین‌های منتشرشده برای ارسال (دانش‌آموز از قبل انتخاب شده) */
  async function sendExercises(chatId: string, stuIdx: number, page: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[stuIdx];
    if (!stu) return STALE;
    if (!exerciseBank) return { text: renderTemplate('bot_exercise_disabled'), buttons: null };

    const result = await exerciseBank.list(
      { publishedOnly: true, page, pageSize: EXB_PAGE_SIZE },
      STU_ACTOR
    );
    if (result.items.length === 0) {
      return {
        text: renderTemplate('bot_exercise_empty'),
        buttons: [[{ text: `↩ بازگشت به ${stu.name}`, callbackData: `stu:menu:${stuIdx}` }]]
      };
    }

    const next = state;
    next.exercises = result.items.map((e) => ({ id: e.id, title: e.title }));
    await writeState(db, chatId, next, now);

    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    const rows: InlineButton[][] = result.items.map((e, i) => [
      { text: truncateLabel(e.title), callbackData: `stu:pick:${stuIdx}:${i}` }
    ]);
    const nav: InlineButton[] = [];
    if (result.page > 1) nav.push({ text: '▶ بعدی', callbackData: `stu:send:${stuIdx}:${result.page - 1}` });
    if (result.hasMore) nav.push({ text: '◀ قبلی', callbackData: `stu:send:${stuIdx}:${result.page + 1}` });
    nav.push({ text: `↩ بازگشت به ${truncateLabel(stu.name, 12)}`, callbackData: `stu:menu:${stuIdx}` });
    rows.push(nav);

    return {
      text: `📤 ارسال تکلیف به خانوادهٔ «${stu.name}»\nتمرین را انتخاب کنید — صفحهٔ ${faDigits(String(result.page))} از ${faDigits(String(totalPages))}:`,
      buttons: rows
    };
  }

  /** تأیید ارسال تکلیف */
  async function pick(chatId: string, stuIdx: number, exIdx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[stuIdx];
    const ex = state?.exercises?.[exIdx];
    if (!stu || !ex) return STALE;
    return {
      text: `📤 تأیید ارسال تکلیف\n\nتمرین: ${ex.title}\nدانش‌آموز: ${stu.name}\n\nکاربرگ به چت متصل ولیّ این دانش‌آموز ارسال می‌شود.`,
      buttons: [
        [
          { text: '✅ ارسال', callbackData: `stu:yes:${stuIdx}:${exIdx}` },
          { text: '✖ انصراف', callbackData: `stu:send:${stuIdx}:1` }
        ]
      ]
    };
  }

  /** اجرای ارسال تکلیف — همان موتور بانک تمرین (ثبت + پیام خانواده + audit) */
  async function yes(chatId: string, stuIdx: number, exIdx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[stuIdx];
    const ex = state?.exercises?.[exIdx];
    if (!stu || !ex) return STALE;

    const exercise = await exerciseBank?.getById(ex.id);
    if (!exerciseBank || !exercise || !exercise.published) {
      return {
        text: '⚠️ این تمرین دیگر منتشر نمی‌شود.',
        buttons: [[{ text: `↩ بازگشت به ${truncateLabel(stu.name, 12)}`, callbackData: `stu:menu:${stuIdx}` }]]
      };
    }

    const assignment = await exerciseBank.assign(
      {
        exerciseId: exercise.id,
        studentId: stu.id,
        assignedBy: owner.refId,
        via: 'bot',
        note: null
      },
      STU_ACTOR
    );

    // یک لینک امضاشده برای هر فایل تمرین
    const extraLines = [`تمرین: ${exercise.title}`];
    if (exercise.description) extraLines.push(exercise.description);
    if (deps.publicBaseUrlEnv && exercise.files.length > 0) {
      for (const f of exercise.files.slice(0, 6)) {
        const token = await exerciseBank.mintDownloadToken(exercise.id, f.id);
        extraLines.push(`📎 ${f.filename}: ${deps.publicBaseUrlEnv.replace(/\/+$/, '')}/public/exercise-files/${exercise.id}?token=${token}`);
      }
      if (exercise.files.length > 6) extraLines.push(`و ${faDigits(exercise.files.length - 6)} فایل دیگر با تماس از دفتر مرکز.`);
    } else if (deps.publicBaseUrlEnv && exercise.file) {
      const token = await exerciseBank.mintDownloadToken(exercise.id);
      extraLines.push(`📎 دانلود کاربرگ: ${deps.publicBaseUrlEnv.replace(/\/+$/, '')}/public/exercise-files/${exercise.id}?token=${token}`);
    } else {
      extraLines.push('برای دریافت فایل تمرین با دفتر مرکز تماس بگیرید.');
    }

    const targets = await guardianChats(stu.id);
    const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();

    let enqueued = 0;
    for (const target of targets) {
      const outcome = await notify.enqueue({
        channel,
        template: 'homework_assigned',
        recipient: target,
        studentId: stu.id,
        payload: { studentName: stu.name, extra: extraLines.join('\n'), clinicName },
        dedupKey: `hw:${assignment.id}:${target}`
      });
      if (!outcome.duplicate) enqueued += 1;
    }
    if (enqueued > 0) await notify.dispatchPending(50);

    await audit.log({
      actorId: owner.refId,
      action: 'exercise.homework.sent',
      resourceType: 'exercise_assignment',
      resourceId: assignment.id,
      changes: {
        exerciseId: { from: null, to: exercise.id },
        studentId: { from: null, to: stu.id },
        enqueued: { from: null, to: enqueued },
        via: { from: null, to: 'stu_menu' }
      }
    });
    log.info('stu.homework.sent', { assignmentId: assignment.id, studentId: stu.id, enqueued });

    const note = enqueued > 0
      ? 'به چت خانواده ارسال شد.'
      : 'ولیّ این دانش‌آموز هنوز به بات متصل نیست — تکلیف در پرونده ثبت شد اما پیامی ارسال نشد.';
    return {
      text: renderTemplate('bot_exercise_sent', { studentName: stu.name, extra: note }),
      buttons: [[{ text: `↩ بازگشت به ${truncateLabel(stu.name, 12)}`, callbackData: `stu:menu:${stuIdx}` }]]
    };
  }

  // ───────── پیام به خانواده (فرم دو مرحله‌ای) ─────────

  /** شروع فرم — ولیّ متصل ندارند همین‌جا باخبر می‌شوند */
  async function msgStart(chatId: string, idx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[idx];
    if (!stu) return STALE;

    const targets = await guardianChats(stu.id);
    if (targets.length === 0) {
      return {
        text: `⚠️ ولیّ «${stu.name}» هنوز به بات متصل نیست.\n\nپس از اتصال خانواده (کد اتصال از دفتر)، دوباره «پیام به خانواده» را بزنید.`,
        buttons: [[{ text: `↩ بازگشت به ${truncateLabel(stu.name, 12)}`, callbackData: `stu:menu:${idx}` }]]
      };
    }

    await writeState(db, chatId, { v: 1, flow: 'stu_msg', step: 'body', studentId: stu.id, studentName: stu.name }, now);
    return {
      text: `✉️ پیام به خانوادهٔ «${stu.name}»\n\nمتن پیام را بفرستید (۲ تا ۵۰۰ نویسه):\nبرای لغو: /cancel`,
      buttons: null
    };
  }

  /** دریافت متن پیام — اعتبارسنجی + جمع‌بندی با دکمهٔ تأیید */
  async function msgFeed(chatId: string, raw: string): Promise<StuBotReply | null> {
    const st = await readStuMsgState(db, chatId);
    if (!st || st.step !== 'body') return null;
    const body = raw.replace(/\s+/g, ' ').trim();
    if (body.length < FAMILY_MSG_MIN || body.length > FAMILY_MSG_MAX) {
      return {
        text: `⚠️ متن پیام باید ۲ تا ۵۰۰ نویسه باشد — دوباره بفرستید یا با /cancel لغو کنید.`,
        buttons: null
      };
    }
    await writeState(db, chatId, { ...st, body }, now);
    return {
      text: [
        '📋 جمع‌بندی پیام — تأیید می‌کنید؟',
        '',
        `دانش‌آموز: ${st.studentName}`,
        '',
        body,
        '',
        `گیرندگان: چت‌های متصل ولیّ «${st.studentName}»`
      ].join('\n'),
      buttons: [
        [
          { text: '✅ ارسال پیام', callbackData: 'stu:msg:do' },
          { text: '✖ انصراف', callbackData: 'stu:msg:no' }
        ]
      ]
    };
  }

  /** اجرای ارسال — صف bot_family_message + audit؛ گیت دولایه */
  async function msgConfirm(chatId: string): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const st = await readStuMsgState(db, chatId);
    if (!st || !st.body) {
      return { text: 'فرمی در جریان نیست — از منوی دانش‌آموز دوباره شروع کنید.', buttons: null };
    }

    const targets = await guardianChats(st.studentId);
    if (targets.length === 0) {
      await clearStuState(db, chatId);
      return {
        text: '⚠️ ولیّ این دانش‌آموز دیگر متصل نیست — پیام ارسال نشد.',
        buttons: null
      };
    }

    const senderName = await db.queryOne<{ full_name: string }>(
      `SELECT full_name FROM staff WHERE id = ?`,
      [owner.refId]
    ).then((r) => r?.full_name ?? 'همکار مرکز');

    const clinicName = await settings.getClinicName();
    const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
    const ts = now().toISOString();

    let enqueued = 0;
    for (const target of targets) {
      const outcome = await notify.enqueue({
        channel,
        template: 'bot_family_message',
        recipient: target,
        studentId: st.studentId,
        payload: {
          studentName: st.studentName,
          senderName,
          extra: st.body,
          clinicName
        },
        dedupKey: `fam-msg:${st.studentId}:${ts}:${target}`
      });
      if (!outcome.duplicate) enqueued += 1;
    }
    if (enqueued > 0) await notify.dispatchPending(50);

    await audit.log({
      actorId: owner.refId,
      action: 'bot.family_message',
      resourceType: 'student',
      resourceId: st.studentId,
      changes: {
        enqueued: { from: null, to: enqueued },
        targets: { from: null, to: targets.length },
        chatId: { from: null, to: chatId }
      }
    });
    log.info('stu.family_message', { studentId: st.studentId, enqueued, by: owner.refId });
    await clearStuState(db, chatId);

    // قالب اختصاصی پیام (قبلاً «تکلیف ثبت شد» نمایش می‌داد — اشتباه)
    return {
      text: renderTemplate('bot_family_message_sent', { studentName: st.studentName, extra: `پیام شما به ${faDigits(String(enqueued))} گفتگوی خانواده ارسال شد.` }),
      buttons: null
    };
  }

  async function msgAbort(chatId: string): Promise<StuBotReply> {
    await clearStuState(db, chatId);
    return { text: '✖️ پیام لغو شد.', buttons: null };
  }

  // ───────── نماهای فقط‌خواندنی ─────────

  /** تمرین‌های دانش‌آموز — باز‌ها اول، بعد آخرین انجام‌شده‌ها */
  async function homework(chatId: string, idx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[idx];
    if (!stu) return STALE;
    if (!exerciseBank) return { text: renderTemplate('bot_exercise_disabled'), buttons: null };

    const list = await exerciseBank.listAssignments({ studentId: stu.id, limit: 10 });
    if (list.length === 0) {
      return {
        text: `📚 برای «${stu.name}» هنوز تکلیفی ثبت نشده است.`,
        buttons: [[{ text: `📤 ارسال تکلیف`, callbackData: `stu:send:${idx}:1` }], [{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
      };
    }
    const open = list.filter((a) => a.status === 'assigned');
    const rest = list.filter((a) => a.status !== 'assigned');
    const lines: string[] = [];
    if (open.length > 0) {
      lines.push(`باز (${faDigits(String(open.length))}):`);
      for (const a of open) lines.push(`• ${a.exerciseTitle} — ${jalaliFullLabel(tehranYmdOf(a.createdAt))}`);
    }
    if (rest.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('آخرین وضعیت‌ها:');
      for (const a of rest.slice(0, 5)) {
        lines.push(`• ${a.exerciseTitle} — ${HW_STATUS_LABELS[a.status] ?? a.status}`);
      }
    }
    return {
      text: [`📚 تمرین‌های «${stu.name}»`, '', ...lines].join('\n'),
      buttons: [[{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
    };
  }

  /** نوبت‌های ۱۴ روز آیندهٔ دانش‌آموز — فقط‌خواندنی */
  async function appointments(chatId: string, idx: number): Promise<StuBotReply> {
    const owner = await staffGate(chatId);
    if (!owner) return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    const state = await readStuState(chatId);
    const stu = state?.students?.[idx];
    if (!stu) return STALE;

    const rows = await db.query<{ start_at: string; status: string; staff_name: string | null }>(
      `SELECT a.start_at, a.status, st.full_name AS staff_name
         FROM appointments a
         JOIN appointment_students ax ON ax.appointment_id = a.id
         LEFT JOIN staff st ON st.id = a.staff_id
        WHERE ax.student_id = ? AND a.start_at >= ? AND a.start_at <= ?
        ORDER BY a.start_at
        LIMIT 12`,
      [stu.id, now().toISOString(), new Date(now().getTime() + 14 * 24 * 3600 * 1000).toISOString()]
    );
    if (rows.length === 0) {
      return {
        text: `🗓 نوبتی در ۱۴ روز آینده برای «${stu.name}» ثبت نشده است.`,
        buttons: [[{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
      };
    }
    const lines = rows.map((r) => {
      const status = r.status === 'cancelled' ? ' (لغوشده)' : '';
      return `• ${jalaliFullLabel(tehranYmdOf(r.start_at))} — ${faDigits(tehranTimeLabel(r.start_at))} — ${r.staff_name ?? 'متخصص'}${status}`;
    });
    return {
      text: [`🗓 نوبت‌های پیش‌روی «${stu.name}»`, '', ...lines].join('\n'),
      buttons: [[{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
    };
  }

  // ───────── فعالیت کلاس (معلم مدرسه) ─────────

  /** «فعالیت کلاس» — شمارش باز + ۸ آیتم آخر کلاس؛ فقط معلم کلاس */
  async function classActivity(chatId: string): Promise<StuBotReply> {
    const owner = await resolveOwner(chatId);
    if (!owner || owner.kind !== 'class') {
      return { text: renderTemplate('bot_my_students_denied'), buttons: null };
    }
    const cls = await db.queryOne<{ name: string; school_name: string }>(
      `SELECT c.name, sc.name AS school_name
         FROM classes c JOIN schools sc ON sc.id = c.school_id
        WHERE c.id = ?`,
      [owner.refId]
    );

    const openRow = await db.queryOne<{ n: number; students: number }>(
      `SELECT COUNT(*) AS n, COUNT(DISTINCT ea.student_id) AS students
         FROM exercise_assignments ea
         JOIN students s ON s.id = ea.student_id
        WHERE s.class_id = ? AND s.active = 1 AND ea.status = 'assigned'`,
      [owner.refId]
    );

    const latest = await db.query<{ exercise_title: string; student_name: string; status: string; created_at: string }>(
      `SELECT e.title AS exercise_title, s.first_name || ' ' || s.last_name AS student_name,
              ea.status, ea.created_at
         FROM exercise_assignments ea
         JOIN exercises e ON e.id = ea.exercise_id
         JOIN students s ON s.id = ea.student_id
        WHERE s.class_id = ? AND s.active = 1
        ORDER BY ea.created_at DESC
        LIMIT 8`,
      [owner.refId]
    );

    const lines: string[] = [
      `تکلیف باز کلاس: ${faDigits(String(openRow?.n ?? 0))} برای ${faDigits(String(openRow?.students ?? 0))} دانش‌آموز`
    ];
    if (latest.length > 0) {
      lines.push('', 'آخرین تکلیف‌ها:');
      for (const r of latest) {
        lines.push(`• ${r.exercise_title} — ${r.student_name} — ${HW_STATUS_LABELS[r.status] ?? r.status}`);
      }
    } else {
      lines.push('', 'هنوز تکلیفی برای دانش‌آموزان کلاس ثبت نشده است.');
    }

    return {
      text: renderTemplate('bot_class_activity', {
        className: cls ? `${cls.name} — ${cls.school_name}` : 'کلاس',
        list: lines.join('\n'),
        clinicName: await settings.getClinicName()
      }),
      buttons: null
    };
  }

  return {
    list,
    menu,
    sendExercises,
    pick,
    yes,
    msgStart,
    msgFeed,
    msgConfirm,
    msgAbort,
    homework,
    appointments,
    classActivity,
    readStuMsgState: (chatId: string) => readStuMsgState(db, chatId)
  };
}

export type StudentActionsBot = ReturnType<typeof createStudentActionsBot>;
