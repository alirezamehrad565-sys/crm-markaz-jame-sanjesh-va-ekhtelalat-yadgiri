// آزمون‌های ۱.۲۷.۱۶ — خواست کارفرما:
// ① فلوی ویرایش سوابق سنجش روزانه: دکمهٔ «روز قبل» در تب ثبت (کلیک دوباره = روزِ قبل‌تر) —
//    ثبت/ویرایش/حذف روی روزِ انتخابی؛ لینک عمیق از ویجت روز کاری (#/screening?day=…)
// ② کارت «نیازمند پیگیری» فقط «ارجاع هوش» را نشان می‌دهد — نه ارجاع بینایی و شنوایی
// @ts-ignore — فایل .js فرانت، خارج از include تایپ‌اسکریپت است
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const screening = read('public/assets/js/views/screening.js');

describe('۱.۲۷.۱۶ — فلوی ویرایش سوابق در تب «ثبت روزانه»', () => {
  it('ناوبری روز: روزِ انتخابی در state + دکمهٔ «روز قبل» با کلیک پشت‌سرهم عقب‌تر می‌رود', () => {
    expect(screening).toMatch(/dailyDay: ''/);
    expect(screening).toMatch(/const selected = state\.dailyDay && /);
    // «روز قبل» → یک روز عقب و رندر دوبارهٔ تب روی همان روز
    expect(screening).toMatch(/state\.dailyDay = addDaysYmd\(selected, -1\); rerenderDay\(\);/);
    // «روز بعد» فقط تا امروز — روی امروز غیرفعال است
    expect(screening).toMatch(/disabled: isToday \? true : null/);
    expect(screening).toMatch(/state\.dailyDay = addDaysYmd\(selected, 1\); rerenderDay\(\);/);
    // دکمهٔ بازگشت سریع به امروز در روزهای گذشته
    expect(screening).toMatch(/state\.dailyDay = ''; rerenderDay\(\);/);
  });

  it('ثبت/لیست روی روزِ انتخابی — نه فقط امروز', () => {
    expect(screening).toMatch(/api\.get\(`\/api\/screening\$\{qs\(\{ from: selected, to: selected \}\)\}`\)/);
    expect(screening).toMatch(/day: selected, \/\* ۱\.۲۷\.۱۶/);
    expect(screening).toMatch(/در این روز قبلاً ثبت شده/);
    expect(screening).toMatch(/isToday \? 'لیست روز سنجش امروز' : `لیست روز سنجش — \$\{formatJalaliFull\(selected\)\}`/);
    // راهنمای ویرایش سوابق در روزهای گذشته
    expect(screening).toMatch(/ثبتِ جاافتاده یا اصلاحِ اشتباهِ همین روز از فرم پایین ممکن است/);
  });

  it('لینک عمیق از ویجت روز کاری: #/screening?day=… → تب ثبت روی همان روز', () => {
    expect(screening).toMatch(/export async function renderScreening\(container, ctx = \{\}\)/);
    expect(screening).toMatch(/const linkDay = ctx\?\.query\?\.day;/);
    expect(screening).toMatch(/state\.dailyDay = linkDay;/);
    expect(screening).toMatch(/location\.hash = `#\/screening\?day=\$\{ymd\}`;/);
    expect(screening).toMatch(/'ثبت \/ ویرایش'\)/);
  });
});

describe('۱.۲۷.۱۶ — کارت پیگیری فقط «ارجاع هوش»', () => {
  it('followUps فقط برچسب ارجاع هوش را شامل می‌شود و عنوان کارت عوض شده', () => {
    expect(screening).toMatch(/const IQ_REFERRAL = 'ارجاع هوش';/);
    // ۱.۲۷.۳۳ — ردیفِ نتیجهٔ ثبت‌شده (iqHandledAt) از کارت فعال خارج می‌شود و به «نتایج ثبت‌شده» می‌رود
    expect(screening).toMatch(/const followUps = entries\.filter\(\(e\) => e\.tags\.includes\(IQ_REFERRAL\) && !e\.iqHandledAt\);/);
    expect(screening).toMatch(/نیازمند پیگیری \(ارجاع هوش\)/);
    // بج‌های ردیف هم فقط همان ارجاع هوش را نشان می‌دهند — نه بینایی/شنوایی
    expect(screening).toMatch(/e\.tags\.filter\(\(t\) => t === IQ_REFERRAL\)\.map\(\(t\) => tagBadge\(t\)\)/);
    // الگوی قدیمی «همهٔ ارجاع‌ها» در این کارت نباید مانده باشد
    expect(screening).not.toMatch(/followUps = entries\.filter\(\(e\) => e\.tags\.some\(\(t\) => REFERRALS\.includes\(t\)\)\)/);
  });

  it('KPI «ارجاع تخصصی» و چیپ فیلتر «همهٔ ارجاع‌ها» دست‌نخورده‌اند (فقط کارت تغییر کرد)', () => {
    expect(screening).toMatch(/sanjKpi\('ارجاع تخصصی'/);
    expect(screening).toMatch(/'نیازمند پیگیری \(همهٔ ارجاع‌ها\)'/);
    expect(screening).toMatch(/const REFERRALS = PREDEFINED\.filter/);
  });
});
