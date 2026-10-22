import { DEFAULT_CLINIC_NAME, faDigits, jalaliFullLabel } from '@core/shared';
import type { NotificationTemplateId, TemplateVars } from '@core/shared';

const UNKNOWN_TEMPLATE_FALLBACK = 'اطلاع‌رسانی سامانه مرکز';

export interface ScheduleEntry {
  timeLabel: string;   // HH:MM تهران
  title: string;       // نام دانش‌آموز یا متخصص
  subtitle?: string;
  cancelled?: boolean;
}

function line(parts: (string | undefined)[], separator = ' '): string {
  return parts.filter((p): p is string => Boolean(p && p.length > 0)).join(separator);
}

export function renderTemplate(id: NotificationTemplateId, vars: TemplateVars = {}): string {
  const clinic = vars.clinicName?.trim() || DEFAULT_CLINIC_NAME;

  switch (id) {
    case 'appointment_reminder':
      return [
        '🔔 یادآوری نوبت',
        '',
        line([vars.studentName, 'عزیز،']),
        `نوبت شما در ${clinic} برای تاریخ ${vars.dateYmd ?? '—'} ساعت ${vars.timeLabel ?? '—'} ثبت شده است.`,
        vars.staffName ? `متخصص: ${vars.staffName}` : undefined,
        '',
        'در صورت عدم امکان حضور، لطفاً از طریق دفتر مرکز اطلاع دهید.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'appointment_created':
      return [
        '✅ نوبت جدید ثبت شد',
        '',
        line([vars.studentName, 'عزیز،']),
        `نوبت شما در ${clinic} برای ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')} ثبت شد.`,
        vars.staffName ? `متخصص: ${vars.staffName}` : undefined,
        '',
        'یادآوری نوبت، چند ساعت قبل از موعد برای شما ارسال می‌شود.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'appointment_cancelled':
      return [
        '❌ لغو نوبت',
        '',
        line([vars.studentName, 'عزیز،']),
        `نوبت شما در ${clinic} برای ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')} لغو شد.`,
        '',
        'برای هماهنگی نوبت جدید با دفتر مرکز تماس بگیرید.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'appointment_changed':
      return [
        '✏️ تغییر زمان نوبت',
        '',
        line([vars.studentName, 'عزیز،']),
        `نوبت شما در ${clinic} از ${vars.oldDateYmd ? jalaliFullLabel(vars.oldDateYmd) : '—'} ساعت ${faDigits(vars.oldTimeLabel ?? '—')}`,
        `به ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')} تغییر یافت.`,
        vars.staffName ? `متخصص: ${vars.staffName}` : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'staff_appointment_created':
      return [
        '📅 نوبت جدید برای شما ثبت شد',
        '',
        `زمان: ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')}`,
        vars.studentsLine ? `دانش‌آموزان: ${vars.studentsLine}` : undefined,
        vars.extra ? vars.extra : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'staff_appointment_changed':
      return [
        '✏️ زمان یکی از نوبت‌های شما تغییر کرد',
        '',
        `زمان قبلی: ${vars.oldDateYmd ? jalaliFullLabel(vars.oldDateYmd) : '—'} ساعت ${faDigits(vars.oldTimeLabel ?? '—')}`,
        `زمان جدید: ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')}`,
        vars.studentsLine ? `دانش‌آموزان: ${vars.studentsLine}` : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'staff_appointment_cancelled':
      return [
        '❌ یکی از نوبت‌های شما لغو شد',
        '',
        `زمان: ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')}`,
        vars.studentsLine ? `دانش‌آموزان: ${vars.studentsLine}` : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'bot_welcome':
      return [
        `سلام! به سامانه ${clinic} خوش آمدید. 👋`,
        '',
        'برای دیدن نوبت‌ها و دریافت یادآوری، گفتگوی خود را متصل کنید:',
        '🔑 کد ملی ۱۰ رقمی یا شماره همراه ۰۹… خود را همین‌جا بفرستید.',
        '',
        'راهنما: /help'
      ].join('\n');

    case 'bot_help':
      return [
        '📋 راهنمای بات:',
        '',
        '🔑 ورود: کد ملی ۱۰ رقمی یا شماره همراه ۰۹… را بفرستید',
        '🗓 «نوبت‌های من» — نوبت‌های پیش‌روی شما',
        '/today — برنامه امروز شما',
        '/week — برنامه این هفته شما',
        '✅ «پیگیری‌های من» — پیگیری‌های روی میز شما با دکمهٔ انجام (همکاران)',
        '📊 «حضور فرزند» — آمار حضور ۳۰ روز اخیر (والدین)',
        '🏥 «وضعیت مرکز» — خلاصهٔ امروز مرکز (مدیر/منشی)',
        '/link CODE — اتصال با کد دریافتی از منشی (روش قبلی)',
        '/myid — نمایش شناسه این گفتگو (برای ثبت دستی)',
        '/help — همین راهنما'
      ].join('\n');

    case 'bot_link_success':
      return [
        '✅ اتصال با موفقیت انجام شد.',
        '',
        line(['پرونده:', vars.studentName]),
        'از این پس یادآوری نوبت‌ها برای این گفتگو ارسال می‌شود.',
        vars.extra ? `\n${vars.extra}` : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'bot_link_invalid':
      return [
        '⚠️ کد اتصال معتبر نیست.',
        '',
        'کد را از منشی مرکز دریافت کنید و دوباره تلاش کنید:',
        '/link CODE'
      ].join('\n');

    case 'bot_link_already':
      return [
        'ℹ️ این کد قبلاً با همین گفتگو متصل شده است.',
        '',
        'همین حالا منوی پایین چت در دسترس شماست.',
        'برای قطع اتصال: دکمهٔ «قطع اتصال» یا دستور /exit'
      ].join('\n');

    case 'bot_myid':
      return [
        ' شناسه این گفتگو:',
        vars.chatId ?? '—',
        '',
        'این عدد را در صورت نیاز به منشی مرکز اعلام کنید.'
      ].join('\n');

    case 'announcement':
      return [
        `📢 ${vars.announcementTitle ?? 'اعلان'}`,
        '',
        vars.extra?.trim() || '',
        '',
        `— ${clinic}`
      ].filter((l) => l !== '').join('\n');

    case 'attendance_absent':
      return [
        '🔔 اطلاع‌رسانی غیبت',
        '',
        line([vars.studentName, 'در جلسه', vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—', `ساعت ${faDigits(vars.timeLabel ?? '—')}`]),
        `حضور نداشت.`,
        '',
        'در صورت تمایل برای هماهنگی جلسه جایگزین با مرکز تماس بگیرید.'
      ].filter((l) => l !== '').join('\n');

    case 'staff_attendance_nudge':
      return [
        '🔔 یادآور حضور و غیاب',
        '',
        vars.extra ?? '',
        '',
        'از پنل مدیریت، بخش «حضور و غیاب» تکمیل کنید.'
      ].filter((l) => l !== '').join('\n');

    case 'teacher_appointment_created':
      return [
        '🎓 اطلاع‌رسانی مراجعه دانش‌آموز',
        '',
        line([vars.studentName, 'از کلاس', vars.className, 'در تاریخ', vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—', `ساعت ${faDigits(vars.timeLabel ?? '—')}`]),
        line(['به', clinic, 'مراجعه دارد.']),
        vars.staffName ? `متخصص: ${vars.staffName}` : undefined,
        '',
        'برای مشاهده برنامه کامل کلاس خود /today و /week را بفرستید.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'teacher_appointment_changed':
      return [
        '✏️ تغییر زمان مراجعه دانش‌آموز',
        '',
        line([vars.studentName, 'از کلاس', vars.className]),
        `زمان قبلی: ${vars.oldDateYmd ? jalaliFullLabel(vars.oldDateYmd) : '—'} ساعت ${faDigits(vars.oldTimeLabel ?? '—')}`,
        `زمان جدید: ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')}`,
        vars.staffName ? `متخصص: ${vars.staffName}` : undefined
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'teacher_appointment_cancelled':
      return [
        '❌ لغو مراجعه دانش‌آموز',
        '',
        line([vars.studentName, 'از کلاس', vars.className, 'در تاریخ', vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—', `ساعت ${faDigits(vars.timeLabel ?? '—')}`]),
        'لغو شد.',
        '',
        'برای هماهنگی جلسه جایگزین با مرکز در تماس باشید.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'teacher_report':
      return [
        '📩 گزارش مرکز',
        '',
        line([vars.studentName ? `درباره ${vars.studentName}` : undefined, vars.className ? `(کلاس ${vars.className})` : undefined]),
        '',
        vars.extra?.trim() || '',
        '',
        `— ${clinic}`
      ].filter((l) => l !== '').join('\n');

    case 'bot_identify_staff':
      return [
        '✅ اتصال انجام شد.',
        '',
        line(['همکار مرکز:', vars.name]),
        vars.roleLine,
        '',
        '🗓 «نوبت‌های من» را بفرستید تا نوبت‌های پیش‌روی شما را با امکان لغو ببینید.',
        'برنامه کامل: /today و /week'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'bot_identify_students':
      return [
        '✅ اتصال انجام شد.',
        '',
        vars.extra ?? '',
        '',
        '🗓 «نوبت‌های من» را بفرستید تا آخرین زمان نوبت‌های تنظیم‌شده را ببینید.',
        'یادآوری نوبت‌ها هم برای همین گفتگو ارسال می‌شود.',
        'برنامه کامل: /today و /week'
      ].join('\n');

    case 'bot_identify_notfound':
      return [
        '⚠️ پرونده‌ای با این کد ملی/شماره پیدا نشد.',
        '',
        'کد ملی ۱۰ رقمی یا شماره همراه ۰۹… را بفرستید،',
        'یا کد اتصال را از منشی مرکز بگیرید:',
        '/link CODE'
      ].join('\n');

    case 'bot_identify_invalid':
      return [
        '⚠️ قالب شناسه درست نیست.',
        '',
        'کد ملی ۱۰ رقمی یا شماره همراه ۰۹… را بفرستید.',
        'مثال: ۰۰۱۲۳۴۵۶۷۹ یا ۰۹۱۲۱۲۳۴۵۶۷'
      ].join('\n');

    case 'bot_identify_ambiguous':
      return [
        '⚠️ این شناسه بین چند کارمند مشترک است.',
        '',
        'لطفاً کد ملی خود را بفرستید.'
      ].join('\n');

    case 'bot_cancel_ask':
      return [
        '⚠️ لغو این نوبت؟',
        '',
        line(['زمان:', vars.dateYmd, `ساعت ${faDigits(vars.timeLabel ?? '—')}`]),
        vars.studentNames ? line(['دانش‌آموزان:', vars.studentNames]) : undefined,
        '',
        'با لغو، به خانواده دانش‌آموز به‌صورت خودکار اطلاع داده می‌شود.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'bot_cancel_success':
      return [
        '✅ نوبت لغو شد.',
        '',
        line(['زمان:', vars.dateYmd, `ساعت ${faDigits(vars.timeLabel ?? '—')}`]),
        vars.studentNames ? line(['دانش‌آموزان:', vars.studentNames]) : undefined,
        '',
        'به خانواده اطلاع داده شد.'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'bot_cancel_conflict':
      return [
        '⚠️ این نوبت همین الان در پنل تغییر کرده است.',
        '',
        '«نوبت‌های من» را دوباره بفرستید و از نو تلاش کنید.'
      ].join('\n');

    case 'bot_cancel_rejected':
      return [
        '⚠️ این نوبت به شما تعلق ندارد یا دیگر موجود نیست.',
        '',
        '«نوبت‌های من» را بفرستید تا فهرست به‌روز را ببینید.'
      ].join('\n');

    case 'todo_assigned':
      return [
        '📋 کار جدید برای شما',
        '',
        `«${vars.taskTitle ?? '—'}»`,
        vars.extra ? vars.extra : undefined,
        '',
        'مشاهده و تکمیل: پنل مدیریت ← داشبورد ← «کارهای من»'
      ].filter((l): l is string => l !== undefined).join('\n');

    case 'generic':
      return vars.extra?.trim() || UNKNOWN_TEMPLATE_FALLBACK;

    case 'digest_staff':
      return [
        `🗓 برنامهٔ امروز شما — ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'}`,
        '',
        vars.extra?.trim() || '',
        '',
        `— ${clinic}`
      ].filter((l) => l !== '').join('\n');

    case 'digest_family':
      return [
        `🗓 نوبت‌های امروز شما — ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'}`,
        '',
        vars.extra?.trim() || '',
        '',
        `— ${clinic}`
      ].filter((l) => l !== '').join('\n');

    case 'digest_class':
      return [
        `🎓 مراجعه‌های امروز کلاس شما — ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'}`,
        '',
        vars.extra?.trim() || '',
        '',
        `— ${clinic}`
      ].filter((l) => l !== '').join('\n');

    case 'followup_nudge':
      return [
        '🔔 یادآور پیگیری',
        '',
        vars.extra?.trim() || '',
        '',
        'مرکز اقدام (پیگیری‌ها) را از پنل مدیریت دنبال کنید یا «پیگیری‌های من» را در همین بات بفرستید.'
      ].filter((l) => l !== '').join('\n');

    case 'reassessment_due':
      return [
        '⏰ یادآور بازسنجی مسیر مداخله',
        '',
        `مسیر فعال پروندهٔ «${vars.studentName ?? '—'}» به پنجرهٔ بازسنجی ۴–۶ هفته‌ای رسیده است.`,
        `تاریخ بازسنجی: ${vars.dueYmd ?? '—'}`,
        '',
        'در تب «تفسیر بالینی» پروفایل، وضعیت مسیر را بازنگری کنید: تمدید، تغییر هدف یا بستن مسیر.'
      ].filter((l) => l !== '').join('\n');

    case 'bot_followup_done':
      return [
        '✅ پیگیری انجام شد.',
        '',
        `«${vars.taskTitle ?? '—'}»`
      ].join('\n');

    case 'bot_followup_rejected':
      return [
        '⚠️ این پیگیری به شما تعلق ندارد یا بسته شده است.',
        '',
        '«پیگیری‌های من» را بفرستید تا فهرست به‌روز را ببینید.'
      ].join('\n');

    case 'bot_followups_denied':
      return [
        '⚠️ این بخش برای همکاران مرکز است.',
        '',
        'اگر همکار مرکز هستید، کد ملی یا شمارهٔ خود را بفرستید تا گفتگوی شما متصل شود.'
      ].join('\n');

    case 'bot_attendance_denied':
      return [
        '⚠️ این دستور برای والدین است.',
        '',
        'کد ملی فرزند یا شمارهٔ همراه ثبت‌شده را بفرستید تا گفتگو متصل شود.'
      ].join('\n');

    case 'bot_status_denied':
      return [
        '⚠️ «وضعیت مرکز» فقط برای مدیر و منشی است.',
        '',
        'اگر مدیر یا منشی هستید، اتصال گفتگوی شما باید با نقش مدیر/منشی انجام شود.'
      ].join('\n');

    case 'bot_goal_denied':
      return [
        '⚠️ «هدف سنجش» فقط برای مدیر و منشی است.',
        '',
        'برای دیدن تحقق اهداف غربال، با مدیر یا منشی مرکز هماهنگ شوید.'
      ].join('\n');

    case 'bot_help_guest':
      return [
        '📋 راهنمای بات:',
        '',
        '🏥 «معرفی مرکز» — مرکز و مدل همکاری سه‌ضلعی',
        '🌟 «خدمات مرکز» — چهار خدمت اصلی',
        '☎ «راه‌های ارتباطی» — تلفن دفتر و ساعات پاسخگویی',
        '🔑 «احراز هویت» — مسیرهای اتصال گفتگو',
        '🔑 یا: کد ملی ۱۰ رقمی / شمارهٔ همراه ۰۹… را بفرستید',
        '/link CODE — اتصال با کد دریافتی از منشی',
        '📖 «آگاهی‌های اختلالات» — راهنمای اختلال‌ها (دستور /awareness)',
        '/myid — نمایش شناسه این گفتگو',
        '/help — همین راهنما',
        '',
        'پس از اتصال، دستورهای نقش شما فعال می‌شود.'
      ].join('\n');

    case 'bot_help_office':
      return [
        '📋 راهنمای بات — مدیر/منشی:',
        '',
        '🗓 «نوبت‌های من» — نوبت‌های پیش‌روی شما',
        '/today — برنامه امروز شما',
        '/week — برنامه این هفته شما',
        '🔎 /search نام — جستجوی دانش‌آموز',
        '🏥 «وضعیت مرکز» — خلاصهٔ امروز مرکز',
        '📋 «برنامه مرکز» — برنامهٔ امروز همهٔ همکاران',
        '⏳ «لیست انتظار» — متقاضیان باز',
        '📊 «هدف سنجش» — تحقق اهداف غربال (ماه/بازه/سال)',
        '✅ «پیگیری‌های من» — پیگیری‌های روی میز شما',
        '👥 «دانش‌آموزان فعال» — منوی اقدام هر دانش‌آموز (تکلیف/پیام خانواده/رویداد و گزارش)',
        '📚 «بانک تمرین» — مرور کاربرگ‌ها و ارسال تکلیف به خانواده',
        '📤 «اعلان‌های در صف» — پیش‌نویس‌ها و ناموفق‌ها + ارسال فوری',
        '/about — دربارهٔ مرکز',
        '/myid — شناسه این گفتگو',
        '/help — همین راهنما',
        'مدیر: 📊 «گزارش KPI» — شاخص‌های تجمیعی'
      ].join('\n');

    case 'bot_help_therapist':
      return [
        '📋 راهنمای بات — همکار (متخصص):',
        '',
        '🗓 «نوبت‌های من» — نوبت‌های پیش‌روی شما',
        '/today — برنامه امروز شما',
        '/week — برنامه این هفته شما',
        '✅ «پیگیری‌های من» — پیگیری‌های روی میز شما',
        '👥 «دانش‌آموزان فعال» — انتخاب دانش‌آموز:',
        '   📤 ارسال تکلیف · ✉️ پیام به خانواده · 📚 تمرین‌های او · 🗓 نوبت‌های او',
        '   📋 رویداد/گزارش (شرح حال، مداخله، وکسلر، چک‌لیست خانواده) · 🕘 تاریخچه · 📝 چک‌لیست‌های او',
        '📚 «بانک تمرین» — مرور کاربرگ‌ها و ارسال تکلیف (مسیر تمرین‌محور)',
        '📤 «اعلان‌های در صف» — وضعیت صف اعلان‌های مرکز',
        '/about — دربارهٔ مرکز',
        '/myid — شناسه این گفتگو',
        '/help — همین راهنما'
      ].join('\n');

    case 'bot_help_class':
      return [
        '📋 راهنمای بات — معلم مدرسه:',
        '',
        '🗓 «نوبت‌های کلاس من» — مراجعه‌های دانش‌آموزان کلاس شما در مرکز',
        '/today و /week — برنامهٔ امروز/هفتهٔ کلاس',
        '🎓 «دانش‌آموزان من» — فهرست کلاس با وضعیت پرونده',
        '➕ «ثبت متقاضی» — افزودن مورد نیازی جدید به لیست انتظار مرکز',
        '📌 «فعالیت کلاس» — تکلیف‌های باز و تازهٔ دانش‌آموزان کلاس',
        '📚 «بانک تمرین» — ارسال کاربرگ و تکلیف بر حسب اختلال به خانوادهٔ دانش‌آموزان کلاس',
        '📖 «آگاهی‌های اختلالات» — ۹ راهنمای تخصصی + ۱۸ دفتر آموزشی A4 با لینک مستقیم (دستور /awareness)',
        '/about — دربارهٔ مرکز',
        '/myid — شناسه این گفتگو',
        '/help — همین راهنما'
      ].join('\n');

    case 'bot_help_parent':
      return [
        '📋 راهنمای بات — والدین:',
        '',
        '🗓 «نوبت‌های دانش‌آموز من» — نوبت‌های پیش‌روی فرزندان',
        '/today · /week — برنامهٔ امروز/هفته',
        '📚 «تمرین‌های انجام‌نشده» — تکلیف‌های باز فرزندان',
        '📝 «چک‌لیست‌های من» — چک‌لیست‌های در انتظار پاسخ شما + نتایج قبلی',
        '📊 «حضور فرزند» — آمار ۳۰ روز اخیر',
        '📤 ارسال نتیجهٔ تکلیف — عکس یا فایل نتیجه را همین‌جا بفرستید',
        '/about — دربارهٔ مرکز',
        '/myid — شناسه این گفتگو',
        '/help — همین راهنما',
        '',
        'برای تغییر یا لغو نوبت با دفتر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_about':
      return [
        `🏥 ${clinic}`,
        'دربارهٔ مرکز',
        '',
        'این مرکز با هدف پشتیبانی از رشد و سلامت کودکان و نوجوانان، چهار خدمت اصلی را کنار هم ارائه می‌کند:',
        '• سنجش و غربالگری — ارزیابی‌های رشدی، گفتار، حرکتی و یادگیری برای شناخت به‌موقع نیاز هر دانش‌آموز',
        '• آموزش — توانمندسازی خانواده، معلمان مدارس و همکاران مرکز با کارگاه‌ها و دفاتر آموزشی',
        '• توان‌بخشی — جلسات درمانگران (گفتاردرمانی، کاردرمانی، روان‌شناسی و…) بر پایهٔ پروندهٔ الکترونیک و برنامهٔ فردی',
        '• مداخلهٔ بهنگام رشدی — پیگیری و مداخلهٔ زودهنگام، پیش از آنکه مشکل رشد کند',
        '',
        'همکاری مدرسه + خانواده + مرکز، ستون کار ماست: معلم کلاس مشاهده می‌کند، خانواده در خانه تمرین می‌کند و مرکز برنامهٔ تخصصی را هدایت می‌کند.',
        '',
        '📅 نوبت و پیگیری: با دفتر مرکز تماس بگیرید یا کد ملی/تلفن خود را همین‌جا بفرستید تا گفتگو متصل شود.',
        '/help — دیدن امکانات این بات بر اساس نقش شما'
      ].join('\n');

    case 'bot_wl_denied_staff':
      return [
        'ℹ️ «ثبت متقاضی» از بات مخصوص معلمان مدارس است.',
        '',
        'همکاران مرکز متقاضی را از پنل ← «لیست انتظار» یا دستور «لیست انتظار» همین‌جا می‌بینند و از سایت ثبت می‌کنند.'
      ].join('\n');

    case 'bot_wl_family_call':
      return [
        '📞 ثبت‌نام و نوبت‌دهی فقط از طریق تماس با دفتر مرکز انجام می‌شود.',
        '',
        `لطفاً با ${clinic} تماس بگیرید. همکاران دفتر اطلاعات شما را ثبت می‌کنند.`
      ].join('\n');

    case 'bot_wl_guest_link':
      return [
        '🔒 «ثبت متقاضی» فقط برای معلمان متصل به کلاس فعال است.',
        '',
        'اگر معلم هستید، کد اتصال را از مرکز بگیرید و بفرستید: /link CODE',
        '',
        'خانواده‌های محترم: ثبت‌نام و نوبت‌دهی فقط با تماس تلفنی با دفتر مرکز انجام می‌شود.'
      ].join('\n');

    case 'bot_wl_cancelled':
      return ['✖️ ثبت متقاضی لغو شد.', '', 'هر وقت خواستید با «ثبت متقاضی» یا /add دوباره شروع کنید.'].join('\n');

    case 'bot_wl_done':
      return [
        '✅ متقاضی با موفقیت در لیست انتظار مرکز ثبت شد.',
        '',
        'کارشناسان مرکز پس از بررسی تماس می‌گیرند.',
        'برای ثبت متقاضی بعدی: «ثبت متقاضی» یا /add'
      ].join('\n');

    case 'bot_wl_link_lost':
      return [
        '⚠️ اتصال این گفتگو به کلاس برقرار نیست (کد لغو شده یا تغییر کرده).',
        '',
        'ثبت انجام نشد — لطفاً کد اتصال جدید از مرکز بگیرید: /link CODE'
      ].join('\n');

    case 'bot_search_denied':
      return [
        '⚠️ «جستجو» فقط برای همکاران مرکز است.',
        '',
        'اگر همکار مرکز هستید، کد ملی یا شمارهٔ خود را بفرستید تا گفتگوی شما متصل شود.'
      ].join('\n');

    case 'bot_center_denied':
      return [
        '⚠️ «برنامه مرکز» فقط برای مدیر و منشی است.',
        '',
        'همکاران برنامهٔ خودشان را با «نوبت‌های من» یا /today می‌بینند.'
      ].join('\n');

    case 'bot_waitlist_denied':
      return [
        '⚠️ «لیست انتظار» فقط برای همکاران مرکز است.',
        '',
        'خانواده‌های محترم: برای ثبت‌نام و نوبت با دفتر مرکز تماس بگیرید.'
      ].join('\n');

    case 'waitlist_slot_freed':
      return [
        '🪑 یک نوبت خالی شد:',
        '',
        `👤 ${vars.staffName ?? '—'} — ${vars.dateYmd ? jalaliFullLabel(vars.dateYmd) : '—'} ساعت ${faDigits(vars.timeLabel ?? '—')}`,
        vars.extra?.trim() || '',
        '',
        'لیست انتظار را از پنل دنب کنید یا «لیست انتظار» را در همین بات بفرستید.'
      ].filter((l) => l !== '').join('\n');

    case 'homework_assigned':
      return [
        `📚 تکلیف جدید — ${vars.studentName ?? 'دانش‌آموز'} عزیز،`,
        '',
        vars.extra?.trim() || '',
        '',
        'پس از انجام تمرین، نتیجه را برای دفتر مرکز بفرستید یا در جلسهٔ بعد همراه بیاورید.',
        `${clinic} — پیام خودکار دفتر`
      ].filter((l) => l !== '').join('\n');

    case 'bot_exercise_denied':
      return [
        '⚠️ «بانک تمرین» فقط برای همکاران مرکز و معلمان متصل است.',
        '',
        'همکاران: کد ملی یا شمارهٔ خودتان را بفرستید تا گفتگو متصل شود.',
        'معلمان: کد اتصال کلاس را از دفتر مرکز بگیرید و با /link CODE متصل شوید.'
      ].join('\n');

    case 'bot_exercise_disabled':
      return [
        '⚙️ بانک تمرین موقتاً غیرفعال است.',
        '',
        'برای اطلاعات بیشتر با مدیر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_exercise_empty':
      return [
        '📚 هنوز تمرینی در بانک ثبت نشده است.',
        '',
        'تمرین‌ها از پنل مدیریت (بانک تمرین) با آپلود فایل ساخته می‌شوند.'
      ].join('\n');

    case 'bot_exercise_sent':
      return [
        `✅ تکلیف برای «${vars.studentName ?? 'دانش‌آموز'}» ثبت شد.`,
        '',
        vars.extra?.trim() || ''
      ].filter((l) => l !== '').join('\n');

    case 'bot_family_message_sent':
      return [
        `✅ پیام شما برای خانوادهٔ «${vars.studentName ?? 'دانش‌آموز'}» ارسال شد.`,
        '',
        vars.extra?.trim() || ''
      ].filter((l) => l !== '').join('\n');

    case 'bot_case_events_disabled':
      return [
        '⚙️ سرویس رویدادها و گزارش‌های پرونده موقتاً در دسترس نیست.',
        '',
        'از پنل مدیریت استفاده کنید یا با مدیر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_checklist_link':
      return [
        '📝 چک‌لیست سنجش',
        '',
        vars.studentName ? `دربارهٔ: ${vars.studentName}` : undefined,
        vars.extra?.trim() || undefined,
        '',
        'پس از ثبت پاسخ، نتیجه به‌طور خودکار برای درمانگر مرکز می‌آید.'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'bot_teacher_package_link':
      return [
        '📝 فرم مشاهدهٔ کلاس — فرم معلم',
        '',
        vars.teacherName ? `${vars.teacherName} سلام 👋` : 'سلام 👋',
        vars.studentName ? `دربارهٔ دانش‌آموز: ${vars.studentName}` : undefined,
        vars.extra?.trim() || undefined,
        '',
        'پاسخ‌ها با نام شما روی پروندهٔ دانش‌آموز ثبت می‌شود و مستقیم برای درمانگر مرکز می‌آید.',
        'پیشاپیش از وقتی که می‌گذارید ممنونیم 🙏'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'homework_returned':
      return [
        '📤 نتیجهٔ تکلیف بازگشت',
        '',
        `👤 دانش‌آموز: ${vars.studentName ?? '—'}`,
        `📚 تمرین: ${vars.exerciseTitle ?? '—'}`,
        vars.extra?.trim() || '',
        '',
        'فایل نتیجه در پروندهٔ دانش‌آموز (تایم‌لاین) ثبت شد.'
      ].filter((l) => l !== '').join('\n');

    case 'doc_request_sent':
      return [
        '📝 درخواست مدارک',
        '',
        vars.studentName ? `${vars.studentName} عزیز، سلام 👋` : 'سلام 👋',
        vars.extra?.trim() || '',
        '',
        'کافی است عکس یا فایل را همین‌جا در همین گفتگو بفرستید؛',
        `مستقیم به پروندهٔ ${vars.studentName ?? 'دانش‌آموز'} در ${clinic} ضمیمه می‌شود.`
      ].filter((l) => l !== undefined && l !== '').join('\n');

    case 'bot_doc_received':
      return [
        `✅ ${vars.title ?? 'فایل'} شما دریافت شد و به پروندهٔ ${vars.studentName ?? 'دانش‌آموز'} ضمیمه شد.`,
        '',
        'ممنون از همراهی شما 🙏'
      ].join('\n');

    case 'bot_doc_bad_type':
      return [
        '⚠️ این نوع فایل مجاز نیست — فقط عکس، PDF، Word، Excel و متن.',
        '',
        'لطفاً مدرک را به‌صورت عکس یا PDF بفرستید.'
      ].join('\n');

    case 'bot_doc_too_large':
      return [
        '⚠️ حجم فایل بیش از ۵۱۲ کیلوبایت است.',
        '',
        'لطفاً عکس را با کیفیت کمتر بفرستید یا فقط صفحه‌های اصلی را عکس بگیرید.'
      ].join('\n');

    case 'bot_doc_failed':
      return [
        '⚠️ دریافت فایل ناموفق بود — لطفاً دوباره بفرستید.',
        '',
        'اگر چند بار تکرار شد، با دفتر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_submission_received':
      return [
        `✅ نتیجهٔ تمرین «${vars.exerciseTitle ?? '—'}» دریافت شد.`,
        '',
        'به دفتر مرکز اطلاع داده شد — ممنون از پیگیری شما 🙏'
      ].join('\n');

    case 'bot_submission_no_pending':
      return [
        '📭 فعلاً تکلیف بازی برای شما ثبت نشده است.',
        '',
        'وقتی همکار مرکز یا معلم، تکلیفی از «بانک تمرین» برای فرزند شما بفرستد،',
        'می‌توانید عکس یا فایل نتیجه را همین‌جا بفرستید.'
      ].join('\n');

    case 'bot_submission_unavailable':
      return [
        '⚙️ دریافت فایل در بات فعلاً فعال نیست.',
        '',
        'لطفاً نتیجهٔ تمرین را در جلسهٔ بعد همراه بیاورید یا با دفتر مرکز هماهنگ کنید.'
      ].join('\n');

    case 'bot_submission_failed':
      return [
        '⚠️ دریافت فایل ناموفق بود — لطفاً دوباره بفرستید.',
        '',
        'اگر چند بار تکرار شد، با دفتر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_submission_too_large':
      return [
        '⚠️ حجم فایل بیش از ۵۱۲ کیلوبایت است.',
        '',
        'لطفاً عکس را با کیفیت کمتر بفرستید یا فقط صفحهٔ پاسخ‌ها را عکس بگیرید.'
      ].join('\n');

    case 'bot_submission_bad_type':
      return [
        '⚠️ این نوع فایل مجاز نیست — فقط عکس، PDF، Word، Excel و متن.',
        '',
        'لطفاً نتیجهٔ تمرین را به‌صورت عکس یا PDF بفرستید.'
      ].join('\n');

    case 'bot_submission_denied':
      return [
        '⚠️ گفتگوی شما به پروندهٔ دانش‌آموزی متصل نیست.',
        '',
        'کد اتصال خانواده را از دفتر مرکز بگیرید و همین‌جا بفرستید تا چت شما متصل شود.'
      ].join('\n');

    case 'bot_contact': {
      const phone = (vars.phone ?? '').trim();
      const head = phone
        ? `☎ شمارهٔ تماس ${clinic}:\n📞 ${phone}`
        : `☎ شمارهٔ تماس ${clinic} هنوز در سامانه ثبت نشده است.`;
      return [
        head,
        '',
        '🕒 پاسخگویی: شنبه تا چهارشنبه ۹ تا ۱۷، پنجشنبه ۹ تا ۱۳',
        'ثبت‌نام و نوبت‌دهی فقط با تماس تلفنی انجام می‌شود.'
      ].join('\n');
    }

    case 'bot_public_files': {
      const links = (vars.links ?? '').trim();
      const body = links
        ? ['🔗 لینک‌های آموزشی:', '', links].join('\n')
        : ['فایل‌های آموزشی روی سایت مرکز بخش «دانلود» قرار دارند.', 'برای دریافت لینک‌ها با دفتر تماس بگیرید.'].join('\n');
      return [`📁 فایل‌های آموزشی ${clinic}`, '', body].join('\n');
    }

    case 'bot_my_students':
      return [
        `🎓 دانش‌آموزان کلاس ${vars.className ?? ''} — ${vars.count ?? '۰'} نفر`,
        '',
        vars.list ?? '—',
        '',
        `برای تکلیف: «بانک تمرین» — برای متقاضی جدید: «ثبت متقاضی»\n(${clinic})`
      ].join('\n');

    case 'bot_my_students_denied':
      return [
        '⚠️ این دکمه فقط برای معلمانِ متصل به کلاس فعال است.',
        '',
        'اگر معلم هستید، کد اتصال کلاس را از دفتر مرکز بگیرید و /link CODE بفرستید.'
      ].join('\n');

    case 'bot_outbox':
      return [
        '📤 صف اعلان‌های مرکز:',
        '',
        `✉ پیش‌نویس (تا ساعت ارسال): ${vars.draftCount ?? '۰'}${vars.nextSend ? `\n⏰ ارسال بعدی: ${vars.nextSend}` : ''}`,
        `✅ آمادهٔ ارسال (فوری): ${vars.readyCount ?? '۰'}`,
        `⚠ ناموفق: ${vars.failedCount ?? '۰'}`,
        '',
        `(${clinic})`
      ].join('\n');

    case 'bot_outbox_denied':
      return ['⚠️ مشاهدهٔ صف اعلان‌ها فقط برای همکاران مرکز است.'].join('\n');

    case 'bot_outbox_flushed':
      return [
        '✅ صف رهاسازی شد.',
        '',
        `پیش‌نویس آزادشده: ${vars.released ?? '۰'} — ارسال‌شده: ${vars.sent ?? '۰'}\n(${clinic})`
      ].join('\n');

    case 'bot_family_link_denied':
      return [
        '🔒 این پرونده از قبل به یک گفتگوی دیگر متصل است.',
        '',
        'برای اتصال با شمارهٔ جدید، با دفتر مرکز تماس بگیرید؛ همکاران ما پس از تأیید، کد اتصال تازه برایتان می‌سازند.',
        `(${clinic})`
      ].join('\n');

    case 'bot_kpi':
      return [`${vars.title ?? 'گزارش KPI'} (${clinic})`, '', vars.lines ?? '—'].join('\n');

    case 'bot_kpi_denied':
      return ['⚠️ گزارش KPI فقط برای ناظر اداره و مدیر مرکز فعال است.'].join('\n');

    case 'bot_help_supervisor':
      return [
        '📋 راهنمای بات — ناظر اداره:',
        '',
        '📊 «گزارش KPI» — شاخص‌های تجمیعی ۷ روز اخیر',
        '   (نوبت‌ها، نرخ حضور، لیست انتظار، دانش‌آموزان)',
        '📊 گزارش هفتگی هر شنبه صبح خودکار ارسال می‌شود.',
        '/about — دربارهٔ مرکز',
        '/myid — شناسه این گفتگو',
        '/help — همین راهنما',
        '',
        'دسترسی شما فقط به گزارش‌های تجمیعی است (بدون اطلاعات شخصی).'
      ].join('\n');

    case 'bot_services':
      return [
        `🌟 خدمات ${clinic}`,
        '',
        '۱) سنجش و غربالگری — ارزیابی‌های رشدی، گفتار، حرکتی و یادگیری برای شناخت به‌موقع نیاز هر دانش‌آموز',
        '۲) آموزش — توانمندسازی خانواده، معلمان مدارس و همکاران با کارگاه‌ها و دفاتر آموزشی',
        '۳) توان‌بخشی — جلسات درمانگران (گفتاردرمانی، کاردرمانی، روان‌شناسی و…) بر پایهٔ پروندهٔ الکترونیک و برنامهٔ فردی',
        '۴) مداخلهٔ بهنگام رشدی — پیگیری و مداخلهٔ زودهنگام، پیش از آنکه مشکل رشد کند',
        '',
        '📞 ثبت‌نام و نوبت‌دهی: با دفتر مرکز تماس بگیرید (دکمهٔ «راه‌های ارتباطی»).'
      ].join('\n');

    case 'bot_auth_guide':
      return [
        '🔑 احراز هویت و اتصال گفتگو',
        '',
        'مسیر ۱ (پیشنهادی): کد ملی ۱۰ رقمی یا شمارهٔ همراه ۰۹… را همین‌جا بفرستید.',
        '   • والدین: کد ملی فرزند یا شمارهٔ ثبت‌شدهٔ ولیّ',
        '   • همکاران مرکز: کد ملی یا شمارهٔ خودتان',
        '',
        'مسیر ۲: کد اتصال ۶ حرفی از دفتر مرکز بگیرید و بفرستید:',
        '/link CODE',
        '',
        'پس از اتصال، منوی مخصوص نقش شما نصب می‌شود:',
        '• خانواده: نوبت‌ها، حضور، تکلیف‌ها',
        '• معلم مدرسه: برنامهٔ کلاس، بانک تمرین، ثبت متقاضی',
        '• همکاران: نوبت‌ها، دانش‌آموزان فعال، پیگیری‌ها',
        '',
        '🔒 هر پروندهٔ خانواده فقط به یک گفتگو متصل می‌شود؛ برای انتقال به شمارهٔ جدید با دفتر مرکز تماس بگیرید.'
      ].join('\n');

    case 'bot_pending_homework':
      return [
        `📚 تکلیف‌های باز شما (${clinic})`,
        '',
        vars.list ?? '—',
        '',
        'بعد از انجام تمرین، عکس یا فایل نتیجه را همین‌جا بفرستید تا در پرونده ثبت شود.'
      ].join('\n');

    case 'bot_class_activity':
      return [
        `📌 فعالیت کلاس — ${vars.className ?? ''} (${clinic})`,
        '',
        vars.list ?? '—',
        '',
        'برای ارسال تکلیف جدید: «بانک تمرین» یا «دانش‌آموزان من» را بزنید.'
      ].join('\n');

    case 'bot_family_message':
      return [
        `✉️ پیام از ${clinic}`,
        '',
        vars.studentName ? `دربارهٔ: ${vars.studentName}` : undefined,
        '',
        vars.extra?.trim() || '',
        '',
        vars.senderName ? `— ${vars.senderName}` : undefined
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'bot_checklist_assigned':
      return [
        '📝 چک‌لیست خانگی جدید',
        '',
        vars.studentName ? `دربارهٔ: ${vars.studentName}` : undefined,
        `عنوان: ${vars.formTitle ?? 'چک‌لیست'}`,
        '',
        'درمانگر مرکز این چک‌لیست را برای مشاهدهٔ وضعیت فرزند شما در خانه ثبت کرده است.',
        vars.extra?.trim() || undefined,
        '',
        'برای پر کردن، دکمهٔ «چک‌لیست‌های من» در پایین گفتگو را بزنید و به آیتم‌ها پاسخ دهید.'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'bot_checklist_result':
      return [
        '✅ نتیجهٔ چک‌لیست ثبت شد',
        '',
        `چک‌لیست: ${vars.formTitle ?? '—'}`,
        vars.studentName ? `دانش‌آموز: ${vars.studentName}` : undefined,
        `امتیاز: ${vars.score ?? '—'}${vars.band ? ` — ${vars.band}` : ''}`,
        '',
        'نتیجهٔ تحلیل‌شده در تایم‌لاین پروندهٔ دانش‌آموز نشست.'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'homework_graded':
      return [
        '✅ تکلیف شما تصحیح شد',
        '',
        vars.exerciseTitle ? `تمرین: ${vars.exerciseTitle}` : undefined,
        '',
        vars.feedback?.trim() || 'بازخورد درمانگر ثبت شد.',
        '',
        'برای تمرین‌های بعدی با همان دقت ادامه دهید.'
      ].filter((l): l is string => l !== undefined && l !== '').join('\n');

    case 'bot_case_event_denied':
      return [
        '⚠️ این بخش فقط برای همکاران مرکز فعال است.',
        '',
        `برای اطلاع‌رسانی به ${clinic} تماس بگیرید.`
      ].join('\n');

    default: {
      const never: never = id;
      return String(never);
    }
  }
}

export function renderScheduleMessage(opts: {
  title: string;            // مثلاً «برنامه امروز شما — شنبه ۱۴ مهر ۱۴۰۴»
  entries: ScheduleEntry[];
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = [opts.title, `(${clinic})`, ''].join(' ');

  if (opts.entries.length === 0) {
    return `${head.trim()}\n\n🕐 موردی برای این بازه ثبت نشده است.`;
  }

  const body = opts.entries.map((e) => {
    const time = faDigits(e.timeLabel);
    const status = e.cancelled ? ' (لغوشده)' : '';
    const sub = e.subtitle ? ` — ${e.subtitle}` : '';
    return `${time}  ${e.title}${status}${sub}`;
  });

  return [head.trim(), '', ...body].join('\n');
}

export function renderDigestBody(entries: ScheduleEntry[]): string {
  if (entries.length === 0) return '🕐 موردی برای امروز ثبت نشده است.';
  return entries
    .map((e) => {
      const time = faDigits(e.timeLabel);
      const status = e.cancelled ? ' (لغوشده)' : '';
      const sub = e.subtitle ? ` — ${e.subtitle}` : '';
      return `${time}  ${e.title}${status}${sub}`;
    })
    .join('\n');
}

export interface FollowupListItem {
  id: string;
  title: string;
  dueLabel: string | null;
}

export interface FollowupListGroups {
  overdue: FollowupListItem[];
  today: FollowupListItem[];
  week: FollowupListItem[];
  future: FollowupListItem[];
  open: FollowupListItem[];
}

export function renderFollowupsMessage(opts: {
  title: string;
  groups: FollowupListGroups;
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;
  const { overdue, today, week, future, open } = opts.groups;
  const total = overdue.length + today.length + week.length + future.length + open.length;

  if (total === 0) {
    return `${head}\n\n✅ پیگیری بازی روی میز شما نیست.`;
  }

  const sections: string[] = [head, ''];
  const emit = (mark: string, label: string, items: FollowupListItem[]): void => {
    if (items.length === 0) return;
    sections.push(`${mark} ${label} (${faDigits(String(items.length))}):`);
    for (const it of items) {
      sections.push(`• ${it.title}${it.dueLabel ? ` — مهلت: ${it.dueLabel}` : ''}`);
    }
    sections.push('');
  };

  emit('⚠️', 'عقب‌افتاده', overdue);
  emit('🕐', 'امروز', today);
  emit('🗓', 'این هفته', week);
  if (future.length > 0) {
    sections.push(`▫️ ${faDigits(String(future.length))} پیگیری برای بعد از این هفته.`);
    sections.push('');
  }
  emit('📌', 'بدون مهلت', open);

  if (sections[sections.length - 1] === '') sections.pop();
  return sections.join('\n');
}

export interface AttendanceChildSummary {
  name: string;
  present: number;
  absent: number;
  pending: number;
  cancelled: number;
}

export function renderAttendanceSummary(opts: {
  title: string;
  children: AttendanceChildSummary[];
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;

  if (opts.children.length === 0) {
    return `${head}\n\nپرونده‌ای به این گفتگو متصل نیست.`;
  }

  const lines = opts.children.map((c) => {
    const parts = [`حاضر ${faDigits(String(c.present))}`, `غایب ${faDigits(String(c.absent))}`];
    if (c.pending > 0) parts.push(`بدون ثبت ${faDigits(String(c.pending))}`);
    if (c.cancelled > 0) parts.push(`لغو ${faDigits(String(c.cancelled))}`);
    return `• ${c.name}: ${parts.join(' · ')}`;
  });
  return [head, '', ...lines].join('\n');
}

export function renderCenterStatus(opts: {
  title: string;
  sessionsToday: number;
  presentToday: number;
  absentToday: number;
  waitlistOpen: number;
  followupsOverdue: number;
  followupsToday: number;
  pendingChecklists?: number;
  sessionsWithoutReport?: number;
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;
  const lines = [
    `🗓 جلسات امروز: ${faDigits(String(opts.sessionsToday))}`,
    `✅ حاضر: ${faDigits(String(opts.presentToday))} · ❌ غایب: ${faDigits(String(opts.absentToday))}`,
    `📝 جلسات امروز بدون گزارش: ${faDigits(String(opts.sessionsWithoutReport ?? 0))}`,
    `⏳ چک‌لیست‌های در انتظار خانواده: ${faDigits(String(opts.pendingChecklists ?? 0))}`,
    `⏳ لیست انتظار باز: ${faDigits(String(opts.waitlistOpen))}`,
    `🔔 پیگیری‌ها: ${faDigits(String(opts.followupsOverdue))} عقب‌افتاده · ${faDigits(String(opts.followupsToday))} امروز`
  ];
  return [head, '', ...lines].join('\n');
}

export interface BotSearchItem {
  name: string;
  grade: string | null;
}

export function renderSearchResults(opts: {
  title: string;
  items: BotSearchItem[];
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;

  if (opts.items.length === 0) {
    return `${head}\n\nموردی با این نام یافت نشد.`;
  }

  const lines = opts.items.map((it) => `• ${it.name}${it.grade ? ` — ${it.grade}` : ''}`);
  return [head, '', ...lines].join('\n');
}

export interface CenterScheduleRow {
  timeLabel: string;
  staffName: string;
  studentNames: string[];
  cancelled: boolean;
}

export const CENTER_SCHEDULE_MAX_ROWS = 12;

export function renderCenterSchedule(opts: {
  title: string;
  rows: CenterScheduleRow[];
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;

  if (opts.rows.length === 0) {
    return `${head}\n\n🕐 موردی برای امروز ثبت نشده است.`;
  }

  const sorted = [...opts.rows].sort((a, b) => a.timeLabel.localeCompare(b.timeLabel));
  const shown = sorted.slice(0, CENTER_SCHEDULE_MAX_ROWS);
  const body = shown.map((r) => {
    const status = r.cancelled ? ' (لغوشده)' : '';
    const students = r.studentNames.length > 0 ? r.studentNames.join('، ') : 'بدون دانش‌آموز';
    return `${faDigits(r.timeLabel)}  ${r.staffName} — ${students}${status}`;
  });

  const rest = sorted.length - shown.length;
  const tail =
    rest > 0
      ? ['', `… و ${faDigits(String(rest))} مورد دیگر — نمایش کامل: پنل ← «روز کاری»`].join('\n')
      : '';
  return [head, '', ...body].join('\n') + tail;
}

export interface WaitlistListItem {
  name: string;
  service: string | null;
  urgent: boolean;
  daysWaiting: number;
}

export const WAITLIST_LIST_MAX_ROWS = 8;

export function renderWaitlistList(opts: {
  title: string;
  items: WaitlistListItem[];
  totalOpen: number;
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;

  if (opts.totalOpen === 0) {
    return `${head}\n\n✅ متقاضیِ بازی در لیست انتظار نیست.`;
  }

  const shown = opts.items.slice(0, WAITLIST_LIST_MAX_ROWS);
  const body = shown.map((it) => {
    const prio = it.urgent ? '🔴 فوری' : 'عادی';
    const service = it.service ? ` — ${it.service}` : '';
    const days = it.daysWaiting === 0 ? 'امروز' : `${faDigits(String(it.daysWaiting))} روز`;
    return `• ${it.name} (${prio}${service}) — ${days} در انتظار`;
  });

  const rest = opts.totalOpen - shown.length;
  const tail =
    rest > 0
      ? ['', `… و ${faDigits(String(rest))} متقاضی دیگر — اقدام: پنل ← «لیست انتظار»`].join('\n')
      : '';
  return [head, '', ...body].join('\n') + tail;
}

export interface BotScreeningGoalItem {
  periodLabel: string;
  target: number;
  done: number;
  percent: number;
  remaining: number;
  status: 'active' | 'upcoming' | 'past';
}

export const SCREENING_GOAL_MAX_ROWS = 10;

export function renderScreeningGoal(opts: {
  title: string;
  todayCount: number;
  weekCount: number;
  monthCount: number;
  goals: BotScreeningGoalItem[];
  clinicName?: string;
}): string {
  const clinic = opts.clinicName?.trim() || DEFAULT_CLINIC_NAME;
  const head = `${opts.title} (${clinic})`;
  const counters = `📌 امروز: ${faDigits(String(opts.todayCount))} · ۷ روز اخیر: ${faDigits(String(opts.weekCount))} · ۳۰ روز اخیر: ${faDigits(String(opts.monthCount))}`;

  if (opts.goals.length === 0) {
    return [head, '', counters, '', '🎯 هنوز هدفی برای سنجش تنظیم نشده است.', 'تنظیم: پنل ← تنظیمات ← شاخص سنجش'].join('\n');
  }

  const shown = opts.goals.slice(0, SCREENING_GOAL_MAX_ROWS);
  const body = shown.map((g) => {
    const mark = g.status === 'upcoming' ? '🕒' : g.percent >= 100 ? '✅' : '🎯';
    const status = g.status === 'upcoming' ? 'شروع نشده' : g.status === 'past' ? 'پایان‌یافته' : 'در جریان';
    const detail =
      g.status === 'upcoming'
        ? `هدف: ${faDigits(String(g.target))} سنجش`
        : `${faDigits(String(g.done))} از ${faDigits(String(g.target))} (${faDigits(String(g.percent))}٪)` +
          (g.status === 'active' && g.remaining > 0 ? ` — ${faDigits(String(g.remaining))} باقی‌مانده` : '');
    return `${mark} ${g.periodLabel} — ${detail} (${status})`;
  });

  const rest = opts.goals.length - shown.length;
  const tail =
    rest > 0
      ? ['', `… و ${faDigits(String(rest))} هدف دیگر — نمایش کامل: پنل ← داشبورد`].join('\n')
      : '';
  return [head, '', counters, '', ...body].join('\n') + tail;
}
