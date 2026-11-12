/**
 * گیت فرانت ۱.۲۵.۶۱ — بازطراحی مستقل ماژول «نظرسنجی خانواده‌ها» را پین می‌کند:
 * خواست کارفرما: «این ماژول باید دوباره بازنگری و باز طراحی بشه به صورت مستقل — تحقیق کن
 * ببین مهم‌ترین گزارش‌هایی که از سامانه یه مدیر می‌تونه بگیره چیه … چه آمارهایی و چه شکل
 * ارائه‌ای برات مهمه … سپس کل ماژول رو باز طراحی کن و اجرا».
 * ① شِل سه‌تبی: تابلوی شاخص‌ها / نظرسنجی‌ها / صدای خانواده
 * ② تابلوی اجرایی: باند هشدار استثنا + شش کارت RAG با دلتای دورهٔ قبل + NPS استاندارد
 * ③ روند برشی با lineChart + هدف خط‌چین + مقایسهٔ دو فرم با hbars + کارنامهٔ درمانگران با dataTable
 * ④ صدای خانواده: تم‌ها + «نیازمند پیگیری»
 * ⑤ endpoint تازهٔ insights فقط-مدیر + ماژول خالص survey-insights
 * الگو: front-12557.test.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const JS = join(ROOT, 'public/assets/js');
const read = (p: string) => readFileSync(join(JS, p), 'utf8');

describe('گیت فرانت ۱.۲۵.۶۱ — بازطراحی مستقل ماژول نظرسنجی', () => {
  const view = read('views/family-surveys.js');
  const app = read('app.js');
  const version = readFileSync(join(ROOT, 'src/core/version.ts'), 'utf8');

  test('① شِل سه‌تبی با نقش‌های ثابت — تابلوی شاخص‌ها پیش‌فرض است', () => {
    expect(view).toMatch(/tabBtn\('board', 'تابلوی شاخص‌ها', 'dashboard'\)/);
    expect(view).toMatch(/tabBtn\('surveys', 'نظرسنجی‌ها', 'clipboard'\)/);
    expect(view).toMatch(/tabBtn\('voice', 'صدای خانواده', 'message'\)/);
    expect(view).toMatch(/const local = \{ tab: 'board', days: 30 \}/);
    /* گارد فقط-مدیر سرِ جای خودش */
    expect(view).toMatch(/role === 'manager'/);
    expect(view).toMatch(/فقط از دسترسی مدیر فعال است/);
  });

  test('② تابلوی اجرایی: هشدار استثنا + شش کارت RAG با آستانهٔ پژوهش‌محور و دلتا', () => {
    /* باند هشدار فقط با آستانه — alert--error/warning */
    expect(view).toMatch(/نرخ پاسخ پایین است/);
    expect(view).toMatch(/RESP_GOAL = 0\.4/);
    expect(view).toMatch(/SAT_OK = 75/);
    expect(view).toMatch(/SAT_WARN = 60/);
    /* شش کارت */
    expect(view).toMatch(/kpi\('رضایت از مرکز', cur\.center_avg/);
    expect(view).toMatch(/kpi\('رضایت از درمانگر', cur\.therapist_avg/);
    expect(view).toMatch(/kpi\('پیشرفت از نگاه خانواده', cur\.progress_avg/);
    expect(view).toMatch(/kpi\('شاخص توصیه \(NPS\)', cur\.nps_index/);
    expect(view).toMatch(/kpi\('نرخ پاسخ خانواده‌ها', cur\.response_rate/);
    expect(view).toMatch(/kpi\('نظرسنجی‌های در جریان', ins\.pending_open \+ ins\.pending_expired/);
    /* دلتای دورهٔ قبل با ▲▼ */
    expect(view).toMatch(/deltaLine\(cur, ins\.previous, 'center_avg'/);
    expect(view).toMatch(/نسبت به دورهٔ قبل/);
    /* مهلت‌گذشته و نظر منفی در هشدار */
    expect(view).toMatch(/ins\.pending_expired > 0/);
    expect(view).toMatch(/ins\.notes_negative_count > 0/);
  });

  test('③ روند برشی + خط هدف + مقایسهٔ دو فرم + کارنامهٔ درمانگران', () => {
    expect(view).toMatch(/lineChart\(\{ points, yMax: 100, height: 170, valueFormatter: \(v\) => `\$\{fa\(Math\.round\(v\)\)\}٪`, threshold: \{ value: SAT_OK, label: `هدف \$\{pct\(SAT_OK\)\}` \} \}\)/);
    expect(view).toMatch(/trendChart\('رضایت از مرکز', 'center_avg'\)/);
    expect(view).toMatch(/trendChart\('رضایت از درمانگر', 'therapist_avg'\)/);
    expect(view).toMatch(/trendChart\('پیشرفت از نگاه خانواده', 'progress_avg'\)/);
    /* مقایسهٔ دو فرم */
    expect(view).toMatch(/نرخ پاسخ — پایان دوره/);
    expect(view).toMatch(/نرخ پاسخ — حین درمان/);
    expect(view).toMatch(/رضایت مرکز — پایان دوره/);
    expect(view).toMatch(/رضایت مرکز — حین درمان/);
    /* کارنامهٔ درمانگران */
    expect(view).toMatch(/کارنامهٔ درمانگران/);
    expect(view).toMatch(/درمانگر مورد ارزیابی/);
    expect(view).toMatch(/بدون درمانگر مشخص \(ثبت‌کننده\)/);
    /* چرخهٔ پنجره ۷/۳۰/۹۰ */
    expect(view).toMatch(/dayChip\(7, '۷ روز'\)/);
    expect(view).toMatch(/dayChip\(30, '۳۰ روز'\)/);
    expect(view).toMatch(/dayChip\(90, '۹۰ روز'\)/);
  });

  test('④ صدای خانواده: تم‌ها + پرچم نیازمند پیگیری + فیلتر', () => {
    expect(view).toMatch(/THEME_LABEL = \{/);
    expect(view).toMatch(/فراوانی تم‌ها/);
    expect(view).toMatch(/نیازمند پیگیری/);
    expect(view).toMatch(/vstate\.negativeOnly/);
    expect(view).toMatch(/n\.themes\.includes\(vstate\.theme\)/);
  });

  test('⑤ منبع دادهٔ تازه: insights فقط-مدیر + عملیات نظرسنجی دست‌نخورده', () => {
    expect(view).toMatch(/\/api\/case-events\/surveys\/insights\?days=\$\{local\.days\}/);
    expect(view).toMatch(/\/api\/case-events\/surveys/);
    expect(app).toMatch(/\{ hash: '#\/family-surveys', label: 'نظرسنجی خانواده‌ها', icon: 'heart', group: 'مرکز', roles: \['manager'\] \}/);
    /* قرارداد مودال ساخت — درس «باز نمی‌شد» ۱.۲۵.۵۹ پین بماند */
    expect(view).toMatch(/actions: \[\(closeShell\) => submitBtn\]/);
    /* عملیات‌ها */
    expect(view).toMatch(/کپی لینک/);
    expect(view).toMatch(/ارسال با بله/);
    expect(view).toMatch(/جزئیات پاسخ/);
  });

  test('⑥ پین نسخه: ۱.۲۵.۶۱', () => {
    expect(version).toMatch(/APP_VERSION = '1\.25\.74'/);
  });
});
