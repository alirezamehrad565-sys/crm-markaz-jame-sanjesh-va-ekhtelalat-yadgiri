/**
 * گیت رجیستری مسیرها — ۱.۲۷.۸۱ (sdt158 — بستن architecture-004 با گزینهٔ الف، ADR-012):
 * مانیفست docs/route-registry.json نقطهٔ واحد کشف مسیرهاست؛ این آزمون همان گیت CI را
 * در سوئیت محلی هم می‌گیرد (spawn اسکریپت ماشین‌ساخته — منطق اسکن فقط یک‌جاست).
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('گیت رجیستری مسیرها (architecture-004) — ۱.۲۷.۸۱', () => {
  it('مانیفست با اسکن سورس هم‌گام است — هر ثبت/حذف مسیر باید در رجیستری ثبت شود', () => {
    const r = spawnSync('node', ['scripts/check-route-registry.mjs'], {
      cwd: join(__dirname, '../..'),
      encoding: 'utf8'
    });
    const out = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    expect(r.status, out.slice(0, 900)).toBe(0);
    expect(out).toContain('گیت رجیستری مسیرها سبز است');
  });

  it('منبع یگانهٔ شمارش: مانیفست ۴۴۱ ثبت در ۵۶ ماژول (domain ۳۳۱ · application ۹۵ · other ۱۵)', () => {
    const m = JSON.parse(readFileSync(join(__dirname, '../../docs/route-registry.json'), 'utf8')) as {
      summary: { totalEndpoints: number; byLayer: { domain: number; application: number; other: number } };
      modules: Array<{ zone: string }>;
    };
    expect(m.summary.totalEndpoints).toBe(441);
    expect(m.summary.byLayer).toEqual({ domain: 331, application: 95, other: 15 });
    expect(m.modules).toHaveLength(56);
    const zones = new Set(m.modules.map((x) => x.zone));
    expect(zones.has('standalone')).toBe(false); // هر ماژول ثبت‌کننده باید محل ثبت‌اش روشن باشد
  });
});
