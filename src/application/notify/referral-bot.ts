/* referral-bot.ts — فلو بات «معرفی دانش‌آموز» (v1.27.35 — خواست کارفرما: اتصال معرفی به نقش پایه و عموم مردم)
 *
 * الگو عین case-events-bot (clf): وضعیت هر گفتگو در bot_menu_state با flow مشخص — مکالمهٔ
 * گام‌به‌گام: نقش (خانواده/معلم) → نام و موبایل معرف → (معلم: مدرسه/پایه/کلاس + تعداد کودک) →
 * به‌ازای هر کودک: نام → دستهٔ دغدغه (دکمه) → شرح (اختیاری) → مرور و ثبت نهایی.
 * ثبت از مسیر رسمی waitlist.submitReferral می‌گذرد (الگوی REFERRAL-DESIGN §I) با
 * token = bot:<chatId> تا کانال ردیف bot بماند و سقف نرخ هر چت (REFERRAL_RATE_PER_CHAT) سر جایش است.
 * عموم مردم بدون احراز و کاربران نقش پایه (خانواده/معلم کلاس) از منوی «معرفی دانش‌آموز» وارد می‌شوند.
 */
import type { DbClient } from '@core/db';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import { faDigits, REFERRAL_RATE_PER_CHAT } from '@core/shared';
import type { InlineButton } from '@core/notify';

export interface ReferralSubmitInput {
  role: 'family' | 'teacher';
  referrer_name: string;
  referrer_phone: string;
  school_text?: string;
  grade_text?: string;
  class_text?: string;
  token?: string;
  children: Array<{
    first_name: string;
    concern_category: string | null;
    concern_text?: string;
    school_text?: string;
    grade_text?: string;
    class_text?: string;
  }>;
}

export type ReferralSubmitFn = (
  input: ReferralSubmitInput,
  meta: { ip?: string }
) => Promise<unknown>;

export interface ReferralBotDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  publicBaseUrl: string | null;
  submitReferral: ReferralSubmitFn | null;
  now?: () => Date;
}

export interface RefBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

interface RefChild {
  firstName: string;
  category: string | null;
  text: string | null;
}

interface RefState {
  v: 1;
  flow: 'referral';
  step: 'school' | 'grade' | 'cls' | 'name' | 'phone' | 'child_name' | 'child_text' | 'confirm';
  role: 'family' | 'teacher';
  name: string;
  phone: string;
  school: string | null;
  grade: string | null;
  cls: string | null;
  count: number;
  idx: number;
  children: RefChild[];
}

export const REF_CAT_LABELS: Record<string, string> = {
  delayed: 'دیرآموزی / تأخیر رشد',
  learning_disorder: 'اختلال یادگیری (خواندن/نوشتن/ریاضی)',
  intellectual: 'مشکوک به کم‌توانی ذهنی',
  autism: 'مشکوک به طیف اتیسم',
  speech: 'تأخیر گفتار و زبان',
  other: 'سایر / نمی‌دانم'
};

const CAT_BUTTONS: InlineButton[][] = [
  [
    { text: '۱. دیرآموزی', callbackData: 'rf:cat:X:delayed' },
    { text: '۲. یادگیری', callbackData: 'rf:cat:X:learning_disorder' }
  ],
  [
    { text: '۳. کم‌توانی ذهنی', callbackData: 'rf:cat:X:intellectual' },
    { text: '۴. اتیسم', callbackData: 'rf:cat:X:autism' }
  ],
  [
    { text: '۵. گفتار و زبان', callbackData: 'rf:cat:X:speech' },
    { text: '۶. سایر', callbackData: 'rf:cat:X:other' }
  ]
];

function catButtons(idx: number): InlineButton[][] {
  return CAT_BUTTONS.map((row) =>
    row.map((b) => ({ text: b.text, callbackData: b.callbackData.replace('X', String(idx)) }))
  );
}

