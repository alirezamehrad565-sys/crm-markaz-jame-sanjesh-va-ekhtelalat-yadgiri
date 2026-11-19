/**
 * POLISH-3 M5 — گیت نظم زیرساخت و نام‌ربی (۱.۲۷.۲۸)
 *
 * ۱) نمای واحد «پیوندهای بیرون» در پنل سلامت — چهار سطر با یک واژگان (مرکز ابری / شبکهٔ مراکز / بازی ابری / بات بله)
 * ۲) یک‌واژه‌سازی: هیچ «کنترل‌پلین»ای در src/public/docs نمی‌ماند — همه «شبکهٔ مراکز»
 * ۳) شناسنامهٔ ابزار در فرم‌ساز — مایگریشن 0117 + zod + سرویس + UI (منبع/هنجار سنی-روایی)
 * ۴) مستندات منقطع‌ها و تصمیم‌های بیرونی (بازی ابری/PUBLIC_BASE_URL، OTA، چرخهٔ باگ)
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('POLISH-3 M5 — نظم زیرساخت و نام‌ربی', () => {
  test('نمای واحد «پیوندهای بیرون»: چهار سطر با یک واژگان در پنل سلامت', () => {
    const hp = read('public/assets/js/views/health-panel.js');
    expect(hp).toContain('export function externalLinksView');
    for (const title of ['مرکز ابری', 'شبکهٔ مراکز', 'بازی ابری', 'بات بله']) {
      expect(hp).toContain(`{ title: '${title}'`);
    }
    // منابع داده: node-sync/status (sync)، cp_link از health/panel، بازی‌ها، bot-username
    expect(hp).toContain('externalLinksView({ sync, cpLink: data?.cp_link, games: data?.games, botUsername })');
    expect(hp).toContain("/api/notifications/bot-username");
    // بخش پنجم پنل — و شماره‌گذاری پس از او دست‌نخورده
    expect(hp).toContain("'۵ — پیوندهای بیرون'");
    expect(hp).toContain("'۶ — کارهای اضطراری'");
    expect(hp).toContain("'۷ — هشدارهای فعال'");
    expect(hp).toContain('هفت بخش مرتب');
  });

  test('یک‌واژه‌سازی: «کنترل‌پلین» در src/public/docs صفر شده — فقط «شبکهٔ مراکز»', () => {
    for (const f of [
      'public/assets/js/app.js',
      'src/domain/network-content/service.ts',
      'src/domain/network-content/types.ts',
      'src/domain/content-score/types.ts',
      'src/application/cp-report/ingest.ts',
      'src/application/cp-content/sync.ts',
      'src/application/health/service.ts',
      'docs/ARCHITECTURE.md'
    ]) {
      expect(read(f)).not.toContain('کنترل‌پلین');
    }
    expect(read('src/domain/network-content/service.ts')).toContain('از شبکهٔ مراکز آمده');
  });

  test('شناسنامهٔ ابزار: مایگریشن 0117 + zod + سرویس (ایجاد/ویرایش) هم‌راستا', () => {
    const mig = read('migrations/0117_tool_metadata.sql');
    expect(mig).toContain('ALTER TABLE case_event_types ADD COLUMN tool_source TEXT');
    expect(mig).toContain('ALTER TABLE case_event_types ADD COLUMN tool_norm TEXT');
    const pure = read('src/domain/case-events/pure.ts');
    expect(pure).toContain('toolSource: z.string().max(TYPE_DESCRIPTION_MAX).nullish()');
    expect(pure).toContain('toolNorm: z.string().max(TYPE_DESCRIPTION_MAX).nullish()');
    const types = read('src/domain/case-events/types.ts');
    expect(types).toContain('toolSource: string | null');
    expect(types).toContain('toolSource?: string | null');
    const service = read('src/domain/case-events/service.ts');
    expect(service).toContain('tool_source, tool_norm, active, created_by');
    expect(service).toContain('tool_source = ?, tool_norm = ?, updated_at = ?');
    expect(service).toContain('toolSource: r.tool_source ?? null');
    const ui = read('public/assets/js/views/case-event-types.js');
    expect(ui).toContain('منبع ابزار (اختیاری — از کجا آمده؟)');
    expect(ui).toContain('هنجار سنی و روایی (اختیاری — برای چه سنی، چه اعتباری؟)');
    expect(ui).toContain('toolSource: v(st.toolSource) || null');
    expect(ui).toContain("t.toolSource ? ` — منبع: ${t.toolSource}`");
  });

  test('مستندات منقطع‌ها و تصمیم‌های بیرونی ثبت شده‌اند', () => {
    const legacy = read('docs/legacy/DISCONNECTED-PANELS.md');
    expect(legacy).toContain('client-errors');
    expect(legacy).toContain('۱.۲۵.۶۶');
    const decisions = read('docs/INFRA-DECISIONS.md');
    expect(decisions).toContain('PUBLIC_BASE_URL');
    expect(decisions).toContain('GAMES_HEALTH_URL');
    expect(decisions).toContain('TAURI_UPDATER_PUBKEY');
    expect(decisions).toContain('TAURI_UPDATER_PRIVATE_KEY');
    expect(decisions).toContain('چرخهٔ هدف');
  });
});
