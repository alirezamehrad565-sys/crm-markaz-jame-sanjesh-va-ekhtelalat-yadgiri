// ساخت SQL نشاندن بستهٔ «حملهٔ جاسوس‌ها» (نوع scan) روی D1 عملیاتی — INSERT امن (idempotent) — ۱.۲۵.۳۰
// بانک authored قطعی: seed ثابت → همان موج‌ها در هر بازتولید؛ امضای هدف = ۲ آنتن در همهٔ مرحله‌ها
// (الگوی d2: بعد حواس‌پرتی یگانه — فقط شمار آنتن)، اهرم سختی = اندازهٔ موج (SCAN_STAGE_MAX_TILES).
import { writeFileSync } from 'node:fs';

/* PRNG قطعی mulberry32 — همان الگوی stimulus.ts سرور؛ بانک authored قابل بازتولید است */
function mulberry32(seedNum) {
  let a = seedNum >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const PROMPT = 'جاسوس‌ها ربات‌هایی با ۲ آنتن‌اند — همه را بگیر، هم‌نوع‌ها را دست نزن.';

/* پیکربندی موج‌های هر گروه — spies = شمار جاسوس، tiles = ستون×ردیف */
const WAVES = {
  a: { cols: 3, rows: 2, spies: 2, dis: [1, 4], wave: 20000 }, // مرحلهٔ ۱ — سقف ۶ خانه
  b: { cols: 3, rows: 3, spies: 2, dis: [1, 3, 4], wave: 18000 }, // مرحلهٔ ۲ — سقف ۹
  c: { cols: 4, rows: 3, spies: 3, dis: [1, 3, 4], wave: 16000 }, // مرحلهٔ ۳ — سقف ۱۲
  d: { cols: 5, rows: 3, spies: 4, dis: [1, 3, 4], wave: 15000 }, // مرحلهٔ ۴ — سقف ۱۵
  p: { cols: 4, rows: 3, spies: 3, dis: [1, 3, 4], wave: 16000 }  // پروب — ۱۲ خانه
};

function wave(id, phase, band, salt) {
  const w = WAVES[band];
  const rand = mulberry32(0x53C4A1 ^ (salt * 2654435761));
  const tiles = w.cols * w.rows;
  // جای جاسوس‌ها — قطعی از seed؛ بقیه خانه‌ها هم‌نوع با آنتن‌های متفاوت
  const idxs = Array.from({ length: tiles }, (_, i) => i);
  for (let i = tiles - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [idxs[i], idxs[j]] = [idxs[j], idxs[i]];
  }
  const spyIdx = idxs.slice(0, w.spies).sort((x, y) => x - y);
  const t = [];
  for (let i = 0; i < tiles; i++) t.push(w.dis[Math.floor(rand() * w.dis.length)]);
  for (const i of spyIdx) t[i] = 2;
  return {
    id, phase, type: 'scan', prompt: PROMPT,
    correct: spyIdx,
    stim: { cols: w.cols, rows: w.rows, wave_ms: w.wave, signature: 2, tiles: t }
  };
}

const items = [
  wave('wa1', 'train', 'a', 1), wave('wa2', 'train', 'a', 2), wave('wa3', 'train', 'a', 3), wave('wa4', 'train', 'a', 4),
  wave('wa5', 'train', 'a', 5), wave('wa6', 'train', 'a', 6), wave('wa7', 'train', 'a', 7), wave('wa8', 'train', 'a', 8),
  wave('wb1', 'train', 'b', 11), wave('wb2', 'train', 'b', 12), wave('wb3', 'train', 'b', 13),
  wave('wb4', 'train', 'b', 14), wave('wb5', 'train', 'b', 15), wave('wb6', 'train', 'b', 16),
  wave('wc1', 'train', 'c', 21), wave('wc2', 'train', 'c', 22), wave('wc3', 'train', 'c', 23),
  wave('wc4', 'train', 'c', 24), wave('wc5', 'train', 'c', 25), wave('wc6', 'train', 'c', 26),
  wave('wd1', 'train', 'd', 31), wave('wd2', 'train', 'd', 32), wave('wd3', 'train', 'd', 33),
  wave('wd4', 'train', 'd', 34), wave('wd5', 'train', 'd', 35), wave('wd6', 'train', 'd', 36),
  wave('wp1', 'probe', 'p', 41), wave('wp2', 'probe', 'p', 42), wave('wp3', 'probe', 'p', 43), wave('wp4', 'probe', 'p', 44),
  wave('wp5', 'probe', 'p', 45), wave('wp6', 'probe', 'p', 46), wave('wp7', 'probe', 'p', 47), wave('wp8', 'probe', 'p', 48)
];

const body = {
  package_id: 'swarm1',
  goals: ['scan_attention'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'scan_v1', game: 'scan', goal: 'scan_attention', metric: 'accuracy_scan',
    metrics: ['accuracy_scan', 'scan_fa_pct', 'scan_miss_pct', 'median_rt_scan'],
    title: 'حملهٔ جاسوس‌ها',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین دقت و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed swarm1 ۱.۰.۰ «توجه و تمرکز — حملهٔ جاسوس‌ها» (idempotent) — ۱.۲۵.۳۰
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_scan', 'دقت گرفتن جاسوس‌ها', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_scan', 'میانهٔ زمان نخستین لمس موج', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('scan_attention', 'توجه و تمرکز — کشف جاسوس‌ها', 'swarm1', 'accuracy_scan', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('swarm1', '1.0.0', 'توجه و تمرکز — حملهٔ جاسوس‌ها', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-scan.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length, 'spies/wave:', items.map((i) => i.correct.length).join(','));