function normalizePhone(raw: string): string {
  let s = String(raw ?? '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[\s+\-().]/g, '');
  if (s.startsWith('+98')) s = '0' + s.slice(3);
  else if (s.startsWith('98') && s.length === 12) s = '0' + s.slice(2);
  return s;
}

export function createReferralBot(deps: ReferralBotDeps) {
  const { db, audit, logger } = deps;
  const log = logger.child('referral-bot');
  const now = deps.now ?? (() => new Date());
  const base = (deps.publicBaseUrl ?? '').replace(/\/+$/, '');
  /* سقف نرخ ثبت از هر چت — درون‌حافظه (پنجرهٔ یک‌ساعته؛ الگوی قرارداد §RUM) */
  const chatHits = new Map<string, { count: number; resetAt: number }>();

  async function readState(chatId: string): Promise<RefState | null> {
    const row = await db.queryOne<{ payload: string }>(`SELECT payload FROM bot_menu_state WHERE chat_id = ?`, [chatId]);
    if (!row) return null;
    try {
      const parsed = JSON.parse(row.payload) as RefState;
      return parsed && parsed.v === 1 && parsed.flow === 'referral' ? parsed : null;
    } catch {
      return null;
    }
  }

  async function writeState(chatId: string, state: RefState): Promise<void> {
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

  const webFormLine = base
    ? `\n🌐 فرم کامل وب (تاریخ تولد و جزئیات بیشتر):\n${base}/public/referral`
    : '';

  function rateBlocked(chatId: string): boolean {
    const nowMs = Date.now();
    const cur = chatHits.get(chatId);
    if (!cur || cur.resetAt < nowMs) {
      chatHits.set(chatId, { count: 1, resetAt: nowMs + 3600_000 });
      return false;
    }
    if (cur.count >= REFERRAL_RATE_PER_CHAT) return true;
    cur.count += 1;
    return false;
  }

  function childPrompt(state: RefState, i: number): RefBotReply {
    return {
      text: `👶 کودک ${faDigits(String(i + 1))} از ${faDigits(String(state.count))} — نام کودک را بنویسید (نام و نام خانوادگی یا فقط نام):`,
      buttons: null
    };
  }

  function summaryText(state: RefState): string {
    const head = [
      '📋 مرور نهایی معرفی:',
      `نقش: ${state.role === 'teacher' ? 'معلم' : 'خانواده / سرپرست'}`,
      `معرف: ${state.name} — ${faDigits(state.phone)}`,
      state.role === 'teacher' && (state.school || state.grade || state.cls)
        ? `مدرسه: ${[state.school, state.grade, state.cls].filter(Boolean).join(' — ')}`
        : null,
      '─────────────'
    ].filter(Boolean) as string[];
    const rows = state.children.map(
      (c, i) =>
        `${faDigits(String(i + 1))}) ${c.firstName} — ${c.category ? REF_CAT_LABELS[c.category] : 'دستهٔ دغدغه نامشخص'}${c.text ? `\n    شرح: ${c.text}` : ''}`
    );
    return [...head, ...rows, '─────────────', 'ثبت کنم؟'].join('\n');
  }

  return {
    readActive(chatId: string): Promise<boolean> {
      return readState(chatId).then((s) => s !== null);
    },

    /* ورود از منوی «معرفی دانش‌آموز» — عموم مردم و نقش پایه، بدون احراز هویت */
    async root(chatId: string): Promise<RefBotReply> {
      await clearState(chatId);
      return {
        text:
          '🧩 معرفی دانش‌آموز به مرکز جامع سنجش و اختلالات یادگیری\n\n' +
          'اگر دربارهٔ یادگیری، گفتار، توجه یا رفتار یک کودک نگرانی دارید، همین‌جا چند پرسش کوتاه پاسخ دهید تا کارشناسان مرکز بررسی و با شما تماس بگیرند.\n\n' +
          'همهٔ خدمات مرکز رایگان است.' +
          webFormLine,
        buttons: [
          [
            { text: '👨‍👩‍👧 خانواده / سرپرست هستم', callbackData: 'rf:role:family' },
            { text: '🏫 معلم هستم', callbackData: 'rf:role:teacher' }
          ]
        ]
      };
    },

    async start(chatId: string, role: 'family' | 'teacher'): Promise<RefBotReply> {
      const state: RefState = {
        v: 1,
        flow: 'referral',
        step: role === 'teacher' ? 'school' : 'name',
        role,
        name: '',
        phone: '',
        school: null,
        grade: null,
        cls: null,
        count: role === 'teacher' ? 0 : 1,
        idx: 0,
        children: []
      };
      await writeState(chatId, state);
      if (role === 'teacher') {
        return {
          text: '🏫 نام مدرسه‌تان را بنویسید (اگر مایل نیستید، «رد» بفرستید):',
          buttons: null
        };
      }
      return {
        text: '👤 نام و نام خانوادگی خودتان را بنویسید:',
        buttons: null
      };
    },

    async setCount(chatId: string, n: number): Promise<RefBotReply> {
      const state = await readState(chatId);
      if (!state) return { text: '⏳ این منو قدیمی است — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
      state.count = Math.min(Math.max(n, 1), 5);
      state.idx = 0;
      state.children = [];
      state.step = 'child_name'; // از گام انتخاب تعداد به پرسش نام کودک می‌رویم
      await writeState(chatId, state);
      return childPrompt(state, 0);
    },

    /* پاسخ‌های متنی هر گام — خروج «رد» گام اختیاری را رد می‌کند */
    async answer(chatId: string, rawText: string): Promise<RefBotReply> {
      const state = await readState(chatId);
      if (!state) return { text: '⏳ این گفتگو بسته شده — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
      const text = rawText.trim().slice(0, 300);
      const skipped = text === 'رد' || text === 'ردکردن' || text === 'رد کردن' || text === '-';

      switch (state.step) {
        case 'school': {
          state.school = skipped ? null : text.slice(0, 120);
          state.step = 'grade';
          await writeState(chatId, state);
          return { text: '✏️ پایه تحصیلی کودکان را بنویسید (مثلاً دوم — یا «رد»):', buttons: null };
        }
        case 'grade': {
          state.grade = skipped ? null : text.slice(0, 40);
          state.step = 'cls';
          await writeState(chatId, state);
          return { text: '✏️ کلاس را بنویسید (مثلاً ۲۱ — یا «رد»):', buttons: null };
        }
        case 'cls': {
          state.cls = skipped ? null : text.slice(0, 40);
          state.step = 'name';
          await writeState(chatId, state);
          const countRow: InlineButton[][] = [
            [1, 2, 3].map((n) => ({ text: faDigits(String(n)), callbackData: `rf:count:${n}` })),
            [
              { text: '۴', callbackData: 'rf:count:4' },
              { text: '۵', callbackData: 'rf:count:5' }
            ]
          ];
          return { text: `👩‍🏫 چند دانش‌آموز را معرفی می‌کنید؟ (تا ${faDigits('5')} نفر در یک ثبت)`, buttons: countRow };
        }
        case 'name': {
          if (text.length < 2) return { text: '⚠️ نام حداقل ۲ نویسه است — دوباره بنویسید:', buttons: null };
          state.name = text.slice(0, 80);
          state.step = 'phone';
          await writeState(chatId, state);
          return { text: '📱 شمارهٔ موبایل خودتان را بفرستید (مثلاً ۰۹۱۲۳۴۵۶۷۸۹):', buttons: null };
        }
        case 'phone': {
          const phone = normalizePhone(text);
          if (!/^09\d{9}$/.test(phone)) {
            return { text: '⚠️ شماره معتبر نیست — باید ۱۱ رقم و با ۰۹ شروع شود. دوباره بفرستید:', buttons: null };
          }
          state.phone = phone;
          state.step = 'child_name';
          state.idx = 0;
          state.children = [];
          await writeState(chatId, state);
          return childPrompt(state, 0);
        }
        case 'child_name': {
          if (text.length < 2) return { text: '⚠️ نام کودک حداقل ۲ نویسه است — دوباره بنویسید:', buttons: null };
          state.children[state.idx] = { firstName: text.slice(0, 80), category: null, text: null };
          state.step = 'child_text';
          await writeState(chatId, state);
          return {
            text: `🔎 «${state.children[state.idx].firstName}» — کدام دستهٔ دغدغه نزدیک‌تر است؟`,
            buttons: catButtons(state.idx)
          };
        }
        case 'child_text': {
          const child = state.children[state.idx];
          if (!child) return { text: '⏳ این گفتگو به‌هم ریخته — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
          child.text = skipped ? null : text.slice(0, 1000);
          state.idx += 1;
          if (state.idx < state.count) {
            state.step = 'child_name';
            await writeState(chatId, state);
            return childPrompt(state, state.idx);
          }
          state.step = 'confirm';
          await writeState(chatId, state);
          return { text: summaryText(state), buttons: [[{ text: '✅ ثبت نهایی', callbackData: 'rf:do' }, { text: '✖️ انصراف', callbackData: 'rf:no' }]] };
        }
        case 'confirm': {
          return {
            text: 'برای ثبت از دکمه‌های «✅ ثبت نهایی» زیر پیام مرور استفاده کنید — یا «✖️ انصراف».',
            buttons: [[{ text: '✅ ثبت نهایی', callbackData: 'rf:do' }, { text: '✖️ انصراف', callbackData: 'rf:no' }]]
          };
        }
        default:
          return { text: '⏳ این گفتگو بسته شده — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
      }
    },

    async setCategory(chatId: string, idx: number, value: string): Promise<RefBotReply> {
      const state = await readState(chatId);
      if (!state || !state.children[idx]) {
        return { text: '⏳ این منو قدیمی است — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
      }
      state.children[idx].category = value;
      await writeState(chatId, state);
      return {
        text: `✍️ شرح دغدغهٔ «${state.children[idx].firstName}» را بنویسید (چیزی که دیده‌اید — یا «رد»):`,
        buttons: null
      };
    },

    /* ثبت نهایی — از مسیر رسمی waitlist.submitReferral با token بات */
    async confirm(chatId: string): Promise<RefBotReply> {
      const state = await readState(chatId);
      if (!state || state.children.length === 0) {
        return { text: '⏳ این گفتگو بسته شده — دوباره «معرفی دانش‌آموز» را بزنید.', buttons: null };
      }
      if (!deps.submitReferral) {
        return { text: '⚠️ ثبت معرفی فعلاً در دسترس نیست — از فرم وب استفاده کنید.' + webFormLine, buttons: null };
      }
      if (rateBlocked(chatId)) {
        return { text: '⏳ تعداد ثبت‌های این گفتگو در یک ساعت زیاد است — کمی بعد تلاش کنید یا از فرم وب استفاده کنید.' + webFormLine, buttons: null };
      }
      try {
        const created = await deps.submitReferral(
          {
            role: state.role,
            referrer_name: state.name,
            referrer_phone: state.phone,
            school_text: state.school ?? undefined,
            grade_text: state.grade ?? undefined,
            class_text: state.cls ?? undefined,
            token: `bot:${chatId}`,
            children: state.children.map((c) => ({
              first_name: c.firstName,
              concern_category: c.category,
              concern_text: c.text ?? undefined
            }))
          },
          { ip: undefined }
        );
        const count = Array.isArray(created) ? created.length : state.children.length;
        await audit.log({
          actorId: 'bale-bot',
          action: 'bot.referral_submit',
          resourceType: 'waitlist_referral',
          resourceId: chatId,
          changes: { count: { from: null, to: count }, role: { from: null, to: state.role } }
        });
        await clearState(chatId);
        log.info('referral.bot.submitted', { chatId, count, role: state.role });
        return {
          text:
            `✅ ثبت شد — ${faDigits(String(count))} معرفی برای کارشناسان مرکز ارسال شد.\n\n` +
            'کارشناسان بررسی می‌کنند و با شما تماس می‌گیرند. همهٔ خدمات رایگان است.' +
            webFormLine,
          buttons: null
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'خطای نامشخص';
        log.warn('referral.bot.submit_failed', { chatId, error: msg });
        return {
          text: `⚠️ ثبت انجام نشد: ${msg}\nمی‌توانید دوباره «✅ ثبت نهایی» را بزنید یا از فرم وب استفاده کنید.` + webFormLine,
          buttons: [[{ text: '✅ ثبت نهایی', callbackData: 'rf:do' }, { text: '✖️ انصراف', callbackData: 'rf:no' }]]
        };
      }
    },

    async abort(chatId: string): Promise<RefBotReply> {
      const had = await readState(chatId);
      await clearState(chatId);
      if (!had) return { text: 'گفتگوی فعالی نیست.', buttons: null };
      return { text: '✖️ معرفی لغو شد — هر وقت خواستید از منوی «معرفی دانش‌آموز» شروع کنید.', buttons: null };
    }
  };
}

export interface ReferralBot {
  readActive(chatId: string): Promise<boolean>;
  root(chatId: string): Promise<RefBotReply>;
  start(chatId: string, role: 'family' | 'teacher'): Promise<RefBotReply>;
  setCount(chatId: string, n: number): Promise<RefBotReply>;
  answer(chatId: string, rawText: string): Promise<RefBotReply>;
  setCategory(chatId: string, idx: number, value: string): Promise<RefBotReply>;
  confirm(chatId: string): Promise<RefBotReply>;
  abort(chatId: string): Promise<RefBotReply>;
}
