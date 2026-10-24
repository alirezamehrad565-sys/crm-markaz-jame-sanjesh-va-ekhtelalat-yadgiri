import { describe, it, expect } from 'vitest';
import { renderFillFormPage } from '../public-form';

const familyModel = {
  typeTitle: 'چک‌لیست دشواری خواندن',
  studentName: 'علی',
  audience: 'family' as const,
  description: 'سلام. این فرم ده جمله دارد…',
  teacherLabel: null,
  sections: [
    {
      title: 'نشانه‌های خواندن',
      items: [
        {
          key: 'rA1',
          label: 'وقتی بلند می‌خواند، کند است، زیاد زحمت می‌کشد و اشتباه می‌خواند.',
          scaleMax: 2,
          scaleLabels: ['دیده نمی‌شود', 'گاهی و کم', 'واضح و بارها'],
          hint: 'مثلاً هر کلمه را با مکث و سختی می‌خواند و خسته می‌شود.',
          teacherLabel: 'وقتی در کلاس بلند می‌خواند، کند است، زیاد زحمت می‌کشد و اشتباه می‌خواند.',
          teacherHint: null
        }
      ]
    }
  ]
};

describe('فرم عمومی — m175: hint و teacherLabel و خط «این فرم تشخیص نیست»', () => {
  it('فرم خانواده: برچسب اصلی + مثال خاکستری + خط تشخیص‌نیست', () => {
    const html = renderFillFormPage(familyModel, 'tok');
    expect(html).toContain('وقتی بلند می‌خواند');
    expect(html).not.toContain('وقتی در کلاس بلند می‌خواند');
    expect(html).toContain('class="hint"');
    expect(html).toContain('مثلاً هر کلمه را با مکث');
    expect(html).toContain('این فرم تشخیص نیست');
    expect(html).toContain('دیده نمی\u200cشود');
  });

  it('فرم معلم (teacherLabel مدل): برچسب جایگزین + مثال جایگزین معلم', () => {
    const teacher = {
      ...familyModel,
      audience: 'both' as const,
      teacherLabel: 'فرم شما — خانم احمدی',
      sections: [
        {
          title: 'نشانه‌های خواندن',
          items: [
            {
              key: 'rB2',
              label: 'برای جبران مشکل خواندن، راه دیگری پیدا کرده و زود خسته می‌شود.',
              scaleMax: 2,
              scaleLabels: ['دیده نمی‌شود', 'گاهی و کم', 'واضح و بارها'],
              hint: 'مثلاً به توضیح شفاهی گوش می‌دهد.',
              teacherLabel: 'برای جبران مشکل خواندن، راه دیگری پیدا کرده و زود خسته می‌شود.',
              teacherHint: 'مثلاً از دوستش می‌خواهد بخواند.'
            }
          ]
        }
      ]
    };
    const html = renderFillFormPage(teacher, 'tok');
    expect(html).toContain('فرم شما — خانم احمدی');
    expect(html).toContain('مثلاً از دوستش می‌خواهد بخواند.');
    expect(html).not.toContain('مثلاً به توضیح شفاهی گوش می‌دهد.');
  });

  it('فرم خانواده: hint معلم نشان داده نمی‌شود', () => {
    const html = renderFillFormPage({
      ...familyModel,
      sections: [
        {
          title: null,
          items: [
            {
              key: 'rB2',
              label: 'برای جبران مشکل خواندن، راه دیگری پیدا کرده و زود خسته می‌شود.',
              scaleMax: 2,
              scaleLabels: ['دیده نمی‌شود', 'گاهی و کم', 'واضح و بارها'],
              hint: 'مثلاً به توضیح شفاهی گوش می‌دهد.',
              teacherLabel: null,
              teacherHint: 'مثلاً از دوستش می‌خواهد بخواند.'
            }
          ]
        }
      ]
    }, 'tok');
    expect(html).toContain('مثلاً به توضیح شفاهی گوش می‌دهد.');
    expect(html).not.toContain('مثلاً از دوستش می‌خواهد بخواند.');
  });

  it('فرم معلم تکی: برچسب «فرم شما — X» + خط «این فرم تشخیص نیست» (m186 — رندر بستهٔ جامع حذف شد)', () => {
    const html = renderFillFormPage({
      typeTitle: 'ملاک‌های کلاسی خواندن/نوشتن/حساب — فرم معلم',
      studentName: 'علی',
      sections: [
        {
          title: 'خواندن در کلاس',
          items: [
            {
              key: 'r01',
              label: 'وقتی بلند می‌خواند، کلمه‌ها را حرف‌به‌حرف می‌خواند.',
              scaleMax: 2,
              scaleLabels: ['اصلاً دیده نمی‌شود', 'تا حدی', 'به‌روشنی و بارها'],
              hint: null,
              teacherLabel: null,
              teacherHint: null
            }
          ]
        }
      ],
      audience: 'teacher',
      description: null,
      teacherLabel: 'فرم شما — خانم احمدی'
    }, 'tok');
    expect(html).toContain('این فرم تشخیص نیست');
    expect(html).toContain('فرم شما — خانم احمدی');
    expect(html).toContain('وقتی بلند می‌خواند، کلمه‌ها را حرف‌به‌حرف می‌خواند.');
  });
});
