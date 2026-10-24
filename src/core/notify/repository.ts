import type {
  BotLinkRecord,
  NotificationChannel,
  NotificationPrefs,
  NotificationRecord,
  NotificationStatus,
  NotificationTemplateId,
  TemplateVars
} from '@core/shared';

export interface NotificationRow {
  id: string;
  channel: string;
  template: string;
  recipient: string | null;
  student_id: string | null;
  appointment_id: string | null;
  staff_id: string | null;
  payload: string;
  status: string;
  attempts: number;
  last_error: string | null;
  dedup_key: string | null;
  send_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrefsRow {
  student_id: string;
  channel: string;
  chat_id: string | null;
  reminders_enabled: number;
  reminder_hours_before: number;
  updated_at: string;
}

export interface BotLinkRow {
  id: string;
  code: string;
  student_id: string;
  chat_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function rowToNotification(row: NotificationRow): NotificationRecord {
  let payload: TemplateVars = {};
  try {
    payload = JSON.parse(row.payload) as TemplateVars;
  } catch {
    payload = {};
  }
  return {
    id: row.id,
    channel: row.channel as NotificationChannel,
    template: row.template as NotificationTemplateId,
    recipient: row.recipient,
    studentId: row.student_id,
    appointmentId: row.appointment_id,
    staffId: row.staff_id,
    payload,
    status: row.status as NotificationStatus,
    attempts: row.attempts,
    lastError: row.last_error,
    dedupKey: row.dedup_key,
    sendAt: row.send_at,
    sentAt: row.sent_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function rowToPrefs(row: PrefsRow): NotificationPrefs {
  return {
    studentId: row.student_id,
    channel: row.channel as NotificationChannel,
    chatId: row.chat_id,
    remindersEnabled: row.reminders_enabled === 1,
    reminderHoursBefore: row.reminder_hours_before,
    updatedAt: row.updated_at
  };
}

export function rowToBotLink(row: BotLinkRow): BotLinkRecord {
  return {
    id: row.id,
    code: row.code,
    studentId: row.student_id,
    chatId: row.chat_id,
    status: row.status as BotLinkRecord['status'],
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const NOTIFICATION_COLS =
  'id, channel, template, recipient, student_id, appointment_id, staff_id, payload, status, attempts, last_error, dedup_key, send_at, sent_at, created_at, updated_at';

export function insertNotification(input: {
  id: string;
  channel: string;
  template: string;
  recipient: string | null;
  studentId: string | null;
  appointmentId: string | null;
  staffId: string | null;
  payload: TemplateVars;
  dedupKey: string | null;
  sendAt: string | null;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO notifications
            (id, channel, template, recipient, student_id, appointment_id, staff_id, payload, status, attempts, dedup_key, send_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, ?, ?, ?, ?)`,
    params: [
      input.id,
      input.channel,
      input.template,
      input.recipient,
      input.studentId,
      input.appointmentId,
      input.staffId,
      JSON.stringify(input.payload),
      input.dedupKey,
      input.sendAt,
      input.nowIso,
      input.nowIso
    ]
  };
}

export function selectNotificationById(id: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${NOTIFICATION_COLS} FROM notifications WHERE id = ?`,
    params: [id]
  };
}

export function selectNotifications(filters: {
  status?: NotificationStatus;
  studentId?: string;
  appointmentId?: string;
  limit: number;
}): { sql: string; params: unknown[] } {
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (filters.status) {
    conditions.push('status = ?');
    params.push(filters.status);
  }
  if (filters.studentId) {
    conditions.push('student_id = ?');
    params.push(filters.studentId);
  }
  if (filters.appointmentId) {
    conditions.push('appointment_id = ?');
    params.push(filters.appointmentId);
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return {
    sql: `SELECT ${NOTIFICATION_COLS} FROM notifications ${where} ORDER BY created_at DESC LIMIT ?`,
    params: [...params, filters.limit]
  };
}

export function selectPendingNotifications(limit: number, maxAttempts: number, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${NOTIFICATION_COLS}
            FROM notifications
           WHERE status = 'pending' AND attempts < ?
             AND (send_at IS NULL OR send_at <= ?)
           ORDER BY created_at
           LIMIT ?`,
    params: [maxAttempts, nowIso, limit]
  };
}

export function releaseNotificationById(id: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET send_at = NULL, attempts = 0, status = 'pending', updated_at = ?
           WHERE id = ? AND status IN ('pending', 'failed')`,
    params: [nowIso, id]
  };
}

export function releaseAllDrafts(nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET send_at = NULL, updated_at = ?
           WHERE status = 'pending' AND send_at IS NOT NULL`,
    params: [nowIso]
  };
}

export function stalePendingToSkipped(maxAttempts: number, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET status = 'skipped', last_error = 'MAX_ATTEMPTS', updated_at = ?
           WHERE status = 'pending' AND attempts >= ?`,
    params: [nowIso, maxAttempts]
  };
}

export function markNotificationSent(id: string, externalId: string | null, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET status = 'sent', sent_at = ?, last_error = NULL,
                 attempts = attempts + 1, updated_at = ?
           WHERE id = ?`,
    params: [nowIso, nowIso, id]
  };
}

export function markNotificationFailed(id: string, error: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET status = 'failed', last_error = ?, attempts = attempts + 1, updated_at = ?
           WHERE id = ?`,
    params: [error.slice(0, 500), nowIso, id]
  };
}

export function markNotificationSkipped(id: string, reason: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET status = 'skipped', last_error = ?, updated_at = ?
           WHERE id = ? AND status = 'pending'`,
    params: [reason.slice(0, 500), nowIso, id]
  };
}

export function retryFailedNotifications(limit: number, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notifications
             SET status = 'pending', updated_at = ?
           WHERE id IN (SELECT id FROM notifications WHERE status = 'failed' ORDER BY created_at LIMIT ?)`,
    params: [nowIso, limit]
  };
}

export function notificationStatusCounts(): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT status, COUNT(*) AS count FROM notifications GROUP BY status`,
    params: []
  };
}

export function selectPrefs(studentId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT student_id, channel, chat_id, reminders_enabled, reminder_hours_before, updated_at
            FROM notification_prefs WHERE student_id = ?`,
    params: [studentId]
  };
}

export function selectPrefsMany(studentIds: string[]): { sql: string; params: unknown[] } {
  if (studentIds.length === 0) {
    return { sql: `SELECT student_id, channel, chat_id, reminders_enabled, reminder_hours_before, updated_at
                     FROM notification_prefs WHERE 0`, params: [] };
  }
  const placeholders = studentIds.map(() => '?').join(',');
  return {
    sql: `SELECT student_id, channel, chat_id, reminders_enabled, reminder_hours_before, updated_at
            FROM notification_prefs WHERE student_id IN (${placeholders})`,
    params: studentIds
  };
}

export function upsertPrefs(input: {
  studentId: string;
  channel: NotificationChannel;
  chatId: string | null;
  remindersEnabled: boolean;
  reminderHoursBefore: number;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO notification_prefs
            (student_id, channel, chat_id, reminders_enabled, reminder_hours_before, updated_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(student_id) DO UPDATE SET
            channel = excluded.channel,
            chat_id = COALESCE(excluded.chat_id, notification_prefs.chat_id),
            reminders_enabled = excluded.reminders_enabled,
            reminder_hours_before = excluded.reminder_hours_before,
            updated_at = excluded.updated_at`,
    params: [
      input.studentId,
      input.channel,
      input.chatId,
      input.remindersEnabled ? 1 : 0,
      input.reminderHoursBefore,
      input.nowIso
    ]
  };
}

const BOT_LINK_COLS = 'id, code, student_id, chat_id, status, created_by, created_at, updated_at';

export function insertBotLink(input: {
  id: string;
  code: string;
  studentId: string;
  createdBy: string;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO bot_links (id, code, student_id, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    params: [input.id, input.code, input.studentId, input.createdBy, input.nowIso, input.nowIso]
  };
}

export function selectBotLinkByCode(code: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${BOT_LINK_COLS} FROM bot_links WHERE code = ?`,
    params: [code]
  };
}

export function selectBotLinks(filters: { studentId?: string; limit: number }): { sql: string; params: unknown[] } {
  if (filters.studentId) {
    return {
      sql: `SELECT ${BOT_LINK_COLS} FROM bot_links WHERE student_id = ? ORDER BY created_at DESC LIMIT ?`,
      params: [filters.studentId, filters.limit]
    };
  }
  return {
    sql: `SELECT ${BOT_LINK_COLS} FROM bot_links ORDER BY created_at DESC LIMIT ?`,
    params: [filters.limit]
  };
}

export function linkBotLink(id: string, chatId: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE bot_links
             SET status = 'linked', chat_id = ?, updated_at = ?
           WHERE id = ?`,
    params: [chatId, nowIso, id]
  };
}

export function insertBotLinkLinked(input: {
  id: string;
  code: string;
  studentId: string;
  chatId: string;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'linked', 'bale-bot', ?, ?)`,
    params: [input.id, input.code, input.studentId, input.chatId, input.nowIso, input.nowIso]
  };
}

export function insertStaffLinkLinked(input: {
  id: string;
  code: string;
  staffId: string;
  chatId: string;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO staff_bot_links (id, code, staff_id, chat_id, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'linked', 'bale-bot', ?, ?)`,
    params: [input.id, input.code, input.staffId, input.chatId, input.nowIso, input.nowIso]
  };
}

export function selectBotLinkIdFor(studentId: string, chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT id FROM bot_links WHERE student_id = ? AND chat_id = ? AND status = 'linked' LIMIT 1`,
    params: [studentId, chatId]
  };
}

export function selectStaffLinkIdFor(staffId: string, chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT id FROM staff_bot_links WHERE staff_id = ? AND chat_id = ? AND status = 'linked' LIMIT 1`,
    params: [staffId, chatId]
  };
}

export function selectStudentIdsByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT DISTINCT student_id FROM bot_links WHERE chat_id = ? AND status = 'linked'`,
    params: [chatId]
  };
}

