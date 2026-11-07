// ساخت SQL نشاندن بستهٔ «رد پای دزد» (نوع trail) روی D1 عملیاتی — INSERT امن (idempotent) — ۱.۲۵.۳۲
// بانک authored قطعی: seed ثابت → همان ردها در هر بازتولید (الگوی make-scan-seed-sql.mjs).
// اقتباس مکانیک: @jspsych-contrib/plugin-trail-making (مخزن jspsych/jspsych-contrib، مجوز MIT)
// و jsPsych (MIT) — نشانه‌های {x,y,برچسب} با فاصلهٔ کمینهٔ مراکز؛ بازنویسی کامل، بدون کپی کد.
// اهرم سختی = شمار ردپا + پنجرهٔ پاسخ + آمیختن عدد/حرف فارسی (سبک TMT-B):
//   a: ۴ ردپا فقط عدد + ۲۰s · b: ۵ ردپا فقط عدد + ۲۰s · c: ۶ ردپا فقط عدد + ۱۸s ·
//   d: ۷ ردپا یک‌درمیان عدد/حرف (۱→الف→۲→ب…) + ۱۸s · p: پروب ۶ ردپا آمیخته + ۱۸s
// گره‌ها هرگز روی‌هم نمی‌افتند: مولد موقعیت قطعی با فاصلهٔ کمینهٔ ≥۱۸٪
// (چک فاصلهٔ اقلیدسی روی شبکهٔ درصدی، پس از گرد کردن به یک رقم اعشار).
// «correct» = آرایهٔ اندیس‌های گره به ترتیب درست — فقط در بانک می‌ماند؛ هرگز به کلاینت نمی‌رود.
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

const PROMPT_NUM = 'دزد فراری ردپا گذاشته؛ ردپاها را به ترتیب شماره لمس کن و رد را کامل کن.';
const PROMPT_ALT = 'دزد فراری ردپا گذاشته؛ رد را کامل کن — بعد از هر عدد یک حرف می‌آید.';
const FA_DIGITS = '۰۱۲۳۴۵۶۷۸۹';
const faNum = (n) => String(n).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]);
const LETTERS = ['الف', 'ب', 'پ', 'ت'];   // الف‌بای فارسی — برچسب گره‌های آمیخته
const MIN_DIST = 18;                      // فاصلهٔ کمینهٔ مراکز گره‌ها (درصد — اقلیدسی)

/* پیکربندی گروه‌ها — count = شمار ردپا، alt = آمیختهٔ عدد/حرف، window_ms = پنجرهٔ موج رد */
const BANDS = {
  a: { count: 4, alt: false, window_ms: 20000 }, // مرحلهٔ ۱ — گرم‌کردن
  b: { count: 5, alt: false, window_ms: 20000 }, // مرحلهٔ ۲
  c: { count: 6, alt: false, window_ms: 18000 }, // مرحلهٔ ۳
  d: { count: 7, alt: true,  window_ms: 18000 }, // مرحلهٔ ۴ — سبک TMT-B
  p: { count: 6, alt: true,  window_ms: 18000 }  // پروب — آمیختهٔ کوتاه‌تر
};

/** برچسب توالی — فقط عدد (۱..n) یا یک‌درمیان عدد/حرف: ۱→الف→۲→ب→۳→پ… */
function labelsFor(count, alt) {
  const out = [];
  for (let p = 0; p < count; p++) {
    if (!alt) out.push(p + 1);
    else if (p % 2 === 0) out.push(p / 2 + 1);
    else out.push(LETTERS[(p - 1) / 2]);
  }
  return out;
}

/** مولد موقعیت قطعی — نمونه‌گیری پس‌زنی روی شبکهٔ درصدی؛ چک اقلیدسی روی مقدار گردشده.
    حاشیه‌ها گره‌ها را داخل میدان نگه می‌دارند (دور از ماه/دزد گوشهٔ صحنه). */
function placeNodes(rand, count) {
  const pts = [];
  let guard = 0;
  while (pts.length < count) {
    guard += 1;
    if (guard > 20000) throw new Error('trail placement failed — min dist ' + MIN_DIST + '% unreachable');
    const x = Math.round((11 + rand() * 78) * 10) / 10;   // 11..89
    const y = Math.round((13 + rand() * 74) * 10) / 10;   // 13..87
    let ok = true;
    for (const q of pts) {
      const dx = q.x - x;
      const dy = q.y - y;
      if (Math.sqrt(dx * dx + dy * dy) < MIN_DIST) { ok = false; break; }
    }
    if (ok) pts.push({ x, y });
  }
  return pts;
}

function trail(id, phase, band, salt) {
  const b = BANDS[band];
  const rand = mulberry32(0x7A1E5D ^ (salt * 2654435761));
  const labels = labelsFor(b.count, b.alt);
  const pts = placeNodes(rand, b.count);
  // بر زدن قطعی جای گره‌ها در آرایه — correct یک جایگشت واقعی می‌شود، نه ۰..n−۱ همیشه
  const slots = Array.from({ length: b.count }, (_, i) => i);
  for (let i = b.count - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [slots[i], slots[j]] = [slots[j], slots[i]];
  }
  const nodes = new Array(b.count);
  const correct = new Array(b.count);
  for (let p = 0; p < b.count; p++) {
    const idx = slots[p];
    nodes[idx] = { x: pts[p].x, y: pts[p].y, n: labels[p] };
    correct[p] = idx;
  }
  return {
    id, phase, type: 'trail',
    prompt: b.alt ? PROMPT_ALT : PROMPT_NUM,
    correct,
    stim: { nodes, window_ms: b.window_ms, alt: b.alt, seq: labels, band } // band = گروه authored برای فیلتر مرحله‌ها
  };
}

