/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — بات بانک تمرین (تکلیف و بازگشت فایل)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// جریان تو‌در‌توی «بانک تمرین» بات برای همکاران و معلمان:
// ریشه → دستهٔ برچسب → فهرست تمرین → جزئیات → انتخاب دانش‌آموز → تأیید → ارسال به اولیا
// وضعیت منو در bot_menu_state (chat_id → JSON) نگه داشته می‌شود چون شناسه‌ها UUIDاند و
// callback_data بیش از ۶۴ بایت نمی‌پذیرد — callback فقط اندیس حمل می‌کند.
// گیت نقش روی «هر» مرحله دوباره چک می‌شود (الگوی دولایه — حتی برای callback).

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import type { InlineButton, NotifyService } from '@core/notify';
import type { BotCommand, ExbCat } from '@core/notify';
import { EXB_PAGE_SIZE, EXB_STUDENTS_PAGE_SIZE, faDigits } from '@core/shared';
import type { ExerciseBankService } from '@domain/exercise-bank';
import { truncateLabel } from '@domain/exercise-bank';
import type { SettingsService } from '@app/settings';
import { renderTemplate } from '@core/notify';

export interface BotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

/** زیرمجموعهٔ exb از BotCommand — Extract روی kind */
export type ExbCommand = Extract<BotCommand, { kind: `exb_${string}` }>;

export interface ExbBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  /** هستهٔ صف اعلان — ارسال تکلیف به اولیا از همین مسیر با dedup */
  notify: NotifyService;
  settings: SettingsService;
  exerciseBank: ExerciseBankService;
  /** آدرس عمومی سامانه برای لینک دانلود — خالی یعنی لینک در پیام نمی‌آید */
  publicBaseUrl: string | null;
  now?: () => Date;
}

/** بازیگر بات برای ثبت تکلیف و audit */
const EXB_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

interface ExbState {
  v: 1;
  /** برچسب‌های آخرین نمای دسته — اندیس callback به این اشاره می‌کند */
  cats?: string[];
  /** تمرین‌های آخرین نمای فهرست */
  ex?: { id: string; title: string }[];
  /** — بسته‌های آخرین نمای فهرست بسته‌ها */
  pk?: { id: string; title: string }[];
  /** دانش‌آموزان آخرین نمای انتخاب */
  stu?: { id: string; name: string }[];
  /** callback فهرست مبدأ برای «بازگشت» از جزئیات */
  back?: string;
  /** آخرین yes اجرا شد — جلوگیری از دوباره‌ارسال با دکمهٔ قدیمی */
  sent?: boolean;
}

interface Owner {
  kind: 'staff' | 'class';
  refId: string;
  role: string | null;
}

type Gate = { ok: true; owner: Owner } | { ok: false; reason: 'disabled' | 'denied' };

const FORMAT_LABELS: Record<string, string> = {
  worksheet: 'کاربرگ',
  game: 'بازی',
  instruction: 'دستورالعمل خانه'
};

function formatSize(bytes: number): string {
  if (bytes >= 1024) return `${Math.round(bytes / 1024)}KB`;
  return `${bytes}B`;
}

