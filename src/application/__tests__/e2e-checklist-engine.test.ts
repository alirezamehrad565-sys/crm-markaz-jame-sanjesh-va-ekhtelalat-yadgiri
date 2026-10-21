/**
 * تست‌های e2e — -checklist-engine
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 */
// e2e--checklist-engine.test.ts — موتور تشخیص و مداخله — فاز ۱ (رویدادساز هوشمند)
// کتابخانهٔ سنجش آماده (SDQ/کانرز/اخنباخ کاربردی/چک‌لیست معلم)، فرم‌ساز همگانی (سه نقش)،
// پیشنهاد قالب بر اساس برچسب‌های دانش‌آموز، ارسال یک‌کلیکی با بله (خانواده/معلم کلاس)،
// dedup همان دقیقه، صف «در انتظار پاسخ» و قالب پیام bot_checklist_link.

import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, asRole, createStudent } from '../../test/harness';
import { renderTemplate } from '@core/notify';

const ADHD_TAG = 'aaaaaaaa-0000-4000-8000-000000000004';

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

interface Suggestion {
  type: { id: string; key: string; title: string; audience: string; tags: string[]; category: string };
  matched: { id: string; name: string }[];
  score: number;
}

interface PendingRow {
  id: string;
  studentId: string;
  studentName: string;
  typeTitle: string;
  typeAudience: string;
  sentCount: number;
  expired: boolean;
}

describe('کتابخانهٔ سنجش آماده (seed مهاجرت)', () => {
  it('قالب‌های استاندارد با مخاطب و برچسب seed شده‌اند — کانرز، اخنباخ کاربردی و چک‌لیست کلاس از غیرفعال (جایگزین: SNAP-IV و SDQ)', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const types = dataOf<Array<{ key: string; title: string; audience: string; tags: string[]; category: string }>>(
      await m.get('/api/case-events/types?active=true')
    );
    const byKey = Object.fromEntries(types.map((t) => [t.key, t]));
    expect(byKey['sdq-parent']).toBeTruthy();
    expect(byKey['sdq-parent'].audience).toBe('family');
    expect(byKey['sdq-parent'].category).toBe('checklist');
    // کانرز کوتاه با SNAP-IV والد/معلم جایگزین شد (پلن v2 §۴) — فعال نیست
    expect(byKey['conners-short']).toBeUndefined();
    // SNAP-IV والد: مخاطب خانواده + برچسب ADHD
    expect(byKey['ce-snap-iv-p-v1']).toBeTruthy();
    expect(byKey['ce-snap-iv-p-v1'].audience).toBe('family');
    expect(byKey['ce-snap-iv-p-v1'].tags).toContain(ADHD_TAG);
    // اخنباخ کاربردی و چک‌لیست کلاس در m132 غیرفعال شدند (فرم‌های موازی SDQ والد/معلم — فقط یک ابزار استاندارد برای هر منبع)
    expect(byKey['achenbach-practical']).toBeUndefined();
    expect(byKey['teacher-classroom']).toBeUndefined();
  });
});

describe('فرم‌ساز همگانی: منشی هم می‌سازد (دستور کاربر)', () => {
  it('منشی قالب جدید می‌سازد (مخاطب + برچسب) و غیرفعال می‌کند', async () => {
    const A = createTestApp();
    const sec = await asRole(A, 'secretary');
    const res = await sec.post('/api/case-events/types', {
      title: 'فرم پیگیری منشی',
      category: 'note',
      fields: [{ key: 'f1', label: 'یادداشت تماس', type: 'text', required: true }],
      audience: 'family',
      tags: [ADHD_TAG]
    });
    expect(res.status).toBe(201);
    const created = dataOf<{ id: string; audience: string; tags: string[] }>(res);
    expect(created.audience).toBe('family');
    expect(created.tags).toEqual([ADHD_TAG]);
    const deact = await sec.post(`/api/case-events/types/${created.id}/deactivate`, {});
    expect(deact.status).toBe(200);
  });
});

describe('موتور پیشنهاد بر اساس برچسب‌های دانش‌آموز', () => {
  it('دانش‌آموز با برچسب ADHD → SNAP-IV سر فهرست با matched؛ بدون برچسب → همه score=۰', async () => {
    const A = createTestApp();
    const m = await asRole(A, 'manager');
    const s = await createStudent(m, {});
    A.sql
      .prepare(`INSERT OR IGNORE INTO student_tags (student_id, tag_id) VALUES (?, ?)`)
      .run(s.id, ADHD_TAG);

    const sug = dataOf<Suggestion[]>(await m.get(`/api/students/${s.id}/case-events/suggest`));
    expect(sug.length).toBeGreaterThanOrEqual(4);
    // جای کانرز، SNAP-IV والد/معلم (هر دو با برچسب ADHD) سر فهرست‌اند
    expect(sug[0].score).toBeGreaterThanOrEqual(1);
    expect(sug[0].matched.some((x) => x.id === ADHD_TAG)).toBe(true);
    const matchedKeys = sug.filter((x) => x.score > 0).map((x) => x.type.key);
    expect(matchedKeys).toContain('ce-snap-iv-p-v1');
    expect(matchedKeys).toContain('ce-snap-iv-t-v1');
    // بقیهٔ فهرست هم قابل انتخاب می‌مانند — صرفاً بعد از تطبیقی‌ها
    // (T5: پکیج فرم جامع خانواده — دستهٔ session اما مسیر ارسال بله برای خانواده)
    // (T7: پکیج فرم جامع معلم — همان الگو، مسیر ارسال بله/لینک برای معلم منتخب)
    expect(sug.every((x) => x.type.category === 'checklist' || x.type.key === 'ce-comp-family-v2' || x.type.key === 'ce-comp-teacher-v2')).toBe(true);

    const s2 = await createStudent(m, {});
    const sug2 = dataOf<Suggestion[]>(await m.get(`/api/students/${s2.id}/case-events/suggest`));
    expect(sug2.every((x) => x.score === 0)).toBe(true);
  });
});

