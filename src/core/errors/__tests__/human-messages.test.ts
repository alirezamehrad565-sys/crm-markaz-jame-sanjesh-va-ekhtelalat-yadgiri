import { describe, it, expect } from 'vitest';
import { HUMAN_MESSAGES, humanizeError } from '../human-messages';
import type { HumanErrorKind, HumanMessage } from '../human-messages';

const KINDS = Object.keys(HUMAN_MESSAGES) as HumanErrorKind[];
const EXPECTED_KINDS: readonly HumanErrorKind[] = [
  'engine_spawn_failed',
  'engine_port_busy',
  'disk_low',
  'db_integrity_failed',
  'sync_network',
  'sync_version_mismatch',
  'central_token_invalid',
  'central_quota',
  'central_deploy_chunk_failed',
];
const FIELDS = ['title', 'hint', 'action'] as const;
const PERSIAN_RE = /[\u0600-\u06FF]/;
const KNOWN_VARS = new Set(['port', 'free_mb', 'chunk', 'total']);

describe('پیام‌های انسانی — پوشش کامل انواع خطا', () => {
  it('اتحاد: هر ۹ نوعِ قراردادی تعریف شده‌اند و چیزی کم/زیاد نیست', () => {
    expect([...KINDS].sort()).toEqual([...EXPECTED_KINDS].sort());
  });

  it('هر نوع، عنوان/راهنما/اقدامِ غیرتهی و فارسی دارد', () => {
    for (const kind of KINDS) {
      const msg: HumanMessage = HUMAN_MESSAGES[kind];
      for (const field of FIELDS) {
        expect(msg[field].trim().length, `${kind}.${field} نباید تهی باشد`).toBeGreaterThan(5);
        expect(PERSIAN_RE.test(msg[field]), `${kind}.${field} باید فارسی باشد`).toBe(true);
      }
    }
  });

  it('راهنمای engine_spawn_failed چهار قدم شماره‌دارِ آنتی‌ویروس دارد', () => {
    const hint = HUMAN_MESSAGES.engine_spawn_failed.hint;
    for (const step of ['۱)', '۲)', '۳)', '۴)']) {
      expect(hint).toContain(step);
    }
    expect(hint).toContain('استثنا');
  });

  it('جای‌خالی‌های قالب‌ها فقط از مجموعهٔ متغیرهای شناخته‌شده‌اند (بدون غلط تایپی)', () => {
    for (const kind of KINDS) {
      for (const field of FIELDS) {
        const matches = HUMAN_MESSAGES[kind][field].match(/\{(\w+)\}/g) ?? [];
        for (const m of matches) {
          expect(KNOWN_VARS.has(m.slice(1, -1)), `${kind}.${field}: ${m}`).toBe(true);
        }
      }
    }
  });
});

describe('humanizeError — جانشینی متغیرها', () => {
  it('{port} در engine_port_busy جانشین می‌شود', () => {
    const msg = humanizeError('engine_port_busy', { port: 9152 });
    expect(msg.hint).toContain('9152');
    expect(msg.hint).not.toContain('{port}');
    expect(msg.title).toBe(HUMAN_MESSAGES.engine_port_busy.title);
  });

  it('{free_mb} با مقدار عددی در disk_low جانشین می‌شود', () => {
    expect(humanizeError('disk_low', { free_mb: 137 }).hint).toContain('137');
  });

  it('{chunk} و {total} در central_deploy_chunk_failed با هم جانشین می‌شوند', () => {
    const msg = humanizeError('central_deploy_chunk_failed', { chunk: 5, total: 8 });
    expect(msg.title).toContain('قطعهٔ 5 از 8');
    expect(msg.title).not.toContain('{chunk}');
    expect(msg.title).not.toContain('{total}');
  });

  it('بدون vars همان قالبِ ثابت بازمی‌گردد (بدون خراب‌کاری)', () => {
    expect(humanizeError('disk_low')).toEqual(HUMAN_MESSAGES.disk_low);
    expect(humanizeError('sync_network')).toBe(HUMAN_MESSAGES.sync_network);
  });

  it('متغیرِ غایب: جای‌خالی دست‌نخورده می‌ماند (نه حذف، نه رشتهٔ تهی)', () => {
    expect(humanizeError('disk_low', {}).hint).toContain('{free_mb}');
  });

  it('نوع ناشناخته خطا می‌دهد — پیام بی‌پیام به UI نمی‌رسد', () => {
    expect(() => humanizeError('no_such_kind' as HumanErrorKind)).toThrow(/پیام انسانی/);
    expect(() => humanizeError(undefined as unknown as HumanErrorKind)).toThrow();
    expect(() => humanizeError('' as HumanErrorKind)).toThrow();
  });
});
