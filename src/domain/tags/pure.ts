import type { TagRef } from '@core/shared';

export function normalizeTagName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

export function diffStudentTags(
  current: TagRef[],
  next: TagRef[]
): { added: string[]; removed: string[] } {
  const currentIds = new Set(current.map((t) => t.id));
  const nextIds = new Set(next.map((t) => t.id));
  const added = next.filter((t) => !currentIds.has(t.id)).map((t) => t.name);
  const removed = current.filter((t) => !nextIds.has(t.id)).map((t) => t.name);
  return { added, removed };
}