export function createExerciseBankBot(deps: ExbBotDeps) {
  const { db, audit, logger, notify, settings, exerciseBank } = deps;
  const log = logger.child('exb-bot');
  const now = deps.now ?? (() => new Date());

  // ───────────── state helpers ─────────────

  async function readState(chatId: string): Promise<ExbState> {
    const row = await db.queryOne<{ payload: string }>(
      `SELECT payload FROM bot_menu_state WHERE chat_id = ?`,
      [chatId]
    );
    if (!row) return { v: 1 };
    try {
      const parsed = JSON.parse(row.payload) as ExbState;
      return parsed && parsed.v === 1 ? parsed : { v: 1 };
    } catch {
      return { v: 1 };
    }
  }

  async function writeState(chatId: string, state: ExbState): Promise<void> {
    await db.execute(
      `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [chatId, JSON.stringify(state), now().toISOString()]
    );
  }

  // ───────────── گیت نقش + کلید قطع ─────────────

  async function gate(chatId: string): Promise<Gate> {
    const enabled = await settings.getExerciseBankEnabled();
    if (!enabled) return { ok: false, reason: 'disabled' };

    const owner = await db.queryOne<{ kind: string; ref_id: string; role: string | null }>(
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
    if (!owner) return { ok: false, reason: 'denied' };
    if (owner.kind !== 'staff' && owner.kind !== 'class') return { ok: false, reason: 'denied' };
    // ناظر اداره از بانک تمرین محروم است (بدون دادهٔ اسم‌دار)
    if (owner.kind === 'staff' && owner.role === 'supervisor') return { ok: false, reason: 'denied' };
    return { ok: true, owner: { kind: owner.kind, refId: owner.ref_id, role: owner.role } };
  }

  function deniedReply(reason: 'disabled' | 'denied'): BotReply {
    if (reason === 'disabled') {
      return { text: renderTemplate('bot_exercise_disabled'), buttons: null };
    }
    return { text: renderTemplate('bot_exercise_denied'), buttons: null };
  }

  const STALE: BotReply = {
    text: '⏳ این منو قدیمی است — دکمهٔ «بانک تمرین» را دوباره بزنید.',
    buttons: [[{ text: '📚 بانک تمرین', callbackData: 'exb:root' }]]
  };

  // ───────────── دامنهٔ دانش‌آموزان فرستنده ─────────────

  interface StudentLite {
    id: string;
    name: string;
  }

  async function scopedStudents(owner: Owner): Promise<StudentLite[]> {
    if (owner.kind === 'class') {
      const rows = await db.query<{ id: string; name: string }>(
        `SELECT id, first_name || ' ' || last_name AS name
           FROM students WHERE class_id = ? AND active = 1
          ORDER BY last_name, first_name`,
        [owner.refId]
      );
      return rows;
    }
    if (owner.role === 'therapist') {
      // دانش‌آموزان جلسات درمانگر — همان مرز «نوبت‌های من»
      const rows = await db.query<{ id: string; name: string }>(
        `SELECT DISTINCT s.id, s.first_name || ' ' || s.last_name AS name
           FROM appointment_students ax
           JOIN appointments a ON a.id = ax.appointment_id
           JOIN students s ON s.id = ax.student_id
          WHERE a.staff_id = ? AND s.active = 1
          ORDER BY s.last_name, s.first_name`,
        [owner.refId]
      );
      return rows;
    }
    // مدیر/منشی — همهٔ پرونده‌های فعال (دفتر)
    const rows = await db.query<{ id: string; name: string }>(
      `SELECT id, first_name || ' ' || last_name AS name
         FROM students WHERE active = 1
        ORDER BY last_name, first_name`
    );
    return rows;
  }

  // ───────────── نماها ─────────────

  async function renderRoot(): Promise<BotReply> {
    const text = [
      '📚 بانک تمرین مرکز',
      '',
      'کاربرگ‌ها و بازی‌های آموزشی را مرور کنید و برای هر دانش‌آموز، تکلیف را به چت خانواده‌اش بفرستید.'
    ].join('\n');
    return {
      text,
      buttons: [
        [{ text: '📚 همهٔ تمرین‌ها', callbackData: 'exb:lst:a:0:1' }],
        [
          { text: '🧩 اختلال‌ها', callbackData: 'exb:cats:d:1' },
          { text: '🎓 پایه‌ها', callbackData: 'exb:cats:g:1' }
        ],
        [{ text: '🏷 سایر برچسب‌ها', callbackData: 'exb:cats:o:1' }]
      ]
    };
  }

  async function renderCats(chatId: string, cat: ExbCat, page: number): Promise<BotReply> {
    const groups = await exerciseBank.categories();
    const list = cat === 'd' ? groups.disorder : cat === 'g' ? groups.grade : groups.other;
    if (list.length === 0) {
      return {
        text: '🏷 هنوز برچسبی در این دسته ثبت نشده است — برچسب‌ها از پنل مدیریت ساخته می‌شوند.',
        buttons: [[{ text: '↩ بازگشت', callbackData: 'exb:root' }]]
      };
    }
    const total = list.length;
    const totalPages = Math.max(1, Math.ceil(total / EXB_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = list.slice((safePage - 1) * EXB_PAGE_SIZE, safePage * EXB_PAGE_SIZE);

    const state = await readState(chatId);
    // لیست کامل برچسب‌های همین دسته ذخیره می‌شود — اندیس callback جهانی است
    state.cats = list.map((t) => t.id);
    delete state.ex;
    delete state.stu;
    delete state.sent;
    await writeState(chatId, state);

    const title = cat === 'd' ? '🧩 برچسب اختلال' : cat === 'g' ? '🎓 برچسب پایه' : '🏷 سایر برچسب‌ها';
    const rows: InlineButton[][] = slice.map((t, i) => [
      { text: truncateLabel(t.name), callbackData: `exb:lst:${cat}:${(safePage - 1) * EXB_PAGE_SIZE + i}:1` }
    ]);
    const nav: InlineButton[] = [];
    if (safePage > 1) nav.push({ text: '▶ بعدی', callbackData: `exb:cats:${cat}:${safePage - 1}` });
    if (safePage < totalPages) nav.push({ text: '◀ قبلی', callbackData: `exb:cats:${cat}:${safePage + 1}` });
    // RTL: «قبلی» در سمت چپ مفهوم «صفحهٔ بعد» را می‌دهد — برچسب‌ها از دید کاربر فارسی‌اند
    nav.push({ text: '↩ بازگشت', callbackData: 'exb:root' });
    rows.push(nav);

    return {
      text: `${title} — صفحهٔ ${safePage} از ${totalPages} (${total} برچسب):\n\nیکی را انتخاب کنید تا تمرین‌های آن بیاید.`,
      buttons: rows
    };
  }

  async function renderList(chatId: string, cat: ExbCat, tagIdx: number, page: number): Promise<BotReply> {
    let tagId: string | undefined;
    if (cat !== 'a') {
      const state = await readState(chatId);
      tagId = state.cats?.[tagIdx];
      if (!tagId) return STALE;
    }
    const result = await exerciseBank.list(
      { tagId, publishedOnly: true, page, pageSize: EXB_PAGE_SIZE },
      EXB_ACTOR
    );
    if (result.items.length === 0) {
      return {
        text: renderTemplate('bot_exercise_empty'),
        buttons: [[{ text: '↩ بازگشت', callbackData: 'exb:root' }]]
      };
    }

    const state = await readState(chatId);
    state.ex = result.items.map((e) => ({ id: e.id, title: e.title }));
    delete state.stu;
    delete state.sent;
    state.back = `exb:lst:${cat}:${tagIdx}:${result.page}`;
    await writeState(chatId, state);

    const totalPages = Math.max(1, Math.ceil(result.total / result.pageSize));
    const rows: InlineButton[][] = result.items.map((e, i) => [
      { text: truncateLabel(e.title), callbackData: `exb:item:${i}` }
    ]);
    const nav: InlineButton[] = [];
    if (result.page > 1) nav.push({ text: '▶ بعدی', callbackData: `exb:lst:${cat}:${tagIdx}:${result.page - 1}` });
    if (result.hasMore) nav.push({ text: '◀ قبلی', callbackData: `exb:lst:${cat}:${tagIdx}:${result.page + 1}` });
    nav.push({ text: '↩ بازگشت', callbackData: 'exb:root' });
    rows.push(nav);

    return {
      text: `📚 تمرین‌ها — صفحهٔ ${result.page} از ${totalPages} (مجموع ${result.total}):\n\nروی تمرین بزنید تا جزئیات و دکمهٔ ارسال تکلیف بیاید.`,
      buttons: rows
    };
  }

  async function renderItem(chatId: string, idx: number): Promise<BotReply> {
    const state = await readState(chatId);
    const lite = state.ex?.[idx];
    if (!lite) return STALE;
    const exercise = await exerciseBank.getById(lite.id);
    if (!exercise || !exercise.published) {
      return {
        text: '⚠️ این تمرین دیگر منتشر نمی‌شود.',
        buttons: [[{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]]
      };
    }

    const lines = [`📚 ${exercise.title}`];
    lines.push(`قالب: ${FORMAT_LABELS[exercise.format] ?? exercise.format}`);
    if (exercise.description) lines.push('', exercise.description);
    if (exercise.tags.length > 0) lines.push('', `🏷 ${exercise.tags.map((t) => t.name).join('، ')}`);
    if (exercise.files.length > 0) {
      // چند فایل: همه (تا ۶ مورد) با نام و حجم
      lines.push('', `📎 فایل‌های پیوست (${faDigits(exercise.files.length)}):`);
      for (const f of exercise.files.slice(0, 6)) {
        lines.push(`• ${f.filename} (${formatSize(f.size)})`);
      }
      if (exercise.files.length > 6) lines.push(`• و ${faDigits(exercise.files.length - 6)} فایل دیگر`);
    } else if (exercise.file) {
      lines.push('', `📎 فایل: ${exercise.file.filename} (${formatSize(exercise.file.size)})`);
    } else {
      lines.push('', '📎 فایل پیوست ندارد.');
    }

    return {
      text: lines.join('\n'),
      buttons: [
        [{ text: '📤 ارسال تکلیف به خانواده', callbackData: `exb:send:${idx}:1` }],
        [{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]
      ]
    };
  }

  async function renderStudents(chatId: string, owner: Owner, idx: number, page: number): Promise<BotReply> {
    const state = await readState(chatId);
    const lite = state.ex?.[idx];
    if (!lite) return STALE;

    const all = await scopedStudents(owner);
    if (all.length === 0) {
      return {
        text: 'هنوز دانش‌آموزی به شما مرتبط نیست.\n\n• همکاران مرکز: با ثبت جلسه برای دانش‌آموزان، فهرست شما ساخته می‌شود.\n• معلمان: با اتصال کد کلاس، دانش‌آموزان کلاس دیده می‌شوند.',
        buttons: [[{ text: '↩ بازگشت', callbackData: `exb:item:${idx}` }]]
      };
    }
    const totalPages = Math.max(1, Math.ceil(all.length / EXB_STUDENTS_PAGE_SIZE));
    const safePage = Math.min(Math.max(page, 1), totalPages);
    const slice = all.slice((safePage - 1) * EXB_STUDENTS_PAGE_SIZE, safePage * EXB_STUDENTS_PAGE_SIZE);

    state.stu = slice;
    delete state.sent;
    await writeState(chatId, state);

    const rows: InlineButton[][] = slice.map((s, i) => [
      { text: truncateLabel(s.name, 24), callbackData: `exb:pick:${idx}:${i}` }
    ]);
    const nav: InlineButton[] = [];
    if (safePage > 1) nav.push({ text: '▶ بعدی', callbackData: `exb:send:${idx}:${safePage - 1}` });
    if (safePage < totalPages) nav.push({ text: '◀ قبلی', callbackData: `exb:send:${idx}:${safePage + 1}` });
    nav.push({ text: '↩ بازگشت', callbackData: `exb:item:${idx}` });
    rows.push(nav);

    return {
      text: `📤 ارسال «${lite.title}» به خانوادهٔ کدام دانش‌آموز؟\nصفحهٔ ${safePage} از ${totalPages} — مجموع ${all.length} دانش‌آموز:`,
      buttons: rows
    };
  }

  async function renderConfirm(chatId: string, idx: number, stuIdx: number): Promise<BotReply> {
    const state = await readState(chatId);
    const lite = state.ex?.[idx];
    const student = state.stu?.[stuIdx];
    if (!lite || !student) return STALE;
    return {
      text: `📤 تأیید ارسال تکلیف\n\nتمرین: ${lite.title}\nدانش‌آموز: ${student.name}\n\nکاربرگ به چت متصل ولیّ این دانش‌آموز ارسال می‌شود.`,
      buttons: [
        [
          { text: '✅ ارسال', callbackData: `exb:yes:${idx}:${stuIdx}` },
          { text: '✖ انصراف', callbackData: `exb:send:${idx}:1` }
        ]
      ]
    };
  }

  // ───────────── ارسال به اولیا ─────────────

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

  async function executeSend(chatId: string, owner: Owner, idx: number, stuIdx: number): Promise<BotReply> {
    const state = await readState(chatId);
    if (state.sent) {
      return {
        text: '✅ این تکلیف از همین منو قبلاً ارسال شد — برای ارسال دوباره، تمرین را دوباره باز کنید.',
        buttons: [[{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]]
      };
    }
    const lite = state.ex?.[idx];
    const student = state.stu?.[stuIdx];
    if (!lite || !student) return STALE;

    const exercise = await exerciseBank.getById(lite.id);
    if (!exercise || !exercise.published) {
      return {
        text: '⚠️ این تمرین دیگر منتشر نمی‌شود.',
        buttons: [[{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]]
      };
    }

    // ثبت تکلیف (گارد سرویس: منتشرشده + دانش‌آموز فعال)
    const assignment = await exerciseBank.assign(
      {
        exerciseId: exercise.id,
        studentId: student.id,
        assignedBy: owner.kind === 'class' ? `class:${owner.refId}` : owner.refId,
        via: 'bot',
        note: null
      },
      EXB_ACTOR
    );

    // لینک امضاشده فقط با PUBLIC_BASE_URL معنا دارد — یک لینک برای هر فایل
    const extraLines = [`تمرین: ${exercise.title}`];
    if (exercise.description) extraLines.push(exercise.description);
    if (deps.publicBaseUrl && exercise.files.length > 0) {
      for (const f of exercise.files.slice(0, 6)) {
        const token = await exerciseBank.mintDownloadToken(exercise.id, f.id);
        extraLines.push(`📎 ${f.filename}: ${deps.publicBaseUrl.replace(/\/+$/, '')}/public/exercise-files/${exercise.id}?token=${token}`);
      }
      if (exercise.files.length > 6) extraLines.push(`و ${faDigits(exercise.files.length - 6)} فایل دیگر با تماس از دفتر مرکز.`);
    } else if (deps.publicBaseUrl && exercise.file) {
      const token = await exerciseBank.mintDownloadToken(exercise.id);
      extraLines.push(`📎 دانلود کاربرگ: ${deps.publicBaseUrl.replace(/\/+$/, '')}/public/exercise-files/${exercise.id}?token=${token}`);
    } else {
      extraLines.push('برای دریافت فایل تمرین با دفتر مرکز تماس بگیرید.');
    }

    // مقصدها: bot_links متصل + prefs دستی (الگوی )
    const targets = await guardianChats(student.id);
    const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
    const clinicName = await settings.getClinicName();

    let enqueued = 0;
    for (const target of targets) {
      const outcome = await notify.enqueue({
        channel,
        template: 'homework_assigned',
        recipient: target,
        studentId: student.id,
        payload: { studentName: student.name, extra: extraLines.join('\n'), clinicName },
        dedupKey: `hw:${assignment.id}:${target}`
      });
      if (!outcome.duplicate) enqueued += 1;
    }
    if (enqueued > 0) await notify.dispatchPending(50);

    await audit.log({
      actorId: owner.kind === 'class' ? 'bale-bot' : owner.refId,
      action: 'exercise.homework.sent',
      resourceType: 'exercise_assignment',
      resourceId: assignment.id,
      changes: {
        exerciseId: { from: null, to: exercise.id },
        studentId: { from: null, to: student.id },
        enqueued: { from: null, to: enqueued },
        targets: { from: null, to: targets.length }
      }
    });
    log.info('exercise.homework.sent', { assignmentId: assignment.id, targets: targets.length, enqueued });

    // جلوگیری از دوباره‌ارسال با دکمهٔ قدیمی
    state.sent = true;
    await writeState(chatId, state);

    const note = enqueued > 0
      ? 'به چت خانواده ارسال شد.'
      : 'ولیّ این دانش‌آموز هنوز به بات متصل نیست — تکلیف در پرونده ثبت شد اما پیامی ارسال نشد.';
    return {
      text: renderTemplate('bot_exercise_sent', { studentName: student.name, extra: note }),
      buttons: [[{ text: '↩ بازگشت به فهرست', callbackData: state.back ?? 'exb:root' }]]
    };
  }

  // ───────────── نقطهٔ ورود ─────────────

  return {
    /** «بانک تمرین» یا /bank — منوی ریشه */
    async root(chatId: string): Promise<BotReply> {
      const g = await gate(chatId);
      if (!g.ok) return deniedReply(g.reason);
      const state = await readState(chatId);
      delete state.cats;
      delete state.ex;
      delete state.pk;
      delete state.stu;
      delete state.sent;
      await writeState(chatId, state);
      return renderRoot();
    },

    /** همهٔ callbackهای exb: */
    async handle(chatId: string, cmd: ExbCommand): Promise<BotReply> {
      const g = await gate(chatId);
      if (!g.ok) return deniedReply(g.reason);
      const { owner } = g;

      switch (cmd.kind) {
        case 'exb_root':
          return this.root(chatId);
        case 'exb_cats':
          return renderCats(chatId, cmd.cat, cmd.page);
        case 'exb_list':
          return renderList(chatId, cmd.cat, cmd.tagIdx, cmd.page);
        case 'exb_item':
          return renderItem(chatId, cmd.idx);
        case 'exb_send':
          return renderStudents(chatId, owner, cmd.idx, cmd.page);
        case 'exb_pick':
          return renderConfirm(chatId, cmd.idx, cmd.stuIdx);
        case 'exb_yes':
          return executeSend(chatId, owner, cmd.idx, cmd.stuIdx);
        default:
          return STALE;
      }
    }
  };
}

export type ExerciseBankBot = ReturnType<typeof createExerciseBankBot>;
