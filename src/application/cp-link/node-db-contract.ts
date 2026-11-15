/**
 * CP-7 (طرح ارتقای بک‌اند §۳-۴ + §۴ آیتم ۲۶) — قرارداد «خواندنی‌های NODE_DB»
 *
 * کانال سوم انتقال: ورکر CP با binding مستقیم `NODE_DB` به D1 همین نود، فقط-SELECT
 * و فقط-پارامتری می‌خواند (cp-repo/wrangler.toml:22-24 — mining nodeQuery + content
 * nodeQuery). بهای این کانال جفت‌شدن شِماست: هر تغییر نام/حذف جدولِ این فهرست در
 * مایگریشن‌های نود، سمت CP به‌صورت خاموش (fallback امتیاز) یا کرش دورهٔ mining
 * می‌شکند — و هیچ آزمون تک‌مخزنی آن را نمی‌گیرد (درس CP-1).
 *
 * گیت همگامی (آزمون cp-link/node-db-contract):
 *  ① هر جدول این فهرست باید در migrations/*.sql ساخته شده باشد — حذف/تغییر نام = قرمز.
 *  ② فهرست باید در docs/backend-upgrade-plan-2026-11-11.md §۳-۴ هم ثبت باشد —
 *     رشد فهرست فقط با رأی دوطرفه (قاعدهٔ ④ §۳-۴)، نه با یک کوئری تازه در سکوت.
 *
 * منبع فهرست (شاهد خط‌به‌خط، cp-repo@4dc81df — v1.12.0/m8 که دیپلوی زنده است):
 *  • src/domain/mining/service.ts — همهٔ کوئری‌های nodeQuery
 *  • src/domain/content/service.ts — nodeQueryهای جمع‌آوری + NODE_FILE_CHUNKS_TABLE
 * استخراج: هر identifier بعد از FROM/JOIN در رشته‌های SQL این دو فایل ∩
 * CREATE TABLEهای migrations/ نود → ۲۴ جدول (برش m8 تأیید شد — diff m6→m8 در این
 * دو فایل صفر است).
 */

/** نسخهٔ CP مبنا — در هر همگامی تازه (افزودن/حذف جدول با رأی دوطرفه) به‌روز شود */
export const NODE_DB_CONTRACT_CP_SOURCE = 'cp-repo@4dc81df (v1.12.0/m8)';

/**
 * جدول‌های نود در معرض خواندن مستقیم CP — مرتب الفبایی؛ «فقط-SELECT» و
 * «رشد فقط با رأی دوطرفه» قانون این فهرست است (§۳-۴ قواعد ①و④).
 */
export const NODE_DB_CONTRACT_TABLES: readonly string[] = Object.freeze([
  'appointment_students',
  'appointments',
  'audit_log',
  'case_event_types',
  'case_events',
  'clearbook_plans',
  'content_score_report',
  'docs',
  'document_requests',
  'exercise_assignments',
  'exercise_file_chunks',
  'exercise_submissions',
  'exercises',
  'followups',
  'game_packages',
  'intervention_paths',
  'ot_progress',
  'pathway_sessions',
  'pathway_templates',
  'rum_events',
  'staff',
  'staff_attendance',
  'students',
  'working_hours'
]);

/** سند مرجع فهرست — گیت ② این مسیر را می‌خواند */
export const NODE_DB_CONTRACT_DOC = 'docs/backend-upgrade-plan-2026-11-11.md';
