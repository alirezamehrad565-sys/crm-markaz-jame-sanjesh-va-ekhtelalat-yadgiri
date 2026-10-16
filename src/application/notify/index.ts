/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — نقطهٔ ورود و صادرات‌های ماژول (barrel)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// مرز عمومی ماژول notify (application) — تنها نقطه import برای api-routing

export { createNotifyAppService } from './service';
export type { NotifyAppDeps, NotifyAppService, UpsertPrefsInput, BotReply } from './service';
export { groupFollowUpsForBot, followupsNudgeBody } from './digest';
export type { DigestSummary } from './digest';
export {
  planReminders,
  reminderDedupKey,
  summarizeSkips,
  buildEnqueueSummary
} from './reminders';
export type {
  PlanRemindersInput,
  ReminderPlan,
  ReminderPlanResult,
  ReminderSkip,
  ReminderSkipReason
} from './reminders';
export { registerRoutes } from './routes';
