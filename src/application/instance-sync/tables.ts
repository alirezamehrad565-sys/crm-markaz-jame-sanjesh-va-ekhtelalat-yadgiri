// فهرست جداول هم‌گامی instance-sync — تولیدشدهٔ deterministic با scripts/gen-instance-sync-migration.mjs
// منبع حقیقت: migrations/ پس از 0114 (اسکیمای زنده پس از CREATE/DROP/RENAME). برای افزودن جدول
// دامنه، مایگریشنش را بسازید و مولد را دوباره اجرا کنید — هرگز این فایل را دستی ویرایش نکنید.
// قرارداد: docs/rust/server-cloud-update-design.md §۲-۴ (فهرست جداول هم‌گامی = کانفیگ صریح
// جدول + PK + ستون updated_at).
//
// استثناها (جداول زندهٔ غیر-دامنه با دلیل):
//   · api_keys — کلیدهای API کارمندان — راز؛ همگام‌شدنی نیست
//   · assessment_files — پیوست باینری سنجش — فایل‌ها همگام نمی‌شوند (فقط ردیف‌های دامنه)
//   · audit_log — ممیزی سیستم — فقط-افزودنی و ویژهٔ هر نصب؛ همگام‌شدنی نیست
//   · auth_sessions — نشست‌های احراز سمت‌سرور (0111) — ویژهٔ هر نمونه؛ هرگز سینک نمی‌شود
//   · bot_links — سیم‌کشی بات تلگرام — chat_id ویژهٔ هر نصب؛ همگام‌شدنی نیست
//   · bot_menu_state — وضعیت منوی بات بر chat_id — ویژهٔ هر نصب
//   · case_audits — ردیف ممیزی رویداد بالینی — trace همان نمونه؛ همگام‌شدنی نیست
//   · case_event_files — پیوست باینری رویداد پرونده — فایل‌ها همگام نمی‌شوند
//   · class_bot_links — پیوند بات کلاس — ویژهٔ هر نصب
//   · clearbook_attachments — پیوست باینری کلربوک — فایل‌ها همگام نمی‌شوند
//   · client_errors — تله‌متری خطای مرورگر (0057) — فقط همان نمونه
//   · docs_files — پیوست باینری نمون‌برگ — فایل‌ها همگام نمی‌شوند
//   · exercise_attachments — پیوست باینری تمرین — فایل‌ها همگام نمی‌شوند
//   · exercise_file_chunks — تکه‌های باینری ذخیرهٔ D1/R2 — حمل blob ممنوع در هم‌گامی
//   · exercise_files — فرادادهٔ فایل تمرین — خانوادهٔ پیوست باینری؛ همگام نمی‌شود
//   · finance_invoice_files — پیوست باینری صورتحساب — فایل‌ها همگام نمی‌شوند
//   · game_preview_tokens — توکن پیش‌نمایش فقط-پرسنلی (0095) — راز کوتاه‌عمر
//   · game_sessions — سطرهای جلسهٔ بازی — دادهٔ خام تله‌متری چانک‌بلند؛ خارج از قرارداد هستهٔ هم‌گامی
//   · knowledge_attachments — پیوست باینری کتابخانه — فایل‌ها همگام نمی‌شوند
//   · login_throttle — گات تلاش ورود (0047) — وضعیت امنیتی لحظه‌ای هر نمونه
//   · node_push_events — idempotency push نود (0109) — bookkeeping قرارداد CP
//   · node_sync_inbox — صندوق ورودی سینک میز (0110) — bookkeeping قرارداد CP
//   · notifications — لاگ اعلان‌های ارسالی — صف ارسال همان نمونه؛ همگام‌شدنی نیست
//   · quota_usage — شمارش سهمیهٔ روزانهٔ مرکز (0113) — bookkeeping زیرساخت
//   · rum_events — تله‌متری کارایی (0086) — فقط همان نمونه
//   · schema_migrations — رهگیری مایگریشن‌ها (0001) — زیرساخت خود SQLite/D1
//   · settings — تنظیمات هر نصب شامل رازها (sys_auth_secret و…) — هرگز بین نمونه‌ها نمی‌رود
//   · staff_bot_links — پیوند بات کارمند — ویژهٔ هر نصب
//   · student_received_docs — رسید تحویل سند به دانش‌آموز — خانوادهٔ پیوست/اسناد؛ همگام نمی‌شود
//   · sync_nodes — رجیستری نودهای سینک rust-f4 — bookkeeping قرارداد CP؛ جدا از instance-sync
//   · synced_announcements — نگاشت اطلاعیه‌های سینک‌شده (0112) — bookkeeping قرارداد CP
//   · table_growth_snapshots — اسنپ‌شات رشد جدول‌ها (0107) — bookkeeping بهداشت داده