describe('ارسال یک‌کلیکی چک‌لیست با بله', () => {
  let A: ReturnType<typeof createTestApp>;
  let manager: Awaited<ReturnType<typeof asRole>>;
  let therapist: Awaited<ReturnType<typeof asRole>>;
  let secretary: Awaited<ReturnType<typeof asRole>>;
  let studentId = '';
  let sldReadId = '';
  let eventId = '';

  beforeAll(async () => {
    A = createTestApp();
    manager = await asRole(A, 'manager');
    therapist = await asRole(A, 'therapist');
    secretary = await asRole(A, 'secretary');
    const s = await createStudent(manager, { first_name: 'سارا', last_name: 'ارسال‌آزمون' });
    studentId = s.id;
    A.sql
      .prepare(
        `INSERT INTO bot_links (id, code, student_id, chat_id, status, created_by, created_at, updated_at)
         VALUES ('bb000000-7600-4000-8000-000000000001', 'M76CODE1', ?, '9101', 'linked', 'seed', datetime('now'), datetime('now'))`
      )
      .run(studentId);
    const types = dataOf<Array<{ id: string; key: string }>>(await manager.get('/api/case-events/types?active=true'));
    // چک‌لیست دشواری خواندن (مخاطب both) — جایگزین کانرز در این سناریو
    sldReadId = types.find((t) => t.key === 'ce-sld-read-v1')!.id;
    const ev = await therapist.post(`/api/students/${studentId}/case-events`, {
      eventTypeId: sldReadId,
      values: {},
      draft: false
    });
    expect(ev.status).toBe(201);
    const rec = dataOf<{ id: string; status: string; sentCount: number }>(ev);
    expect(rec.status).toBe('pending_family');
    expect(rec.sentCount).toBe(0);
    eventId = rec.id;
  });

  it('بدون چت معلم متصل → ۴۰۹ با پیام فارسی', async () => {
    const res = await therapist.post(`/api/case-events/${eventId}/send`, { audience: 'teacher' });
    expect(res.status).toBe(409);
    expect((res.body as { message: string }).message).toContain('معلم');
  });

  it('ارسال به خانواده → sent≥۱، رویداد شمارش می‌گیرد، صف «در انتظار پاسخ» نشان می‌دهد', async () => {
    const res = await therapist.post(`/api/case-events/${eventId}/send`, { audience: 'family' });
    expect(res.status).toBe(200);
    const out = dataOf<{ sent: number; targets: string[] }>(res);
    expect(out.sent).toBeGreaterThanOrEqual(1);
    expect(out.targets).toContain('9101');

    const rec = dataOf<{ sentCount: number; sentAt: string | null }>(
      await manager.get(`/api/case-events/${eventId}`)
    );
    expect(rec.sentCount).toBe(out.sent);
    expect(rec.sentAt).toBeTruthy();

    const pending = dataOf<PendingRow[]>(await manager.get('/api/case-events/pending'));
    const row = pending.find((p) => p.id === eventId);
    expect(row).toBeTruthy();
    expect(row!.studentName).toContain('سارا');
    expect(row!.typeAudience).toBe('both'); // مخاطب چک‌لیست دشواری خواندن = both
    expect(row!.sentCount).toBe(out.sent);
    expect(row!.expired).toBe(false);
  });

  it('ارسال فوری دوباره در همان دقیقه → dedup: sent=۰ (ضد دابل‌کلیک)', async () => {
    const res = await therapist.post(`/api/case-events/${eventId}/send`, { audience: 'family' });
    expect(res.status).toBe(200);
    expect(dataOf<{ sent: number }>(res).sent).toBe(0);
  });

  it('منشی هم می‌تواند ارسال کند (همگانی — همان دقیقه → sent=۰ ولی ۲۰۰)', async () => {
    const res = await secretary.post(`/api/case-events/${eventId}/send`, { audience: 'family' });
    expect(res.status).toBe(200);
    expect(dataOf<{ sent: number }>(res).sent).toBe(0);
  });

  it('قالب پیام bot_checklist_link — لینک امن و نام گیرنده در متن است', () => {
    const text = renderTemplate('bot_checklist_link', {
      studentName: 'سارا',
      extra: 'چک‌لیست «چک‌لیست دشواری خواندن — فرم خانواده و معلم (ملاک‌های DSM)»\nفرم امن (۷ روز اعتبار):\nhttps://center.test.example.com/public/case-events/x/fill?token=t'
    });
    expect(text).toContain('سارا');
    expect(text).toContain('خواندن');
    expect(text).toContain('https://center.test.example.com/public/case-events/x/fill?token=t');
    expect(text).toContain('نتیجه');
  });
});
