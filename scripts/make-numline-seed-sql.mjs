// ساخت SQL نشاندن بستهٔ «جادهٔ عددها» روی D1 عملیاتی — INSERT OR REPLACE امن (idempotent)
import { writeFileSync } from 'node:fs';

function train(id, band, num) {
  const span = { a: 10, b: 20, c: 50, d: 100 }[band];
  const tol = { a: 0.5, b: 1, c: 2, d: 4 }[band];
  return { id, phase: 'train', type: 'numline', prompt: 'این عدد کجای جاده است؟', stim: { number: num }, range: [0, span], correct: num, tolerance: tol };
}
const probe = (id, band, num) => ({ ...train(id, band, num), phase: 'probe' });

const items = [
  train('ta1', 'a', 3), train('ta2', 'a', 7), train('ta3', 'a', 1), train('ta4', 'a', 9),
  train('ta5', 'a', 5), train('ta6', 'a', 2), train('ta7', 'a', 8), train('ta8', 'a', 6),
  train('tb1', 'b', 12), train('tb2', 'b', 16), train('tb3', 'b', 9),
  train('tb4', 'b', 18), train('tb5', 'b', 13), train('tb6', 'b', 15),
  train('tc1', 'c', 23), train('tc2', 'c', 37), train('tc3', 'c', 45),
  train('tc4', 'c', 12), train('tc5', 'c', 41), train('tc6', 'c', 29),
  train('td1', 'd', 63), train('td2', 'd', 81), train('td3', 'd', 34),
  train('td4', 'd', 92), train('td5', 'd', 47), train('td6', 'd', 75),
  probe('pa1', 'a', 4), probe('pa2', 'a', 8),
  probe('pb1', 'b', 14), probe('pb2', 'b', 11),
  probe('pc1', 'c', 33), probe('pc2', 'c', 48),
  probe('pd1', 'd', 56), probe('pd2', 'd', 88)
];

const body = {
  package_id: 'numline1',
  goals: ['numline'],
  mastery: { threshold: 30, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'numline_v1', game: 'numline', goal: 'numline', metric: 'pct_error_numline',
    metrics: ['pct_error_numline', 'accuracy_numline', 'median_rt_numline'],
    title: 'جادهٔ عددها',
    mastery: { threshold: 30, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین مهارت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed numline1 ۱.۰.۰ «حس عدد — جادهٔ عددها» (idempotent) — ۱.۲۵.۲۸
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_numline', 'دقت جای عدد', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_numline', 'میانهٔ زمان واکنش جای عدد', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('numline1', '1.0.0', 'حس عدد — جادهٔ عددها', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('numline_road', 'حس عدد و جای عدد', 'numline1', 'pct_error_numline', 4, 12);
`;
writeFileSync('/tmp/seed-numline.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length);
