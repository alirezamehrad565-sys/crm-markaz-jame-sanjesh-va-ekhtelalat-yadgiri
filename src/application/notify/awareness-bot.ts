/**
 * اعلان‌های کاربردی و بات‌های نقش‌آگاه بله — بات نقش‌آگاه بله (منو و مسیرها)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// منوی «آگاهی‌های اختلالات»: محتوای آموزشی عمومی مرکز داخل بات
// ریشه (dis:root) → دو بخش: t=راهنمای تخصصی اختلال‌ها (۹) / d=دفاتر آموزشی A4 (۱۸)
// بخش → فهرست دکمه‌های عنوان‌دار (صفحه‌بندی ۸تایی) → آیتم → پیام عنوان + لینک عمومی
// بدون گیت داده: فایل‌ها روی سایت عمومی‌اند و برای همهٔ نقش‌ها حتی مهمان باز است.
// شناسه‌ها اندیس آرایهٔ استاتیک‌اند — state لازم ندارد (برخلاف exb/stu).

import type { InlineButton } from '@core/notify';
import type { AwSection } from '@core/notify';
import { faDigits } from '@core/shared';

export interface AwBotDeps {
  /** آدرس عمومی سامانه — خالی = پیام بدون لینک (نسخهٔ چاپی از دفتر) */
  publicBaseUrl: string | null;
}

export interface AwBotReply {
  text: string;
  buttons: InlineButton[][] | null;
}

/** سقف دکمه‌های هر صفحهٔ بخش */
export const AW_PAGE_SIZE = 8;

interface AwItem {
  title: string;
  file: string;
  hint: string;
}

/** راهنمای تخصصی اختلال‌ها — پوشهٔ /downloads/training */
const TRAINING: AwItem[] = [
  { title: 'نارساخوانی (دیس‌لکسی)', file: 'ekhtelal-01-narsakhaani.html', hint: 'شناخت علائم و راه‌های همراهی در خانه و کلاس' },
  { title: 'نارسانویسی (دیس‌گرافی)', file: 'ekhtelal-02-narsanevisi.html', hint: 'دشواری نوشتن و خوشنویسی؛ تمرین‌های پیشنهادی' },
  { title: 'نارساریاضی (دیس‌کالکولی)', file: 'ekhtelal-03-narsaariaazi.html', hint: 'دشواری مفاهیم عدد و محاسبه' },
  { title: 'بیش‌فعالی و کم‌توجهی (ADHD)', file: 'ekhtelal-04-adhd.html', hint: 'مدیریت توجه، تکلیف و رفتار' },
  { title: 'طیف اتیسم', file: 'ekhtelal-05-otism.html', hint: 'ارتباط، تعامل و ساختاربندی محیط' },
  { title: 'اختلال زبانی و بیان', file: 'ekhtelal-06-zabani.html', hint: 'تأخیر گفتار و زبان؛ تمرین‌های زبانی خانگی' },
  { title: 'اضطراب کودکان', file: 'ekhtelal-07-ezteraab.html', hint: 'نشانه‌ها و راهکارهای کاهش اضطراب' },
  { title: 'هماهنگی حرکتی (دیس‌پراکسی)', file: 'ekhtelal-08-hamahangi.html', hint: 'دشواری حرکات درشت و ظریف' },
  { title: 'دیرآموزی و پروتکل دیرآموز', file: 'ekhtelal-09-diramuzi.html', hint: 'یادگیری آهسته‌تر با روش ساخت‌یافته' }
];

/** دفاتر آموزشی A4 — پوشهٔ /downloads/dossiers */
const DOSSIERS: AwItem[] = [
  { title: 'دفتر ۰۱ — نارساخوانی', file: 'd-01-narsakhani.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۲ — نارسانویسی', file: 'd-02-narsanevisi.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۳ — نارساریاضی', file: 'd-03-narsaariaazi.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۴ — بیش‌فعالی و کم‌توجهی', file: 'd-04-adhd.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۵ — طیف اتیسم', file: 'd-05-otism.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۶ — اختلال زبانی و بیان', file: 'd-06-zabani.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۷ — اضطراب کودکان', file: 'd-07-ezteraab.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۸ — هماهنگی حرکتی', file: 'd-08-hamahangi.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۰۹ — دیرآموزی', file: 'd-09-diramuzi.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۰ — مشکلات رفتاری و نافرمانی', file: 'd-10-raftari.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۱ — حافظهٔ کاری و پردازش', file: 'd-11-hafeze.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۲ — فقر فرصت آموزشی', file: 'd-12-faqr.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۳ — افت انگیزشی و خودباوری', file: 'd-13-angize.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۴ — اضطراب امتحان', file: 'd-14-emtehan.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۵ — عادت‌های مطالعه', file: 'd-15-motalee.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۶ — سازگاری با تغییر مقطع', file: 'd-16-taghir.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۷ — استرس محیطی و خانوادگی', file: 'd-17-estress.html', hint: 'گزارش A4 برای چاپ' },
  { title: 'دفتر ۱۸ — تک‌درس ضعیف', file: 'd-18-yekdars.html', hint: 'گزارش A4 برای چاپ' }
];