const items = [
  trail('ta1', 'train', 'a', 1), trail('ta2', 'train', 'a', 2), trail('ta3', 'train', 'a', 3), trail('ta4', 'train', 'a', 4),
  trail('ta5', 'train', 'a', 5), trail('ta6', 'train', 'a', 6), trail('ta7', 'train', 'a', 7), trail('ta8', 'train', 'a', 8),
  trail('tb1', 'train', 'b', 11), trail('tb2', 'train', 'b', 12), trail('tb3', 'train', 'b', 13),
  trail('tb4', 'train', 'b', 14), trail('tb5', 'train', 'b', 15), trail('tb6', 'train', 'b', 16),
  trail('tc1', 'train', 'c', 21), trail('tc2', 'train', 'c', 22), trail('tc3', 'train', 'c', 23),
  trail('tc4', 'train', 'c', 24), trail('tc5', 'train', 'c', 25), trail('tc6', 'train', 'c', 26),
  trail('td1', 'train', 'd', 31), trail('td2', 'train', 'd', 32), trail('td3', 'train', 'd', 33),
  trail('td4', 'train', 'd', 34), trail('td5', 'train', 'd', 35), trail('td6', 'train', 'd', 36),
  trail('tp1', 'probe', 'p', 41), trail('tp2', 'probe', 'p', 42), trail('tp3', 'probe', 'p', 43), trail('tp4', 'probe', 'p', 44),
  trail('tp5', 'probe', 'p', 45), trail('tp6', 'probe', 'p', 46), trail('tp7', 'probe', 'p', 47), trail('tp8', 'probe', 'p', 48)
];

/* ─── راستی‌آزمایی بانک پیش از نوشتن SQL — هر خطا = توقف با پیام روشن ─── */
function validate(items) {
  const seen = new Set();
  let minPair = Infinity;
  for (const it of items) {
    if (seen.has(it.id)) throw new Error('duplicate id ' + it.id);
    seen.add(it.id);
    const s = it.stim;
    const n = s.nodes.length;
    if (n !== it.correct.length) throw new Error(it.id + ': nodes/correct mismatch');
    if (![...it.correct].sort((x, y) => x - y).every((v, i) => v === i)) throw new Error(it.id + ': correct not a permutation');
    if (s.window_ms < 4000 || s.window_ms > 30000) throw new Error(it.id + ': window out of range');
    for (const nd of s.nodes) {
      if (nd.x < 0 || nd.x > 100 || nd.y < 0 || nd.y > 100) throw new Error(it.id + ': node out of stage');
    }
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const dx = s.nodes[i].x - s.nodes[j].x;
        const dy = s.nodes[i].y - s.nodes[j].y;
        const d = Math.sqrt(dx * dx + dy * dy);
        minPair = Math.min(minPair, d);
        if (d < MIN_DIST) throw new Error(it.id + ': nodes closer than ' + MIN_DIST + '% (' + d.toFixed(1) + ')');
      }
    }
    // توالی برچسب‌ها — فقط عدد یا یک‌درمیان عدد/حرف (مطابق alt خود آیتم)
    for (let p = 0; p < n; p++) {
      const lbl = s.nodes[it.correct[p]].n;
      const want = s.alt ? (p % 2 === 0 ? p / 2 + 1 : LETTERS[(p - 1) / 2]) : p + 1;
      if (lbl !== want) throw new Error(it.id + ': label sequence broken at ' + p);
    }
  }
  return minPair;
}

const minPair = validate(items);

const body = {
  package_id: 'trail1',
  goals: ['trail_attention'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'trail_v1', game: 'trail', goal: 'trail_attention', metric: 'accuracy_trail',
    metrics: ['accuracy_trail', 'trail_prefix_pct', 'median_rt_trail'],
    title: 'رد پای دزد',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین دقت و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed trail1 ۱.۰.۰ «دنبال‌کردن — رد پای دزد» (idempotent) — ۱.۲۵.۳۲
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_trail', 'دقت کامل‌کردن رد ردپاها', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_trail', 'میانهٔ زمان لمس هر ردپا', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('trail_attention', 'دنبال‌کردن — رد پای دزد', 'trail1', 'accuracy_trail', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('trail1', '1.0.0', 'دنبال‌کردن — رد پای دزد', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-trail.sql', sql, 'utf8');

const train = items.filter((i) => i.phase === 'train').length;
const probe = items.filter((i) => i.phase === 'probe').length;
console.log('SQL ready — bytes:', sql.length,
  'items:', items.length, '(train', train, '/ probe', probe + ')',
  'nodes/item:', items.map((i) => i.stim.nodes.length).join(','),
  'minDist%:', minPair.toFixed(1));
