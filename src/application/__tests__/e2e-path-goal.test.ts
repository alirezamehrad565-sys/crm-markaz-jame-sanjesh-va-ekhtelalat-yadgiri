import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  createStudent
} from '../../test/harness';

// پیوند نیم‌رخ به مداخله: هدف SMART روی مسیر + اسنپ‌شات مبنا + برچسب «بدون هدف»
// معیار پذیرش سند: هر مسیر فعال هدف اندازه‌پذیر متصل به دادهٔ مبنا؛ ساخت بدون هدف ممکن ولی برچسب‌دار.

interface PathBody {
  id: string;
  targetKey: string;
  status: string;
  goal: string | null;
  goalBasis: { targetKey: string; rules: { key: string; ifFa: string; thenFa: string; sourceFa: string }[] } | null;
}

interface InsightsBody {
  basis: { targetKey: string; rules: { key: string }[] }[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('هدف SMART و مبنا روی مسیر مداخله ()', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    studentId = (await createStudent(ali)).id;
    // هستهٔ خواندن با آگاهی واج‌شناختی ضعف آشکار → قاعدهٔ «تمرین واج‌شناسی» فعال می‌شود
    const rc = await ali.post(`/api/students/${studentId}/case-events/read-core`, { levels: { pa: 2, dec: 2, flu: 1, voc: 0, comp: 0 } });
    expect(rc.status).toBe(201);
  });

  it('insights شامل مبنای پیشنهاد فعال برای نارساخوانی است (اگر-آنگاه با منبع)', async () => {
    const res = await ali.get(`/api/students/${studentId}/clinical-insights`);
    expect(res.status).toBe(200);
    const body = dataOf<InsightsBody>(res);
    const dys = body.basis.find((b) => b.targetKey === 'dyslexia');
    expect(dys).toBeDefined();
    expect(dys!.rules.some((r) => r.key === 'dyslexia_pa')).toBe(true);
  });

  it('ساخت مسیر با هدف → goal + goalBasis اسنپ‌شات؛ بدون هدف → goal null', async () => {
    const withGoal = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, {
      target_key: 'dyslexia',
      goal: 'خواندن واژهٔ تازه با رمزگشایی هدایت‌شده — با سنجهٔ «WCPM پروب» تا ۸۰٪ در دو جلسهٔ پیاپی (مهلت: چهار هفته)'
    }));
    expect(withGoal.status).toBe('suggested');
    expect(withGoal.goal).toContain('WCPM');
    expect(withGoal.goalBasis?.targetKey).toBe('dyslexia');
    expect(withGoal.goalBasis?.rules.some((r) => r.key === 'dyslexia_pa')).toBe(true);

    const withoutGoal = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dysgraphia' }));
    expect(withoutGoal.goal).toBeNull();
    expect(withoutGoal.goalBasis).toBeNull();
  });

  it('هدف‌گذاری پس از ساخت (PATCH) — منشی ۴۰۳؛ هدف بلندتر از سقف ۴۰۰', async () => {
    const path = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'dyscalculia' }));
    const patched = await ali.patch(`/api/clinical-paths/${path.id}/goal`, { goal: 'شمارش تلفظی تا ۱۰۰ — با سنجهٔ «digits2min» تا معیار ۸۰٪' });
    expect(patched.status).toBe(200);
    expect(dataOf<PathBody>(patched).goal).toContain('digits2min');

    const tooLong = await ali.patch(`/api/clinical-paths/${path.id}/goal`, { goal: 'x'.repeat(301) });
    expect(tooLong.status).toBe(400);

    const sec = await asRole(A, 'secretary');
    const denied = await sec.patch(`/api/clinical-paths/${path.id}/goal`, { goal: 'هدف منشی' });
    expect(denied.status).toBe(403);
  });

  it('audit — clinical_path.goal روی مسیر ثبت می‌شود', async () => {
    const path = dataOf<PathBody>(await ali.post(`/api/students/${studentId}/clinical-paths`, { target_key: 'adhd' }));
    await ali.patch(`/api/clinical-paths/${path.id}/goal`, { goal: 'تکمیل تکالیف کلاس با شکستن به پله‌ها — معیار ۴ از ۵ روز' });
    const rows = A.sql
      .prepare(`SELECT action FROM audit_log WHERE resource_id = ? AND resource_type = 'intervention_path' AND action = 'clinical_path.goal'`)
      .all(path.id) as { action: string }[];
    expect(rows).toHaveLength(1);
  });
});
