/**
 * rust-f3 — آزمون گام‌ها: شمارش/یکتایی/متن فارسی/یکپارچگی با app.js واقعی/گیت نقش‌ها
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  allTutorialSteps,
  MANAGER_STEPS,
  SECRETARY_STEPS,
  stepsForRole,
  THERAPIST_STEPS
} from '../tutorial/steps.js';
import type { TutorialRole } from '../tutorial/steps.js';

const APP_JS = readFileSync(
  fileURLToPath(new URL('../../public/assets/js/app.js', import.meta.url)),
  'utf8'
);

/** جدول نقش‌های NAV از سورس واقعی app.js — حقیقتِ «این نقش کجا می‌تواند برود» */
function navHashesFor(role: TutorialRole): Set<string> {
  const hashes = new Set<string>();
  const re = /hash:\s*'(#\/[a-z0-9:/-]+)'[\s\S]*?(?:roles:\s*\[([^\]]*)\])?\s*\},/g;
  for (const m of APP_JS.matchAll(re)) {
    const hash = m[1];
    const rolesRaw = m[2];
    if (!rolesRaw) {
      hashes.add(hash); // بدون قید نقش = همه
      continue;
    }
    const roles = rolesRaw.split(',').map((s) => s.trim().replace(/'/g, ''));
    if (roles.includes(role)) hashes.add(hash);
  }
  return hashes;
}

describe('tutorial-steps — شمارش و یکتایی', () => {
  it('مدیر ۱۰ / منشی ۱۱ / درمانگر ۱۰ گام دارد (جمع ۳۱)', () => {
    expect(MANAGER_STEPS).toHaveLength(10);
    expect(SECRETARY_STEPS).toHaveLength(11);
    expect(THERAPIST_STEPS).toHaveLength(10);
    expect(allTutorialSteps()).toHaveLength(31);
  });

  it('شناسهٔ گام‌ها در کل سه نقش یکتاست و stepsForRole همان آرایهٔ نقش را می‌دهد', () => {
    const ids = allTutorialSteps().map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(stepsForRole('manager')).toBe(MANAGER_STEPS);
    expect(stepsForRole('secretary')).toBe(SECRETARY_STEPS);
    expect(stepsForRole('therapist')).toBe(THERAPIST_STEPS);
  });
});

describe('tutorial-steps — سلامت محتوای فارسی و مسیر', () => {
  it('هر گام عنوان و متن فارسی غیرتهی دارد', () => {
    for (const s of allTutorialSteps()) {
      expect(s.title.trim().length).toBeGreaterThan(4);
      expect(s.text.trim().length).toBeGreaterThan(15);
      expect(s.title).toMatch(/[\u0600-\u06FF]/);
      expect(s.text).toMatch(/[\u0600-\u06FF]/);
    }
  });

  it('سلکتور هر گام یا تهی است (حباب مرکزی) یا آیتم سایدبار data-nav', () => {
    for (const s of allTutorialSteps()) {
      if (s.selector === null) continue;
      expect(s.selector).toMatch(/^\[data-nav="#\/[a-z0-9-]+"\]$/);
    }
  });
});

describe('tutorial-steps — یکپارچگی با app.js واقعی و قاعدهٔ «هرگز مسیر قفل نشود»', () => {
  it('هر مسیر گام در سورس واقعی app.js ثبت شده است (NAV یا register)', () => {
    for (const s of allTutorialSteps()) {
      expect(APP_JS.includes(`'${s.path}'`), `مسیر ${s.path} گام ${s.id} در app.js نیست`).toBe(true);
    }
  });

  it('مسیر هیچ گامی برای نقشِ همان گام قفل نیست (roleOnly/managerOnly دور زده نمی‌شود)', () => {
    for (const role of ['manager', 'secretary', 'therapist'] as const) {
      const allowed = navHashesFor(role);
      for (const s of stepsForRole(role)) {
        expect(allowed.has(s.path), `${s.path} برای ${role} در NAV مجاز نیست`).toBe(true);
      }
    }
  });
});

describe('tutorial-steps — قالب نقش‌محور (خوش‌آمد/پایان/آمار دوره)', () => {
  it('گام نخست هر نقش خوش‌آمد روی داشبورد بدون هایلایت است', () => {
    for (const role of ['manager', 'secretary', 'therapist'] as const) {
      const first = stepsForRole(role)[0];
      expect(first.path).toBe('#/dashboard');
      expect(first.selector).toBeNull();
      expect(first.title).toContain('خوش آمدید');
    }
  });

  it('گام پایانی: مدیر و منشی در تنظیمات، درمانگر روی داشبورد (دسترسی‌پذیر برای خودش)', () => {
    expect(MANAGER_STEPS[MANAGER_STEPS.length - 1].path).toBe('#/settings');
    expect(SECRETARY_STEPS[SECRETARY_STEPS.length - 1].path).toBe('#/settings');
    expect(THERAPIST_STEPS[THERAPIST_STEPS.length - 1].path).toBe('#/dashboard');
  });

  it('مدیر به‌جای پنل سلامتِ قطع‌شده (۱.۲۵.۷۱) گام «آمار دوره» دارد', () => {
    const reports = MANAGER_STEPS.find((s) => s.title === 'آمار دوره');
    expect(reports?.path).toBe('#/reports');
    const allText = allTutorialSteps().map((s) => `${s.title} ${s.text} ${s.path}`).join('\n');
    expect(allText).not.toContain('پنل سلامت');
    expect(allText).not.toContain('#/health-panel');
  });

  it('منشی سه‌گانهٔ روزمره (نوبت/تابلوی امروز/لیست انتظار) را دارد', () => {
    const paths = SECRETARY_STEPS.map((s) => s.path);
    expect(paths).toContain('#/appointments');
    expect(paths).toContain('#/working-day');
    expect(paths).toContain('#/waitlist');
  });
});
