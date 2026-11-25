/**
 * POLISH-3 M6 — گیت بازنویسی کارت اعتبارسنجی بیرونی (۱.۲۷.۲۹)
 *
 * ۱) عنوان/زیرنویس روایت: «آیا تشخیص‌های ما درست از آب درمی‌آیند؟ — اثبات اعتبار تصمیم‌های بالینی»
 * ۲) حفر چهار KPI به فهرست مسیرهای پشتشان (الگوی M2 — کلیک‌پذیر با route صادقانه)
 * ۳) فرم پیگیری ۳–۶ماهه («شاهد پیامد واقعی» — وعدهٔ مایگریشن 0082) در UI + شمارش در KPI
 * ۴) نمای فقط‌خواندنی درمانگرِ همان پرونده (۴۰۳ مطلق برداشته شد — فیلتر صاحب/منتسب)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('POLISH-3 M6 — بازنویسی کارت اعتبارسنجی بیرونی', () => {
  test('روایت: عنوان و زیرنویس تازه در سر کارت', () => {
    const dash = read('public/assets/js/views/dashboard.js');
    expect(dash).toContain("'آیا تشخیص‌های ما درست از آب درمی‌آیند؟'");
    expect(dash).toContain('اثبات اعتبار تصمیم‌های بالینی برای اعتماد خانواده و اداره');
    expect(dash).not.toContain("'اعتبارسنجی بیرونی — شاخص‌های اعتماد'");
  });

  test('حفر چهار KPI: هر شاخص کلیک‌پذیر با مسیر صادقانه (الگوی M2)', () => {
    const dash = read('public/assets/js/views/dashboard.js');
    expect(dash).toContain('مشاهدهٔ فهرست پشتِ این عدد');
    // چهار مسیر حفر: پرونده‌ها (دو شاخص) · گزارش دوره · نوبت‌ها
    expect(dash).toContain("تأیید شدند', '#/students')");
    expect(dash).toContain("روند بهبود یا تسلط دارند', '#/reports')");
    expect(dash).toContain("جلسهٔ بازنگری‌شان ثبت شده', '#/appointments')");
    expect(dash).toContain('پرونده)`, \'#/students\')');
    expect(dash).toContain("node.setAttribute('role', 'link')");
    expect(dash).toContain("node.setAttribute('tabindex', '0')");
  });

  test('شاهد پیامد واقعی: فرم پیگیری ۳–۶ماهه در کارت + شمارش ارسال/پرشده', () => {
    const mig = read('migrations/0082_validation_m227.sql');
    expect(mig).toContain("'ce-followup-3m-v1'");
    const dash = read('public/assets/js/views/dashboard.js');
    expect(dash).toContain('شاهد پیامد واقعی — فرم پیگیری ۳–۶ماهه (خانواده)');
    expect(dash).toContain("const FOLLOWUP_TYPE_ID = 'bbbbbbbb-8231-4000-8000-000000000001'");
    expect(dash).toContain('function openFollowupSendModal');
    expect(dash).toContain("/api/students/${studentId}/case-events`, { eventTypeId: FOLLOWUP_TYPE_ID, values: {} }");
    expect(dash).toContain("/api/case-events/${created?.data?.id}/send`, { audience: 'family' }");
    expect(dash).toContain('فرم ارسال‌شده ·');
    const svc = read('src/domain/clinical-engine/service.ts');
    expect(svc).toContain("t.key = 'ce-followup-3m-v1' AND e.deleted_at IS NULL");
    expect(svc).toContain("followups: { sent: fuRow?.sent ?? 0, filled: fuRow?.filled ?? 0 }");
    expect(read('src/domain/clinical-engine/validation.ts')).toContain('followups?: { sent: number; filled: number } | null');
  });

  test('نمای فقط‌خواندنی درمانگرِ همان پرونده: ۴۰۳ مطلق برداشته شد', () => {
    const svc = read('src/domain/clinical-engine/service.ts');
    expect(svc).toContain("if (actor.role === 'therapist')");
    expect(svc).toContain('s.owner_staff_id = ? OR EXISTS');
    expect(svc).toContain('JOIN appointment_students asn ON asn.appointment_id = ap.id');
    expect(svc).toContain('حسابرسی موردی فقط برای دفتر مرکز و درمانگرِ همان پرونده قابل مشاهده است');
    const routes = read('src/domain/clinical-engine/routes.ts');
    expect(routes).toContain("requireRole('manager', 'secretary', 'therapist')");
    expect(routes).toContain("app.post('/api/case-audits', requireRole('manager', 'secretary')");
    const routing = read('src/application/dashboard/kpi-source.ts'); // ۱.۲۷.۸۰ — تجمیع KPI به سرویس منتقل شد (architecture-001)
    expect(routing).toContain("actor.role === 'therapist'");
    expect(routing).toContain('kpis: null, audits: a ?? []');
    const dash = read('public/assets/js/views/dashboard.js');
    expect(dash).toContain('نمای فقط‌خواندنی — حسابرسی موردیِ پرونده‌های شما');
    expect(dash).toContain('const isTherapistView = !kpis');
  });
});
