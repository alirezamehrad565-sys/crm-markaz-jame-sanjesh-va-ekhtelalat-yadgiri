/**
 * تست‌های e2e — پیشرفت جلسه‌به‌جلسه (m162)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-ot-progress.test.ts — GET /api/students/:id/ot/progress:
// تایم‌لاین جلسات از تجمیع ot_progress بر حسب session_id (فقط primary؛ ردیف نامعتبر نادیده؛
// ردیف بدون جلسه = جلسهٔ مستقل raw:*)؛ قاعدهٔ تسلط دوجلسه‌ای به‌صورت confirmedNew در همان جلسه؛
// توزیع سطح راهنمای «با کمک» (منحنی محوشدن راهنما)؛ شمار به تفکیک حیطه؛
// خط پایهٔ عملکردی از آخرین ce-rehab-fx-v1 غیرلغوشده (band/color/prompt) — آخرین ثبت ملاک است؛
// خلاصهٔ جمع‌بندی (تسلط تأییدشدهٔ فعلی)؛ RBAC هم‌الگوی پروفایل (منشی ۲۰۰، درمانگرِ غیرمسئول ۴۰۳).

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole, loginToken, createStudent } from '../../test/harness';

interface ProgressSession {
  sessionId: string;
  ord: number;
  occurredAt: string;
  total: number;
  mastered: number;
  withHelp: number;
  notYet: number;
  confirmedNew: number;
  prompts: Record<string, number>;
  domains: { key: string; mastered: number; withHelp: number; notYet: number }[];
}

interface BaselineEntry {
  key: string;
  label: string;
  valueFa: string;
  band: string;
  color: string;
  prompt: string;
}

interface ProgressBody {
  sessions: ProgressSession[];
  baseline: BaselineEntry[] | null;
  baselineSummary: string | null;
  baselineAt: string | null;
  summary: { sessions: number; confirmedMastered: number; withHelp: number; lastAt: string | null };
}

const dataOf = (res: { body: unknown }): ProgressBody =>
  (res.body as { data: ProgressBody }).data;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('پیشرفت جلسه‌به‌جلسه — GET /ot/progress (m162)', () => {
  let A: ReturnType<typeof createTestApp>;
  let therapist: Api;
  let secretary: Api;
  let manager: Api;
  let maryam: Api;
  let studentId = '';

  beforeAll(async () => {
    A = createTestApp();
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    manager = await asRole(A, 'manager');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    // مالک پرونده = درمانگر — RBAC موتور OT: درمانگرِ غیرمسئول ۴۰۳
    const s = await createStudent(therapist, { first_name: 'نیما', last_name: 'روندپیمای', pathway: 'rehab' });
    studentId = s.id;
  });

  it('پروندهٔ نو — تایم‌لاین خالی، خط پایهٔ ثبت‌نشده، جمع‌بندی صفر', async () => {
    const res = await therapist.get(`/api/students/${studentId}/ot/progress`);
    expect(res.status).toBe(200);
    const body = dataOf(res);
    expect(body.sessions).toEqual([]);
    expect(body.baseline).toBeNull();
    expect(body.baselineSummary).toBeNull();
    expect(body.baselineAt).toBeNull();
    expect(body.summary).toEqual({ sessions: 0, confirmedMastered: 0, withHelp: 0, lastAt: null });
  });

  it('دو جلسه — شمار هر جلسه، تسلط دوجلسه‌ای تأییدشده، توزیع راهنما، شمار حیطه‌ای', async () => {
    const s1 = await therapist.post(`/api/students/${studentId}/ot/sessions`, {
      items: [
        { skill_id: 'ot-gross-01', status: 'mastered' },
        { skill_id: 'ot-gross-02', status: 'with_help', prompt_level: 'verbal' },
        { skill_id: 'ot-gross-03', status: 'not_yet' }
      ],
      focus: 'حرکات درشت'
    });
    expect(s1.status).toBe(201);
    await sleep(10);
    const s2 = await therapist.post(`/api/students/${studentId}/ot/sessions`, {
      items: [
        { skill_id: 'ot-gross-01', status: 'mastered' }, // دوجلسه‌ای → تأیید
        { skill_id: 'ot-aud-01', status: 'with_help', prompt_level: 'gestural' }
      ]
    });
    expect(s2.status).toBe(201);

    const body = dataOf(await therapist.get(`/api/students/${studentId}/ot/progress`));
    expect(body.summary.sessions).toBe(2);
    expect(body.summary.confirmedMastered).toBe(1);
    expect(body.summary.withHelp).toBe(2);
    expect(body.summary.lastAt).toBeTruthy();

    expect(body.sessions).toHaveLength(2);
    expect(body.sessions.map((s) => s.ord)).toEqual([1, 2]);
    // ترتیب زمانی صعودی — جلسهٔ اول قبل از دوم
    expect(body.sessions[0].occurredAt <= body.sessions[1].occurredAt).toBe(true);

    const first = body.sessions[0];
    expect(first.total).toBe(3);
    expect(first.mastered).toBe(1);
    expect(first.withHelp).toBe(1);
    expect(first.notYet).toBe(1);
    expect(first.confirmedNew).toBe(0); // جلسهٔ اول — هنوز تأیید نمی‌شود
    expect(first.prompts).toEqual({ verbal: 1 });
    const gross1 = first.domains.find((d) => d.key === 'gross')!;
    expect(gross1).toEqual({ key: 'gross', mastered: 1, withHelp: 1, notYet: 1 });
    expect(first.domains.find((d) => d.key === 'cognitive')!.mastered).toBe(0);

    const second = body.sessions[1];
    expect(second.total).toBe(2);
    expect(second.mastered).toBe(1);
    expect(second.withHelp).toBe(1);
    expect(second.confirmedNew).toBe(1); // ot-gross-01 دوجلسه‌ای تأیید شد
    expect(second.prompts).toEqual({ gestural: 1 });
    expect(second.domains.find((d) => d.key === 'gross')!.mastered).toBe(1);
    expect(second.domains.find((d) => d.key === 'auditory')!.withHelp).toBe(1);
  });

  it('خط پایهٔ عملکردی — از آخرین ce-rehab-fx-v1؛ ثبت دوم جایگزین می‌شود', async () => {
    // خط پایهٔ اول — نیم‌رخ ضعیف (سه حیطه ضعیف + راهنمای ثبت‌شده)
    const weak = await therapist.post(`/api/students/${studentId}/case-events/rehab-fx`, {
      values: {
        d_att_sus: 3, d_att_sel: 8, d_wm: 2, d_inh: 1, d_flex: 1, d_ps: 7,
        p_att_sus: 'راهنمای کلامی', p_wm: 'لمسی جزئی'
      }
    });
    expect(weak.status).toBe(201);
    await sleep(10);
    // خط پایهٔ دوم — نیم‌رخ قوی؛ «آخرین ثبت» باید ملاک باشد
    const strong = await therapist.post(`/api/students/${studentId}/case-events/rehab-fx`, {
      values: {
        d_att_sus: 12, d_att_sel: 1, d_wm: 5, d_inh: 1, d_flex: 0, d_ps: 10,
        p_att_sus: 'بدون راهنما', p_wm: 'بدون راهنما'
      }
    });
    expect(strong.status).toBe(201);

    const body = dataOf(await therapist.get(`/api/students/${studentId}/ot/progress`));
    expect(body.baseline).toHaveLength(6);
    expect(body.baselineAt).toBeTruthy();
    expect(body.baselineSummary).toContain('۶ حیطه در انتظار');
    const attSus = body.baseline!.find((b) => b.key === 'att_sus')!;
    expect(attSus.label).toBe('توجه پایدار');
    expect(attSus.valueFa).toContain('۱۲');
    expect(attSus.band).toBe('در انتظار');
    expect(attSus.color).toBe('ok');
    expect(attSus.prompt).toBe('بدون راهنما');
    const wm = body.baseline!.find((b) => b.key === 'wm')!;
    expect(wm.valueFa).toContain('رقم'); // واحد از label فیلد payload می‌آید
    // تایم‌لاین جلسات دست‌نخورده — خط پایه فقط بخش پایه را پر می‌کند
    expect(body.summary.sessions).toBe(2);
  });

  it('ردیف بدون جلسه = جلسهٔ مستقل (raw:*)؛ ردیف نامعتبر نادیده؛ مکمل‌ها شمرده نمی‌شوند', async () => {
    const now = new Date().toISOString();
    // ردیف با وضعیت نامعتبر — نادیده گرفته می‌شود
    A.sql.prepare(
      `INSERT INTO ot_progress (id, student_id, skill_id, status, session_id, occurred_at, created_at)
       VALUES ('op-invalid', ?, 'ot-gross-04', 'magic', 'sess-x', ?, ?)`
    ).run(studentId, now, now);
    // ردیف بدون جلسه — مستقل شمرده می‌شود
    A.sql.prepare(
      `INSERT INTO ot_progress (id, student_id, skill_id, status, session_id, occurred_at, created_at)
       VALUES ('op-legacy', ?, 'ot-gross-05', 'with_help', NULL, ?, ?)`
    ).run(studentId, now, now);
    // ردیف مهارت مکمل (غیر primary) — خارج از شمارش
    const sec = A.sql.prepare(`SELECT id FROM ot_skills WHERE COALESCE(is_primary, 1) = 0 LIMIT 1`).get() as { id: string } | undefined;
    if (sec) {
      A.sql.prepare(
        `INSERT INTO ot_progress (id, student_id, skill_id, status, session_id, occurred_at, created_at)
         VALUES ('op-secondary', ?, ?, 'mastered', 'sess-sec', ?, ?)`
      ).run(studentId, sec.id, now, now);
    }

    const body = dataOf(await therapist.get(`/api/students/${studentId}/ot/progress`));
    // دو جلسهٔ ثبت‌شدهٔ قبلی + جلسهٔ مستقل legacy = ۳ (ردیف نامعتبر و مکمل شمرده نمی‌شوند)
    expect(body.summary.sessions).toBe(3);
    const legacy = body.sessions.find((s) => s.sessionId.startsWith('raw:'));
    expect(legacy).toBeTruthy();
    expect(legacy!.total).toBe(1);
    expect(legacy!.withHelp).toBe(1);
  });

  it('RBAC — منشی/مدیر ۲۰۰؛ درمانگرِ غیرمسئول ۴۰۳؛ پروندهٔ ناموجود ۴۰۴', async () => {
    expect((await secretary.get(`/api/students/${studentId}/ot/progress`)).status).toBe(200);
    expect((await manager.get(`/api/students/${studentId}/ot/progress`)).status).toBe(200);
    expect((await maryam.get(`/api/students/${studentId}/ot/progress`)).status).toBe(403);
    expect((await therapist.get('/api/students/00000000-0000-0000-0000-00000000dead/ot/progress')).status).toBe(404);
  });
});