export interface StaffBotLinkRow {
  id: string;
  code: string;
  staff_id: string;
  chat_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function rowToStaffBotLink(row: StaffBotLinkRow): import('@core/shared').StaffBotLinkRecord {
  return {
    id: row.id,
    code: row.code,
    staffId: row.staff_id,
    chatId: row.chat_id,
    status: row.status as 'pending' | 'linked',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

const STAFF_LINK_COLS = 'id, code, staff_id, chat_id, status, created_by, created_at, updated_at';

export function insertStaffLink(input: {
  id: string;
  code: string;
  staffId: string;
  createdBy: string;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO staff_bot_links (id, code, staff_id, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    params: [input.id, input.code, input.staffId, input.createdBy, input.nowIso, input.nowIso]
  };
}

export function selectStaffLinkByCode(code: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${STAFF_LINK_COLS} FROM staff_bot_links WHERE code = ?`,
    params: [code]
  };
}

export function selectStaffLinks(filters: { staffId?: string; limit: number }): { sql: string; params: unknown[] } {
  if (filters.staffId) {
    return {
      sql: `SELECT ${STAFF_LINK_COLS} FROM staff_bot_links WHERE staff_id = ? ORDER BY created_at DESC LIMIT ?`,
      params: [filters.staffId, filters.limit]
    };
  }
  return {
    sql: `SELECT ${STAFF_LINK_COLS} FROM staff_bot_links ORDER BY created_at DESC LIMIT ?`,
    params: [filters.limit]
  };
}

export function linkStaffLink(id: string, chatId: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE staff_bot_links
             SET status = 'linked', chat_id = ?, updated_at = ?
           WHERE id = ?`,
    params: [chatId, nowIso, id]
  };
}

export function selectStaffChats(staffId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT DISTINCT chat_id FROM staff_bot_links
           WHERE staff_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
    params: [staffId]
  };
}

export interface ClassBotLinkRow {
  id: string;
  code: string;
  class_id: string;
  chat_id: string | null;
  status: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export function rowToClassBotLink(row: ClassBotLinkRow): import('@core/shared').ClassBotLinkRecord {
  const rec: import('@core/shared').ClassBotLinkRecord = {
    id: row.id,
    code: row.code,
    classId: row.class_id,
    chatId: row.chat_id,
    status: row.status as 'pending' | 'linked' | 'revoked',
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
  const extra = row as ClassBotLinkRow & { class_name?: string | null; school_name?: string | null };
  if (extra.class_name !== undefined) rec.className = extra.class_name;
  if (extra.school_name !== undefined) rec.schoolName = extra.school_name;
  return rec;
}

const CLASS_LINK_COLS = 'id, code, class_id, chat_id, status, created_by, created_at, updated_at';

export function insertClassLink(input: {
  id: string;
  code: string;
  classId: string;
  createdBy: string;
  nowIso: string;
}): { sql: string; params: unknown[] } {
  return {
    sql: `INSERT INTO class_bot_links (id, code, class_id, status, created_by, created_at, updated_at)
          VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
    params: [input.id, input.code, input.classId, input.createdBy, input.nowIso, input.nowIso]
  };
}

export function selectClassLinkByCode(code: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT ${CLASS_LINK_COLS} FROM class_bot_links WHERE code = ?`,
    params: [code]
  };
}

export function selectClassLinks(filters: { classId?: string; limit: number }): { sql: string; params: unknown[] } {
  if (filters.classId) {
    return {
      sql: `SELECT ${CLASS_LINK_COLS} FROM class_bot_links WHERE class_id = ? ORDER BY created_at DESC LIMIT ?`,
      params: [filters.classId, filters.limit]
    };
  }
  return {
    sql: `SELECT l.id, l.code, l.class_id, l.chat_id, l.status, l.created_by, l.created_at, l.updated_at,
                 c.name AS class_name, sc.name AS school_name
            FROM class_bot_links l
            JOIN classes c ON c.id = l.class_id
            JOIN schools sc ON sc.id = c.school_id
           ORDER BY l.created_at DESC LIMIT ?`,
    params: [filters.limit]
  };
}

export function linkClassLink(id: string, chatId: string, nowIso: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE class_bot_links
             SET status = 'linked', chat_id = ?, updated_at = ?
           WHERE id = ? AND status != 'revoked'`,
    params: [chatId, nowIso, id]
  };
}

export function selectClassChats(classId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT DISTINCT chat_id FROM class_bot_links
           WHERE class_id = ? AND status = 'linked' AND chat_id IS NOT NULL`,
    params: [classId]
  };
}

export function resolveChatOwner(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `SELECT 'staff' AS kind, l.staff_id AS ref_id, COALESCE(s.role_ext, s.role) AS role
            FROM staff_bot_links l JOIN staff s ON s.id = l.staff_id
           WHERE l.chat_id = ? AND l.status = 'linked'
          UNION ALL
          SELECT 'class' AS kind, class_id AS ref_id, NULL AS role FROM class_bot_links
           WHERE chat_id = ? AND status = 'linked'
          UNION ALL
          SELECT 'student' AS kind, p.student_id AS ref_id, NULL AS role FROM notification_prefs p
           WHERE p.chat_id = ? AND p.reminders_enabled = 1
          LIMIT 1`,
    params: [chatId, chatId, chatId]
  };
}

// ─── قطع اتصال (m184) — پاک‌سازی همهٔ اتصال‌ها و وضعیت‌های یک گفتگو ───

export function unlinkBotLinksByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE bot_links
             SET chat_id = NULL, status = 'pending', updated_at = ?
           WHERE chat_id = ? AND status = 'linked'`,
    params: [chatId, chatId]
  };
}

export function unlinkStaffLinksByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE staff_bot_links
             SET chat_id = NULL, status = 'pending', updated_at = ?
           WHERE chat_id = ? AND status = 'linked'`,
    params: [chatId, chatId]
  };
}

export function unlinkClassLinksByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE class_bot_links
             SET chat_id = NULL, status = 'pending', updated_at = ?
           WHERE chat_id = ? AND status = 'linked'`,
    params: [chatId, chatId]
  };
}

export function clearPrefsChatByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `UPDATE notification_prefs SET chat_id = NULL, updated_at = ?
           WHERE chat_id = ?`,
    params: [chatId, chatId]
  };
}

export function deleteBotMenuStateByChat(chatId: string): { sql: string; params: unknown[] } {
  return {
    sql: `DELETE FROM bot_menu_state WHERE chat_id = ?`,
    params: [chatId]
  };
}
