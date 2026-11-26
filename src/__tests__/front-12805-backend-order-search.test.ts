/**
 * گیت ۱.۲۷.۸۵ (sdt164) — موج B4 بهینه‌سازی بک‌اند:
 * ① جستجوی سراسری یک statement شد (UNION ALL با زیر-SELECT های LIMIT دار و ستون literal «kind»)،
 * ② ترتیب‌های پایدار: گره خوردن ORDER BY به id در سه مخزن + ترتیب انتظار در pure،
 * ③ حلقه‌های enqueue بخش ارسال‌کننده‌ها از enqueueToMany می‌خوانند + هلپر مشترک familyTargets،
 * ④ دروازه‌های فرصت‌طلب index.ts یک کارخانه (makeOpportunisticGate) دارند،
 * ⑤ سه‌گانهٔ اعتبارسنجی فایل از هستهٔ مشترک (@core/shared) می‌آید — تعریف محلی docs/case-events حذف شد.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت B4 — جستجو/ترتیب پایدار/notify/index ۱.۲۷.۸۵', () => {
  const globalService = read('src/application/search/service.ts');
  const waitlistService = read('src/domain/waitlist/service.ts');
  const studentRepo = read('src/domain/student-profile/repository.ts');
  const studentService = read('src/domain/student-profile/service.ts');
  const apptRepo = read('src/domain/appointment-core/repository.ts');
  const senders = read('src/application/notify/senders.ts');
  const digest = read('src/application/notify/digest.ts');
  const index = read('src/index.ts');
  const docsService = read('src/domain/docs/service.ts');
  const casePure = read('src/domain/case-events/pure.ts');

  it('① جستجوی سراسری: شش پرس‌وجو یک statement شد — UNION ALL + زیر-SELECT با LIMIT + ستون kind', () => {
    expect(globalService).toContain("SELECT 'student' AS kind");
    expect(globalService).toContain("SELECT 'doc' AS kind");
    expect(globalService.match(/UNION ALL SELECT \* FROM \(/g)?.length).toBeGreaterThanOrEqual(5);
    expect(globalService).toContain('${docsBranch}'); // گیت اسنادِ مدیر/منشی همان قبلی است
    expect(globalService).toContain('sanitizeFaQuery(rawQuery)');
    expect(globalService).toMatch(/\$\{faHaystackExpr\('first_name'\)\}/);
    expect(globalService).toMatch(/\$\{faHaystackExpr\('full_name'\)\}/);
    expect(globalService).toContain("COALESCE(grade, national_id) AS subtitle"); // همان subtitle پاسخ قدیمی
    // قرارداد جستجوی لیست انتظار هم‌قرارداد دانش‌آموزان شد: نرمال فارسی + بی‌اثرکردن wildcard
    expect(waitlistService).toContain('likePattern(sanitizeFaQuery(filters.q))');
    expect(waitlistService).toContain("${faHaystackExpr('w.first_name')}");
    expect(waitlistService).toContain("${faHaystackExpr(`(w.first_name || ' ' || w.last_name)`)}");
    expect(waitlistService).not.toContain('%${filters.q.trim()}%');
  });

  it('② ترتیب پایدار: id در سه مخزن و pure انتظار', () => {
    expect(studentRepo).toContain('ORDER BY s.last_name, s.first_name, s.id');
    expect(studentService).toContain('ORDER BY a.start_at DESC, a.id DESC');
    expect(apptRepo).toContain('ORDER BY start_at, id');
  });

  it('③ senders: حلقه‌های enqueue از enqueueToMany می‌خوانند + هلپر مشترک familyTargets', () => {
    expect((senders.match(/enqueueToMany\(notify,/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(senders).toContain('async function familyTargets(studentId: string)');
    expect(senders.match(/FROM bot_links/g)?.length).toBe(1); // تعریف تکراری حذف شد
    expect(senders).toContain('notify.enqueueMany'); // پیوست غیبت: ستون appointment_id — هستهٔ batched مستقیم
    expect(senders).not.toContain('for (const chatId of targets)');
    expect(digest).toContain('inParamChunks'); // N+1 گفتگوها با IN تکه‌تکه جمع شد
    expect(digest).toContain('dayAppointments');
  });

  it('④ index.ts: دروازه‌های فرصت‌طلب یک کارخانه دارند و کرون روی نگاشت گیت‌ها می‌چرخد', () => {
    expect(index).toContain('function makeOpportunisticGate');
    expect(index).toContain('const CRON_GATES');
    expect(index.match(/makeOpportunisticGate\('/g)?.length).toBe(4);
    expect(index).not.toContain('probeCpSync');
    expect(index).toContain('cpSyncGate.probe(env, ctx)');
    expect(index).toContain('gate.runCycle(env)');
    expect(index).toContain("'cp_sync',");
    expect(index).toContain("'bug_report',");
  });

  it('⑤ اعتبارسنجی فایل از هستهٔ مشترک می‌آید — تعریف محلی docs/case-events حذف شد', () => {
    expect(docsService).not.toMatch(/function sanitizeFilename/);
    expect(docsService).toContain('sanitizeFilename // architecture-010');
    expect(casePure).toContain("export { sanitizeFilename } from '@core/shared'");
    expect(casePure).toContain('validateAttachmentFileInput(ALLOWED_FILE_MIME_TYPES, input, MAX_FILE_BYTES)');
    expect(casePure).not.toContain('isAllowedMimeType');
  });
});
