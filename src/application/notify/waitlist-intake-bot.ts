import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { InlineButton } from '@core/notify';
import { renderTemplate, stripToDigits, normalizePhoneDigits } from '@core/notify';
import { jalaliToGregorianYmd } from '@core/shared';

export interface WlIntakeState {
  v: 1;
  flow: 'wl_intake';
  step: 'name' | 'phone' | 'birth' | 'need';
  name?: string;
  phone?: string;
  birth?: string;
  need?: string;
}

export interface WlIntakeDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  now?: () => Date;
}

export interface WlBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

const CONFIRM_BUTTONS: InlineButton[][] = [
  [
    { text: '✅ ثبت نهایی', callbackData: 'wl:do' },
    { text: '✖️ انصراف', callbackData: 'wl:no' }
  ]
];

export async function readWlIntakeState(db: DbClient, chatId: string): Promise<WlIntakeState | null> {
  const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
  if (!row) return null;
  try {
    const parsed = JSON.parse(row.payload) as WlIntakeState;
    return parsed && parsed.v === 1 && parsed.flow === 'wl_intake' ? parsed : null;
  } catch {
    return null;
  }
}

async function writeState(db: DbClient, chatId: string, state: WlIntakeState, now: () => Date): Promise<void> {
  await db.execute(
    `INSERT INTO bot_menu_state (chat_id, payload, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(chat_id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`,
    [chatId, JSON.stringify(state), now().toISOString()]
  );
}

