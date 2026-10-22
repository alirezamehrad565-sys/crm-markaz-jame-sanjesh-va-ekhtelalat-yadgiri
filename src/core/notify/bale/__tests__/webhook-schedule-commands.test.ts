import { describe, expect, it } from 'vitest';
import { parseBotUpdate } from '../webhook';

describe('parseBotUpdate — schedule commands', () => {
  const update = (text: string) => ({ message: { chat: { id: 42 }, text } });

  it('parses /today', () => {
    const cmd = parseBotUpdate(update('/today'));
    expect(cmd).toEqual({ kind: 'schedule', chatId: '42', scope: 'today' });
  });

  it('parses /week with extra spaces', () => {
    const cmd = parseBotUpdate(update('  /week  '));
    expect(cmd).toEqual({ kind: 'schedule', chatId: '42', scope: 'week' });
  });

  it('keeps /link and /myid working', () => {
    expect(parseBotUpdate(update('/link AB23CD'))).toEqual({ kind: 'link', chatId: '42', code: 'AB23CD' });
    expect(parseBotUpdate(update('/myid'))).toEqual({ kind: 'myid', chatId: '42' });
  });

  it('non-command text still returns null', () => {
    expect(parseBotUpdate(update('سلام بات'))).toBeNull();
  });

  it('unknown command falls back to unknown', () => {
    const cmd = parseBotUpdate(update('/xyz'));
    expect(cmd).toEqual({ kind: 'unknown', chatId: '42', text: '/xyz' });
  });
});