export interface SyncTableMeta {
  /** نام جدول دامنه (هم‌نما در هر دو سو — هر دو سو هم‌شِما هستند) */
  table: string;
  /** ستون‌های کلید اصلی به‌ترتیب تعریف — مبنا PK کانونی('|'-جمع‌شده) */
  pk: string[];
  /** آیا updated_at از مایگریشن‌های قبل موجود بوده (true) یا با 0114 افزوده شده (false) */
  hasUpdatedAt: boolean;
}

/** جداول دامنهٔ مشمول هم‌گامی دوسویه — 60 جدول */
export const SYNC_TABLES: readonly SyncTableMeta[] = [
  { table: 'announcements', pk: ['id'], hasUpdatedAt: true },
  { table: 'appointment_students', pk: ['appointment_id', 'student_id'], hasUpdatedAt: false },
  { table: 'appointments', pk: ['id'], hasUpdatedAt: true },
  { table: 'assessments', pk: ['id'], hasUpdatedAt: true },
  { table: 'bug_reports', pk: ['id'], hasUpdatedAt: false },
  { table: 'case_event_types', pk: ['id'], hasUpdatedAt: true },
  { table: 'case_events', pk: ['id'], hasUpdatedAt: true },
  { table: 'classes', pk: ['id'], hasUpdatedAt: false },
  { table: 'clearbook_entries', pk: ['id'], hasUpdatedAt: true },
  { table: 'clearbook_entry_tags', pk: ['entry_id', 'tag'], hasUpdatedAt: false },
  { table: 'clearbook_plans', pk: ['id'], hasUpdatedAt: true },
  { table: 'committee_items', pk: ['id'], hasUpdatedAt: true },
  { table: 'committee_meetings', pk: ['id'], hasUpdatedAt: true },
  { table: 'content_score_report', pk: ['source_table', 'source_id'], hasUpdatedAt: true },
  { table: 'day_notes', pk: ['id'], hasUpdatedAt: false },
  { table: 'docs', pk: ['id'], hasUpdatedAt: true },
  { table: 'document_requests', pk: ['id'], hasUpdatedAt: false },
  { table: 'exercise_assignments', pk: ['id'], hasUpdatedAt: false },
  { table: 'exercise_batches', pk: ['id'], hasUpdatedAt: false },
  { table: 'exercise_focus_links', pk: ['exercise_id', 'focus_key'], hasUpdatedAt: false },
  { table: 'exercise_package_items', pk: ['package_id', 'exercise_id'], hasUpdatedAt: false },
  { table: 'exercise_package_tags', pk: ['package_id', 'tag_id'], hasUpdatedAt: false },
  { table: 'exercise_packages', pk: ['id'], hasUpdatedAt: true },
  { table: 'exercise_submissions', pk: ['id'], hasUpdatedAt: false },
  { table: 'exercise_tags', pk: ['exercise_id', 'tag_id'], hasUpdatedAt: false },
  { table: 'exercises', pk: ['id'], hasUpdatedAt: true },
  { table: 'finance_budgets', pk: ['id'], hasUpdatedAt: true },
  { table: 'finance_donations', pk: ['id'], hasUpdatedAt: true },
  { table: 'finance_invoices', pk: ['id'], hasUpdatedAt: true },
  { table: 'followups', pk: ['id'], hasUpdatedAt: true },
  { table: 'game_adherence', pk: ['mission_id'], hasUpdatedAt: false },
  { table: 'game_attempts', pk: ['id'], hasUpdatedAt: false },
  { table: 'game_goals', pk: ['id'], hasUpdatedAt: false },
  { table: 'game_links', pk: ['jti'], hasUpdatedAt: false },
  { table: 'game_metrics', pk: ['id'], hasUpdatedAt: false },
  { table: 'game_missions', pk: ['id'], hasUpdatedAt: false },
  { table: 'game_packages', pk: ['id', 'version'], hasUpdatedAt: true },
  { table: 'game_prescriptions', pk: ['id'], hasUpdatedAt: true },
  { table: 'intervention_paths', pk: ['id'], hasUpdatedAt: true },
  { table: 'knowledge_items', pk: ['id'], hasUpdatedAt: true },
  { table: 'network_content', pk: ['id'], hasUpdatedAt: true },
  { table: 'notification_prefs', pk: ['student_id'], hasUpdatedAt: true },
  { table: 'ot_progress', pk: ['id'], hasUpdatedAt: false },
  { table: 'ot_skills', pk: ['id'], hasUpdatedAt: false },
  { table: 'pathway_probes', pk: ['id'], hasUpdatedAt: true },
  { table: 'pathway_sessions', pk: ['id'], hasUpdatedAt: true },
  { table: 'pathway_templates', pk: ['id'], hasUpdatedAt: true },
  { table: 'schools', pk: ['id'], hasUpdatedAt: false },
  { table: 'screening_entries', pk: ['id'], hasUpdatedAt: true },
  { table: 'staff', pk: ['id'], hasUpdatedAt: false },
  { table: 'staff_attendance', pk: ['id'], hasUpdatedAt: true },
  { table: 'student_education_history', pk: ['id'], hasUpdatedAt: false },
  { table: 'student_focus_links', pk: ['student_id', 'focus_key'], hasUpdatedAt: false },
  { table: 'student_tags', pk: ['student_id', 'tag_id'], hasUpdatedAt: false },
  { table: 'student_teachers', pk: ['id'], hasUpdatedAt: false },
  { table: 'students', pk: ['id'], hasUpdatedAt: false },
  { table: 'tags', pk: ['id'], hasUpdatedAt: false },
  { table: 'todos', pk: ['id'], hasUpdatedAt: true },
  { table: 'waitlist', pk: ['id'], hasUpdatedAt: true },
  { table: 'working_hours', pk: ['id'], hasUpdatedAt: true }
];

