// درخت هدف در پروفایل دانش‌آموز: PUT/GET /api/students/:id/focus + پیشنهاد دو-بعدی (برچسب + هدف)
// «فاز جدا» نقشهٔ همان قرارداد برای کارت‌ها: کلید ناشناخته ۴۰۰، سقف ۸ پیوند، audit کامل.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent, Api, loginToken } from '../../test/harness';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

const ADHD_TAG = 'aaaaaaaa-0000-4000-8000-000000000004';

interface ExerciseRec {
  id: string;
  title: string;
  published: boolean;
}

interface SuggestionRec {
  exercise: ExerciseRec;
  matched: { id: string; name: string }[];
  matchedFocus: { key: string; fa: string }[];
  score: number;
}

describe('پیوند درخت هدف با پروفایل دانش‌آموز', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let exTagOnly = '';
  let exFocusOnly = '';
  let exBoth = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    const s = await createStudent(manager, { first_name: 'نگار', last_name: 'هدف‌خانه' });
    studentId = s.id;
    A.sql.prepare(`INSERT OR IGNORE INTO student_tags (student_id, tag_id) VALUES (?, ?)`).run(studentId, ADHD_TAG);

    // هدف پروفایل: کلید حوزهٔ «توجه» — با گسترش درختی مهارت‌های زیر را می‌پوشاند
    const put = await manager.put(`/api/students/${studentId}/focus`, { focus_keys: ['attention_divided', 'attention'] });
    expect(put.status).toBe(200);

    exTagOnly = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'کاربرگ فقط برچسب', format: 'worksheet', tag_ids: [ADHD_TAG] })
    ).id;
    exFocusOnly = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'کاربرگ فقط هدف', format: 'worksheet', focus: ['attention_selective'] })
    ).id;
    exBoth = dataOf<ExerciseRec>(
      await manager.post('/api/exercises', { title: 'کاربرگ برچسب و هدف', format: 'worksheet', tag_ids: [ADHD_TAG], focus: ['attention_sustained'] })
    ).id;
    await manager.post('/api/exercises', { title: 'کاربرگ بی‌طبقه‌بندی', format: 'worksheet' });
  });

  it('GET کلیدها را به ترتیب درخت برمی‌گرداند (حوزه پیش از مهارت)', async () => {
    const keys = dataOf<string[]>(await therapist.get(`/api/students/${studentId}/focus`));
    expect(keys).toEqual(['attention', 'attention_divided']);
  });

  it('کلید ناشناخته → ۴۰۰ با عبارت «درخت هدف»؛ دانش‌آموز ناموجود → ۴۰۴', async () => {
    const bad = await manager.put(`/api/students/${studentId}/focus`, { focus_keys: ['not_a_key'] });
    expect(bad.status).toBe(400);
    expect(JSON.stringify(bad.body)).toContain('درخت هدف');

    const missing = await manager.put('/api/students/00000000-0000-4000-8000-0000000000aa/focus', {
      focus_keys: ['attention']
    });
    expect(missing.status).toBe(404);

    const missingGet = await manager.get('/api/students/00000000-0000-4000-8000-0000000000aa/focus');
    expect(missingGet.status).toBe(200);
    expect(dataOf<string[]>(missingGet)).toEqual([]);
  });

  it('سقف ۸ پیوند → ۴۰۰ (شِمای متمرکز)', async () => {
    const res = await manager.put(`/api/students/${studentId}/focus`, {
      focus_keys: [
        'attention_sustained', 'attention_selective', 'attention_divided',
        'perception_visual', 'perception_auditory', 'perception_visomotor',
        'memory_working', 'memory_shortterm', 'memory_visual'
      ]
    });
    expect(res.status).toBe(400);
  });

  it('جایگزینی تکراریِ بی‌تغییر دوباره audit نمی‌نویسد؛ تغییر واقعی می‌نویسد', async () => {
    const count = () => (A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'student.focus.replace'`).get() as { n: number }).n;

    const same = await manager.put(`/api/students/${studentId}/focus`, { focus_keys: ['attention', 'attention_divided'] });
    expect(same.status).toBe(200);
    expect(count()).toBe(1);

    const changed = await manager.put(`/api/students/${studentId}/focus`, { focus_keys: ['memory_working'] });
    expect(changed.status).toBe(200);
    expect(count()).toBe(2);

    // برگشت به حالت اصلی برای تست‌های پیشنهاد
    const back = await manager.put(`/api/students/${studentId}/focus`, { focus_keys: ['attention'] });
    expect(back.status).toBe(200);
    expect(dataOf<string[]>(back)).toEqual(['attention']);
  });

  it('پیشنهاد دو-بعدی: برچسب مشترک + هدف مشترک جمع می‌شوند و سر فهرست می‌نشینند', async () => {
    const sug = dataOf<{ exercises: SuggestionRec[] }>(
      await therapist.get(`/api/students/${studentId}/exercises/suggest`)
    );
    const byId = new Map(sug.exercises.map((s) => [s.exercise.id, s]));

    const both = byId.get(exBoth);
    expect(both?.score).toBe(2);
    expect(both?.matched.some((m) => m.id === ADHD_TAG)).toBe(true);
    expect(both?.matchedFocus).toEqual([{ key: 'attention_sustained', fa: 'توجه پایدار' }]);

    const focusOnly = byId.get(exFocusOnly);
    expect(focusOnly?.score).toBe(1);
    expect(focusOnly?.matched).toEqual([]);
    // گسترش درختی: حوزهٔ «توجه» پروفایل، مهارت «توجه انتخابی» کارت را می‌پوشاند
    expect(focusOnly?.matchedFocus).toEqual([{ key: 'attention_selective', fa: 'توجه انتخابی' }]);

    const tagOnly = byId.get(exTagOnly);
    expect(tagOnly?.score).toBe(1);
    expect(tagOnly?.matchedFocus).toEqual([]);

    expect(sug.exercises[0].exercise.id).toBe(exBoth); // امتیاز ۲ سر فهرست
    expect(sug.exercises.every((s) => s.exercise.published)).toBe(true);
  });

  it('ناظر: GET باز، PUT ۴۰۳ + رویداد supervisor.denied', async () => {
    const create = await manager.post('/api/staff', {
      full_name: 'ناظر هدف ',
      username: 'sup-focus236',
      role: 'supervisor'
    });
    expect(create.status).toBe(201);
    const token = await loginToken(A, 'sup-focus236');
    const sup = new Api(A, token);

    const read = await sup.get(`/api/students/${studentId}/focus`);
    expect(read.status).toBe(200);

    const write = await sup.put(`/api/students/${studentId}/focus`, { focus_keys: ['attention'] });
    expect(write.status).toBe(403);

    const denied = A.sql.prepare(`SELECT COUNT(*) AS n FROM audit_log WHERE action = 'supervisor.denied'`).get() as { n: number };
    expect(denied.n).toBeGreaterThanOrEqual(1);
  });

  it('حذف پرونده، پیوندهای هدف را هم پاک می‌کند (بدون رهاشدگی)', async () => {
    const s = await createStudent(manager, { first_name: 'موقت', last_name: 'حذف‌هدف' });
    const put = await manager.put(`/api/students/${s.id}/focus`, { focus_keys: ['memory_working'] });
    expect(put.status).toBe(200);
    const del = await manager.delete(`/api/students/${s.id}`);
    expect(del.status).toBe(204);
    const left = A.sql.prepare(`SELECT COUNT(*) AS n FROM student_focus_links WHERE student_id = ?`).get(s.id) as { n: number };
    expect(left.n).toBe(0);
  });

  it('شِمای مهاجرت ۰۰۸۵ — ستون‌های جدول پیوند هدف پروفایل', () => {
    // گارد ساختاری: مهاجرت ۰۰۸۵ باید جدول را بسازد — harness همهٔ مایگریشن‌ها را اجرا کرده است
    const cols = A.sql.prepare(`PRAGMA table_info(student_focus_links)`).all() as { name: string }[];
    expect(cols.map((c) => c.name)).toEqual(expect.arrayContaining(['student_id', 'focus_key', 'created_at']));
  });
});
