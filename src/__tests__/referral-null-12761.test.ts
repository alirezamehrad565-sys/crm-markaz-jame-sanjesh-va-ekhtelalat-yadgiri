// ۱.۲۷.۶۱ — رگرسیون فرم عمومی رفرال سنجش: فرم برای فیلدهای اختیاریِ خالی null می‌فرستد
// (referral-page.ts familyChildren: birth_date_text/school_text/grade_text/class_text/
// concern_text/prior_eval_note = مقدار || null) و گام آخر با پیام
// «Invalid input: expected string, received null» رد می‌شد — اسکیما باید nullish باشد.
import { describe, it, expect } from 'vitest';
import { PublicReferralSubmissionSchema } from '@core/shared/schemas';

const familyPayload = {
  role: 'family',
  referrer_name: 'زهرا کریمی',
  referrer_phone: '09121234567',
  children: [
    {
      first_name: 'علی محمدی',
      birth_date_text: null,
      school_text: null,
      grade_text: null,
      class_text: null,
      concern_category: 'delayed',
      concern_tags: [],
      concern_text: null,
      prior_eval: null,
      prior_eval_note: null
    }
  ]
};

describe('PublicReferralSubmissionSchema — فیلدهای اختیاریِ خالیِ فرم عمومی (null)', () => {
  it('ثبت خانواده با همهٔ فیلدهای اختیاری null پذیرفته می‌شود (گام آخر رفرال)', () => {
    const out = PublicReferralSubmissionSchema.safeParse(familyPayload);
    expect(out.success).toBe(true);
  });

  it('ثبت معلم با school_text/grade_text/class_text سطح بالا null پذیرفته می‌شود', () => {
    const out = PublicReferralSubmissionSchema.safeParse({
      role: 'teacher',
      referrer_name: 'معلم همکار مرکز',
      referrer_phone: '09121234567',
      school_text: null,
      grade_text: null,
      class_text: null,
      children: [
        {
          first_name: 'دانش‌آموز کلاس',
          concern_category: 'learning_disorder',
          family_cooperation: 'mid',
          family_liv: 'mid',
          prior_eval_note: null,
          concern_text: null
        }
      ]
    });
    expect(out.success).toBe(true);
  });

  it('کامل‌خواندن دادهٔ سبز: مقدار واقعی از فرم دست‌نخورده می‌ماند', () => {
    const out = PublicReferralSubmissionSchema.safeParse({
      ...familyPayload,
      children: [
        {
          ...familyPayload.children[0],
          birth_date_text: '۱۳۹۸/۰۵/۱۲',
          school_text: 'دبستان شهید مطهری',
          grade_text: 'پنجم',
          concern_text: 'روخوانی ضعیف'
        }
      ]
    });
    expect(out.success).toBe(true);
    if (out.success) {
      expect(out.data.children[0].birth_date_text).toBe('۱۳۹۸/۰۵/۱۲');
      expect(out.data.children[0].grade_text).toBe('پنجم');
    }
  });
});
