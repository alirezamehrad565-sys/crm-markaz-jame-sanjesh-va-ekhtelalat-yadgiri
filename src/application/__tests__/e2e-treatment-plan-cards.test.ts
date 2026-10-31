// طرح درمان کارت‌محور: کارت v2 (done/linkId)، انواع probe/family، جابه‌جایی جلسات،
// کارت‌های قبلی تیم، کپی هدف/معیار از قالب به جلسه، و اصلاح باگ پاک‌شدن هدف در toggle وضعیت
import { describe, it, expect, beforeAll } from 'vitest';
import {
  createTestApp,
  Api,
  asRole,
  loginToken,
  createStudent
} from '../../test/harness';

interface CardItem {
  type: string;
  text: string;
  done: boolean;
  linkId: string | null;
}
interface SessionBody {
  id: string;
  ord: number;
  title: string;
  plan: string | null;
  criterion: string | null;
  outcome: string | null;
  note?: string | null;
  items: CardItem[];
  status: string;
}
interface PathBody {
  id: string;
  status: string;
  sessions: SessionBody[];
}
interface TemplateBody {
  key: string;
  title: string;
  sessions: { title: string; plan: string | null; criterion: string | null; items: CardItem[] }[];
}

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

describe('طرح درمان: نویسندهٔ کارت‌محور', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let sec: Api;
  let ali: Api;
  let exerciseId: string;

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    sec = await asRole(A, 'secretary');
    ali = await asRole(A, 'therapist');
    const ex = await mgr.post('/api/exercises', { title: 'تمرین آگاهی واجی — حذف آوای اول', format: 'worksheet' });
    expect(ex.status).toBe(201);
    exerciseId = dataOf<{ id: string }>(ex).id;
  });

  it('قالب طرح درمان با هدف/معیار جلسه + کارت پیوسته/پراپ/خانواده → ۲۰۱ و خواندن همان شکل', async () => {
    const res = await ali.post('/api/pathway-templates', {
      key: 'tpl--reading',
      title: 'طرح درمان خواندن — هشت جلسه',
      description: 'چرخهٔ کامل آگاهی واجی تا روان‌خوانی',
      protocol: 'learning',
      target_key: 'dyslexia',
      sessions: [
        {
          title: 'جلسهٔ ۱ — خط‌مایهٔ آگاهی واجی',
          plan: 'آشنایی کودک با تفکیک آواهای اول واژه',
          criterion: 'حذف درست آوای اول در ۸۰٪ ایتم‌های پراپ',
          items: [
            { type: 'exercise', text: 'تمرین آگاهی واجی — حذف آوای اول', link_id: exerciseId },
            { type: 'probe', text: 'پراپ: واژه در دقیقه — خط پایه' },
            { type: 'family', text: 'آموزش والدین: اجرای تمرین در خانه (۱۰ دقیقه)' }
          ]
        },
        {
          title: 'جلسهٔ ۲ — ادغام',
          plan: 'تثبیت تفکیک آواها با بازی',
          items: [{ type: 'game', text: 'بازی کارت‌های هم‌خانواده' }]
        }
      ]
    });
    expect(res.status).toBe(201);
    const tpl = dataOf<TemplateBody>(res);
    expect(tpl.sessions[0].plan).toContain('آوا');
    expect(tpl.sessions[0].criterion).toContain('۸۰٪');
    const items = tpl.sessions[0].items;
    expect(items).toHaveLength(3);
    expect(items[0].linkId).toBe(exerciseId);
    expect(items[0].done).toBe(false); // تیک در قالب بی‌معناست
    expect(items[1].type).toBe('probe');
    expect(items[2].type).toBe('family');
  });

  it('کارت پیوسته به تمرین ناموجود → ۴۰۰ (اعتبارسنجی تزریقی بانک)', async () => {
    const res = await ali.post('/api/pathway-templates', {
      key: 'tpl--badlink',
      title: 'طرح با لینک شکسته',
      sessions: [
        { title: 'جلسهٔ بی‌لینک سالم', items: [{ type: 'exercise', text: 'کارت یتیم', link_id: '99999999-9999-4999-8999-999999999999' }] }
      ]
    });
    expect(res.status).toBe(400);
    expect((res.body as { error?: { code?: string } }).error?.code ?? (res.body as { error?: string }).error).toContain('VALIDATION_ERROR');
  });

  it('ساخت مسیر از قالب → هدف/معیار جلسه کپی می‌شود؛ تیک کارت صفر می‌ماند', async () => {
    const studentId = (await createStudent(ali)).id;
    const res = await ali.post(`/api/students/${studentId}/clinical-paths`, {
      template_key: 'tpl--reading',
      target_key: 'dyslexia'
    });
    expect(res.status).toBe(201);
    const path = dataOf<PathBody>(res);
    expect(path.sessions).toHaveLength(2);
    expect(path.sessions[0].plan).toContain('آوا');
    expect(path.sessions[0].criterion).toContain('۸۰٪');
    expect(path.sessions[0].items[0].linkId).toBe(exerciseId);
    expect(path.sessions[0].items.every((it) => it.done === false)).toBe(true);
  });

  it('toggle وضعیت جلسه هدف/معیار/یادداشت را پاک نمی‌کند (اصلاح باگ )', async () => {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl--reading', target_key: 'dyslexia' });
    const path = dataOf<PathBody>(created);
    const sid = path.sessions[0].id;
    // اصلاح متن هدف و یادداشت؛ بعد فقط وضعیت را عوض می‌کنیم
    await ali.patch(`/api/clinical-paths/${path.id}/sessions/${sid}`, { plan: 'هدف اصلاح‌شده', note: 'یادداشت درمانگر' });
    const done = await ali.patch(`/api/clinical-paths/${path.id}/sessions/${sid}`, { status: 'done' });
    expect(done.status).toBe(200);
    const list = dataOf<PathBody[]>(
      await ali.get(`/api/students/${studentId}/clinical-paths`)
    );
    const s = list.find((p) => p.id === path.id)!.sessions.find((x) => x.id === sid)!;
    expect(s.plan).toBe('هدف اصلاح‌شده');
    expect(s.note).toBe('یادداشت درمانگر');
    expect(s.criterion).toContain('۸۰٪');
    expect(s.status).toBe('done');
  });

  it('تیک کارت (done) با PATCH آیتم‌ها ذخیره و برگردانده می‌شود', async () => {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl--reading', target_key: 'dyslexia' });
    const path = dataOf<PathBody>(created);
    const s = path.sessions[0];
    const items = s.items.map((it, i) => ({ ...it, done: i === 0 }));
    const res = await ali.patch(`/api/clinical-paths/${path.id}/sessions/${s.id}`, { items });
    expect(res.status).toBe(200);
    const saved = dataOf<SessionBody>(res);
    expect(saved.items[0].done).toBe(true);
    expect(saved.items[1].done).toBe(false);
  });

  it('جابه‌جایی جلسات — ترتیب کامل با یک فراخوان؛ شمارش غلط/تکراری ۴۰۰؛ منشی ۴۰۳', async () => {
    const studentId = (await createStudent(ali)).id;
    const created = await ali.post(`/api/students/${studentId}/clinical-paths`, { template_key: 'tpl--reading', target_key: 'dyslexia' });
    const path = dataOf<PathBody>(created);
    // جلسهٔ سوم اضافه می‌کنیم
    const add = await ali.post(`/api/clinical-paths/${path.id}/sessions`, { title: 'جلسهٔ ۳ — روان‌خوانی', criterion: '۹۰ واژه در دقیقه' });
    expect(add.status).toBe(201);
    const ids = [path.sessions[1].id, path.sessions[0].id, dataOf<SessionBody>(add).id];

    expect((await sec.post(`/api/clinical-paths/${path.id}/sessions/reorder`, { session_ids: ids })).status).toBe(403);
    expect((await ali.post(`/api/clinical-paths/${path.id}/sessions/reorder`, { session_ids: ids.slice(0, 2) })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${path.id}/sessions/reorder`, { session_ids: [...ids, ids[0]] })).status).toBe(400);
    expect((await ali.post(`/api/clinical-paths/${path.id}/sessions/reorder`, { session_ids: [ids[0], ids[0], ids[2]] })).status).toBe(400);

    const ok = await ali.post(`/api/clinical-paths/${path.id}/sessions/reorder`, { session_ids: ids });
    expect(ok.status).toBe(200);
    const sessions = dataOf<SessionBody[]>(ok);
    expect(sessions.map((s) => s.id)).toEqual(ids);
    expect(sessions.map((s) => s.ord)).toEqual([1, 2, 3]);
    expect(sessions[0].title).toContain('ادغام'); // جلسهٔ ۲ حالا اول است
  });

  it('کارت‌های قبلی تیم — دیکشانده با شمارندهٔ استفاده؛ منشی ۴۰۳', async () => {
    expect((await sec.get('/api/clinical-cards')).status).toBe(403);
    const res = await ali.get('/api/clinical-cards');
    expect(res.status).toBe(200);
    const cards = dataOf<{ type: string; text: string; usageCount: number; linkId: string | null }[]>(res);
    // «تمرین آگاهی واجی» هم در قالب و هم در جلسات کپی‌شدهٔ دو مسیر → حداقل ۳ بار
    const card = cards.find((c) => c.text.includes('حذف آوای اول'));
    expect(card).toBeDefined();
    expect(card!.usageCount).toBeGreaterThanOrEqual(3);
    expect(card!.linkId).toBe(exerciseId);
    // پراپ و خانواده هم در فهرست‌اند
    expect(cards.some((c) => c.type === 'probe')).toBe(true);
    expect(cards.some((c) => c.type === 'family')).toBe(true);
    // بدون تکرار — کلیدهای یکتا
    const keys = cards.map((c) => `${c.type}:${c.text}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('فرمت «آموزش خانواده» در بانک + فیلتر format', async () => {
    const fam = await mgr.post('/api/exercises', { title: 'راهنمای والدین — روتین تکلیف', format: 'family' });
    expect(fam.status).toBe(201);
    const famOnly = dataOf<{ items: { format: string }[]; total: number }>(
      await mgr.get('/api/exercises?format=family&page_size=50')
    );
    expect(famOnly.total).toBe(1);
    expect(famOnly.items[0].format).toBe('family');
    const gameOnly = dataOf<{ items: { format: string }[] }>(
      await mgr.get('/api/exercises?format=game&page_size=50')
    );
    expect(gameOnly.items.every((e) => e.format === 'game')).toBe(true);
  });
});
