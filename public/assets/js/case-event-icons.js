import { icon, isKnownIcon } from './ui.js';

export const CATEGORY_ICONS = { session: 'puzzle', checklist: 'clipboard', note: 'note' };

export const TYPE_ICON_CHOICES = [
  'clipboard', 'puzzle', 'note', 'book', 'edit', 'calculator', 'zap', 'speech',
  'heart', 'activity', 'shield', 'brain', 'star', 'target', 'users', 'calendar',
  'trophy', 'medal', 'sparkles', 'compass', 'board', 'gamepad'
];

export function typeIconNode(category, iconName, size = 20) {
  if (isKnownIcon(iconName)) return icon(iconName, size);
  return icon(CATEGORY_ICONS[category] ?? 'clipboard', size);
}
