// پیش‌نمایش فقط-پرسنلی بازی (۱.۲۵.۲۰) — ممیزی فاز ۰ §۳.۱۰/U4:
// صدور پرسنلی (مدیر/درمانگر)، صفحهٔ بی‌کلید پاسخ، آیتم بی‌کلید، بازخورد بی‌نوشت،
// انقضای محترمانه؛ توکن کوتاه‌عمر جای احراز — هیچ رکورد بالینی ساخته نمی‌شود.
import { describe, it, expect, beforeAll } from 'vitest';
import { createTestApp, Api, asRole } from '../../test/harness';

interface PreviewBody { jti: string; token: string; url: string; expiresAt: string }

function dataOf<T>(res: { body: unknown }): T {
  return (res.body as { data: T }).data;
}

function gonogoBody(pkgId: string) {
  return {
    package_id: pkgId,
    version: '1.0.0',
    title_fa: 'بستهٔ پیش‌نمایش',
    evidence_level: 'B',
    dose: { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 4 },
    body: {
      package_id: pkgId,
      goals: ['inhibition'],
      mastery: { threshold: 85, sessions: 2 },
      tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
      missions: [{
        id: 'prev_m1', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo', title: 'پیش‌نمایش ستاره‌چین',
        items: [
          { id: 'pv-g1', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'سبز' }, correct_touch: true },
          { id: 'pv-g2', phase: 'train', type: 'touch_report', stim: { shape: 'circle', color: 'سبز' }, correct_touch: true },
          { id: 'pv-n1', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'آبی' }, correct_touch: false },
          { id: 'pv-g3', phase: 'train', type: 'touch_report', stim: { shape: 'heart', color: 'سبز' }, correct_touch: true },
          { id: 'pv-n2', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'آبی' }, correct_touch: false }
        ]
      }]
    }
  };
}

