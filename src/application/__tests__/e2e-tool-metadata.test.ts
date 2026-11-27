import { describe, it, expect, beforeAll } from 'vitest';
import screeningJson from '../../domain/clinical-engine/battery-screening.json';
import specificJson from '../../domain/clinical-engine/battery-specific.json';
import clinicalJson from '../../domain/clinical-engine/battery-clinical.json';
import { createTestApp, asRole } from '../../test/harness';

/* ۱.۲۷.۸۸ — ممیزی روان‌سنجی (quick wins): گیت شناسنامهٔ ابزار — مایگریشن 0126 باید
   tool_source/tool_norm را عیناً از فیلد «source» بلوک‌های JSON باتری پر کرده باشد و
   دستهٔ کتابخانهٔ باتری (batteryCategory) روی پاسخ API در دسترس باشد. مقادیر در این گیت
   از خود JSON خوانده می‌شوند — نه رونوشت دستی — تا با محتوا واگرا نشوند. */
interface TypeRow {
  key: string;
  active: boolean;
  toolSource: string | null;
  toolNorm: string | null;
  batteryCategory: string | null;
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const BLOCKS = [
  ...(screeningJson as unknown as Array<{ key: string; source: string; batteryCategory: string }>),
  ...(specificJson as unknown as Array<{ key: string; source: string; batteryCategory: string }>),
  ...(clinicalJson as unknown as Array<{ key: string; source: string; batteryCategory: string }>)
];

const NORM_LABELS = ['مستند', 'کالیبراسیون داخلی', 'بدون مبدأ — نیازمند تأیید'];
/* فرم‌های بدون باند/هنجار — tool_norm عمداً NULL است (مستند مبدأ: docs/INSTRUMENT-SOURCES.md) */
const NO_NORM_KEYS = ['ce-anamnesis-v2', 'ce-anamnesis-v3'];
/* دو چیپ کد-مقیم: ردیف case_event_types ندارند (SENSORY_CHIP_KEY/READ_CORE_KEY در pure.ts) —
   شناسنامهٔ آن‌ها JSON + docs/INSTRUMENT-SOURCES.md است و مایگریشن 0126 برایشان UPDATE نمی‌نویسد */
const CODE_RESIDENT_KEYS = ['ce-sensory-chip-v1', 'ce-read-core-v1'];
const DB_BLOCKS = BLOCKS.filter((b) => !CODE_RESIDENT_KEYS.includes(b.key));

describe('شناسنامهٔ ابزار باتری (0126 — ممیزی روان‌سنجی)', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: ReturnType<typeof asRole> extends Promise<infer T> ? T : never;
  let rows: Map<string, TypeRow>;

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    rows = new Map(
      dataOf<TypeRow[]>(await manager.get('/api/case-events/types')).map((t) => [t.key, t])
    );
  });

  it('tool_source هر ۱۹ قالب باتریِ مقیم DB عیناً برابر فیلد source همان بلوک JSON است', () => {
    for (const b of DB_BLOCKS) {
      const row = rows.get(b.key);
      expect(row, `قالب باتری ${b.key} در پاسخ types نیست`).toBeTruthy();
      expect(row!.toolSource, `tool_source واگرا با JSON برای ${b.key}`).toBe(b.source);
    }
    /* چیپ‌های کد-مقیم واقعاً ردیف DB ندارند — ادعای شناسنامهٔ DB برایشان جعل نمی‌شود */
    for (const k of CODE_RESIDENT_KEYS) {
      expect(rows.get(k), `چیپ کد-مقیم ${k} نباید ردیف DB داشته باشد`).toBeUndefined();
    }
  });

  it('tool_norm = برچسب وضعیت باند/هنجار؛ فرم بدون باند NULL و هر برچسب از واژگان سه‌گانه است', () => {
    for (const b of DB_BLOCKS) {
      const row = rows.get(b.key)!;
      if (NO_NORM_KEYS.includes(b.key)) {
        expect(row.toolNorm, `tool_norm برای فرم بدون باند ${b.key} باید NULL باشد`).toBeNull();
      } else {
        expect(NORM_LABELS, `برچسب هنجار ناشناخته برای ${b.key}: ${row.toolNorm}`).toContain(row.toolNorm);
      }
    }
    /* دو نمونهٔ شاخص: برش‌های مستند SCARED و هنجار بی‌مرجع پراپ خواندن (مستند مبدأ: instruments.ts) */
    expect(rows.get('ce-scared-p-v1')!.toolNorm).toBe('مستند');
    expect(rows.get('ce-probe-read-v1')!.toolNorm).toBe('بدون مبدأ — نیازمند تأیید');
  });

  it('batteryCategory پاسخ API برابر بلوک JSON است و قالب‌های خارج از باتری null می‌گیرند', () => {
    for (const b of DB_BLOCKS) {
      expect(rows.get(b.key)!.batteryCategory).toBe(b.batteryCategory);
    }
    const outside = rows.get('ce-wechsler-w4-v1');
    expect(outside).toBeTruthy();
    expect(outside!.batteryCategory).toBeNull(); /* خارج از باتری — بدون ادعای دسته */
    expect(outside!.toolSource).toBeNull(); /* و بدون ادعای منبع — فرم‌ساز باید ثبتش کند */
  });

  it('فرم ورودی نسخهٔ ۳ فعال و نسخهٔ ۲ برای ورودی جدید خاموش است (0127 — تضمین مجدد ممیزی)', () => {
    expect(rows.get('ce-anamnesis-v2')!.active).toBe(false);
    expect(rows.get('ce-anamnesis-v3')!.active).toBe(true);
  });
});
