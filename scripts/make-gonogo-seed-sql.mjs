// ساخت SQL نشاندن بستهٔ «توجه و بازداری پاسخ» (گونوگو M2) روی D1 — INSERT OR REPLACE امن (idempotent)
// بازساخته در ۱.۲۵.۴۵ به سبک make-numline-seed-sql (نسخهٔ مرورگریِ قدیمی در پاک‌سازی ۱.۲۵.۴۴ حذف شده بود)
import { writeFileSync } from 'node:fs';

const items = [
  { id: 'tr-go1', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
  { id: 'tr-go2', phase: 'train', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
  { id: 'tr-nogo1', phase: 'train', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false },
  { id: 'tr-go3', phase: 'train', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
  { id: 'pr-go1', phase: 'probe', type: 'touch_report', stim: { shape: 'star', color: 'yellow' }, correct_touch: true },
  { id: 'pr-nogo1', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false },
  { id: 'pr-go2', phase: 'probe', type: 'touch_report', stim: { shape: 'circle', color: 'yellow' }, correct_touch: true },
  { id: 'pr-nogo2', phase: 'probe', type: 'touch_report', stim: { shape: 'square', color: 'blue' }, correct_touch: false }
];

const body = {
  package_id: 'attention2',
  goals: ['inhibition'],
  mastery: { threshold: 85, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'gonogo_m2', game: 'gonogo', goal: 'inhibition', metric: 'accuracy_gonogo',
    metrics: ['accuracy_gonogo', 'median_rt_gonogo', 'commission_gonogo', 'omission_gonogo'],
    title: 'ستاره‌چین', probe: { items: 4, feedback: false, position: 'end' },
    mastery: { threshold: 85, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 15, max_missions_per_day: 2, min_weeks: 5 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed attention2 ۱.۰.۰ «توجه و بازداری پاسخ» (idempotent) — ۱.۲۵.۴۵
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('attention2', '1.0.0', 'توجه و بازداری پاسخ', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('inhibition_m2', 'بازداری پاسخ (آزمون M2)', 'attention2', 'accuracy_gonogo', 6, 10);
`;
writeFileSync('/tmp/seed-gonogo.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length);
