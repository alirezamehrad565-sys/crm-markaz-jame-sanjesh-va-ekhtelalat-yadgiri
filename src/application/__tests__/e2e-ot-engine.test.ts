/**
 * تست‌های e2e — ot-engine
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e-ot-engine.test.ts — /: فلو دوفازی شناسایی → مداخله + چک‌لیست ۷ حیطه‌ای کاردرمانی ذهنی
//: تازگی ۱۲ماههٔ گیت‌ها، حداقل ۳ نمره در حیطه، قاعدهٔ تسلط دوجلسه‌ای، سطح راهنمای «با کمک»،
// مهارت‌های primary/مکمل، پیشنهاد نیاز→پروتکل، snapshot گیت‌ها در ثبت نیاز

import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent
} from '../../test/harness';

interface GateBody {
  key: string;
  label: string;
  done: boolean;
  detail: string;
}

interface GatesBody {
  phase: 'identification' | 'intervention';
  protocol: string | null;
  gates: GateBody[];
  otCoverage: { scored: number; total: number; domainsCovered: number; domainsMin3: number; domainTitles: string[] };
  protocolSuggestions: Record<string, { protocol: string; secondary: string | null } | null>;
}

interface SkillState {
  skillId: string;
  ord: number;
  status: string | null;
  firstStatus: string | null;
  masteryConfirmed: boolean;
  promptLevel: string | null;
  expectedAge: string | null;
  isPrimary: boolean;
  latestNote: string | null;
  sessions: number;
}

interface ProfileBody {
  domains: { key: string; title: string; skills: SkillState[]; resumeSkillId: string | null; mastered: number; masteredPending: number; withHelp: number; scored: number; total: number; totalAll: number }[];
  totals: { scored: number; total: number; mastered: number; masteredPending: number; withHelp: number; notYet: number; secondarySkills: number; sessions: number; lastSessionAt: string | null };
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('/ — گیت‌های شناسایی و RBAC', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api; // درمانگر مسئول
  let maryam: Api; // درمانگر دیگر
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    studentId = (await createStudent(ali)).id;
  });

  it('پروندهٔ نو → فاز شناسایی با ۵ گیتِ ثبت‌نشده + پیشنهاد پروتکل', async () => {
    const res = await ali.get(`/api/students/${studentId}/clinical-gates`);
    expect(res.status).toBe(200);
    const body = dataOf<GatesBody>(res);
    expect(body.phase).toBe('identification');
    expect(body.protocol).toBeNull();
    expect(body.gates).toHaveLength(5);
    expect(body.gates.every((g) => !g.done)).toBe(true);
    expect(body.gates.map((g) => g.key)).toEqual(['anamnesis', 'behavioral', 'wechsler', 'skills', 'needs']);
    expect(body.otCoverage.total).toBe(83); // — فقط primary (۸۴ − ۱ مکمل دکمه/زیپ)
    expect(body.otCoverage.scored).toBe(0);
    expect(body.otCoverage.domainsMin3).toBe(0);
    // نگاشت پیشنهاد نیاز→پروتکل
    expect(body.protocolSuggestions.dyslexia?.protocol).toBe('learning');
    expect(body.protocolSuggestions.slow_learner?.protocol).toBe('slow_learner');
    expect(body.protocolSuggestions.adhd?.protocol).toBe('mental_ot');
    expect(body.protocolSuggestions.other).toBeNull();
  });

  it('RBAC — گیت‌ها: مسئول/مدیر/منشی ۲۰۰؛ درمانگرِ غیرمسئول ۴۰۳', async () => {
    expect((await ali.get(`/api/students/${studentId}/clinical-gates`)).status).toBe(200);
    expect((await mgr.get(`/api/students/${studentId}/clinical-gates`)).status).toBe(200);
    expect((await sec.get(`/api/students/${studentId}/clinical-gates`)).status).toBe(200);
    expect((await maryam.get(`/api/students/${studentId}/clinical-gates`)).status).toBe(403);
  });

  it('RBAC — ثبت جلسهٔ کاردرمانی: منشی ۴۰۳؛ درمانگرِ غیرمسئول ۴۰۳', async () => {
    const items = [{ skill_id: 'ot-gross-01', status: 'mastered' }];
    expect((await sec.post(`/api/students/${studentId}/ot/sessions`, { items })).status).toBe(403);
    expect((await maryam.post(`/api/students/${studentId}/ot/sessions`, { items })).status).toBe(403);
  });

  it('شناسهٔ مهارت نامعتبر → ۴۰۰', async () => {
    const res = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [{ skill_id: 'ot-nope-99', status: 'mastered' }]
    });
    expect(res.status).toBe(400);
  });

  it('«با کمک» بدون سطح راهنما → ۴۰۰؛ سطح نامعتبر → ۴۰۰', async () => {
    const noPrompt = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [{ skill_id: 'ot-gross-05', status: 'with_help' }]
    });
    expect(noPrompt.status).toBe(400);
    const badPrompt = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [{ skill_id: 'ot-gross-05', status: 'with_help', prompt_level: 'magic' }]
    });
    expect(badPrompt.status).toBe(400);
  });

  it('ثبت شرح‌حال تازه → گیت شرح‌حال سبز می‌شود (تازگی ۱۲ماهه)', async () => {
    const typeRow = await A.db.queryOne<{ id: string }>(`SELECT id FROM case_event_types WHERE key = 'ce-anamnesis-v2'`);
    expect(typeRow).toBeTruthy();
    const iso = new Date().toISOString();
    await A.db.execute(
      `INSERT INTO case_events (id, event_type_id, student_id, occurred_at, status, payload, summary, created_by)
       VALUES (?, ?, ?, ?, 'completed', '{}', 'شرح‌حال تست', 'e2e')`,
      [crypto.randomUUID(), typeRow!.id, studentId, iso]
    );
    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentId}/clinical-gates`));
    const anam = gates.gates.find((g) => g.key === 'anamnesis')!;
    expect(anam.done).toBe(true);
    expect(anam.detail).toBe('ثبت شده');
  });
});

describe('/ — پروفایل مهارتی، نقطهٔ ادامه، تسلط دوجلسه‌ای و ثبت جلسه', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let mgr: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    ali = await asRole(A, 'therapist');
    studentId = (await createStudent(ali)).id;
  });

  it('پروفایل نو — ۷ حیطه، بازهٔ سنی، primary/مکمل، ترتیب سختی', async () => {
    const res = await ali.get(`/api/students/${studentId}/ot/profile`);
    expect(res.status).toBe(200);
    const body = dataOf<ProfileBody>(res);
    expect(body.domains).toHaveLength(7);
    expect(body.totals.total).toBe(83); // فقط primary
    expect(body.totals.secondarySkills).toBe(1);
    for (const d of body.domains) {
      expect(d.skills).toHaveLength(12);
      expect(d.skills.map((s) => s.ord)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
      expect(d.resumeSkillId).toBe(d.skills[0].skillId); // همه نمره‌نخورده → نقطهٔ ادامه = مهارت ۱
      expect(d.skills.every((s) => s.expectedAge)).toBe(true); // — بازهٔ سنی
    }
    const adl = body.domains.find((d) => d.key === 'adl')!;
    expect(adl.total).toBe(11); // ۱۲ − ۱ مکمل (دکمه/زیپ روی خود)
    expect(adl.totalAll).toBe(12);
    const sec8 = adl.skills.find((s) => s.skillId === 'ot-adl-08')!;
    expect(sec8.isPrimary).toBe(false);
    expect(body.totals.sessions).toBe(0);
  });

  it('ثبت جلسه — با سطح راهنما؛ تسلط تک‌جلسه‌ای هنوز تأیید نیست؛ نقطهٔ ادامه ثابت می‌ماند', async () => {
    const res = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [
        { skill_id: 'ot-gross-01', status: 'mastered' },
        { skill_id: 'ot-gross-02', status: 'with_help', prompt_level: 'verbal', note: 'تعادل روی پای چپ ضعیف‌تر' }
      ],
      focus: 'حرکات درشت',
      summary: 'واکنش خوب به بازی توپ',
      homework: 'پرش دوپا روزی ۱۰ بار'
    });
    expect(res.status).toBe(201);
    const saved = dataOf<{ sessionId: string; saved: number; masteryConfirmed: number; summary: string }>(res);
    expect(saved.saved).toBe(2);
    expect(saved.masteryConfirmed).toBe(0); // جلسهٔ اول — هنوز تأیید نمی‌شود
    expect(saved.summary).toContain('جلسهٔ کاردرمانی ذهنی');

    // تکرار همان مهارت در یک درخواست → dedupe (آخرین وضعیت)
    const dup = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [
        { skill_id: 'ot-gross-03', status: 'not_yet' },
        { skill_id: 'ot-gross-03', status: 'with_help', prompt_level: 'gestural' }
      ]
    });
    expect(dup.status).toBe(201);
    expect(dataOf<{ saved: number }>(dup).saved).toBe(1);

    const prof = dataOf<ProfileBody>(await ali.get(`/api/students/${studentId}/ot/profile`));
    expect(prof.totals.scored).toBe(3);
    expect(prof.totals.sessions).toBe(2);
    const gross = prof.domains.find((d) => d.key === 'gross')!;
    expect(gross.mastered).toBe(0); // — تسلط تک‌جلسه‌ای تأیید نیست
    expect(gross.masteredPending).toBe(1);
    expect(gross.withHelp).toBe(2);
    // نقطهٔ ادامه = اولین primary بدون تسلط دوجلسه‌ای → ot-gross-01 هنوز معلق است
    expect(gross.resumeSkillId).toBe('ot-gross-01');
    const s1 = gross.skills.find((s) => s.skillId === 'ot-gross-01')!;
    expect(s1.status).toBe('mastered');
    expect(s1.masteryConfirmed).toBe(false);
    const s2 = gross.skills.find((s) => s.skillId === 'ot-gross-02')!;
    expect(s2.status).toBe('with_help');
    expect(s2.firstStatus).toBe('with_help');
    expect(s2.promptLevel).toBe('verbal');
    expect(s2.sessions).toBe(1);
    expect(s2.latestNote).toContain('تعادل');
    const s3 = gross.skills.find((s) => s.skillId === 'ot-gross-03')!;
    expect(s3.status).toBe('with_help'); // آخرین وضعیت ملاک است (dedupe)
    expect(s3.promptLevel).toBe('gestural');

    // گزارش جلسه در تایم‌لاین (case_events) — رکورد typeTitle دارد
    const events = dataOf<{ typeTitle?: string }[]>(await ali.get(`/api/students/${studentId}/case-events`));
    expect(events.some((e) => e.typeTitle === 'جلسهٔ کاردرمانی ذهنی — ثبت درمانگر')).toBe(true);
  });

  it('جلسهٔ دوم «بلد است» → تسلط دوجلسه‌ای تأیید و نقطهٔ ادامه جلو می‌رود', async () => {
    const res = await ali.post(`/api/students/${studentId}/ot/sessions`, {
      items: [{ skill_id: 'ot-gross-01', status: 'mastered' }]
    });
    expect(res.status).toBe(201);
    expect(dataOf<{ masteryConfirmed: number }>(res).masteryConfirmed).toBe(1);

    const prof = dataOf<ProfileBody>(await ali.get(`/api/students/${studentId}/ot/profile`));
    const gross = prof.domains.find((d) => d.key === 'gross')!;
    expect(gross.mastered).toBe(1);
    expect(gross.masteredPending).toBe(0);
    // ترتیب جدید: چهاردست‌وپا (ot-gross-03) ردیف ۲ است؛ بعد از تأیید مهارت ۱، ادامه از آن‌جاست
    expect(gross.resumeSkillId).toBe('ot-gross-03');
  });

  it('گیت مهارتی با حداقل ۳ نمره در هر ۷ حیطه سبز می‌شود', async () => {
    // gross: ۳ مهارت نمره‌گرفته (۰۱، ۰۲، ۰۳) — برای ۶ حیطهٔ دیگر ۳ نمونه ثبت می‌شود
    const rest = ['fine', 'visual', 'aud', 'cog', 'adl', 'soc'];
    const items = rest.flatMap((d) =>
      ['01', '02', '03'].map((n) => ({ skill_id: `ot-${d}-${n}`, status: 'not_yet' as const }))
    );
    expect(items).toHaveLength(18);
    expect((await ali.post(`/api/students/${studentId}/ot/sessions`, { items })).status).toBe(201);

    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentId}/clinical-gates`));
    const skillsGate = gates.gates.find((g) => g.key === 'skills')!;
    expect(skillsGate.done).toBe(true);
    expect(gates.otCoverage.domainsCovered).toBe(7);
    expect(gates.otCoverage.domainsMin3).toBe(7);
    expect(gates.phase).toBe('identification'); // هنوز نیاز ویژه ثبت نشده
  });
});

describe('/ — نتیجهٔ نیاز ویژه و فعال‌سازی پروتکل', () => {
  let A: ReturnType<typeof createTestApp>;
  let ali: Api;
  let sec: Api;
  let maryam: Api;
  let studentId: string;

  beforeAll(async () => {
    A = createTestApp();
    ali = await asRole(A, 'therapist');
    sec = await asRole(A, 'secretary');
    maryam = new Api(A, await loginToken(A, 'maryam'));
    studentId = (await createStudent(ali)).id;
  });

  it('نیاز ویژه با مقدار نامعتبر → ۴۰۰', async () => {
    expect((await ali.post(`/api/students/${studentId}/needs-summary`, {
      need_type: 'nope', protocol: 'mental_ot'
    })).status).toBe(400);
    expect((await ali.post(`/api/students/${studentId}/needs-summary`, {
      need_type: 'slow_learner', protocol: 'bogus'
    })).status).toBe(400);
  });

  it('RBAC — منشی/درمانگرِ غیرمسئول ۴۰۳', async () => {
    const body = { need_type: 'slow_learner', protocol: 'mental_ot' };
    expect((await sec.post(`/api/students/${studentId}/needs-summary`, body)).status).toBe(403);
    expect((await maryam.post(`/api/students/${studentId}/needs-summary`, body)).status).toBe(403);
  });

  it('پروتکل پشتیبان هم‌سان با اصلی → ۴۰۰', async () => {
    const res = await ali.post(`/api/students/${studentId}/needs-summary`, {
      need_type: 'slow_learner', protocol: 'mental_ot', protocol_secondary: 'mental_ot'
    });
    expect(res.status).toBe(400);
  });

  it('ثبت نیاز ویژه → پروتکل فعال، فاز مداخله، رویداد تایم‌لاین', async () => {
    const res = await ali.post(`/api/students/${studentId}/needs-summary`, {
      need_type: 'slow_learner',
      protocol: 'mental_ot',
      protocol_secondary: 'learning',
      evidence: 'وکسلر FSIQ=78 — ضعف پراکنده در حیطه‌های حرکتی',
      goals: 'پیمایش کامل حیطهٔ حرکات درشت تا جلسهٔ دهم',
      session_plan: 'هفته‌ای ۲ جلسهٔ کاردرمانی ذهنی'
    });
    expect(res.status).toBe(201);
    const body = dataOf<{ protocol: string; needTypeLabel: string }>(res);
    expect(body.protocol).toBe('mental_ot');
    expect(body.needTypeLabel).toContain('دیرآموز');

    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentId}/clinical-gates`));
    expect(gates.phase).toBe('intervention');
    expect(gates.protocol).toBe('mental_ot');
    const needsGate = gates.gates.find((g) => g.key === 'needs')!;
    expect(needsGate.done).toBe(true);
    expect(needsGate.detail).toContain('کاردرمانی ذهنی');

    const events = dataOf<{ typeTitle?: string; summary?: string }[]>(await ali.get(`/api/students/${studentId}/case-events`));
    const needsEvent = events.find((e) => e.typeTitle === 'نتیجهٔ نیاز ویژه — جمع‌بندی شناسایی');
    expect(needsEvent).toBeDefined();
    expect(needsEvent!.summary).toContain('دیرآموز');
  });

  it('نیازهای تکمیلی (ناتوانی هوشی/تأخیر رشدی/ارتباط اجتماعی/تیک) پذیرفته می‌شوند', async () => {
    for (const nt of ['intellectual_disability', 'global_developmental_delay', 'social_communication', 'tic']) {
      const res = await ali.post(`/api/students/${studentId}/needs-summary`, {
        need_type: nt, protocol: 'mental_ot'
      });
      expect(res.status).toBe(201);
      const body = dataOf<{ needTypeLabel: string }>(res);
      expect(body.needTypeLabel.length).toBeGreaterThan(3);
    }
  });

  it('ثبت مجدد نیاز ویژه → پروتکل جایگزین می‌شود (بازسنجی)', async () => {
    const res = await ali.post(`/api/students/${studentId}/needs-summary`, {
      need_type: 'dyslexia', protocol: 'learning'
    });
    expect(res.status).toBe(201);
    const gates = dataOf<GatesBody>(await ali.get(`/api/students/${studentId}/clinical-gates`));
    expect(gates.protocol).toBe('learning');
  });
});
