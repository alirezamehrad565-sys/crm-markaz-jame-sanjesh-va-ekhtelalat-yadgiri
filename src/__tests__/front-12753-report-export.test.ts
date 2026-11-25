/**
 * گیت موج ۳ طرح ارتقای پرونده (۱.۲۷.۵۳) — «پروندهٔ ناشر» (طرح C، PROFILE-UPGRADE-DESIGN §۵):
 * ① migration 0122 report_snapshots با سندگیت همگامی ② ماژول report-export: snapshot-first
 * (شمارهٔ سالانه/SHA-256/امضا + راستی‌آزمایی هش در خواندن) ③ سیم‌کشی با تزریق سازندهٔ گزارش
 * ④ kind report_export در timeline (سند نه پیام) + چیپ آرشیو ⑤ کلاینت: builder + نسخهٔ قطعی سه‌واریانت.
 * منطق سرویس خودش در report-export.test.ts پوشش دارد؛ اینجا فقط قرارداد پین می‌شود.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('موج ۳ — سند و migration', () => {
  it('0122_report_snapshots.sql با سندگیت همگامی MIGRATIONS.md هم‌خوان است', () => {
    expect(existsSync(join(ROOT, 'migrations/0122_report_snapshots.sql'))).toBe(true);
    const mig = read('migrations/0122_report_snapshots.sql');
    expect(mig).toContain('report_no TEXT NOT NULL UNIQUE');
    expect(mig).toContain('content_hash TEXT NOT NULL');
    const doc = read('docs/MIGRATIONS.md');
    expect(doc).toContain('| 122 | `0122_report_snapshots.sql` |');
    // ۱.۲۷.۷۹ (sdt156) — پین پویا: «شمارهٔ بعدی» سند باید همیشه برابر بعدیِ آزادِ دنباله‌دارِ
    // واقعی مخزن باشد (literal ثابت در هر مایگریشن تازه می‌شکست — خودِ الگوی testing-002)
    const maxNum = readdirSync(join(ROOT, 'migrations'))
      .filter((f) => f.endsWith('.sql'))
      .map((f) => Number(f.slice(0, 4)))
      .reduce((a, b) => Math.max(a, b), 0);
    expect(doc).toContain(`شمارهٔ بعدی = \`0${maxNum + 1}\``);
  });
});

describe('موج ۳ — ماژول report-export و سیم‌کشی', () => {
  const svc = read('src/application/report-export/service.ts');
  const wiring = read('src/application/api-routing/index.ts');

  it('snapshot-first: هش SHA-256 + شمارهٔ سالانهٔ جلالی + امضاکنندهٔ لحظهٔ قطعی', () => {
    expect(svc).toContain('export async function sha256Hex');
    expect(svc).toContain('export function reportNoOf');
    expect(svc).toContain("action: 'report.snapshot.created'");
    expect(svc).toContain(".includes('UNIQUE')"); // گارد رقابت شماره — تلاش دوباره فقط برای برخورد UNIQUE
  });

  it('راستی‌آزمایی در خواندن: بازمحاسبهٔ هش = بازتولید عین محتوا', () => {
    expect(svc).toContain('rec.hashVerified = (await sha256Hex(row.sections_json)) === row.content_hash;');
  });

  it('سازندهٔ گزارش تزریقی است (نه وابستگی domain→domain) و route ثبت شده', () => {
    expect(wiring).toContain('createReportExportService({');
    expect(wiring).toContain('clinicalEngine.getPathwayReport(pathId, { from: null, to: null }, actor)');
    expect(wiring).toContain('registerReportExportRoutes(app, services.reportExport);');
  });
});

describe('موج ۳ — timeline و کلاینت', () => {
  const types = read('src/application/student-timeline/types.ts');
  const timelineSvc = read('src/application/student-timeline/service.ts');
  const view = read('public/assets/js/views/student-profile.js');

  it('kind report_export: سند در تاریخچه می‌نشیند، نه پیام', () => {
    expect(types).toContain("'report_export'");
    expect(timelineSvc).toContain('FROM report_snapshots');
    expect(timelineSvc).toContain("type: 'report_snapshot', id: s.id");
  });

  it('کلاینت: دکمهٔ صدور در page-head + فلوی انتخاب→قطعی‌سازی→گزارش قطعی', () => {
    expect(view).toContain("'صدور گزارش قطعی'");
    expect(view).toContain('async function openSnapshotBuilder()');
    expect(view).toContain("api.post(`/api/students/${id}/report-snapshots`, { path_id: p.id })");
    expect(view).toContain('async function openSnapshotModal(sid)');
    expect(view).toContain("'اصالت سند: تأیید'");
  });

  it('آرشیو: چیپ «گزارش‌های خروجی» و بازکردن سند از خط زمانی (سند نه پیام)', () => {
    expect(view).toContain("{ key: 'reports', label: 'گزارش‌های خروجی', kinds: 'report_export' }"); // ۱.۲۷.۷۱ — نام چیپ کلاسیک
    expect(view).toContain('const isSnapshot = e.kind === \'report_export\' && e.ref?.type === \'report_snapshot\'');
    expect(view).toContain('report_export: { icon: \'file\', tone: \'accent\' }');
  });

  it('سه واریانت از یک سند قطعی — متخصص/خانواده/مدرسه', () => {
    expect(view).toContain("variant === 'family'");
    expect(view).toContain("variant === 'school'");
    expect(view).toContain("kv('تصمیم پایش', m.decisionLabel ?? null)");
  });

  it('گراف بوت دست‌نخورده — ماژول تازه فقط در chunk پروفایل/سرور', () => {
    expect(read('public/assets/js/app.js')).not.toContain('report-snapshots');
  });
});
