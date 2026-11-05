// بخش «اتصال بات» سرویس اعلان: کدِ اتصال دانش‌آموز/همکار/کلاس + ترجیحات یادآور.
// بدنه‌ها عیناً از service.ts منتقل شده‌اند؛ این فایل فقط سبد ctx می‌گیرد.
import { NotFoundError } from '@core/errors';
import type { AuthContext, BotLinkRecord, ClassBotLinkRecord, NotificationPrefs, StaffBotLinkRecord } from '@core/shared';
import { LINK_CODE_LENGTH } from '@core/shared';
import { generateLinkCode, rowToBotLink, rowToPrefs, rowToStaffBotLink, rowToClassBotLink, selectBotLinkByCode, selectBotLinks, selectPrefs, selectStaffLinkByCode, selectStaffLinks, selectClassLinkByCode, selectClassLinks, insertBotLink, insertStaffLink, insertClassLink, upsertPrefs } from '@core/notify';
import type { BotLinkRow, PrefsRow, StaffBotLinkRow, ClassBotLinkRow } from '@core/notify';
import type { NotifyAppService, UpsertPrefsInput } from './service';
import { spreadStmt } from './context';
import type { NotifyCtx } from './context';

export function createBotLinksSection(ctx: NotifyCtx): Pick<NotifyAppService, 'getPrefs' | 'upsertPrefs' | 'createLink' | 'listLinks' | 'createStaffLink' | 'listStaffLinks' | 'createClassLink' | 'listClassLinks' | 'revokeClassLink'> {
  const { db, audit, log, now, students, botDeepLink, botDeepLinkCache } = ctx;

  return {
    async getPrefs(studentId: string): Promise<NotificationPrefs | null> {
      const row = await db.queryOne<PrefsRow>(...spreadStmt(selectPrefs(studentId)));
      return row ? rowToPrefs(row) : null;
    },

    async upsertPrefs(studentId: string, input: UpsertPrefsInput, actor: AuthContext): Promise<NotificationPrefs> {
      const existing = await this.getPrefs(studentId);
      const next = {
        studentId,
        channel: input.channel ?? existing?.channel ?? ('bale' as const),
        chatId: input.chatId !== undefined ? input.chatId : (existing?.chatId ?? null),
        remindersEnabled: input.remindersEnabled ?? existing?.remindersEnabled ?? true,
        reminderHoursBefore: input.reminderHoursBefore ?? existing?.reminderHoursBefore ?? 2
      };

      await db.execute(
        ...spreadStmt(
          upsertPrefs({
            studentId,
            channel: next.channel,
            chatId: next.chatId,
            remindersEnabled: next.remindersEnabled,
            reminderHoursBefore: next.reminderHoursBefore,
            nowIso: now().toISOString()
          })
        )
      );

      await audit.log({
        actorId: actor.staffId,
        action: 'notification.prefs.update',
        resourceType: 'notification_prefs',
        resourceId: studentId,
        changes: {
          channel: { from: existing?.channel ?? null, to: next.channel },
          remindersEnabled: { from: existing?.remindersEnabled ?? null, to: next.remindersEnabled },
          reminderHoursBefore: { from: existing?.reminderHoursBefore ?? null, to: next.reminderHoursBefore }
        }
      });

      const saved = await this.getPrefs(studentId);
      if (!saved) throw new Error('PREFS_SAVE_FAILED');
      return saved;
    },

    async createLink(studentId: string, actor: AuthContext): Promise<BotLinkRecord> {
      const student = await students.getStudentById(studentId);
      if (!student) throw new NotFoundError('دانش‌آموز');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertBotLink({ id, code, studentId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.link.create',
        resourceType: 'bot_link',
        resourceId: id,
        changes: { studentId: { from: null, to: studentId } }
      });

      const row = await db.queryOne<BotLinkRow>(...spreadStmt(selectBotLinkByCode(code)));
      if (!row) throw new Error('LINK_CREATE_FAILED');
      const rec = rowToBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listLinks(studentId: string | undefined, limit = 50): Promise<BotLinkRecord[]> {
      const rows = await db.query<BotLinkRow>(
        ...spreadStmt(selectBotLinks({ studentId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    async createStaffLink(staffId: string, actor: AuthContext): Promise<StaffBotLinkRecord> {
      const member = await db.queryOne<{ id: string }>(`SELECT id FROM staff WHERE id = ?`, [staffId]);
      if (!member) throw new NotFoundError('کارمند');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertStaffLink({ id, code, staffId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.staff_link.create',
        resourceType: 'staff_bot_link',
        resourceId: id,
        changes: { staffId: { from: null, to: staffId } }
      });

      const row = await db.queryOne<StaffBotLinkRow>(...spreadStmt(selectStaffLinkByCode(code)));
      if (!row) throw new Error('STAFF_LINK_CREATE_FAILED');
      const rec = rowToStaffBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listStaffLinks(staffId: string | undefined, limit = 50): Promise<StaffBotLinkRecord[]> {
      const rows = await db.query<StaffBotLinkRow>(
        ...spreadStmt(selectStaffLinks({ staffId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToStaffBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    async createClassLink(classId: string, actor: AuthContext): Promise<ClassBotLinkRecord> {
      const cls = await db.queryOne<{ id: string }>(`SELECT id FROM classes WHERE id = ? AND active = 1`, [classId]);
      if (!cls) throw new NotFoundError('کلاس');

      const id = crypto.randomUUID();
      const code = generateLinkCode(LINK_CODE_LENGTH);
      await db.execute(
        ...spreadStmt(insertClassLink({ id, code, classId, createdBy: actor.staffId, nowIso: now().toISOString() }))
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.class_link.create',
        resourceType: 'class_bot_link',
        resourceId: id,
        changes: { classId: { from: null, to: classId } }
      });

      const row = await db.queryOne<ClassBotLinkRow>(...spreadStmt(selectClassLinkByCode(code)));
      if (!row) throw new Error('CLASS_LINK_CREATE_FAILED');
      const rec = rowToClassBotLink(row);
      rec.deepLink = await botDeepLink(code);
      return rec;
    },

    async listClassLinks(classId: string | undefined, limit = 50): Promise<ClassBotLinkRecord[]> {
      const rows = await db.query<ClassBotLinkRow>(
        ...spreadStmt(selectClassLinks({ classId, limit: Math.min(limit, 200) }))
      );
      const deep = await botDeepLinkCache();
      return rows.map((r) => {
        const rec = rowToClassBotLink(r);
        rec.deepLink = deep ? `${deep}?start=${r.code}` : null;
        return rec;
      });
    },

    async revokeClassLink(id: string, actor: AuthContext): Promise<ClassBotLinkRecord> {
      const row = await db.queryOne<ClassBotLinkRow>(`SELECT * FROM class_bot_links WHERE id = ?`, [id]);
      if (!row) throw new NotFoundError('کد اتصال معلم');
      if (row.status === 'revoked') return rowToClassBotLink(row); // ایده‌امپوتنت — اجرای دوباره اثر ندارد

      await db.execute(
        `UPDATE class_bot_links SET status = 'revoked', updated_at = ? WHERE id = ?`,
        [now().toISOString(), id]
      );
      await audit.log({
        actorId: actor.staffId,
        action: 'notification.class_link.revoke',
        resourceType: 'class_bot_link',
        resourceId: id,
        changes: { status: { from: row.status, to: 'revoked' } }
      });

      const after = await db.queryOne<ClassBotLinkRow>(`SELECT * FROM class_bot_links WHERE id = ?`, [id]);
      return rowToClassBotLink(after ?? row);
    },

  };
}
