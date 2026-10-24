import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import type { InlineButton, NotifyService } from '@core/notify';
import type { BotCommand, ExbCat } from '@core/notify';
import { EXB_PAGE_SIZE, faDigits } from '@core/shared';
import type { ExerciseBankService, ExerciseFileSender } from '@domain/exercise-bank';
import { truncateLabel } from '@domain/exercise-bank';
import type { SettingsService } from '@app/settings';
import { renderTemplate } from '@core/notify';

export interface BotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

export type ExbCommand = Extract<BotCommand, { kind: `exb_${string}` }>;

export interface ExbBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  settings: SettingsService;
  exerciseBank: ExerciseBankService;
  publicBaseUrl: string | null;
  fileSender?: ExerciseFileSender | null;
  now?: () => Date;
}

const EXB_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

interface ExbState {
  v: 1;
  cats?: string[];
  ex?: { id: string; title: string }[];
  pk?: { id: string; title: string }[];
  stu?: { id: string; name: string }[];
  back?: string;
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
  const { db, audit, logger, notify, settings, exerciseBank, fileSender } = deps;
  const log = logger.child('exb-bot');
  const now = deps.now ?? (() => new Date());

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

  interface StudentLite {
    id: string;
    name: string;
  }

  async function scopedStudents(owner: Owner): Promise<StudentLite[]> {
    if (owner.kind === 'class') {
      const rows2 = await db.query<{ id: string; name: string }>(
        `SELECT id, first_name || ' ' || last_name AS name
           FROM students WHERE class_id = ? AND active = 1
          ORDER BY last_name, first_name`,
        [owner.refId]
      );
      return rows2;
    }
    if (owner.role === 'therapist') {
      const rows2 = await db.query<{ id: string; name: string }>(
        `SELECT DISTINCT s.id, s.first_name || ' ' || s.last_name AS name
           FROM appointment_students ax
           JOIN appointments a ON a.id = ax.appointment_id
           JOIN students s ON s.id = ax.student_id
          WHERE a.staff_id = ? AND s.active = 1
          ORDER BY s.last_name, s.first_name`,
        [owner.refId]
      );
      return rows2;
    }
    const rows = await db.query<{ id: string; name: string }>(
      `SELECT id, first_name || ' ' || last_name AS name
         FROM students WHERE active = 1
        ORDER BY last_name, first_name`
    );
    return rows;
  }

  async function renderRoot(): Promise<BotReply> {
    const text = [
      '📚 بانک تمرین مرکز',
      '',
      'کاربرگ‌ها و بازی‌های آموزشی مرکز را مرور کنید؛ فایل هر تمرین را می‌توانید دانلود کنید.'
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
      text: `📚 تمرین‌ها — صفحهٔ ${result.page} از ${totalPages} (مجموع ${result.total}):\n\nروی تمرین بزنید تا جزئیات و دکمهٔ دریافت فایل بیاید.`,
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
    const fileRows: InlineButton[][] = [];
    if (exercise.files.length > 0) {
      lines.push('', `📎 فایل‌های پیوست (${faDigits(exercise.files.length)}):`);
      for (const f of exercise.files.slice(0, 6)) {
        lines.push(`• ${f.filename} (${formatSize(f.size)})`);
      }
      if (exercise.files.length > 6) lines.push(`• و ${faDigits(exercise.files.length - 6)} فایل دیگر`);
      for (let i = 0; i < Math.min(exercise.files.length, 4); i += 1) {
        fileRows.push([{ text: `📎 ${truncateLabel(exercise.files[i].filename, 26)}`, callbackData: `exb:file:${idx}:${i}` }]);
      }
    } else if (exercise.file) {
      lines.push('', `📎 فایل: ${exercise.file.filename} (${formatSize(exercise.file.size)})`);
      fileRows.push([{ text: '📎 دریافت فایل', callbackData: `exb:lfile:${idx}` }]);
    } else {
      lines.push('', '📎 فایل پیوست ندارد.');
    }
    fileRows.push([{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]);
    return {
      text: lines.join('\n'),
      buttons: fileRows
    };
  }

  async function sendFile(chatId: string, idx: number, fileIdx: number): Promise<BotReply> {
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
    const back = [[{ text: '↩ بازگشت', callbackData: state.back ?? 'exb:root' }]];
    let target: { id: string; filename: string } | null = null;
    if (fileIdx >= 0) {
      const f = exercise.files[fileIdx];
      if (!f) return { text: renderTemplate('bot_file_unavailable'), buttons: back };
      target = { id: f.id, filename: f.filename };
    } else {
      if (!exercise.file) return { text: renderTemplate('bot_file_unavailable'), buttons: back };
      target = { id: '', filename: exercise.file.filename };
    }
    if (!fileSender) {
      log.warn('exb-bot.file_sender_missing', { chatId, exerciseId: exercise.id });
      return { text: renderTemplate('bot_file_failed'), buttons: back };
    }
    const file = target.id ? await exerciseBank.getAttachmentFile(exercise.id, target.id) : await exerciseBank.getFile(exercise.id);
    if (!file) return { text: renderTemplate('bot_file_unavailable'), buttons: back };
    let ok = false;
    try {
      ok = await fileSender(chatId, {
        filename: file.filename,
        bytes: file.bytes,
        mime: file.mime,
        caption: `📚 «${exercise.title}»`
      });
    } catch (err) {
      log.warn('exb-bot.file_send_error', { chatId, exerciseId: exercise.id, error: err instanceof Error ? err.message : 'unknown' });
    }
    if (ok)
      audit.log({ actorId: 'bale-bot', action: 'exercise.file.sent_to_staff', resourceType: 'exercise', resourceId: exercise.id, changes: { filename: { from: null, to: file.filename } } }).catch(() => undefined);
    return { text: renderTemplate(ok ? 'bot_file_sent' : 'bot_file_failed', { filename: file.filename }), buttons: back };
  }

  return {
    async root(chatId: string): Promise<BotReply> {
      const g = await gate(chatId);
      if (!g.ok) return deniedReply(g.reason);
      const state = await readState(chatId);
      delete state.cats;
      delete state.ex;
      delete state.pk;
      await writeState(chatId, state);
      return renderRoot();
    },

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
        case 'exb_file':
          return sendFile(chatId, cmd.idx, cmd.fileIdx);
        default:
          return STALE;
      }
    }
  };
}

export type ExerciseBankBot = ReturnType<typeof createExerciseBankBot>;
