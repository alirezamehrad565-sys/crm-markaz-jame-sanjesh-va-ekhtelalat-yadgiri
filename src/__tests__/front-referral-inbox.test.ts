/**
 * گیت فرانت ۱.۲۷.۳۸ — ادغام «صندوق ورودی» در لیست انتظار + افزودن به آرشیو + متن‌های محاوره‌ای
 * خواست کارفرما (این نوبت):
 * ① «قرار بود صندوق ورودی توی لیست انتظار ادغام بشه» — تب دوم داخل #/waitlist، بدون آیتم مستقل منو
 * ② «از صندوق ورودی باید بشه دانش‌آموز رو به آرشیو اضافه کرد» — کنش پیش‌پُر از معرفی در فرم آرشیو
 * ③ متن‌های دیرآموز/کم‌توان/اختلال یادگیری محاوره‌ای و مفصل‌تر، بدون تذکر تکراری «تشخیص»،
 *    با لینک فایل راهنمای عمومی (/public/guide/<slug>)
 * ④ بات: دکمهٔ «تمرین‌ها و کارت‌ها» برای مهمان + لینک صفحهٔ عمومی بانک محتوا (/public/activities)
 * الگو: front-12581.test.ts — گیت محتوایی سورس‌خوان
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

describe('گیت فرانت ۱.۲۷.۳۸ — صندوق ورودی در لیست انتظار + آرشیو + متن‌ها + بات', () => {
  const view = read('public/assets/js/views/referral-inbox.js');
  const waitlist = read('public/assets/js/waitlist.js');
  const app = read('public/assets/js/app.js');
  const archiveForm = read('public/assets/js/archive-form.js');
  const referralPage = read('src/domain/waitlist/referral-page.ts');
  const guidePage = read('src/domain/waitlist/guide-page.ts');
  const waitRoutes = read('src/domain/waitlist/routes.ts');
  const webhook = read('src/core/notify/bale/webhook.ts');
  const botCommands = read('src/application/notify/bot-commands.ts');
  const templates = read('src/core/notify/templates.ts');
  const exbRoutes = read('src/domain/exercise-bank/routes.ts');
  const exbTypes = read('src/domain/exercise-bank/types.ts');
  const exbService = read('src/domain/exercise-bank/service.ts');

  it('① صندوق ورودی: تب دومِ لیست انتظار — بدون آیتم مستقل منو و بدون badge قدیمی', () => {
    expect(waitlist).toContain("import { renderReferralInbox } from './views/referral-inbox.js'");
    expect(waitlist).toContain('renderReferralInbox(inboxZone, { embedded: true, onCount: (n) => {');
    expect(waitlist).toContain("'صندوق ورودی'");
    expect(app).not.toContain('#/referral-inbox'); // آیتم منو + register + badge همه حذف شده‌اند
    expect(app).not.toContain('nav__badge--referrals');
    expect(app).not.toContain('updateReferralsBadge');
    expect(view).toContain('const embedded = opts.embedded === true');
    expect(view).toContain("opts.onCount?.(rows.filter((r) => r.status === 'new').length)");
  });

  it('② «افزودن به آرشیو» از صندوق — پیش‌پُر از معرفی در فرم آرشیو', () => {
    expect(view).toContain("import { openArchiveStudentForm } from '../archive-form.js'");
    expect(view).toContain("'افزودن به آرشیو'");
    expect(view).toContain('initial: {');
    expect(view).toContain("full_name: r.firstName ?? ''");
    expect(archiveForm).toContain('const pre = initial && !student ? initial : null');
    expect(archiveForm).toContain("preName[0] ?? ''"); // شکستن نام کامل به نام/نام‌خانوادگی
    expect(archiveForm).toContain('meta.schools.find((s) => s.active && s.name === pre.school_text)');
    expect(archiveForm).toContain('ثبت در آرشیو — از معرفی صندوق ورودی');
    expect(archiveForm).toContain('/^\\d{8}$/.test(String(pre?.birth_date ?? \'\'))'); /* فقط عدد جلالی به تقویم */
  });

  it('③ صفحه‌های آگاهی: محاوره‌ای، بدون تذکر تکراری «تشخیص»، با لینک فایل راهنما', () => {
    expect(referralPage).toContain("g:'delayed'");
    expect(referralPage).toContain("g:'learning-disorder'");
    expect(referralPage).toContain("g:'intellectual'");
    expect(referralPage).toContain('href="/public/guide/\'+a.g');
    expect(referralPage).toContain('فایل راهنمای کامل‌تر این دسته');
    expect(referralPage).not.toContain('تشخیصش کارِ ماست'); // تذکر تکراری حذف شد
    expect(referralPage).not.toContain('شما تشخیص نمی‌دید');
    expect(referralPage).not.toContain('تشخیص کار ماست');
    // متن تازه مفصل‌تر و محاوره‌ای‌تر است
    expect(referralPage).toContain('گام‌های کوچیک‌تر');
    expect(referralPage).toContain('مغزش فقط یه مسیر رو متفاوت پردازش می‌کنه');
    expect(referralPage).toContain('انتظارِ واقع‌بینانه');
  });

  it('⑤ جعبهٔ «لینک عمومی معرفی» برای اشتراک در گروه‌ها — مطلق، کپی‌پذیر، بدون توکن (۱.۲۷.۴۴)', () => {
    expect(view).toContain('لینک عمومی معرفی به مرکز');
    expect(view).toContain("String(res.public_base_url ?? '').trim() || location.origin"); // پایه از استقرار؛ دسکتاپ → مبدأ فعلی
    expect(view).toContain('/public/referral'); // لینک ثابت فرم عمومی
    expect(view).toContain('navigator.clipboard.writeText'); // کپی یک‌کلیکی
    expect(view).toContain("document.execCommand('copy')"); // fallback
    expect(view).toContain('shareCard'); // جعبه در بدنهٔ اصلی نما مونت شده
    // مسیر API پایه را می‌دهد (env استقرار) — و لینک هیچ‌گاه توکن ندارد
    expect(waitRoutes).toContain('public_base_url: opts?.publicBaseUrl ?? null');
    expect(read('src/application/api-routing/index.ts')).toContain(
      'registerWaitlistRoutes(app, services.waitlist, { publicBaseUrl: deps.publicBaseUrl ?? null })'
    );
    const shareIdx = view.indexOf('shareUrl()');
    expect(view.slice(shareIdx, shareIdx + 120)).not.toContain('token'); // بدون توکن نشست/چت
    // بات هم لینک ساده می‌دهد (بدون ?token=) — قابل فوروارد به هر گروه
    expect(botCommands).toContain("+ '/public/referral';");
    expect(botCommands).not.toMatch(/refWebLink[^\n]*token=/);
  });

  it('③ راهنمای عمومی سه‌دسته سرو می‌شود — همان قرارداد /public/referral', () => {
    expect(waitRoutes).toContain("app.get('/public/guide/:slug'");
    expect(waitRoutes).toContain('GUIDE_SLUGS as readonly string[]).includes(slug)');
    expect(waitRoutes).toContain("import { GUIDE_SLUGS, renderGuidePage } from './guide-page'");
    expect(guidePage).toContain("GUIDE_SLUGS = ['delayed', 'learning-disorder', 'intellectual']");
    expect(guidePage).toContain('/public/referral'); // CTA معرفی در هر راهنما
    expect(guidePage).not.toContain('تشخیص کار ماست'); // بدون تذکر تکراری در راهنماها
    expect(guidePage).toContain('همهٔ خدمات مرکز رایگانه'); // ۱.۲۷.۴۲ — متن بازبینی‌شدهٔ کارفرما
  });

  it('④ بات: دکمهٔ «تمرین‌ها و کارت‌ها» + لینک صفحهٔ عمومی بانک محتوا', () => {
    expect(webhook).toContain('ACTIVITIES_LABELS');
    expect(webhook).toContain("'تمرین‌ها و کارت‌ها'");
    expect(webhook).toContain("kind: 'activities'");
    expect(botCommands).toContain("['تمرین‌ها و کارت‌ها']");
    expect(botCommands).toContain("case 'activities'");
    expect(botCommands).toContain('handleActivitiesCommand');
    expect(botCommands).toContain('/public/activities');
    expect(botCommands).toContain('مرور تمرین‌ها و کارت‌های آمادهٔ مرکز');
    expect(templates).toContain("case 'bot_activities'");
    expect(exbRoutes).toContain("app.get('/public/activities'");
    expect(exbRoutes).toContain('renderActivitiesPage');
    expect(exbTypes).toContain('listPublicActivities(): Promise<PublicActivityItem[]>;');
    expect(exbService).toContain('async listPublicActivities()');
    expect(exbService).toContain('WHERE e.published = 1 AND e.deleted_at IS NULL'); // فقط منتشرشده‌ها
  });
});
