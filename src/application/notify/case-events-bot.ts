/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — بات رویدادساز (توزیع فرم و دریافت پاسخ)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// جریان «رویداد/گزارش» بات:
// الف) همکاران مرکز: منوی دانش‌آموز → «رویداد/گزارش» → دسته → نوع → ویزارد فرم
// مرحله‌به‌مرحله (هر فیلد یک پیام؛ select/scale با دکمه؛ اختیاری با دکمهٔ رد)
// ب) خانواده: «چک‌لیست‌های من» → فهرست چک‌لیست‌های در انتظار → پر کردن آیتم‌به‌آیتم
// (تصمیم ۳ طراحی: چک‌لیست بلندتر از ۸ آیتم → لینک وب‌فرم امن)
// state در bot_menu_state با flow='tl' (انتخاب نوع) / 'tl_form' / 'clf_form'.
// گیت دولایه: شروع + اجرا هر دو دوباره چک می‌شوند — الگوی /.

import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import { faDigits, jalaliFullLabel, tehranTimeLabel, tehranYmdOf } from '@core/shared';
import type { InlineButton, NotifyService } from '@core/notify';
import { renderTemplate } from '@core/notify';
import { truncateLabel } from '@domain/exercise-bank';
import type {
  CaseEventCategory, CaseEventField, CaseEventRecord, CaseEventsService
} from '@domain/case-events';
import { CASE_EVENT_CATEGORY_LABELS, CHECKLIST_BOT_MAX_ITEMS } from '@domain/case-events';
import type { SettingsService } from '@app/settings';
import type { StuListItem } from './student-actions-bot';
import { clearStuState } from './student-actions-bot';

/** سقف نویسهٔ پاسخ متنی کوتاه/بلند در ویزارد بات — هم‌تراز pure دامنه */
const TEXT_MAX = 200;
const LONGTEXT_MAX = 2000;

export interface CaseEventsBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  settings: SettingsService;
  caseEvents: CaseEventsService | null;
  /** آدرس عمومی سامانه برای لینک وب‌فرم چک‌لیست بلند (خالی = بدون لینک) */
  publicBaseUrlEnv: string | null;
  now?: () => Date;
}

export interface TlBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

/** بازیگر بات برای ثبت رویداد — staffId واقعیِ همکار در createEvent تزریق می‌شود */
const TL_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

/** حالت انتخاب نوع (فهرست دانش‌آموز + idهای نوعِ دستهٔ انتخابی) */
export interface TlPickState {
  v: 1;
  flow: 'tl';
  students: StuListItem[];
  stuIdx: number;
  typeIds: string[];
  typeTitles: string[];
}

/** حالت ویزارد فرم رویداد (همکار) */
export interface TlFormState {
  v: 1;
  flow: 'tl_form';
  studentId: string;
  studentName: string;
  typeId: string;
  typeTitle: string;
  category: CaseEventCategory;
  fields: CaseEventField[];
  step: number;
  answers: Record<string, string>;
  /** — گزارش جلسه به نوبت اخیر همان دانش‌آموز متصل می‌شود (گزارش الزامی هر جلسه) */
  appointmentId?: string | null;
  appointmentLabel?: string | null;
}

/** حالت ویزارد چک‌لیست خانواده */
export interface ClfFormState {
  v: 1;
  flow: 'clf_form';
  eventId: string;
  studentId: string;
  studentName: string;
  typeTitle: string;
  fields: CaseEventField[];
  step: number;
  answers: Record<string, number>;
}

type BotState = TlPickState | TlFormState | ClfFormState;

const SCALE_HINTS: Record<number, string> = {
  3: '۰ = هرگز، ۱ = گاهی، ۲ = بیشتر وقت‌ها، ۳ = همیشه',
  5: '۰ = هیچ تا ۵ = خیلی زیاد',
  4: '۰ = هیچ تا ۴ = خیلی زیاد'
};

function fa(n: number): string {
  return faDigits(String(n));
}

