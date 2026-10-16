/**
 * ماژول اعلان مدیر — سرویس اصلی و منطق کسب‌وکار
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// اعلان‌های مدیر: صفحه ورود + پنل کارمندان + ارسال با بات
// مالک WRITE جدول announcements؛ ارسال بات از طریق هسته notify (صف + dispatch)

import type {
  AnnouncementPublic,
  AnnouncementRecord,
  AnnouncementSendSummary,
  AuthContext,
  DispatchSummary
} from '@core/shared';
import { NotFoundError, ValidationError } from '@core/errors';
import type { AuditWriter } from '@core/audit';
import type { Logger } from '@core/logger';
import type { DbClient } from '@core/db';
import type { NotifyService } from '@core/notify';

export interface AnnouncementDeps {
  db: DbClient;
  audit: AuditWriter;
  logger: Logger;
  notify: NotifyService;
  /** آیا کانال بله واقعی فعال است؟ (تعیین کانال صف ارسال) */
  baleEnabled: boolean;
  clinicName?: string;
}

export interface NewAnnouncementInput {
  title: string;
  body: string;
  showLogin?: boolean;
  showPanel?: boolean;
}

export interface UpdateAnnouncementInput {
  title?: string;
  body?: string;
  showLogin?: boolean;
  showPanel?: boolean;
  active?: boolean;
}

export interface AnnouncementService {
  create(input: NewAnnouncementInput, actor: AuthContext): Promise<AnnouncementRecord>;
  listPublic(): Promise<AnnouncementPublic[]>;
  listPanel(): Promise<AnnouncementRecord[]>;
  listAll(): Promise<AnnouncementRecord[]>;
  update(id: string, input: UpdateAnnouncementInput, actor: AuthContext): Promise<AnnouncementRecord>;
  remove(id: string, actor: AuthContext): Promise<{ id: string }>;
  sendViaBot(id: string, target: 'staff' | 'families', actor: AuthContext): Promise<AnnouncementSendSummary>;
}

interface AnnouncementRow {
  id: string;
  title: string;
  body: string;
  show_login: number;
  show_panel: number;
  bot_sent_staff: number;
  bot_sent_families: number;
  active: number;
  created_by: string;
  created_by_name?: string | null;
  created_at: string;
  updated_at: string;
}

