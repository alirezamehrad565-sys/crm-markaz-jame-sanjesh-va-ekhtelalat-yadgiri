// ساخت SQL نشاندن بستهٔ «گلهٔ فریبکار» (نوع flanker — فلانکر اریکسن) روی D1 عملیاتی —
// INSERT امن (idempotent) — ۱.۲۵.۳۲
// بانک authored قطعی: seed ثابت → همان گله‌ها در هر بازتولید (PRNG mulberry32 —
// همان الگوی make-scan-seed-sql.mjs و stimulus.ts سرور).
// اهرم سختی گروه‌ها (تک‌اهرمِ ثابت قصه = فریبِ گرگ‌های کناری):
//   a=مرحلهٔ ۱: ۳ گرگ هم‌جهت (بدون فریب) + پنجرهٔ ۳۵۰۰ms — گرم‌کردن بدون حواس‌پرتی
//   b=مرحلهٔ ۲: ۵ گرگ اکثراً هم‌جهت (حداکثر یک قلابی) + ۳۰۰۰ms — معرفیِ فریب نرم
//   c=مرحلهٔ ۳: ۵ گرگ اکثراً مخالف (فریب واقعی؛ اکثریت اطراف به آن‌سو) + ۳۰۰۰ms
//   d=مرحلهٔ ۴: ۵ گرگ همهٔ اطراف مخالف + ۲۶۰۰ms + جابه‌جایی ایستای فاصله‌ها (±۲..۵px)
//   p=پروب: آمیختهٔ قطعی و متوازن مطمبوع/نامطمبوع (۵/۵، شرایط خالص برای سنجهٔ تداخل) + ۲۸۰۰ms
// مکانیک اقتباس از @jspsych-contrib/plugin-flanker (مخزن jspsych/jspsych-contrib — MIT)
// + Eriksen & Eriksen (1974)؛ کد بازنویسی‌شده با قرارداد سامانهٔ ما — بدون دارایی بیرونی.
import { writeFileSync } from 'node:fs';

/* PRNG قطعی mulberry32 — بانک authored قابل بازتولید است */
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

const PROMPT = 'گرگ‌های قلابی سرک می‌کشند؛ فقط نگاهِ گرگِ وسط را دنبال کن.';

/* پیکربندی گروه‌ها — n=شمار گرگ‌ها، win=پنجرهٔ پاسخ (ms)، mode=قاعدهٔ فریب */
const BANDS = {
  a: { n: 3, win: 3500, mode: 'congruent' },      // مرحلهٔ ۱ — بدون فریب
  b: { n: 5, win: 3000, mode: 'mostly_con' },     // مرحلهٔ ۲ — حداکثر یک قلابی
  c: { n: 5, win: 3000, mode: 'mostly_incon' },   // مرحلهٔ ۳ — فریب واقعی
  d: { n: 5, win: 2600, mode: 'incongruent', jit: true }, // مرحلهٔ ۴ — همهٔ قلابی + جابه‌جایی
  p: { n: 5, win: 2800, mode: 'mixed' }           // پروب — آمیختهٔ شرایط خالص
};

const other = (d) => (d === 'L' ? 'R' : 'L');

function pack(id, phase, band, salt) {
  const b = BANDS[band];
  const rand = mulberry32(0x464C41 ^ (salt * 2654435761));
  const pi = salt - 40; // شمارهٔ پروب ۱..۱۰ — توازن قطعی شرایط
  const n = band === 'p' ? (pi % 5 === 4 ? 3 : 5) : b.n; // دو پروب ۳ گرگی، بقیه ۵ گرگی
  const mid = (n - 1) / 2;
  const center = salt % 2 === 0 ? 'L' : 'R'; // توازن قطعی چپ/راست در هر گروه
  const opp = other(center);
  const arrows = Array.from({ length: n }, () => center);
  let flips = 0;
  if (b.mode === 'mostly_con') flips = rand() < 0.5 ? 0 : 1;
  if (b.mode === 'mostly_incon') flips = rand() < 0.5 ? 3 : 4;
  if (b.mode === 'incongruent') flips = n - 1;
  if (b.mode === 'mixed') flips = pi % 2 === 1 ? 0 : n - 1; // پروب: یک‌درمیان مطمبوع/نامطمبوع (۵/۵)
  const sides = Array.from({ length: n }, (_, i) => i).filter((i) => i !== mid);
  for (let i = sides.length - 1; i > 0; i--) { // جای قلابی‌ها — قطعی از seed
    const j = Math.floor(rand() * (i + 1));
    [sides[i], sides[j]] = [sides[j], sides[i]];
  }
  for (const i of sides.slice(0, flips)) arrows[i] = opp;
  const same = arrows.filter((d) => d === center).length;
  const cond = same >= n - same ? 'congruent' : 'incongruent'; // برچسب عمومی محرک (پوشیده در خود arrows)
  const stim = { arrows, window_ms: b.win, cond };
  if (b.jit) {
    stim.jitter = arrows.map((_, i) =>
      i === mid ? 0 : (rand() < 0.5 ? -1 : 1) * (2 + Math.round(rand() * 3))
    );
  }
  return {
    id, phase, type: 'flanker', prompt: PROMPT,
    correct: center === 'L' ? 0 : 1, // ۰=چپ، ۱=راست — فقط سمت سرور می‌ماند
    stim
  };
}

