import { CLEARBOOK_PLAN_STATUS_LABELS } from '@core/shared';
import type { ImportRegistryEntity } from './types';

// ─── درون‌ریزی اکسل: رجیستری موجودیت‌ها ───
// منبع حقیقت ستون‌ها: هم اعتبارسنجی سمت سرور و هم ساخت قالب اکسل سمت مرورگر از همین تعریف می‌خواند.
// موجودیت تازه = یک ورودی اینجا + منطق validate/commit در service.ts

export const IMPORT_ROWS_MAX = 500;

const SCHOOL_KIND_OPTIONS = [
  { value: 'school', label: 'مدرسه' },
  { value: 'kindergarten', label: 'مهدکودک' }
];

const GENDER_OPTIONS = [
  { value: 'mixed', label: 'مختلط', aliases: ['مخلوط', 'هر دو'] },
  { value: 'male', label: 'پسرانه', aliases: ['پسر'] },
  { value: 'female', label: 'دخترانه', aliases: ['دختر'] }
];

const PLAN_STATUS_OPTIONS = [
  { value: 'planned', label: CLEARBOOK_PLAN_STATUS_LABELS.planned, aliases: ['برنامه ریزی شده', 'planned'] },
  { value: 'active', label: CLEARBOOK_PLAN_STATUS_LABELS.active, aliases: ['درجریان', 'جاری', 'active'] },
  { value: 'done', label: CLEARBOOK_PLAN_STATUS_LABELS.done, aliases: ['تکمیل شده', 'تکمیلشده', 'انجام شده', 'پایان یافته', 'done'] }
];