function rowToRecord(row: AnnouncementRow): AnnouncementRecord {
  return {
    id: row.id,
    title: row.title,
    body: row.body,
    showLogin: row.show_login === 1,
    showPanel: row.show_panel === 1,
    botSentStaff: row.bot_sent_staff === 1,
    botSentFamilies: row.bot_sent_families === 1,
    active: row.active === 1,
    createdBy: row.created_by,
    createdByName: row.created_by_name ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const SELECT_COLS = `a.id, a.title, a.body, a.show_login, a.show_panel, a.bot_sent_staff,
       a.bot_sent_families, a.active, a.created_by, s.full_name AS created_by_name,
       a.created_at, a.updated_at`;

export function createAnnouncementService(deps: AnnouncementDeps): AnnouncementService {
  const { db, audit, logger, notify, baleEnabled, clinicName } = deps;

  async function getById(id: string): Promise<AnnouncementRecord | null> {
    const row = await db.queryOne<AnnouncementRow>(
      `SELECT ${SELECT_COLS} FROM announcements a JOIN staff s ON s.id = a.created_by WHERE a.id = ?`,
      [id]
    );
    return row ? rowToRecord(row) : null;
  }

  return {
    async create(input, actor) {
      if (!input.showLogin && !input.showPanel) {
        throw new ValidationError('حداقل یکی از محل‌های نمایش (صفحه ورود یا پنل) را انتخاب کنید');
      }
      const id = crypto.randomUUID();
      const nowIso = new Date().toISOString();
      await db.transaction(async (tx) => {
        await tx.execute(
          `INSERT INTO announcements (id, title, body, show_login, show_panel, active, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
          [id, input.title, input.body, input.showLogin ? 1 : 0, input.showPanel ? 1 : 0, actor.staffId, nowIso, nowIso]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'announcement.create',
          resourceType: 'announcement',
          resourceId: id,
          changes: {
            title: { from: null, to: input.title },
            show_login: { from: null, to: input.showLogin ? 1 : 0 },
            show_panel: { from: null, to: input.showPanel ? 1 : 0 }
          }
        });
      });
      logger.child('announcements').info('announcement.created');
      const created = await getById(id);
      return created as AnnouncementRecord;
    },

    async listPublic() {
      // endpoint عمومی — فقط اعلان‌های فعال صفحه ورود، بدون فیلدهای مدیریتی
      const rows = await db.query<AnnouncementRow>(
        `SELECT ${SELECT_COLS} FROM announcements a JOIN staff s ON s.id = a.created_by
          WHERE a.active = 1 AND a.show_login = 1
          ORDER BY a.created_at DESC LIMIT 5`
      );
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        body: r.body,
        createdAt: r.created_at
      }));
    },

    async listPanel() {
      const rows = await db.query<AnnouncementRow>(
        `SELECT ${SELECT_COLS} FROM announcements a JOIN staff s ON s.id = a.created_by
          WHERE a.active = 1 AND a.show_panel = 1
          ORDER BY a.created_at DESC LIMIT 5`
      );
      return rows.map(rowToRecord);
    },

    async listAll() {
      const rows = await db.query<AnnouncementRow>(
        `SELECT ${SELECT_COLS} FROM announcements a JOIN staff s ON s.id = a.created_by
          ORDER BY a.created_at DESC LIMIT 200`
      );
      return rows.map(rowToRecord);
    },

    async update(id, input, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('اعلان');

      const next = {
        title: input.title ?? existing.title,
        body: input.body ?? existing.body,
        showLogin: input.showLogin ?? existing.showLogin,
        showPanel: input.showPanel ?? existing.showPanel,
        active: input.active ?? existing.active
      };
      if (next.active && !next.showLogin && !next.showPanel) {
        throw new ValidationError('اعلان فعال باید حداقل یک محل نمایش داشته باشد');
      }

      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE announcements
              SET title = ?, body = ?, show_login = ?, show_panel = ?, active = ?, updated_at = ?
            WHERE id = ?`,
          [next.title, next.body, next.showLogin ? 1 : 0, next.showPanel ? 1 : 0, next.active ? 1 : 0, new Date().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'announcement.update',
          resourceType: 'announcement',
          resourceId: id,
          changes: {
            title: { from: existing.title, to: next.title },
            active: { from: existing.active ? 1 : 0, to: next.active ? 1 : 0 }
          }
        });
      });
      const updated = await getById(id);
      return updated as AnnouncementRecord;
    },

    async remove(id, actor) {
      const existing = await getById(id);
      if (!existing) throw new NotFoundError('اعلان');
      await db.transaction(async (tx) => {
        await tx.execute(`DELETE FROM announcements WHERE id = ?`, [id]);
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'announcement.delete',
          resourceType: 'announcement',
          resourceId: id,
          changes: { title: { from: existing.title, to: null } }
        });
      });
      logger.child('announcements').info('announcement.deleted');
      return { id };
    },

    async sendViaBot(id, target, actor) {
      const rec = await getById(id);
      if (!rec) throw new NotFoundError('اعلان');
      if (!rec.active) throw new ValidationError('اعلان بایگانی‌شده قابل ارسال نیست');

      // ─── مقصدها بر اساس هدف ───
      let rows: { chat_id: string; staff_id: string | null }[];
      if (target === 'staff') {
        rows = await db.query<{ chat_id: string; staff_id: string | null }>(
          `SELECT DISTINCT sbl.chat_id, sbl.staff_id
             FROM staff_bot_links sbl JOIN staff s ON s.id = sbl.staff_id
            WHERE sbl.status = 'linked' AND sbl.chat_id IS NOT NULL AND s.active = 1`
        );
      } else {
        // خانواده‌ها: گفتگوهای متصل دانش‌آموزان + chat_id دستی در prefs
        rows = await db.query<{ chat_id: string; staff_id: string | null }>(
          `SELECT chat_id, NULL AS staff_id FROM bot_links
            WHERE status = 'linked' AND chat_id IS NOT NULL
           UNION
           SELECT chat_id, NULL AS staff_id FROM notification_prefs
            WHERE chat_id IS NOT NULL AND channel = 'bale'`
        );
      }

      const channel = baleEnabled ? 'bale' : 'internal';
      let queued = 0;
      for (const r of rows) {
        const outcome = await notify.enqueue({
          channel,
          template: 'announcement',
          recipient: r.chat_id,
          staffId: r.staff_id ?? null,
          payload: {
            announcementTitle: rec.title,
            extra: rec.body,
            clinicName
          },
          dedupKey: `announcement:${id}:${target}:${r.chat_id}`
        });
        if (!outcome.duplicate) queued++;
      }

      const dispatch: DispatchSummary = await notify.dispatchPending();

      // پرچم ارسال — برای نمایش وضعیت در UI
      const flagCol = target === 'staff' ? 'bot_sent_staff' : 'bot_sent_families';
      await db.transaction(async (tx) => {
        await tx.execute(
          `UPDATE announcements SET ${flagCol} = 1, updated_at = ? WHERE id = ?`,
          [new Date().toISOString(), id]
        );
        await audit.logInTransaction(tx, {
          actorId: actor.staffId,
          action: 'announcement.send_bot',
          resourceType: 'announcement',
          resourceId: id,
          changes: {
            target: { from: null, to: target },
            recipients: { from: null, to: rows.length }
          }
        });
      });

      logger.child('announcements').info('announcement.sent_bot', { target, recipients: rows.length });
      return { target, recipients: rows.length, dispatch };
    }
  };
}