function sectionItems(section: AwSection): AwItem[] {
  return section === 't' ? TRAINING : DOSSIERS;
}

export function createAwarenessBot(deps: AwBotDeps) {
  const base = (deps.publicBaseUrl ?? '').replace(/\/+$/, '');
  const hasLinks = base.length > 0;

  function itemUrl(section: AwSection, item: AwItem): string {
    return section === 't'
      ? `${base}/downloads/training/${item.file}`
      : `${base}/downloads/dossiers/${item.file}`;
  }

  return {
    /** منوی ریشه — دو دکمهٔ بخش */
    async root(): Promise<AwBotReply> {
      return {
        text: [
          '📖 آگاهی‌های اختلالات',
          '',
          'راهنماهای تخصصی و دفاتر آموزشی مرکز برای خانواده‌ها و معلمان — لینک هر مورد در پیام بعدی باز می‌شود.',
          hasLinks ? '' : '⚙️ لینک‌های آنلاین فعلاً فعال نیست — نسخهٔ چاپی را از دفتر مرکز بخواهید.'
        ].join('\n'),
        buttons: [
          [{ text: '🧩 راهنمای اختلال‌ها (۹)', callbackData: 'dis:t' }],
          [{ text: '📄 دفاتر آموزشی A4 (۱۸)', callbackData: 'dis:d' }]
        ]
      };
    },

    /** فهرست یک بخش با صفحه‌بندی */
    async section(section: AwSection, page: number): Promise<AwBotReply> {
      const items = sectionItems(section);
      const totalPages = Math.max(1, Math.ceil(items.length / AW_PAGE_SIZE));
      const safePage = Math.min(Math.max(page, 1), totalPages);
      const slice = items.slice((safePage - 1) * AW_PAGE_SIZE, safePage * AW_PAGE_SIZE);

      const rows: InlineButton[][] = slice.map((it, i) => [
        { text: it.title, callbackData: `dis:${section}:${(safePage - 1) * AW_PAGE_SIZE + i}` }
      ]);
      const nav: InlineButton[] = [];
      if (safePage > 1) nav.push({ text: '▶ بعدی', callbackData: `dis:${section}:${safePage - 1}` });
      if (safePage < totalPages) nav.push({ text: '◀ قبلی', callbackData: `dis:${section}:${safePage + 1}` });
      nav.push({ text: '↩ بازگشت', callbackData: 'dis:root' });
      rows.push(nav);

      const title = section === 't' ? '🧩 راهنمای اختلال‌ها' : '📄 دفاتر آموزشی A4';
      return {
        text: `${title} — صفحهٔ ${faDigits(String(safePage))} از ${faDigits(String(totalPages))} (مجموع ${faDigits(String(items.length))}):\n\nروی هر عنوان بزنید تا توضیح و لینک بیاید.`,
        buttons: rows
      };
    },

    /** پیام یک آیتم: عنوان + توضیح یک‌خطی + لینک عمومی */
    async item(section: AwSection, idx: number): Promise<AwBotReply> {
      const items = sectionItems(section);
      const it = items[idx];
      if (!it) {
        return {
          text: '⏳ این مورد قدیمی است — دکمهٔ «آگاهی‌های اختلالات» را دوباره بزنید.',
          buttons: [[{ text: '📖 آگاهی‌ها', callbackData: 'dis:root' }]]
        };
      }
      const lines = [`📖 ${it.title}`, '', it.hint];
      if (hasLinks) lines.push('', `🔗 ${itemUrl(section, it)}`);
      else lines.push('', 'نسخهٔ چاپی این راهنما را از دفتر مرکز بخواهید.');
      return {
        text: lines.join('\n'),
        buttons: [[{ text: '↩ بازگشت', callbackData: `dis:${section}` }]]
      };
    }
  };
}

export type AwarenessBot = ReturnType<typeof createAwarenessBot>;