export const IMPORT_ENTITIES: ImportRegistryEntity[] = [
  {
    key: 'schools',
    title: 'اطلاعات مدارس',
    hint: 'مدارس و مهدکودک‌های همکار مرکز را یک‌جا وارد کنید. ردیفی که «نام مدرسه» آن قبلاً ثبت شده باشد ویرایش می‌شود و ردیف تازه اضافه می‌شود.',
    roles: ['manager'],
    listUrl: '/api/schools',
    keyLabel: 'نام مدرسه',
    columns: [
      {
        key: 'name',
        recordKey: 'name',
        label: 'نام مدرسه',
        type: 'text',
        required: true,
        maxLength: 200,
        width: 32,
        help: 'نام کامل مدرسه یا مهدکودک — کلید تشخیص ویرایش؛ اگر همین نام قبلاً ثبت شده باشد آن ردیف ویرایش می‌شود',
        example: 'دبستان شهید مطهری'
      },
      {
        key: 'kind',
        recordKey: 'kind',
        label: 'نوع',
        type: 'enum',
        options: SCHOOL_KIND_OPTIONS,
        width: 12,
        help: 'خالی = مدرسه (در افزودن) / بدون تغییر (در ویرایش)',
        example: 'مدرسه'
      },
      {
        key: 'gender_type',
        recordKey: 'genderType',
        label: 'جنسیت',
        type: 'enum',
        options: GENDER_OPTIONS,
        width: 12,
        help: 'خالی = بدون تغییر (در ویرایش) و خالی ثبت می‌شود (در افزودن)',
        example: 'مختلط'
      },
      {
        key: 'code',
        recordKey: 'code',
        label: 'کد مدرسه',
        type: 'code',
        maxLength: 20,
        width: 14,
        help: 'کد یکتای آموزش‌وپرورش؛ اگر همین کد برای مدرسهٔ دیگری ثبت باشد آن ردیف خطا می‌گیرد',
        example: '44990002'
      },
      {
        key: 'phone',
        recordKey: 'phone',
        label: 'تلفن',
        type: 'phone',
        maxLength: 20,
        width: 16,
        help: 'تلفن مدرسه — بهتر است سلول «متن» باشد تا صفر اول حذف نشود',
        example: '021-12345678'
      },
      {
        key: 'principal_name',
        recordKey: 'principalName',
        label: 'نام مدیر',
        type: 'text',
        maxLength: 120,
        width: 18,
        help: 'نام مدیر مدرسه برای ارتباط مرکز با مدرسه',
        example: 'آقای احمدی'
      },
      {
        key: 'principal_phone',
        recordKey: 'principalPhone',
        label: 'تلفن مدیر',
        type: 'phone',
        maxLength: 20,
        width: 16,
        help: 'شمارهٔ همراه مدیر مدرسه',
        example: '09121234567'
      },
      {
        key: 'address',
        recordKey: 'address',
        label: 'نشانی',
        type: 'longtext',
        maxLength: 500,
        width: 44,
        help: 'نشانی کامل مدرسه'
      },
      {
        key: 'notes',
        recordKey: 'notes',
        label: 'یادداشت',
        type: 'longtext',
        maxLength: 500,
        width: 44,
        help: 'نکات داده، شماره‌های جایگزین و…'
      }
    ]
  },
  {
    key: 'school-classes',
    title: 'کلاس‌ها و معلمان مدارس',
    hint: 'هر سطر یک کلاس است: نام مدرسه (باید قبلاً ثبت شده باشد) + نام کلاس + نام معلم و تلفن او. اگر «نام مدرسه + نام کلاس» قبلاً ثبت شده باشد همان کلاس ویرایش می‌شود؛ کلاس غیرفعالِ هم‌نام دوباره فعال می‌شود.',
    roles: ['manager'],
    listUrl: '/api/classes',
    keyLabel: 'نام مدرسه + نام کلاس',
    columns: [
      {
        key: 'school',
        recordKey: 'schoolName',
        label: 'نام مدرسه',
        type: 'text',
        required: true,
        maxLength: 200,
        width: 30,
        help: 'دقیقاً همان نام مدرسهٔ ثبت‌شده در بخش مدارس — کلاس به آن وصل می‌شود؛ مدرسهٔ ناشناخته خطا می‌گیرد',
        example: 'دبستان شهید مطهری'
      },
      {
        key: 'class_name',
        recordKey: 'name',
        label: 'نام کلاس',
        type: 'text',
        required: true,
        maxLength: 120,
        width: 18,
        help: 'کلید تشخیص ویرایش همراه نام مدرسه — مثل «پنجم الف» یا «مهر ۱۴۰۵»',
        example: 'پنجم الف'
      },
      {
        key: 'teacher_name',
        recordKey: 'teacherName',
        label: 'نام معلم کلاس',
        type: 'text',
        maxLength: 120,
        width: 22,
        help: 'نام و نام‌خانوادگی معلمِ همان کلاس — خالی = بدون تغییر (در ویرایش)',
        example: 'خانم رضایی'
      },
      {
        key: 'teacher_phone',
        recordKey: 'teacherPhone',
        label: 'تلفن معلم',
        type: 'phone',
        maxLength: 20,
        width: 18,
        help: 'شمارهٔ همراه معلم کلاس — سلول «متن» باشد تا صفر اول حذف نشود؛ خالی = بدون تغییر',
        example: '09131234567'
      }
    ]
  },
  {
    key: 'clearbook-plans',
    title: 'تقویم اجرایی کلر بوک',
    hint: 'فازهای تقویم اجرایی سالانهٔ مرکز را یک‌جا وارد کنید. فازی که «عنوان فاز» آن قبلاً ثبت شده باشد ویرایش می‌شود و فاز تازه در انتهای تقویم اضافه می‌شود. تاریخ‌ها شمسی وارد شوند.',
    roles: ['manager', 'secretary'],
    listUrl: '/api/clearbook/plans',
    keyLabel: 'عنوان فاز',
    columns: [
      {
        key: 'title',
        recordKey: 'title',
        label: 'عنوان فاز (خطیه اجرایی)',
        type: 'text',
        required: true,
        maxLength: 150,
        width: 36,
        help: 'کلید تشخیص ویرایش؛ اگر همین عنوان قبلاً ثبت شده باشد آن فاز ویرایش می‌شود',
        example: 'هفتهٔ اول مهر — آماده‌سازی و توجیه'
      },
      {
        key: 'from_date',
        recordKey: 'fromDate',
        label: 'از تاریخ',
        type: 'date',
        required: true,
        width: 14,
        help: 'شروع بازهٔ اجرا — شمسی مثل 1404/07/01 یا 1404-7-1 یا 14040701 (میلادی 2025-09-23 هم پذیرفته می‌شود)',
        example: '1404/07/01'
      },
      {
        key: 'to_date',
        recordKey: 'toDate',
        label: 'تا تاریخ',
        type: 'date',
        width: 14,
        help: 'پایان بازهٔ اجرا — خالی یعنی رویداد یک‌روزه؛ نباید قبل از «از تاریخ» باشد',
        example: '1404/07/07'
      },
      {
        key: 'admin_actions',
        recordKey: 'adminActions',
        label: 'اقدامات اداری و جلسات',
        type: 'longtext',
        maxLength: 2000,
        width: 46,
        help: 'بخشنامه‌ها، توجیهی‌ها، جلسات اداری این بازه'
      },
      {
        key: 'center_actions',
        recordKey: 'centerActions',
        label: 'خروجی / اقدام عملیاتی مرکز',
        type: 'longtext',
        maxLength: 2000,
        width: 46,
        help: 'اقدام عملیاتی که مرکز در این بازه باید انجام دهد و خروجی آن'
      },
      {
        key: 'status',
        recordKey: 'status',
        label: 'وضعیت',
        type: 'enum',
        options: PLAN_STATUS_OPTIONS,
        width: 16,
        help: 'خالی = برنامه‌ریزی‌شده (در افزودن) / بدون تغییر (در ویرایش)',
        example: 'برنامه‌ریزی‌شده'
      },
      {
        key: 'tag',
        recordKey: 'tag',
        label: 'برچسب فعالیت‌ها',
        type: 'text',
        maxLength: 40,
        width: 22,
        help: 'رویدادهای خط زمانی که با همین برچسب ثبت شوند به‌عنوان شواهد اجرای این فاز شمرده می‌شوند',
        example: 'جلسات اولیا'
      }
    ]
  }
];

export function findImportEntity(key: string): ImportRegistryEntity | undefined {
  return IMPORT_ENTITIES.find((e) => e.key === key);
}
