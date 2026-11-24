/**
 * گیت موج ۰ طرح ارتقای پرونده — رجیستری تب‌محور با fallback قدیمی (PROFILE-UPGRADE-DESIGN §۵).
 * ① رفتار رجیستری (import واقعی ماژول وانیل‌JS)
 * ② قرارداد اسکلت لولایی در student-profile.js: dispatch رجیستری‌اول + نقشهٔ قدیمی به‌عنوان fallback + chunk داینامیک حفظ
 * ③ رجیستری خارج از گراف بوت است (فقط student-profile استاتیک می‌گیرد؛ app.js دست‌نخورده)
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(__dirname, '../..');
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');

// @ts-expect-error — ماژول فرانت وانیل‌JS است و خارج از tsconfig قرار دارد
const mod = await import('../../public/assets/js/profile/registry.js');

describe('createProfileRegistry — رفتار رجیستری', () => {
  const reg = mod.createProfileRegistry([
    { key: 'clinical', when: () => true, mount: () => 'clinical' },
    { key: 'games', when: () => false, mount: () => 'games' },
    { key: 'timeline', mount: () => 'timeline' } // بدون when
  ]);

  it('resolve — تب مهاجرت‌شده با when درست برمی‌گردد', () => {
    expect(reg.resolve('clinical', null)?.mount(null, null)).toBe('clinical');
  });

  it('resolve — when ردشده null می‌دهد تا پوسته به fallback برود', () => {
    expect(reg.resolve('games', null)).toBeNull();
  });

  it('resolve — descriptor بدون when همیشه می‌آید', () => {
    expect(reg.resolve('timeline', null)).not.toBeNull();
  });

  it('resolve — کلید ناشناس null می‌دهد (رفتار fallback)', () => {
    expect(reg.resolve('sessions', null)).toBeNull();
    expect(reg.has('sessions')).toBe(false);
  });

  it('کلید تکراری ممنوع — خطای صریح، نه سکوت', () => {
    expect(() => mod.createProfileRegistry([
      { key: 'info', mount: () => null },
      { key: 'info', mount: () => null }
    ])).toThrow(/تکراری/);
  });

  it('descriptor نامعتبر (بدون mount) ممنوع', () => {
    expect(() => mod.createProfileRegistry([{ key: 'x' } as never])).toThrow(/نامعتبر/);
    expect(() => mod.createProfileRegistry([null as never])).toThrow(/نامعتبر/);
  });

  it('keys — ترتیب ثبت حفظ می‌شود', () => {
    expect(mod.createProfileRegistry([
      { key: 'b', mount: () => null }, { key: 'a', mount: () => null }
    ]).keys()).toEqual(['b', 'a']);
  });
});

describe('قرارداد اسکلت لولایی در student-profile.js', () => {
  const view = read('public/assets/js/views/student-profile.js');
  const registry = read('public/assets/js/profile/registry.js');

  it('dispatch رجیستری‌اول و سپس fallback قدیمی', () => {
    expect(view).toContain("import { createProfileRegistry } from '../profile/registry.js'");
    expect(view).toContain('const desc = profileTabs.resolve(key, ctx);');
    /* ۱.۲۷.۶۳ — موج ۲: dispatch مقصد صریح می‌گیرد (هاب/کشو در کارگاه، ظرف مشترک content در کلاسیک) */
    expect(view).toContain('function dispatchTab(key, box = tabMount)'); // ۱.۲۷.۶۸ — ظرف پیش‌فرض کارت فعال (بدون هاب/کشو)
    expect(view).toContain('if (desc) { desc.mount(box, ctx); return; }');
    // نقشهٔ قدیمی کامل باقی است — کلیدهای مهاجرت‌شده هم fallback دارند
    for (const k of ['info: renderInfoTab', 'clinical: renderClinicalTabContent', 'timeline: renderTimelineTab', 'sessions: renderSessionsTab', 'comms: renderCommsTab', 'exercises: renderExercisesTabContent', 'games: renderGamesTabContent', 'narrative: renderNarrativeTabContent']) {
      expect(view).toContain(k);
    }
  });

  it('سه تب کم‌اتصال در رجیستری‌اند با گیت RBAC موجود', () => {
    expect(view).toContain("{ key: 'clinical', when: () => canSeeClinical");
    expect(view).toContain("{ key: 'narrative', when: () => canSeeClinical");
    expect(view).toContain("{ key: 'games', when: () => canSeeGames");
  });

  it('chunk داینامیک بازی‌ها و روایت عیناً حفظ شده (خارج از chunk پروفایل)', () => {
    expect(view).toContain("import('../games-console.js')");
    expect(view).toContain("import('../student-narrative.js')");
  });

  it('رجیستری هیچ ایمپورت استاتیکی ندارد — ماژول خالص و جداشده از گراف بوت', () => {
    expect(registry).not.toMatch(/^\s*import\s/m);
    expect(read('public/assets/js/app.js')).not.toContain('profile/registry');
  });
});