export async function clearWlIntakeState(db: DbClient, chatId: string): Promise<void> {
  await db.execute(`DELETE FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
}

function validName(raw: string): string | null {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t.length < 3 || t.length > 120) return null;
  if (stripToDigits(t).replace(/\D/g, '').length === t.replace(/\s/g, '').length) return null; // همه رقم
  return t;
}

function validPhone(raw: string): string | null {
  const digits = normalizePhoneDigits(stripToDigits(raw));
  if (digits.length === 11 && digits.startsWith('09')) return digits;
  return null;
}

function validBirth(raw: string): string | null | '' {
  const t = raw.trim();
  if (t === '-' || t === 'رد' || t === 'ندارد' || t.length === 0) return '';
  const m = t.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  if (y >= 1300 && y <= 1500) return jalaliToGregorianYmd(y, mo, d); // شمسی
  if (y >= 1900 && y <= 2100) return `${m[1]}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; // میلادی
  return null;
}

function validNeed(raw: string): string | null | '' {
  const t = raw.replace(/\s+/g, ' ').trim();
  if (t === '-' || t === 'ندارد' || t.length === 0) return '';
  if (t.length > 300) return null;
  return t;
}

export function createWaitlistIntakeBot(deps: WlIntakeDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('wl-intake');
  const now = deps.now ?? (() => new Date());

  async function linkedClass(chatId: string): Promise<{ classId: string; schoolId: string; className: string; schoolName: string; createdBy: string } | null> {
    const row = await db.queryOne<{ id: string; school_id: string; name: string; school_name: string; created_by: string }>(
      `SELECT c.id, c.school_id, c.name, sc.name AS school_name, l.created_by
         FROM class_bot_links l
         JOIN classes c ON c.id = l.class_id
         JOIN schools sc ON sc.id = c.school_id
        WHERE l.chat_id = ? AND l.status = 'linked'
        ORDER BY l.updated_at DESC
        LIMIT 1`,
      [chatId]
    );
    return row
      ? { classId: row.id, schoolId: row.school_id, className: row.name, schoolName: row.school_name, createdBy: row.created_by }
      : null;
  }

  const cancelHint = '\n\nبرای لغو: /cancel';

  async function start(chatId: string): Promise<WlBotReply> {
    const owner = await db.queryOne<{ kind: string; role: string | null }>(
      `SELECT 'staff' AS kind, s.role AS role
         FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
        WHERE l.chat_id = ? AND l.status = 'linked'
       UNION ALL
       SELECT 'class' AS kind, NULL AS role FROM class_bot_links
        WHERE chat_id = ? AND status = 'linked'
       UNION ALL
       SELECT 'student' AS kind, NULL AS role FROM notification_prefs
        WHERE chat_id = ? AND reminders_enabled = 1
       LIMIT 1`,
      [chatId, chatId, chatId]
    );

    if (!owner) return { text: renderTemplate('bot_wl_guest_link'), buttons: null };
    if (owner.kind === 'staff') return { text: renderTemplate('bot_wl_denied_staff'), buttons: null };
    if (owner.kind === 'student') return { text: renderTemplate('bot_wl_family_call'), buttons: null };

    const cls = await linkedClass(chatId);
    if (!cls) return { text: renderTemplate('bot_wl_guest_link'), buttons: null };

    await writeState(
      db,
      chatId,
      { v: 1, flow: 'wl_intake', step: 'name' },
      now
    );
    return {
      text: [
        `📝 ثبت متقاضی جدید — کلاس «${cls.className}» (${cls.schoolName})`,
        '',
        '۱ از ۴ — نام و نام خانوادگی دانش‌آموز را بفرستید:',
        '   مثال: علی محمدی' + cancelHint
      ].join('\n'),
      buttons: null
    };
  }

  async function cancel(chatId: string): Promise<WlBotReply> {
    const had = await readWlIntakeState(db, chatId);
    await clearWlIntakeState(db, chatId);
    return { text: had ? renderTemplate('bot_wl_cancelled') : 'چیزی برای لغو نبود.', buttons: null };
  }

  async function feedInput(chatId: string, raw: string): Promise<WlBotReply | null> {
    const st = await readWlIntakeState(db, chatId);
    if (!st) return null;

    if (st.step === 'name') {
      const name = validName(raw);
      if (!name) return { text: '⚠️ نام معتبر نیست — نام و نام خانوادگی را کامل بفرستید (حداقل ۳ نویسه).' + cancelHint, buttons: null };
      await writeState(db, chatId, { ...st, step: 'phone', name }, now);
      return {
        text: `۲ از ۴ — شمارهٔ موبایل ولیّ دانش‌آموز:\n   مثال: ۰۹۱۲۱۲۳۴۵۶۷` + cancelHint,
        buttons: null
      };
    }

    if (st.step === 'phone') {
      const phone = validPhone(raw);
      if (!phone) return { text: '⚠️ شماره معتبر نیست — موبایل ۱۱ رقمی با ۰۹ بفرستید.' + cancelHint, buttons: null };
      await writeState(db, chatId, { ...st, step: 'birth', phone }, now);
      return {
        text: '۳ از ۴ — تاریخ تولد دانش‌آموز (اختیاری):\n   شمسی مثل ۱۳۹۸/۰۵/۱۲ یا میلادی مثل 2019-08-03\n   برای رد شدن بفرستید: -' + cancelHint,
        buttons: null
      };
    }

    if (st.step === 'birth') {
      const birth = validBirth(raw);
      if (birth === null) {
        return { text: '⚠️ تاریخ معتبر نیست — مثال شمسی: ۱۳۹۸/۰۵/۱۲ یا برای رد شدن: -' + cancelHint, buttons: null };
      }
      await writeState(db, chatId, { ...st, step: 'need', birth: birth || undefined }, now);
      return {
        text: '۴ از ۴ — شرح نیاز یا نکتهٔ مهم (اختیاری):\n   مثال: تأخیر گفتار، توصیهٔ معلم…\n   برای رد شدن بفرستید: -' + cancelHint,
        buttons: null
      };
    }

    const need = validNeed(raw);
    if (need === null) return { text: '⚠️ متن طولانی است (سقف ۳۰۰ نویسه) — کوتاه‌تر بفرستید یا: -' + cancelHint, buttons: null };
    const final: WlIntakeState = { ...st, need: need || undefined };
    await writeState(db, chatId, final, now);

    const cls = await linkedClass(chatId);
    const lines = [
      '📋 جمع‌بندی — تأیید می‌کنید؟',
      '',
      `👤 نام: ${final.name ?? '—'}`,
      `📞 موبایل ولیّ: ${final.phone ?? '—'}`,
      `🎂 تاریخ تولد: ${final.birth ?? 'ثبت نشده'}`,
      `📝 شرح نیاز: ${final.need ?? 'ثبت نشده'}`,
      `🏫 کلاس: ${cls ? `${cls.className} — ${cls.schoolName}` : '—'}`
    ];
    return { text: lines.join('\n'), buttons: CONFIRM_BUTTONS };
  }

  async function confirm(chatId: string): Promise<WlBotReply> {
    const st = await readWlIntakeState(db, chatId);
    if (!st || !st.name || !st.phone) {
      return { text: 'فرمی در جریان نیست — با «ثبت متقاضی» یا /add شروع کنید.', buttons: null };
    }
    const cls = await linkedClass(chatId);
    if (!cls) {
      await clearWlIntakeState(db, chatId);
      return { text: renderTemplate('bot_wl_link_lost'), buttons: null };
    }

    const parts = st.name.split(' ');
    const firstName = parts[0];
    const lastName = parts.slice(1).join(' ') || '—';
    const id = crypto.randomUUID();
    const ts = now().toISOString();
    const provenance = `ثبت از بات توسط معلم کلاس «${cls.className}» — ${cls.schoolName}`;

    await db.execute(
      `INSERT INTO waitlist (id, first_name, last_name, phone, national_id, birth_date, school_id, class_id,
                             source, service_type, note, priority, status, call_count, created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, 'teacher', ?, ?, 'normal', 'waiting', 0, ?, ?, ?)`,
      [id, firstName, lastName, st.phone, st.birth ?? null, cls.schoolId, cls.classId, st.need ?? null, provenance, cls.createdBy, ts, ts]
    );

    await audit.log({
      actorId: 'bale-bot',
      action: 'waitlist.teacher_intake',
      resourceType: 'waitlist',
      resourceId: id,
      changes: {
        source: { from: null, to: 'teacher' },
        classId: { from: null, to: cls.classId },
        chatId: { from: null, to: chatId }
      }
    });
    await clearWlIntakeState(db, chatId);
    log.info('wl.teacher_intake', { waitlistId: id, classId: cls.classId });
    return { text: renderTemplate('bot_wl_done'), buttons: null };
  }

  async function abort(chatId: string): Promise<WlBotReply> {
    await clearWlIntakeState(db, chatId);
    return { text: renderTemplate('bot_wl_cancelled'), buttons: null };
  }

  return { start, cancel, feedInput, confirm, abort, readWlIntakeState };
}

export type WaitlistIntakeBot = ReturnType<typeof createWaitlistIntakeBot>;