/* خودبازرسی بانک — بانک ناسالم هرگز SQL نمی‌سازد */
function assertItem(it) {
  const s = it.stim;
  const mid = (s.arrows.length - 1) / 2;
  const ok = s.arrows.length >= 3 && s.arrows.length % 2 === 1 &&
    s.arrows.every((v) => v === 'L' || v === 'R') &&
    it.correct === (s.arrows[mid] === 'L' ? 0 : 1) &&
    s.window_ms >= 800 && s.window_ms <= 8000;
  if (!ok) throw new Error('ناسالم آیتم: ' + it.id);
}

const items = [
  pack('fla1', 'train', 'a', 1), pack('fla2', 'train', 'a', 2), pack('fla3', 'train', 'a', 3), pack('fla4', 'train', 'a', 4),
  pack('fla5', 'train', 'a', 5), pack('fla6', 'train', 'a', 6), pack('fla7', 'train', 'a', 7), pack('fla8', 'train', 'a', 8),
  pack('flb1', 'train', 'b', 11), pack('flb2', 'train', 'b', 12), pack('flb3', 'train', 'b', 13),
  pack('flb4', 'train', 'b', 14), pack('flb5', 'train', 'b', 15), pack('flb6', 'train', 'b', 16),
  pack('flc1', 'train', 'c', 21), pack('flc2', 'train', 'c', 22), pack('flc3', 'train', 'c', 23),
  pack('flc4', 'train', 'c', 24), pack('flc5', 'train', 'c', 25), pack('flc6', 'train', 'c', 26),
  pack('fld1', 'train', 'd', 31), pack('fld2', 'train', 'd', 32), pack('fld3', 'train', 'd', 33),
  pack('fld4', 'train', 'd', 34), pack('fld5', 'train', 'd', 35), pack('fld6', 'train', 'd', 36),
  pack('flp1', 'probe', 'p', 41), pack('flp2', 'probe', 'p', 42), pack('flp3', 'probe', 'p', 43), pack('flp4', 'probe', 'p', 44),
  pack('flp5', 'probe', 'p', 45), pack('flp6', 'probe', 'p', 46), pack('flp7', 'probe', 'p', 47), pack('flp8', 'probe', 'p', 48),
  pack('flp9', 'probe', 'p', 49), pack('flp10', 'probe', 'p', 50)
];
items.forEach(assertItem);

const body = {
  package_id: 'flanker1',
  goals: ['flanker_attention'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'flanker_v1', game: 'flanker', goal: 'flanker_attention', metric: 'accuracy_flanker',
    metrics: ['accuracy_flanker', 'flanker_congruent_acc_pct', 'flanker_incongruent_acc_pct', 'median_rt_flanker'],
    title: 'گلهٔ فریبکار',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین توجه و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed flanker1 ۱.۰.۰ «توجه و تمرکز — گلهٔ فریبکار» (idempotent) — ۱.۲۵.۳۲
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_flanker', 'دقت دنبال‌کردن نگاه گرگِ وسط', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_flanker', 'میانهٔ زمان پاسخ به گرگِ وسط', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('flanker_attention', 'توجه و تمرکز — دنبال‌کردن نگاه گرگ', 'flanker1', 'accuracy_flanker', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('flanker1', '1.0.0', 'توجه و تمرکز — گلهٔ فریبکار', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-flanker.sql', sql, 'utf8');
const train = items.filter((i) => i.phase === 'train').length;
const probe = items.filter((i) => i.phase === 'probe').length;
const left = items.filter((i) => i.correct === 0).length;
console.log('SQL ready — bytes:', sql.length, 'items:', items.length, '(train', train, '/ probe', probe + ')',
  'centers L/R:', left + '/' + (items.length - left),
  'windows:', [...new Set(items.map((i) => i.stim.window_ms))].join(','));