const SYNC_TABLE_MAP: ReadonlyMap<string, SyncTableMeta> = new Map(SYNC_TABLES.map((t) => [t.table, t]));

/** جدول خارج از قرارداد هم‌گامی؟ (مرز امنیتی push — نام از بدنهٔ درخواست نمی‌آید مگر با این گیت) */
export function isSyncTable(table: string): boolean {
  return SYNC_TABLE_MAP.has(table);
}

export function syncTableMeta(table: string): SyncTableMeta | undefined {
  return SYNC_TABLE_MAP.get(table);
}

/** pk کانونی ردیف: مقادیر pk به رشته (NULL→'') با '|' — همان قالب تومب‌استون در _sync_deleted */
export function syncPkValueOfRow(row: Record<string, unknown>, pk: string[]): string {
  return pk.map((k) => (row[k] === null || row[k] === undefined ? '' : String(row[k]))).join('|');
}

/** وارون syncPkValueOfRow: شکستن pk کانونی به اجزا (به‌ترتیب ستون‌های pk) */
export function syncPkValueSplit(value: string, pk: string[]): string[] {
  const parts = value.split('|');
  if (parts.length !== pk.length) return [];
  return parts;
}

/** cursor اپوک — بذر 0114 در _sync_state؛ شکل JSON دو-محوره (ردیف/تومب‌استون جدا) */
export const SYNC_EPOCH = '{"rows":"1970-01-01T00:00:00.000Z","deleted":"1970-01-01T00:00:00.000Z"}';

export const EPOCH_STAMP = '1970-01-01T00:00:00.000Z';
