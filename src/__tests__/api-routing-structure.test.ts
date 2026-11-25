/**
 * گیت ساختاری ۱.۲۷.۸۰ (sdt157 — بستن architecture-001 رجیستری ممیزی): تفکیک سه نقشِ
 * api-routing. createApp باریک است (نه سرویس می‌سازد، نه هندلر منطق‌دار دارد)؛ ترکیب در
 * composition، میان‌افزار سراسری در middleware، رجیستری مسیرها در routes — با ترتیبِ
 * قطعیِ چیدمان: عمومی → گیت → محافظت‌شده. افزودن ماژول دامنه فقط یک ورودی به routes.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت ساختاری api-routing (architecture-001) — ۱.۲۷.۸۰', () => {
  const index = read('src/application/api-routing/index.ts');
  const composition = read('src/application/api-routing/composition.ts');
  const middleware = read('src/application/api-routing/middleware.ts');
  const routes = read('src/application/api-routing/routes.ts');

  it('① createApp باریک است: نه سرویس می‌سازد نه هندلر منطق‌دار دارد', () => {
    expect(index).not.toMatch(/create\w*Service\(/);
    expect(index).not.toContain('app.get(');
    expect(index).toContain('installGlobalMiddleware(app, services)');
    expect(index).toContain('registerPublicRoutes(app, services, deps)');
    expect(index).toContain('registerProtectedRoutes(app, services, deps)');
    expect(index).toContain('__services'); // قرارداد تستی حفظ شده
  });

  it('② composition root: سرویس‌های دو-ناقلهٔ سابق و تجمیع KPI این‌جا ساخته می‌شوند', () => {
    expect(composition).toContain('export function createServices');
    expect(composition).toContain('createDashboardService({');
    expect(composition).toContain('createAssessmentBlockService({');
    expect(composition).toContain('createFormBuilderService({');
    expect(composition).toContain('createDashboardKpiService({');
    expect(composition).toMatch(/downloadSecret: deps\.downloadSecret \?\? deps\.webhookSecret \?\? \(crypto\.randomUUID\(\) \+ crypto\.randomUUID\(\)\)/);
  });

  it('③ میان‌افزار: ماسک مسیر (security-005) و سقف GET توکن‌دار (security-008) این‌جایند', () => {
    expect(middleware).toContain("import { maskSensitivePath } from '@core/shared/log-mask'");
    expect(middleware).toContain('path: maskSensitivePath(c.req.path)');
    expect(middleware).not.toMatch(/path:\s*c\.req\.path[,}]/); // فرمِ خام بازنگشته
    expect(middleware).toContain('parseTokenGetRateLimitPerMin');
    expect(middleware).toContain("tokenGetLimiter.allow(`tg:${perMin}:${ip}`");
  });

  it('④ ترتیب قطعی چیدمان در index: عمومی پیش از گیت، محافظت‌شده پس از آن', () => {
    const iPublic = index.indexOf('registerPublicRoutes(app, services, deps)');
    const iGate = index.indexOf("app.use('/api/*', authMiddleware())");
    const iProtected = index.indexOf('registerProtectedRoutes(app, services, deps)');
    expect(iPublic).toBeGreaterThan(-1);
    expect(iGate).toBeGreaterThan(iPublic);
    expect(iProtected).toBeGreaterThan(iGate);
  });

  it('⑤ رجیستری: زنجیرهٔ عمومی بازی و subappها پیش از گیت‌اند و KPI به سرویس رفته', () => {
    expect(routes).toContain('registerGamesPublicRoutes(app');
    expect(routes).toContain("app.route('/node'");
    expect(routes).toContain("app.route('/api/instance-sync'");
    expect(routes).toContain('services.dashboardKpi.getKpis');
    expect(routes).not.toContain('createDashboardService(');
    expect(routes).not.toContain('createAssessmentBlockService(');
    expect(routes).toContain('registerWaitlistRoutes(app, services.waitlist, { publicBaseUrl: deps.publicBaseUrl ?? null })');
    expect(routes).toContain('registerHealthRoutes(app');
    expect(routes).toContain('registerClientErrorsRoutes(app');
  });

  it('⑥ import scoring از لایهٔ مسیریابی بیرون کشیده شد — فقط در kpi-source است', () => {
    expect(read('src/application/dashboard/kpi-source.ts')).toContain("from '../../../worker/scoring.js'");
    expect(index + routes + composition + middleware).not.toContain('worker/scoring');
  });
});