function faNumStr(s: string): string {
  return s.replace(/[0-9]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

export function createCaseEventsBot(deps: CaseEventsBotDeps) {
  const { db, audit, logger, notify, settings, caseEvents } = deps;
  const log = logger.child('tl-bot');
  const now = deps.now ?? (() => new Date());

  const STALE_STAFF: TlBotReply = {
    text: '⏳ این منو قدیمی است — دکمهٔ «دانش‌آموزان فعال» را دوباره بزنید.',
    buttons: [[{ text: '👥 دانش‌آموزان فعال', callbackData: 'stu:list' }]]
  };
  // خانواده پیام STALE غلط می‌گرفت (راهنما به دکمهٔ همکاران اشاره می‌کرد)
  const STALE_FAMILY: TlBotReply = {
    text: '⏳ این منو قدیمی است — دکمهٔ «چک‌لیست‌های من» را دوباره بزنید.',
    buttons: [[{ text: '📝 چک‌لیست‌های من', callbackData: 'clf_list' }]]
  };
  const STALE = STALE_STAFF;

  // ───────── state ─────────

  async function readState<T extends BotState>(chatId: string, flow: T['flow']): Promise<T | null> {
    const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.payload) as BotState;
      return parsed && parsed.v === 1 && parsed.flow === flow ? (parsed as T) : null;
    } catch {
      return null;
    }
  }

  async function writeState(chatId: string, state: BotState): Promise<void> {
    await db.execute(
      `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
       VALUES (?, ?, ?)
       ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
      [chatId, JSON.stringify(state), now().toISOString()]
    );
  }

  async function clearState(chatId: string): Promise<void> {
    await clearStuState(db, chatId);
  }

  /** گیت همکاران مرکز + نقش معتبر برای ثبت رویداد — ناظر/معلم کلاس/ناشناس رد */
  async function staffOwner(chatId: string): Promise<{ staffId: string; role: string } | null> {
    const row = await db.queryOne<{ staff_id: string; role: string | null }>(
      `SELECT l.staff_id, COALESCE(s.role_ext, s.role) AS role
         FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
        WHERE l.chat_id = ? AND l.status = 'linked'`,
      [chatId]
    );
    if (!row) return null;
    if (row.role !== 'manager' && row.role !== 'therapist' && row.role !== 'secretary') return null;
    // تصمیم ۸ طراحی: ثبت گزارش فقط مدیر/درمانگر — منشی فقط خواننده
    if (row.role === 'secretary') return null;
    return { staffId: row.staff_id, role: row.role };
  }

  /** — گیت خواننده: منشی هم تایم‌لاین/چک‌لیست را می‌بیند (فقط‌خواندنی) */
  async function staffReader(chatId: string): Promise<boolean> {
    const row = await db.queryOne<{ role: string | null }>(
      `SELECT COALESCE(s.role_ext, s.role) AS role
         FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
        WHERE l.chat_id = ? AND l.status = 'linked'`,
      [chatId]
    );
    return Boolean(row && (row.role === 'manager' || row.role === 'therapist' || row.role === 'secretary'));
  }

  function actorOf(staffId: string, role: string): AuthContext {
    return { staffId, email: 'bale-bot@system.local', role: role as AuthContext['role'], displayName: 'بات بله' };
  }

  /** چت‌های ولیّ یک دانش‌آموز — از سرویس دامنه (bot_links + prefs) */
  async function guardianChats(studentId: string): Promise<string[]> {
    return caseEvents ? caseEvents.guardianChats(studentId) : [];
  }

  /** چت‌های متصل یک همکار (اعلان نتیجهٔ چک‌لیست) */
  async function staffChats(staffId: string): Promise<string[]> {
    const rows = await db.query<{ chat_id: string }>(
      `SELECT chat_id FROM staff_bot_links WHERE staff_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
      [staffId]
    );
    return rows.map((r) => r.chat_id);
  }

  // ───────── الف) همکاران — ویزارد رویداد ─────────

  /** ورود از منوی دانش‌آموز:stu:tl:<idx> → نمایش سه دسته */
  async function startCategory(chatId: string, stuIdx: number): Promise<TlBotReply> {
    const owner = await staffOwner(chatId);
    if (!owner) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const raw = await readRawState(chatId);
    const stu = raw?.students?.[stuIdx];
    if (!stu) return STALE;

    const cats: CaseEventCategory[] = ['session', 'checklist', 'note'];
    const rows: InlineButton[][] = cats.map((c) => [
      { text: `${c === 'checklist' ? '📝' : c === 'session' ? '🧩' : '🗒'} ${CASE_EVENT_CATEGORY_LABELS[c]}`, callbackData: `tl:types:${stuIdx}:${c}` }
    ]);
    rows.push([{ text: `↩ بازگشت به ${truncateLabel(stu.name, 12)}`, callbackData: `stu:menu:${stuIdx}` }]);
    return {
      text: `📋 ثبت رویداد/گزارش برای «${stu.name}»\n\nدستهٔ رویداد را انتخاب کنید:`,
      buttons: rows
    };
  }

  /** خواندن خام state (فهرست دانش‌آموزان) — flow='stu' */
  async function readRawState(chatId: string): Promise<{ students?: StuListItem[] } | null> {
    const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.payload) as { v?: number; flow?: string; students?: StuListItem[] };
      if (parsed && parsed.v === 1 && parsed.flow === 'stu' && Array.isArray(parsed.students)) return parsed;
      return null;
    } catch {
      return null;
    }
  }

  /** فهرست انواع فعال دسته — برای چک‌لیست‌ها فقط family_fillable */
  async function listTypes(chatId: string, stuIdx: number, cat: string): Promise<TlBotReply> {
    const owner = await staffOwner(chatId);
    if (!owner) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const raw = await readRawState(chatId);
    const stu = raw?.students?.[stuIdx];
    if (!stu) return STALE;
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };

    const category = cat as CaseEventCategory;
    if (!CASE_EVENT_CATEGORY_LABELS[category]) return STALE;
    const types = await caseEvents.listTypes({ activeOnly: true, category });
    if (types.length === 0) {
      return {
        text: `هنوز نوعی در دستهٔ «${CASE_EVENT_CATEGORY_LABELS[category]}» ساخته نشده است.\n\nمدیر می‌تواند از پنل ← «انواع رویداد» نوع جدید بسازد.`,
        buttons: [[{ text: '↩ بازگشت به دسته‌ها', callbackData: `stu:tl:${stuIdx}` }]]
      };
    }

    await writeState(chatId, {
      v: 1,
      flow: 'tl',
      students: raw!.students!,
      stuIdx,
      typeIds: types.map((t) => t.id),
      typeTitles: types.map((t) => `${t.icon ?? ''} ${t.title}`.trim())
    });
    const rows: InlineButton[][] = types.map((t, i) => [
      { text: truncateLabel(`${t.icon ?? ''} ${t.title}`.trim(), 40), callbackData: `tl:start:${stuIdx}:${i}` }
    ]);
    rows.push([{ text: '↩ بازگشت به دسته‌ها', callbackData: `stu:tl:${stuIdx}` }]);
    return {
      text: `نوع «${CASE_EVENT_CATEGORY_LABELS[category]}» برای «${stu.name}» را انتخاب کنید:`,
      buttons: rows
    };
  }

  /** شروع فرم: چک‌لیست → تأیید مستقیم (بدون فیلد درمانگر)؛ بقیه → ویزارد فیلدها */
  async function startForm(chatId: string, stuIdx: number, typeIdx: number): Promise<TlBotReply> {
    const owner = await staffOwner(chatId);
    if (!owner) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const pick = await readState<TlPickState>(chatId, 'tl');
    const stu = pick?.students[stuIdx];
    const typeId = pick?.typeIds[typeIdx];
    if (!stu || !typeId || !caseEvents) return STALE;

    const type = await caseEvents.getTypeById(typeId);
    if (!type || !type.active) {
      return { text: '⚠️ این نوع رویداد دیگر فعال نیست.', buttons: [[{ text: '↩ بازگشت', callbackData: `stu:tl:${stuIdx}` }]] };
    }

    if (type.category === 'checklist') {
      // چک‌لیست فیلد درمانگر ندارد — تأیید مستقیم ساخت و اطلاع‌رسانی به خانواده
      await writeState(chatId, {
        v: 1,
        flow: 'tl_form',
        studentId: stu.id,
        studentName: stu.name,
        typeId: type.id,
        typeTitle: type.title,
        category: type.category,
        fields: [],
        step: type.fields.length,
        answers: {}
      });
      return {
        text: [
          `📝 تأیید ثبت چک‌لیست`,
          '',
          `چک‌لیست: ${type.title}`,
          `دانش‌آموز: ${stu.name}`,
          '',
          'رویداد با وضعیت «در انتظار پاسخ خانواده» ثبت می‌شود و به چت‌های متصل ولیّ اطلاع‌رسانی می‌شود.'
        ].join('\n'),
        buttons: [
          [
            { text: '✅ ثبت و اطلاع‌رسانی', callbackData: 'tl:do' },
            { text: '✖ انصراف', callbackData: 'tl:no' }
          ]
        ]
      };
    }

    // گزارش جلسه: اگر نوبت اخیر (۱۴ ساعت گذشته) همین دانش‌آموز هست، خودکار متصل می‌شود
    let appointmentId: string | null = null;
    let appointmentLabel: string | null = null;
    if (type.category === 'session') {
      try {
        const since = new Date(now().getTime() - 14 * 3600_000).toISOString();
        const appt = await db.queryOne<{ id: string; start_at: string }>(
          `SELECT a.id, a.start_at
             FROM appointments a
             JOIN appointment_students ax ON ax.appointment_id = a.id
            WHERE ax.student_id = ? AND a.status != 'cancelled' AND a.start_at >= ? AND a.start_at <= ?
            ORDER BY a.start_at DESC
            LIMIT 1`,
          [stu.id, since, now().toISOString()]
        );
        if (appt) {
          appointmentId = appt.id;
          appointmentLabel = jalaliFullLabel(tehranYmdOf(appt.start_at)) + ' — ' + faDigits(tehranTimeLabel(appt.start_at));
        }
      } catch { /* اختیاری */ }
    }

    await writeState(chatId, {
      v: 1,
      flow: 'tl_form',
      studentId: stu.id,
      studentName: stu.name,
      typeId: type.id,
      typeTitle: type.title,
      category: type.category,
      fields: type.fields,
      step: 0,
      answers: {},
      appointmentId,
      appointmentLabel
    });
    if (appointmentLabel) {
      return {
        text: `🔗 جلسهٔ اخیر «${stu.name}» پیدا شد:
🗓 ${appointmentLabel}
این گزارش به همین نوبت متصل می‌شود.

برای ادامه، فیلدهای فرم را مرحله‌به‌مرحله پاسخ دهید:`,
        buttons: null
      };
    }
    return promptField(chatId);
  }

  /** پیام فیلد جاری — متن آزاد یا دکمه‌ای */
  async function promptField(chatId: string): Promise<TlBotReply> {
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st) return STALE;
    const f = st.fields[st.step];
    if (!f) return await buildConfirm(chatId);

    const head = `📝 ${st.typeTitle}\nفیلد ${fa(st.step + 1)} از ${fa(st.fields.length)}`;
    if (f.type === 'select') {
      const opts = f.options ?? [];
      const rows: InlineButton[][] = [];
      for (let i = 0; i < opts.length; i += 2) {
        const row: InlineButton[] = [{ text: truncateLabel(opts[i], 22), callbackData: `tl:opt:${i}` }];
        if (opts[i + 1] !== undefined) row.push({ text: truncateLabel(opts[i + 1], 22), callbackData: `tl:opt:${i + 1}` });
        rows.push(row);
      }
      if (!f.required) rows.push([{ text: '⏭ رد کردن', callbackData: 'tl:skip' }]);
      return { text: `${head}\n\n${f.label}${f.required ? '' : ' (اختیاری)'}:`, buttons: rows };
    }
    if (f.type === 'scale') {
      const max = f.scaleMax ?? 3;
      const row: InlineButton[] = [];
      for (let v = 0; v <= max; v++) row.push({ text: faNumStr(String(v)), callbackData: `tl:opt:${v}` });
      const hint = SCALE_HINTS[max] ?? `۰ تا ${fa(max)}`;
      return {
        text: `${head}\n\n${f.label}\n(${hint})${f.required ? '' : ' — اختیاری'}`,
        buttons: [row, f.required ? [] : [{ text: '⏭ رد کردن', callbackData: 'tl:skip' }]].filter((r) => r.length > 0)
      };
    }
    // text / longtext / number — با پیام متنی
    const hint = f.type === 'longtext' ? 'متن را بفرستید' : f.type === 'number' ? 'عدد را بفرستید' : 'متن کوتاه را بفرستید';
    const limit = f.type === 'longtext' ? LONGTEXT_MAX : TEXT_MAX;
    const buttons: InlineButton[][] | null = f.required ? null : [[{ text: '⏭ رد کردن', callbackData: 'tl:skip' }]];
    return {
      text: `${head}\n\n${f.label}${f.required ? '' : ' (اختیاری)'} — ${hint} (تا ${faNumStr(String(limit))} نویسه):\nبرای لغو: /cancel`,
      buttons
    };
  }

  /** پاسخ گزینه‌ای/نمره‌ای به فیلد جاری */
  async function optionPick(chatId: string, value: number): Promise<TlBotReply> {
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st) return STALE;
    const f = st.fields[st.step];
    if (!f) return STALE;
    if (f.type === 'select') {
      const opts = f.options ?? [];
      if (value < 0 || value >= opts.length) return STALE;
      st.answers[f.key] = opts[value];
    } else if (f.type === 'scale') {
      const max = f.scaleMax ?? 3;
      if (value < 0 || value > max) return STALE;
      st.answers[f.key] = String(value);
    } else {
      return STALE;
    }
    st.step += 1;
    await writeState(chatId, st);
    return st.fields[st.step] ? promptField(chatId) : buildConfirm(chatId);
  }

  /** رد کردن فیلد اختیاری */
  async function skipField(chatId: string): Promise<TlBotReply> {
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st) return STALE;
    const f = st.fields[st.step];
    if (!f) return STALE;
    if (f.required) {
      return { text: '⚠️ این فیلد الزامی است و قابل رد کردن نیست.', buttons: null };
    }
    st.step += 1;
    await writeState(chatId, st);
    return st.fields[st.step] ? promptField(chatId) : buildConfirm(chatId);
  }

  /** ورودی متنی آزاد — فیلد جاری text/longtext/number */
  async function feedInput(chatId: string, raw: string): Promise<TlBotReply | null> {
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st) return null;
    const f = st.fields[st.step];
    if (!f) return null;
    if (f.type === 'select' || f.type === 'scale') return null; // این‌ها دکمه‌ای‌اند

    const text = raw.trim();
    if (f.type === 'number') {
      const normalized = faNumStr(text).replace(/[^\d.-]/g, '');
      const n = Number(normalized);
      if (!Number.isFinite(n)) {
        return { text: '⚠️ لطفاً فقط عدد بفرستید (یا /cancel برای لغو).', buttons: null };
      }
      st.answers[f.key] = String(n);
    } else {
      const max = f.type === 'longtext' ? LONGTEXT_MAX : TEXT_MAX;
      const len = Array.from(text).length;
      if (len < 1 || len > max) {
        return { text: `⚠️ متن باید بین ۱ تا ${faNumStr(String(max))} نویسه باشد — دوباره بفرستید یا /cancel بزنید.`, buttons: null };
      }
      st.answers[f.key] = text;
    }
    st.step += 1;
    await writeState(chatId, st);
    return st.fields[st.step] ? promptField(chatId) : buildConfirm(chatId);
  }

  /** جمع‌بندی ویزارد — تأیید نهایی */
  async function buildConfirm(chatId: string): Promise<TlBotReply> {
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st) return STALE;
    const lines = [`📋 جمع‌بندی «${st.typeTitle}»`, `دانش‌آموز: ${st.studentName}`, ''];
    let answered = 0;
    for (const f of st.fields) {
      const v = st.answers[f.key];
      if (v !== undefined && v !== '') {
        lines.push(`• ${f.label}: ${truncateLabel(v, 80)}`);
        answered += 1;
      } else {
        lines.push(`• ${f.label}: —`);
      }
    }
    if (st.category === 'checklist') {
      lines.push('', 'رویداد با وضعیت «در انتظار پاسخ خانواده» ثبت می‌شود و به ولیّ‌ها اطلاع‌رسانی می‌شود.');
    } else {
      lines.push('', `فیلدهای پرشده: ${fa(answered)} از ${fa(st.fields.length)} — روی تایم‌لاین دانش‌آموز می‌نشیند.`);
    }
    return {
      text: lines.join('\n'),
      buttons: [
        [
          { text: '✅ ثبت', callbackData: 'tl:do' },
          { text: '✖ انصراف', callbackData: 'tl:no' }
        ]
      ]
    };
  }

  /** اجرای ثبت — createEvent + اعلان چک‌لیست به خانواده */
  async function confirmCreate(chatId: string): Promise<TlBotReply> {
    const owner = await staffOwner(chatId);
    if (!owner) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const st = await readState<TlFormState>(chatId, 'tl_form');
    if (!st || !caseEvents) return STALE;

    const values: Record<string, string | number | null> = {};
    for (const f of st.fields) {
      const v = st.answers[f.key];
      values[f.key] = v !== undefined && v !== '' ? v : null;
    }

    let event: CaseEventRecord;
    try {
      event = await caseEvents.createEvent(
        {
          eventTypeId: st.typeId,
          studentId: st.studentId,
          values,
          appointmentId: st.appointmentId ?? null
        },
        actorOf(owner.staffId, owner.role)
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ثبت انجام نشد';
      return { text: `⚠️ ${msg}`, buttons: [[{ text: '↩ بازگشت به جمع‌بندی', callbackData: 'tl:no' }]] };
    }

    await audit.log({
      actorId: owner.staffId,
      action: 'bot.case_event.created',
      resourceType: 'case_event',
      resourceId: event.id,
      changes: {
        studentId: { from: null, to: st.studentId },
        eventTypeId: { from: null, to: st.typeId },
        chatId: { from: null, to: chatId }
      }
    });
    log.info('tl.created', { eventId: event.id, studentId: st.studentId, type: st.typeTitle });

    let notifyNote = '';
    if (event.status === 'pending_family') {
      notifyNote = await notifyChecklistAssigned(event, st.studentName, st.typeTitle, chatId);
    }
    await clearState(chatId);
    return {
      text: [
        `✅ رویداد ثبت شد — «${st.typeTitle}»`,
        '',
        `دانش‌آموز: ${st.studentName}`,
        st.appointmentLabel ? `🔗 متصل به جلسه: ${st.appointmentLabel}` : null,
        notifyNote || 'رویداد روی تایم‌لاین پرونده نشست.'
      ].filter((l): l is string => l !== null).join('\n'),
      buttons: null
    };
  }

  /** اعلان چک‌لیست به ولیّ‌ها + لینک وب‌فرم برای فرم بلند — خروجی: خط توضیح برای پیام همکار */
  async function notifyChecklistAssigned(event: CaseEventRecord, studentName: string, typeTitle: string, byChatId: string): Promise<string> {
    const chats = await guardianChats(event.studentId);
    const type = caseEvents ? await caseEvents.getTypeById(event.eventTypeId) : null;
    const itemCount = type?.fields.length ?? 0;
    const useWeb = itemCount > CHECKLIST_BOT_MAX_ITEMS;

    let webLine: string | null = null;
    if (useWeb && deps.publicBaseUrlEnv) {
      webLine = await caseEvents!.mintFillLink(event.id, deps.publicBaseUrlEnv);
    }

    const clinicName = await settings.getClinicName();
    const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
    let enqueued = 0;
    for (const target of chats) {
      const outcome = await notify.enqueue({
        channel,
        template: 'bot_checklist_assigned',
        recipient: target,
        studentId: event.studentId,
        payload: {
          studentName,
          formTitle: typeTitle,
          extra: webLine ? `فرم بلند است — با این لینک امن پر کنید (۷ روز اعتبار):\n${webLine}` : `تعداد آیتم‌ها: ${fa(itemCount)} — از دکمهٔ «چک‌لیست‌های من» در پایین چت پر کنید.`,
          clinicName
        },
        dedupKey: `clf:${event.id}:${target}`
      });
      if (!outcome.duplicate) enqueued += 1;
    }
    if (enqueued > 0) await notify.dispatchPending(50);

    await audit.log({
      actorId: 'bale-bot',
      action: 'bot.checklist_assigned',
      resourceType: 'case_event',
      resourceId: event.id,
      changes: {
        enqueued: { from: null, to: enqueued },
        viaWeb: { from: null, to: webLine ? 1 : 0 },
        byChatId: { from: null, to: byChatId }
      }
    });
    log.info('clf.assigned', { eventId: event.id, enqueued, viaWeb: Boolean(webLine) });

    if (enqueued === 0) {
      return 'ولیّ این دانش‌آموز هنوز به بات متصل نیست — چک‌لیست ثبت شد اما پیامی ارسال نشد. خانواده می‌تواند از دکمهٔ «چک‌لیست‌های من» بعد از اتصال پر کند.';
    }
    return webLine
      ? `به ${fa(enqueued)} گفتگوی خانواده با لینک وب‌فرم اطلاع‌رسانی شد.`
      : `به ${fa(enqueued)} گفتگوی خانواده اطلاع‌رسانی شد — خانواده با «چک‌لیست‌های من» پاسخ می‌دهد.`;
  }

  async function abortCreate(chatId: string): Promise<TlBotReply> {
    await clearState(chatId);
    return { text: '✖️ ثبت رویداد لغو شد.', buttons: null };
  }

  // ───────── ب) خانواده — چک‌لیست‌های من ─────────

  /** دانش‌آموزان متصل به چت خانواده */
  async function familyStudentIds(chatId: string): Promise<string[]> {
    const linkRows = await db.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM bot_links WHERE chat_id = ? AND status = 'linked' AND student_id IS NOT NULL`,
      [chatId]
    );
    const prefRows = await db.query<{ student_id: string }>(
      `SELECT DISTINCT student_id FROM notification_prefs WHERE chat_id = ? AND channel = 'bale' AND student_id IS NOT NULL`,
      [chatId]
    );
    return [...new Set([...linkRows.map((r) => r.student_id), ...prefRows.map((r) => r.student_id)].filter((x): x is string => Boolean(x)))];
  }

  /** «چک‌لیست‌های من» — فهرست چک‌لیست‌های در انتظار پاسخ خانواده */
  async function listMine(chatId: string): Promise<TlBotReply> {
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };
    const studentIds = await familyStudentIds(chatId);
    if (studentIds.length === 0) {
      return { text: 'برای دیدن چک‌لیست‌ها، ابتدا با کد اتصال از دفتر مرکز فرزند خود را به بات وصل کنید.', buttons: null };
    }
    const placeholders = studentIds.map(() => '?').join(', ');
    const rows2 = await db.query<{ id: string; student_id: string; type_title: string; type_icon: string | null; first_name: string; last_name: string; created_at: string }>(
      `SELECT e.id, e.student_id, t.title AS type_title, t.icon AS type_icon,
              s.first_name, s.last_name, e.created_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id AND t.family_fillable = 1
         JOIN students s ON s.id = e.student_id
        WHERE e.student_id IN (${placeholders}) AND e.status = 'pending_family'
        ORDER BY e.created_at DESC
        LIMIT 8`,
      studentIds
    );
    // نتایج قبلی: خانواده بعد از پاسخ، نتیجه/روند را همین‌جا می‌بیند
    const doneRows = await db.query<{ type_title: string; type_icon: string | null; first_name: string; last_name: string; analysis: string | null; occurred_at: string }>(
      `SELECT t.title AS type_title, t.icon AS type_icon, s.first_name, s.last_name, e.analysis, e.occurred_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id AND t.family_fillable = 1
         JOIN students s ON s.id = e.student_id
        WHERE e.student_id IN (${placeholders}) AND e.status = 'completed'
        ORDER BY e.occurred_at DESC
        LIMIT 3`,
      studentIds
    );
    const resultLines: string[] = [];
    for (const d of doneRows) {
      let scoreLine = '';
      try {
        const a = d.analysis ? (JSON.parse(d.analysis) as { score?: number; maxScore?: number; band?: string | null; total?: number }) : null;
        if (a) {
          scoreLine = ` — امتیاز ${fa(a.score ?? 0)} از ${fa(a.maxScore ?? (a.total ?? 0) * 3)}${a.band ? ` (${a.band})` : ''}`;
        }
      } catch { /* بدون تحلیل */ }
      resultLines.push(`• ${d.type_title} — ${d.first_name} ${d.last_name} — ${jalaliFullLabel(tehranYmdOf(d.occurred_at))}${scoreLine}`);
    }

    if (rows2.length === 0) {
      const text = resultLines.length === 0
        ? '✅ چک‌لیست در انتظاری برای فرزندان شما نداریم.'
        : `✅ چک‌لیست در انتظاری نداریم.\n\nآخرین نتایج شما:\n${resultLines.join('\n')}`;
      return { text, buttons: null };
    }
    const buttons: InlineButton[][] = rows2.map((r) => [
      { text: truncateLabel(`${r.type_icon ?? '📝'} ${r.type_title} — ${r.first_name} ${r.last_name}`, 44), callbackData: `clf:fill:${r.id}` }
    ]);
    const text = resultLines.length === 0
      ? `📝 چک‌لیست‌های در انتظار پاسخ (${fa(rows2.length)}):\n\nروی هر مورد بزنید و به آیتم‌ها پاسخ دهید:`
      : `📝 چک‌لیست‌های در انتظار پاسخ (${fa(rows2.length)}):\n\nروی هر مورد بزنید و به آیتم‌ها پاسخ دهید:\n\n――\nآخرین نتایج:\n${resultLines.join('\n')}`;
    return { text, buttons };
  }

  /** شروع پر کردن — گیت خانواده + مسیر بات/وب (تصمیم ۳) */
  async function startFill(chatId: string, eventId: string): Promise<TlBotReply> {
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };
    const event = await caseEvents.getEventById(eventId);
    if (!event || event.typeCategory !== 'checklist') {
      return { text: '⚠️ این چک‌لیست پیدا نشد.', buttons: null };
    }
    if (event.status !== 'pending_family') {
      return { text: 'این چک‌لیست قبلاً پاسخ گرفته یا فعال نیست. با تشکر از همراهی شما.', buttons: null };
    }
    const allowed = await caseEvents.assertFamilyChat(event.studentId, chatId);
    if (!allowed) {
      return { text: '⚠️ این چک‌لیست برای فرزندان متصل به این چت نیست.', buttons: null };
    }
    const type = await caseEvents.getTypeById(event.eventTypeId);
    const fields = type?.fields ?? [];
    if (fields.length === 0) return { text: '⚠️ این چک‌لیست فاقد آیتم است.', buttons: null };

    if (fields.length > CHECKLIST_BOT_MAX_ITEMS) {
      // تصمیم ۳: فرم بلند → وب‌فرم امن
      const link = deps.publicBaseUrlEnv ? await caseEvents.mintFillLink(event.id, deps.publicBaseUrlEnv) : null;
      if (link) {
        return {
          text: [
            `📝 ${event.typeTitle}`,
            '',
            `این چک‌لیست ${fa(fields.length)} آیتم دارد و در بات طولانی می‌شود.`,
            'با لینک امن زیر در مرورگر پر کنید (۷ روز اعتبار):',
            '',
            link
          ].join('\n'),
          buttons: null
        };
      }
      // بدون publicBaseUrl — همان بات ادامه می‌دهیم (بهترین تلاش)
    }

    const stuName = await db.queryOne<{ name: string }>(
      `SELECT first_name || ' ' || last_name AS name FROM students WHERE id = ?`,
      [event.studentId]
    );
    await writeState(chatId, {
      v: 1,
      flow: 'clf_form',
      eventId: event.id,
      studentId: event.studentId,
      studentName: stuName?.name ?? '',
      typeTitle: event.typeTitle,
      fields,
      step: 0,
      answers: {}
    });
    return promptClfItem(chatId);
  }

  /** پیام آیتم جاری چک‌لیست خانواده — پشتیبانی گزینه‌ای نمره‌دار (فقط برچسب، بدون نمره) */
  async function promptClfItem(chatId: string): Promise<TlBotReply> {
    const st = await readState<ClfFormState>(chatId, 'clf_form');
    if (!st) return STALE;
    const f = st.fields[st.step];
    if (!f) return buildClfConfirm(chatId);
    if (f.type === 'single' && f.scoredOptions && f.scoredOptions.length > 0) {
      const rows: InlineButton[][] = [];
      for (const o of f.scoredOptions) {
        rows.push([{ text: truncateLabel(o.label, 40), callbackData: `clf:a:${f.scoredOptions.indexOf(o)}` }]);
      }
      return {
        text: [
          `📝 ${st.typeTitle}${st.studentName ? ` — ${st.studentName}` : ''}`,
          `آیتم ${fa(st.step + 1)} از ${fa(st.fields.length)}`,
          '',
          f.label
        ].join('\n'),
        buttons: [...rows, [{ text: '✖ انصراف', callbackData: 'clf:no' }]]
      };
    }
    const max = f.scaleMax ?? 3;
    const row: InlineButton[] = [];
    for (let v = 0; v <= max; v++) row.push({ text: faNumStr(String(v)), callbackData: `clf:a:${v}` });
    return {
      text: [
        `📝 ${st.typeTitle}${st.studentName ? ` — ${st.studentName}` : ''}`,
        `آیتم ${fa(st.step + 1)} از ${fa(st.fields.length)}`,
        '',
        f.label,
        '',
        `(${SCALE_HINTS[max] ?? `۰ تا ${fa(max)}`})`
      ].join('\n'),
      buttons: [row, [{ text: '✖ انصراف', callbackData: 'clf:no' }]]
    };
  }

  /** پاسخ به آیتم جاری — گزینه‌ای نمره‌دار = اندیس گزینه */
  async function answerItem(chatId: string, value: number): Promise<TlBotReply> {
    const st = await readState<ClfFormState>(chatId, 'clf_form');
    if (!st) return STALE;
    const f = st.fields[st.step];
    if (!f) return STALE;
    if (f.type === 'single' && f.scoredOptions && f.scoredOptions.length > 0) {
      if (!Number.isInteger(value) || value < 0 || value >= f.scoredOptions.length) return STALE;
      st.answers[f.key] = value;
      st.step += 1;
      await writeState(chatId, st);
      return st.fields[st.step] ? promptClfItem(chatId) : buildClfConfirm(chatId);
    }
    const max = f.scaleMax ?? 3;
    if (value < 0 || value > max) return STALE;
    st.answers[f.key] = value;
    st.step += 1;
    await writeState(chatId, st);
    return st.fields[st.step] ? promptClfItem(chatId) : buildClfConfirm(chatId);
  }

  async function buildClfConfirm(chatId: string): Promise<TlBotReply> {
    const st = await readState<ClfFormState>(chatId, 'clf_form');
    if (!st) return STALE;
    const lines = ['📋 جمع‌بندی پاسخ‌ها', st.studentName ? `دانش‌آموز: ${st.studentName}` : undefined, '', `${fa(Object.keys(st.answers).length)} پاسخ از ${fa(st.fields.length)} آیتم ثبت شد.`, '', 'ارسال کنیم؟'].filter((l): l is string => l !== undefined);
    return {
      text: lines.join('\n'),
      buttons: [
        [
          { text: '✅ ارسال پاسخ‌ها', callbackData: 'clf:do' },
          { text: '✖ انصراف', callbackData: 'clf:no' }
        ]
      ]
    };
  }

  /** ثبت نهایی پاسخ‌های خانواده + اعلان به درمانگر */
  async function confirmFill(chatId: string): Promise<TlBotReply> {
    const st = await readState<ClfFormState>(chatId, 'clf_form');
    if (!st || !caseEvents) return STALE;

    // گیت دوباره در اجرا (دولایه)
    const allowed = await caseEvents.assertFamilyChat(st.studentId, chatId);
    if (!allowed) {
      await clearState(chatId);
      return { text: '⚠️ اتصال این چت به پروندهٔ دانش‌آموز از بین رفته است.', buttons: null };
    }

    let event: CaseEventRecord;
    try {
      event = await caseEvents.fillByFamily(
        st.eventId,
        { values: st.answers, sourceChatId: chatId, viaWeb: false },
        TL_ACTOR
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'ثبت انجام نشد';
      await clearState(chatId);
      return { text: `⚠️ ${msg}`, buttons: null };
    }

    await audit.log({
      actorId: 'bale-bot',
      action: 'bot.checklist_filled',
      resourceType: 'case_event',
      resourceId: event.id,
      changes: {
        studentId: { from: null, to: st.studentId },
        chatId: { from: null, to: chatId }
      }
    });
    log.info('clf.filled', { eventId: event.id, chatId });

    // اعلان نتیجه به ثبت‌کننده (درمانگر) — اگر به بات متصل باشد
    if (event.staffId) {
      const chats = await staffChats(event.staffId);
      const clinicName = await settings.getClinicName();
      const channel: 'bale' | 'internal' = notify.getChannel('bale') ? 'bale' : 'internal';
      let enqueued = 0;
      for (const target of chats) {
        const outcome = await notify.enqueue({
          channel,
          template: 'bot_checklist_result',
          recipient: target,
          studentId: event.studentId,
          payload: {
            studentName: st.studentName || undefined,
            formTitle: st.typeTitle,
            score: faNumStr(String(event.analysis?.score ?? 0)),
            band: event.analysis?.band ?? null,
            clinicName
          },
          dedupKey: `clf-result:${event.id}:${target}`
        });
        if (!outcome.duplicate) enqueued += 1;
      }
      if (enqueued > 0) await notify.dispatchPending(50);
      log.info('clf.result_notified', { eventId: event.id, enqueued });
    }

    await clearState(chatId);
    const bandLine = event.analysis?.band ? `\nوضعیت: ${event.analysis.band}` : '';
    return {
      text: `✅ پاسخ‌های شما ثبت شد. با تشکر از همراهی شما.${bandLine}`,
      buttons: null
    };
  }

  async function abortFill(chatId: string): Promise<TlBotReply> {
    await clearState(chatId);
    return { text: '✖️ پر کردن چک‌لیست لغو شد — هر وقت آماده بودید از «چک‌لیست‌های من» دوباره شروع کنید.', buttons: null };
  }

  // ───────── ج) — نمای چرخهٔ پرونده در منوی دانش‌آموز ─────────

  /** «🕘 تاریخچه» — ۱۰ رویداد آخر پرونده (گزارش جلسه، چک‌لیست، یادداشت) + نوبت‌های اخیر */
  async function history(chatId: string, idx: number): Promise<TlBotReply> {
    if (!(await staffReader(chatId))) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const raw = await readRawState(chatId);
    const stu = raw?.students?.[idx];
    if (!stu) return STALE_STAFF;
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };

    const events = await caseEvents.listEventsByStudent(stu.id, { limit: 10 });
    const lines: string[] = [];
    const STATUS_LABEL: Record<string, string> = { draft: 'پیش‌نویس', completed: '', pending_family: 'در انتظار خانواده', cancelled: 'لغوشده' };
    for (const e of events) {
      const st = STATUS_LABEL[e.status] ?? '';
      lines.push(`• ${e.typeIcon ?? '📋'} ${e.typeTitle} — ${jalaliFullLabel(tehranYmdOf(e.occurredAt))}${st ? ` (${st})` : ''}${e.summary ? `\n   ${truncateLabel(e.summary, 90)}` : ''}`);
    }
    if (lines.length === 0) {
      return {
        text: `🕘 برای «${stu.name}» هنوز رویدادی (گزارش جلسه، چک‌لیست، یادداشت) ثبت نشده است.\n\nبا «📋 رویداد/گزارش» اولین گزارش را ثبت کنید.`,
        buttons: [[{ text: '📋 ثبت رویداد/گزارش', callbackData: `stu:tl:${idx}` }], [{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
      };
    }
    return {
      text: [`🕘 تاریخچهٔ پروندهٔ «${stu.name}» (۱۰ رویداد آخر)`, '', ...lines].join('\n'),
      buttons: [[{ text: '📋 ثبت رویداد/گزارش', callbackData: `stu:tl:${idx}` }], [{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
    };
  }

  /** «📝 چک‌لیست‌های او» — در انتظار خانواده + آخرین نتایج با امتیاز/باند */
  async function checklists(chatId: string, idx: number): Promise<TlBotReply> {
    if (!(await staffReader(chatId))) return { text: renderTemplate('bot_case_event_denied'), buttons: null };
    const raw = await readRawState(chatId);
    const stu = raw?.students?.[idx];
    if (!stu) return STALE_STAFF;
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };

    const rows = await db.query<{ id: string; type_title: string; type_icon: string | null; status: string; analysis: string | null; occurred_at: string; created_at: string }>(
      `SELECT e.id, t.title AS type_title, t.icon AS type_icon, e.status, e.analysis, e.occurred_at, e.created_at
         FROM case_events e
         JOIN case_event_types t ON t.id = e.event_type_id
        WHERE e.student_id = ? AND t.family_fillable = 1 AND e.status IN ('pending_family', 'completed')
        ORDER BY (e.status = 'pending_family') DESC, e.occurred_at DESC
        LIMIT 8`,
      [stu.id]
    );
    const pending = rows.filter((r) => r.status === 'pending_family');
    const done = rows.filter((r) => r.status === 'completed');
    const lines: string[] = [];
    if (pending.length > 0) {
      lines.push(`در انتظار پاسخ خانواده (${fa(pending.length)}):`);
      for (const p of pending) lines.push(`• ${p.type_icon ?? '📝'} ${p.type_title} — ${jalaliFullLabel(tehranYmdOf(p.created_at))}`);
    }
    if (done.length > 0) {
      if (lines.length > 0) lines.push('');
      lines.push('آخرین نتایج:');
      for (const d of done) {
        let scoreLine = '';
        try {
          const a = d.analysis ? (JSON.parse(d.analysis) as { score?: number; maxScore?: number; band?: string | null; total?: number }) : null;
          if (a) scoreLine = ` — امتیاز ${fa(a.score ?? 0)} از ${fa(a.maxScore ?? (a.total ?? 0) * 3)}${a.band ? ` (${a.band})` : ''}`;
        } catch { /* بدون تحلیل */ }
        lines.push(`• ${d.type_title} — ${jalaliFullLabel(tehranYmdOf(d.occurred_at))}${scoreLine}`);
      }
    }
    if (lines.length === 0) {
      return {
        text: `📝 برای «${stu.name}» هنوز چک‌لیست خانواده‌ای ثبت نشده است.\n\nاز «📋 رویداد/گزارش» ← دستهٔ «چک‌لیست» یکی بسازید — خانواده با بات پر می‌کند و نتیجهٔ تحلیل‌شده به شما پیام می‌رود.`,
        buttons: [[{ text: '📋 ثبت رویداد/گزارش', callbackData: `stu:tl:${idx}` }], [{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
      };
    }
    return {
      text: [`📝 چک‌لیست‌های خانواده — «${stu.name}»`, '', ...lines].join('\n'),
      buttons: [[{ text: '↩ بازگشت', callbackData: `stu:menu:${idx}` }]]
    };
  }

  return {
    // همکاران
    startCategory,
    listTypes,
    startForm,
    optionPick,
    skipField,
    feedInput,
    confirmCreate,
    abortCreate,
    // خانواده
    listMine,
    startFill,
    answerItem,
    confirmFill,
    abortFill,
    // نمای چرخهٔ پرونده
    history,
    checklists,
    // state readers (تست + intercept)
    readTlFormState: (chatId: string) => readState<TlFormState>(chatId, 'tl_form'),
    readClfFormState: (chatId: string) => readState<ClfFormState>(chatId, 'clf_form')
  };
}

export type CaseEventsBot = ReturnType<typeof createCaseEventsBot>;
