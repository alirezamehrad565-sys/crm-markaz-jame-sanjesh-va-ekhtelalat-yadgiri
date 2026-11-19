/**
 * ۱.۲۵.۸۱ — گیت «پیش‌نمایش از نگاه خانواده» (خواست کارفرما):
 * «یه گزینه پیش‌نمایش تو پرسشنامه‌ها بزار؛ همکار با کلیک روش ببینه خانواده دقیقاً چی می‌بینه،
 * بعد از پر کردنش چه جوابی میده، و این نتایج امتحانی جایی ذخیره نشه».
 *
 * قراردادهای پین‌شده در این آزمون:
 * ① POST /public/case-events/preview → صفحهٔ عین فرم خانواده (بنر زرد «هیچ پاسخی ذخیره
 *   نمی‌شود» + همهٔ آیتم‌ها) — برای تعریف ۱۰۰ ایتمی هم بدون ریزش.
 * ② POST /public/case-events/preview/analyze → تحلیل = دقیقاً همان شیء analyzeChecklist/
 *   buildSummary که در مسیر واقعی fillByFamily به ستون analysis پرونده می‌نشیند.
 * ③ «جایی ذخیره نشه» — شمارش case_events / audit_log / case_event_types پیش و پس از
 *   پیش‌نمایش و تحلیل باید کلاً یکسان بماند: هیچ نوشتنی، نه دیتا نه سونامه.
 * ④ توکن نشست در بدنه (مسیر /public سرِتیتِ هدر Authorization است) — بدون توکن ۴۰۱،
 *   نقش ناظر ۴۰۳، تعریف ناقص ۴۰۰ با پیام فارسی.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, loginToken, type TestApp } from '../../test/harness';
import { createDb } from '@core/db';
import { analyzeChecklist, buildSummary } from '@domain/case-events/pure';

function previewDefinition(nItems = 6) {
  return {
    title: 'پرسش‌نامهٔ پیش‌نمایش — رفتار کودک',
    category: 'checklist',
    icon: null,
    familyFillable: true,
    fields: Array.from({ length: nItems }, (_, i) => ({
      key: `it_${i}`,
      label: `آیتم شمارهٔ ${i + 1}`,
      type: 'scale' as const,
      scaleMax: 3
    })),
    bands: [
      { max: 6, label: 'مطلوب', color: 'ok' as const, advice: 'ادامهٔ روند فعلی' },
      { max: nItems * 3, label: 'نیاز به پیگیری', color: 'warn' as const, advice: 'ارزیابی هدفمند' }
    ],
    subscales: null,
    tags: null,
    audience: 'family' as const,
    description: 'توضیح آزمایشی برای خانواده'
  };
}

const formPost = (A: TestApp, body: URLSearchParams) =>
  A.app.request('/public/case-events/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  }, A.env as never);

const analyzePost = (A: TestApp, body: unknown) =>
  A.app.request('/public/case-events/preview/analyze', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  }, A.env as never);

const countOf = async (db: ReturnType<typeof createDb>, sql: string): Promise<number> => {
  const rows = await db.query<{ n: number }>(sql);
  return rows[0]?.n ?? -1;
};

describe('پیش‌نمایش از نگاه خانواده — رندر، تحلیل و «هیچ‌جا ذخیره نشد»', () => {
  let A: ReturnType<typeof createTestApp>;
  let token: string;
  let db: ReturnType<typeof createDb>;

  beforeAll(async () => {
    A = createTestApp();
    const manager = await asRole(A, 'manager');
    token = await loginToken(A, 'manager');
    expect(manager).toBeDefined();
    db = createDb(A.env.DB as never);
  });

  it('① رندر پیش‌نمایش: بنر «ذخیره نمی‌شود» + عین آیتم‌ها — تعریف ذخیره‌نشده هم می‌گذرد', async () => {
    const res = await formPost(A, new URLSearchParams({
      definition: JSON.stringify(previewDefinition(6)),
      token
    }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('هیچ پاسخی جایی ذخیره نمی‌شود');
    expect(html).toContain('پرسش‌نامهٔ پیش‌نمایش — رفتار کودک');
    expect(html).toContain('آیتم شمارهٔ 1'); // برچسب عین تعریف همکار — esc بدون تبدیل رقم
    expect((html.match(/class="item"/g) ?? []).length).toBe(6);
    expect(res.headers.get('cache-control')).toBe('no-store');
  });

  it('①ب — پرسش‌نامهٔ ۱۰۰ ایتمی همکار: هر ۱۰۰ آیتم رندر می‌شود (سقف ۴۵ برداشته شد)', async () => {
    const res = await formPost(A, new URLSearchParams({
      definition: JSON.stringify(previewDefinition(100)),
      token
    }));
    expect(res.status).toBe(200);
    const html = await res.text();
    expect((html.match(/class="item"/g) ?? []).length).toBe(100);
    expect(html).toContain('آیتم شمارهٔ 100');
  });

  it('② تحلیل پیش‌نمایش = دقیقاً همان شیء مسیر واقعی fillByFamily', async () => {
    const def = previewDefinition(6);
    const answers: Record<string, number> = {};
    for (let i = 0; i < 6; i++) answers[`it_${i}`] = i % 2 === 0 ? 3 : 1; // جمع نمره = 9
    const res = await analyzePost(A, { token, definition: def, answers });
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text()) as { ok: boolean; analysis: Record<string, unknown>; summary: string; payload: Record<string, { value: string; label: string }> };
    expect(body.ok).toBe(true);
    const numericValues: Record<string, number> = {};
    for (let i = 0; i < 6; i++) numericValues[`it_${i}`] = i % 2 === 0 ? 3 : 1;
    const expected = analyzeChecklist(def.fields, def.bands, numericValues, null);
    expect(body.analysis).toEqual(expected);
    const payload: Record<string, { value: string; label: string }> = {};
    for (const f of def.fields) payload[f.key] = { value: String(answers[f.key]), label: f.label };
    expect(body.summary).toEqual(buildSummary(payload, expected));
  });

  it('③ «جایی ذخیره نشه» — شمارش رویداد/سونامه/قالب پیش و پس یکسان می‌ماند', async () => {
    const before = {
      events: await countOf(db, 'SELECT COUNT(*) AS n FROM case_events'),
      audit: await countOf(db, 'SELECT COUNT(*) AS n FROM audit_log'),
      types: await countOf(db, 'SELECT COUNT(*) AS n FROM case_event_types')
    };
    const def = previewDefinition(6);
    await formPost(A, new URLSearchParams({ definition: JSON.stringify(def), token }));
    await analyzePost(A, { token, definition: def, answers: { it_0: 1, it_1: 1, it_2: 1, it_3: 1, it_4: 1, it_5: 1 } });
    const after = {
      events: await countOf(db, 'SELECT COUNT(*) AS n FROM case_events'),
      audit: await countOf(db, 'SELECT COUNT(*) AS n FROM audit_log'),
      types: await countOf(db, 'SELECT COUNT(*) AS n FROM case_event_types')
    };
    expect(after).toEqual(before);
  });

  it('④ بدون توکن ۴۰۱ — توکن ساختگی ۴۰۱', async () => {
    const noToken = await formPost(A, new URLSearchParams({ definition: JSON.stringify(previewDefinition(3)) }));
    expect(noToken.status).toBe(401);
    const fake = await analyzePost(A, { token: 'not-a-jwt', definition: previewDefinition(3), answers: {} });
    expect(fake.status).toBe(401);
  });

  it('④ب — تعریف ناقص ۴۰۰ با پیام فارسی و هدایت به ذخیره در فرم‌ساز', async () => {
    const broken = { ...previewDefinition(3), title: 'x' }; // عنوان زیر حداقل ۲ نویسه
    const res = await formPost(A, new URLSearchParams({ definition: JSON.stringify(broken), token }));
    expect(res.status).toBe(400);
    const html = await res.text();
    expect(html).toContain('هنوز کامل نیست');
    expect(html).toContain('ذخیره');
  });

  it('④ت — فرم درمانگری (غیرچک‌لیست): بدون تحلیل نمره‌ای، با پیش‌نمایش پاسخ‌ها', async () => {
    const def = {
      title: 'فرم مشاهدهٔ درمانگر',
      category: 'session' as const,
      icon: null,
      familyFillable: false,
      fields: [
        { key: 'obs_1', label: 'مشاهدهٔ اول', type: 'longtext' as const },
        { key: 'obs_2', label: 'انتخاب درمانگر', type: 'select' as const, options: ['کم', 'زیاد'] }
      ],
      bands: null,
      subscales: null,
      tags: null,
      audience: 'family' as const,
      description: null
    };
    const res = await analyzePost(A, { token, definition: def, answers: { obs_1: 'همکاری خوب بود', obs_2: 'زیاد' } });
    expect(res.status).toBe(200);
    const body = JSON.parse(await res.text()) as { ok: boolean; analysis: unknown; note?: string | undefined; payload: Record<string, { value: string }> };
    expect(body.ok).toBe(true);
    expect(body.analysis).toBeNull();
    expect(body.payload['obs_1'].value).toBe('همکاری خوب بود');
    expect(body.note).toContain('خانواده‌پرکن نیست');
  });
});