describe('پیش‌نمایش فقط-پرسنلی بازی (۱.۲۵.۲۰)', () => {
  let A: ReturnType<typeof createTestApp>;
  let mgr: Api;
  let secretary: Api;
  let anon: Api;
  let preview: PreviewBody;
  const PKG = 'attention-preview';

  beforeAll(async () => {
    A = createTestApp();
    mgr = await asRole(A, 'manager');
    secretary = await asRole(A, 'secretary');
    anon = new Api(A);
    const pkgRes = await mgr.post('/api/games/packages', gonogoBody(PKG));
    expect(pkgRes.status).toBe(201);
    const pubRes = await mgr.post(`/api/games/packages/${PKG}/1.0.0/publish`, {});
    expect(pubRes.status).toBe(200);
    const prevRes = await mgr.post('/api/games/preview', { package_id: PKG, version: '1.0.0' });
    expect(prevRes.status).toBe(201);
    preview = dataOf<PreviewBody>(prevRes);
  });

  it('صدور توکن پیش‌نمایش: نشانی /play/preview/ با انقضای ~۳۰ دقیقه', () => {
    expect(preview.url).toContain('/play/preview/');
    const age = new Date(preview.expiresAt).getTime() - Date.now();
    expect(age).toBeGreaterThan(0);
    expect(age).toBeLessThanOrEqual(31 * 60 * 1000);
  });

  it('ناشناس ۴۰۱ و منشی ۴۰۳ — صدور فقط مدیر/درمانگر', async () => {
    expect((await anon.post('/api/games/preview', { package_id: PKG, version: '1.0.0' })).status).toBe(401);
    expect((await secretary.post('/api/games/preview', { package_id: PKG, version: '1.0.0' })).status).toBe(403);
  });

  it('بستهٔ پیش‌نویس پیش‌نمایش نمی‌گیرد — فقط منتشرشده', async () => {
    await mgr.post('/api/games/packages', gonogoBody('attention-draft'));
    expect((await mgr.post('/api/games/preview', { package_id: 'attention-draft', version: '1.0.0' })).status).toBe(409);
  });

  it('صفحهٔ پیش‌نمایش: پخش‌کننده با data-protocol و بدون هیچ کلید پاسخی در DOM', async () => {
    const raw = await A.app.request(new URL(preview.url, 'http://test').pathname, {}, A.env as never);
    expect(raw.status).toBe(200);
    const html = await raw.text();
    expect(html).toContain('id="play-root"');
    expect(html).toContain('data-kind="gonogo"');
    expect(html).toContain('پیش‌نمایش درمانگر');
    expect(html).toContain('/assets/play/preview.js?v=');
    expect(html).toContain('/assets/play/play.css?v=');
    // تمایز با نسخهٔ شبح ۰۹: کلید پاسخ و شناسهٔ آیتم هرگز به صفحهٔ عمومی نمی‌رسد
    expect(html).not.toContain('correct_touch');
    expect(html).not.toContain('"correct"');
    expect(html).not.toContain('pv-g1');
    expect(html).not.toContain('pv-n2');
  });

  it('آیتم پیش‌نمایش: ItemView بی‌کلید با پیشرفت؛ پاسخِ همان جایگاه قطعی (seed ثابت بسته)', async () => {
    const first = dataOf<{ item: { id: string; phase: string } | null; progress: { done: number; total: number } }>(
      await anon.get(`/api/play/preview/${preview.token}/item/0`));
    expect(first.progress.total).toBe(5);
    expect(first.progress.done).toBe(0);
    expect(first.item).toBeTruthy();
    expect(first.item!.phase).toBe('train');
    expect(JSON.stringify(first)).not.toContain('correct_touch');
    const again = dataOf<{ item: { id: string } | null }>(await anon.get(`/api/play/preview/${preview.token}/item/0`));
    expect(again.item!.id).toBe(first.item!.id);
    const last = dataOf<{ item: { id: string } | null }>(await anon.get(`/api/play/preview/${preview.token}/item/5`));
    expect(last.item).toBeNull();
  });

  it('بازخورد آزمایشی: نمره‌دهی سروری از آیتم ذخیره‌شده — گو/بازداری/پروب بی‌بازخورد — با صفر نوشتن', async () => {
    const tk = preview.token;
    const go = dataOf<{ correct: boolean; message?: string }>(
      await anon.post(`/api/play/preview/${tk}/feedback`, { item_id: 'pv-g1', response: { touched: true }, rt_ms: 300 }));
    expect(go.correct).toBe(true);
    expect(go.message).toBe('گرفتی!');
    const nogo = dataOf<{ correct: boolean }>(
      await anon.post(`/api/play/preview/${tk}/feedback`, { item_id: 'pv-n1', response: { touched: true }, rt_ms: 300 }));
    expect(nogo.correct).toBe(false);
    const withhold = dataOf<{ correct: boolean; message?: string }>(
      await anon.post(`/api/play/preview/${tk}/feedback`, { item_id: 'pv-n1', response: { touched: false }, rt_ms: null }));
    expect(withhold.correct).toBe(true);
    expect(withhold.message).toBe('عالی، صبر کردی!');
    const probe = dataOf<{ phase: string; message?: string }>(
      await anon.post(`/api/play/preview/${tk}/feedback`, { item_id: 'pv-n2', response: { touched: true }, rt_ms: 300 }));
    expect(probe.phase).toBe('probe');
    expect(probe.message).toBeUndefined();
    // صفر نوشتن — هیچ جلسه و هیچ پاسخی ساخته نشد؛ پیش‌نمایش از جریان بالینی جداست
    const sess = A.sql.prepare(`SELECT COUNT(*) AS n FROM game_sessions`).get() as { n: number };
    const att = A.sql.prepare(`SELECT COUNT(*) AS n FROM game_attempts`).get() as { n: number };
    expect(sess.n).toBe(0);
    expect(att.n).toBe(0);
  });

  it('توکن ناشناس/جعلی: صفحه کارت محترمانه، آیتم و بازخورد خطای تمیز', async () => {
    const dead = await A.app.request('/play/preview/unknown.deadbeef', {}, A.env as never);
    expect(dead.status).toBe(200);
    expect(await dead.text()).toContain('پیش‌نمایش فعال نیست');
    expect((await anon.get('/api/play/preview/unknown.deadbeef/item/0')).status).toBe(404);
    expect((await anon.post(`/api/play/preview/${preview.token}/feedback`, { item_id: 'nope', response: { touched: true }, rt_ms: 300 })).status).toBe(400);
    expect((await anon.get(`/api/play/preview/${preview.token}/item/-1`)).status).toBe(400);
    expect((await anon.get(`/api/play/preview/${preview.token}/item/abc`)).status).toBe(400);
  });

  it('توکن فقط هش‌شده ذخیره می‌شود — خودِ توکن خام هرگز در DB نیست', () => {
    const row = A.sql.prepare(`SELECT token_hash, package_id FROM game_preview_tokens WHERE jti = ?`).get(preview.jti) as { token_hash: string; package_id: string };
    expect(row.token_hash).not.toBe(preview.token);
    expect(row.token_hash).toHaveLength(64);
    expect(row.package_id).toBe(PKG);
  });
});
