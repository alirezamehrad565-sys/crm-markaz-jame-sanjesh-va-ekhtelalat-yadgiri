/**
 * هستهٔ اعلان و کلاینت بات بله — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول notify — تنها نقطه import برای لایه‌های بالاتر

export { createNotifyService } from './service';
export type { NotifyDeps, NotifyService, EnqueueOutcome } from './service';
export { renderTemplate, renderScheduleMessage } from './templates';
export type { ScheduleEntry } from './templates';
export {
  renderDigestBody,
  renderFollowupsMessage,
  renderAttendanceSummary,
  renderCenterStatus,
  renderSearchResults,
  renderCenterSchedule,
  renderWaitlistList,
  renderScreeningGoal
} from './templates';
export type {
  FollowupListItem,
  FollowupListGroups,
  AttendanceChildSummary,
  BotSearchItem,
  CenterScheduleRow,
  WaitlistListItem,
  BotScreeningGoalItem
} from './templates';
export { createInternalChannel } from './internal-channel';
export { createBaleChannel } from './bale/client';
export type { BaleClientOptions } from './bale/client';
export { createBaleMediaFetcher, FetchMediaError } from './bale/media';
export type { MediaFetcher, FetchedMedia } from './bale/media';
export {
  parseBotUpdate,
  parseExbCallback,
  parseSubCallback,
  parseStuCallback,
  parseAwarenessCallback,
  generateLinkCode,
  stripToDigits,
  classifyIdentityDigits,
  normalizePhoneDigits,
  pickLargestPhoto,
  extractMedia,
  normalizeCaption
} from './bale/webhook';
export type {
  BaleUpdate,
  BaleCallbackQuery,
  BotCommand,
  ExbCat,
  AwSection,
  IdentityFormat,
  BotMedia,
  BalePhotoSize,
  BaleDocument
} from './bale/webhook';
export {
  rowToNotification,
  rowToPrefs,
  rowToBotLink,
  rowToStaffBotLink,
  rowToClassBotLink,
  insertNotification,
  selectNotificationById,
  selectNotifications,
  selectPendingNotifications,
  stalePendingToSkipped,
  markNotificationSent,
  markNotificationFailed,
  markNotificationSkipped,
  retryFailedNotifications,
  notificationStatusCounts,
  selectPrefs,
  selectPrefsMany,
  upsertPrefs,
  insertBotLink,
  selectBotLinkByCode,
  selectBotLinks,
  linkBotLink,
  insertBotLinkLinked,
  selectBotLinkIdFor,
  selectStudentIdsByChat,
  insertStaffLink,
  selectStaffLinkByCode,
  selectStaffLinks,
  linkStaffLink,
  insertStaffLinkLinked,
  selectStaffLinkIdFor,
  selectStaffChats,
  insertClassLink,
  selectClassLinkByCode,
  selectClassLinks,
  linkClassLink,
  selectClassChats,
  resolveChatOwner
} from './repository';
export type {
  NotificationRow,
  PrefsRow,
  BotLinkRow,
  StaffBotLinkRow,
  ClassBotLinkRow
} from './repository';
export type { EnqueueInput, NotifyChannel, NotifyListFilters, OutboundMessage, SendResult, InlineButton } from './types';
