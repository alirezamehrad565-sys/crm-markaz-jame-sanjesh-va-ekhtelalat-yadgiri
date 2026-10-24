import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { AuthContext } from '@core/shared';
import { faDigits, jalaliFullLabel, tehranYmdOf } from '@core/shared';
import type { InlineButton, NotifyService } from '@core/notify';
import { renderTemplate } from '@core/notify';
import { truncateLabel } from '@domain/exercise-bank';
import type { CaseEventField, CaseEventRecord, CaseEventsService } from '@domain/case-events';
import { CHECKLIST_BOT_MAX_ITEMS } from '@domain/case-events';

export interface CaseEventsBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  caseEvents: CaseEventsService | null;
  publicBaseUrlEnv: string | null;
  now?: () => Date;
}

export interface TlBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

const CLF_ACTOR: AuthContext = {
  staffId: 'bale-bot',
  email: 'bale-bot@system.local',
  role: 'manager',
  displayName: 'بات بله'
};

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

type BotState = ClfFormState;

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
  const { db, audit, logger, caseEvents } = deps;
  const log = logger.child('clf-bot');
  const now = deps.now ?? (() => new Date());

  const STALE: TlBotReply = {
    text: '⏳ این منو قدیمی است — دکمهٔ «چک‌لیست‌های من» را دوباره بزنید.',
    buttons: [[{ text: '📝 چک‌لیست‌های من', callbackData: 'clf_list' }]]
  };

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
    await db.execute(`DELETE FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
  }

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

  async function startFill(chatId: string, eventId: string): Promise<TlBotReply> {
    if (!caseEvents) return { text: renderTemplate('bot_case_events_disabled'), buttons: null };
    const event = await caseEvents.getEventById(eventId);
    const type = event ? await caseEvents.getTypeById(event.eventTypeId) : null;
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
    const fields = type?.fields ?? [];
    if (fields.length === 0) return { text: '⚠️ این چک‌لیست فاقد آیتم است.', buttons: null };

    if (fields.length > CHECKLIST_BOT_MAX_ITEMS) {
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

  async function confirmFill(chatId: string): Promise<TlBotReply> {
    const st = await readState<ClfFormState>(chatId, 'clf_form');
    if (!st || !caseEvents) return STALE;

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
        CLF_ACTOR
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

    // m172 — اعلان نتیجه به درمانگر دیگر اینجا انجام نمی‌شود؛
    // FillObserver مشترک (api-routing) هم پر کردن وب و هم بات را پوشش می‌دهد و از اعلان دوباره جلوگیری می‌کند.

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

  return {
    listMine,
    startFill,
    answerItem,
    confirmFill,
    abortFill,
    readClfFormState: (chatId: string) => readState<ClfFormState>(chatId, 'clf_form')
  };
}

export type CaseEventsBot = ReturnType<typeof createCaseEventsBot>;
