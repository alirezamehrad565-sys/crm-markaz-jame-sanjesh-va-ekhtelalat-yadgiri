// مولد SQL نشاندن بستهٔ «کولهٔ مرواریدها» (نوع corsi — حافظهٔ کاری فضایی/کورسی) روی D1 عملیاتی
// INSERT امن (idempotent) — ۱۴۰۵/۰۸/۱۹
// بانک authored قطعی: seed ثابت → همان دنباله‌ها در هر بازتولید (PRNG mulberry32 —
// همان الگوی make-scan/stroop/flanker-seed-sql.mjs و stimulus.ts سرور).
// اقتباس مکانیک: @jspsych-contrib/plugin-corsi-blocks (مخزن jspsych/jspsych-contrib، مجوز MIT)
// — حالت نمایش (روشن‌شدن پیاپی بلوک‌ها) + حالت ورود (بازتپ همان ترتیب) + بازخورد پس از پاسخ؛
// بازنویسی کامل با قرارداد سامانهٔ ما (شاخهٔ sequence، گره‌های بی‌برچسب) — بدون کپی کد.
// اهرم سختی گروه‌ها (تک‌اهرمِ ثابت قصه = طول دنبالهٔ مرواریدها):
//   a: طول ۲ + برق ۷۰۰ms — گرم‌کردن · b: طول ۳ · c: طول ۴ · d: طول ۵ · e: طول ۶ (سقف کشش) ·
//   p: پروب آمیختهٔ ۳/۴/۵ با توازن قطعی
// تخت صدف ثابت و نامنظم است (تختِ کلاسیک کورسی) — «جای صدف‌ها» هرگز بازنویسی نمی‌شود.
// کلید بازی = خود دنبالهٔ نمایش‌داده‌شده (کودک آن را می‌بیند) — آیتم «correct» ندارد؛
// نمره‌دهی سرور دنبالهٔ stim را با ترتیب لمس کودک می‌سنجد.
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

/* تخت صدف ثابت — ۹ جایگاه نامنظم؛ عین SHELL_SPOTS در kinds/corsi.js (تختِ کلاسیک کورسی) */
const SHELL_SPOTS = [
  { x: 20, y: 26 }, { x: 50, y: 18 }, { x: 80, y: 30 },
  { x: 32, y: 48 }, { x: 66, y: 46 },
  { x: 18, y: 68 }, { x: 48, y: 70 }, { x: 82, y: 72 },
  { x: 50, y: 86 }
];

const PROMPT = 'مرواریدها پشت‌سرهم برق می‌زنند؛ همان ترتیب را لمس کن.';

/* پیکربندی گروه‌ها — len=طول دنباله، lit/gap=اوتور نمایش، win=پنجرهٔ بازتولید */
const BANDS = {
  a: { len: 2, lit: 700, gap: 320, win: 14000, count: 8, phase: 'train' },
  b: { len: 3, lit: 680, gap: 300, win: 14000, count: 6, phase: 'train' },
  c: { len: 4, lit: 650, gap: 280, win: 16000, count: 6, phase: 'train' },
  d: { len: 5, lit: 650, gap: 260, win: 18000, count: 6, phase: 'train' },
  e: { len: 6, lit: 600, gap: 240, win: 20000, count: 4, phase: 'train' },
  p: { len: 'mixed', lit: 620, gap: 260, win: 16000, count: 8, phase: 'probe' }
};

/** طول پروب متنوع — یک‌درمیان ۳/۴/۵ با توازن قطعی */
function probeLen(i) {
  return [3, 4, 5, 3, 4, 5, 3, 5][i % 8];
}

/** یک آیتم کورسی — تخت ثابت + دنبالهٔ قطعی از seed (بی‌تکرار) */
function shellSeq(id, band, bandKey, salt, i) {
  const b = band;
  const rand = mulberry32(0x434F52 ^ (salt * 2654435761));
  const len = b.len === 'mixed' ? probeLen(i) : b.len;
  /* دنبالهٔ بی‌تکرار — فیشر-یتس روی اندیس‌های تخت؛ دو سرِ پیاپی دشمنِ یکدیگرند اما
     تخت نامنظم از پیش فاصلهٔ ≥۲۰٪ دارد؛ فقط تکرار اندیس درون دنباله ممنوع است */
  const pool = Array.from({ length: SHELL_SPOTS.length }, (_, k) => k);
  for (let k = pool.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [pool[k], pool[j]] = [pool[j], pool[k]];
  }
  const sequence = pool.slice(0, len);
  return {
    id, phase: b.phase, type: 'corsi', prompt: PROMPT,
    stim: { shells: SHELL_SPOTS, sequence, lit_ms: b.lit, gap_ms: b.gap, window_ms: b.win, band: bandKey }
  };
}

const items = [];
const counters = { a: 0, b: 0, c: 0, d: 0, e: 0, p: 0 };
let salt = 1;
for (const bandKey of ['a', 'b', 'c', 'd', 'e', 'p']) {
  const band = BANDS[bandKey];
  for (let i = 0; i < band.count; i++) {
    counters[bandKey] += 1;
    items.push(shellSeq('co' + bandKey + counters[bandKey], band, bandKey, salt++, i));
  }
}

/* ─── راستی‌آزمایی بانک پیش از نوشتن SQL — هر خطا = توقف با پیام روشن ─── */
function validate(items) {
  const seen = new Set();
  for (const it of items) {
    if (seen.has(it.id)) throw new Error('duplicate id ' + it.id);
    seen.add(it.id);
    const s = it.stim;
    if (s.shells !== SHELL_SPOTS) throw new Error(it.id + ': board rewritten — تخت صدف ثابت است');
    const seq = s.sequence;
    if (!Array.isArray(seq) || seq.length < 2 || seq.length > 6) throw new Error(it.id + ': sequence length out of 2..6');
    if (new Set(seq).size !== seq.length) throw new Error(it.id + ': repeated shell in sequence');
    if (!seq.every((n) => Number.isInteger(n) && n >= 0 && n < SHELL_SPOTS.length)) throw new Error(it.id + ': index out of board');
    if (!(s.lit_ms >= 300 && s.lit_ms <= 1500)) throw new Error(it.id + ': lit_ms out of 300..1500');
    if (!(s.gap_ms >= 120 && s.gap_ms <= 800)) throw new Error(it.id + ': gap_ms out of 120..800');
    if (!(s.window_ms >= 4000 && s.window_ms <= 30000)) throw new Error(it.id + ': window out of 4000..30000');
    // پنجرهٔ بازتولید باید برای طول دنباله سخاوتمند باشد (≥ ۱٫۲s بر مروارید)
    if (s.window_ms < seq.length * 1200) throw new Error(it.id + ': window too tight for sequence length');
  }
  // فاصلهٔ جفت‌های تخت — هویت تختِ نامنظم محفوظ بماند
  let minPair = Infinity;
  for (let i = 0; i < SHELL_SPOTS.length; i++) {
    for (let j = i + 1; j < SHELL_SPOTS.length; j++) {
      const dx = SHELL_SPOTS[i].x - SHELL_SPOTS[j].x;
      const dy = SHELL_SPOTS[i].y - SHELL_SPOTS[j].y;
      minPair = Math.min(minPair, Math.sqrt(dx * dx + dy * dy));
    }
  }
  if (minPair < 15) throw new Error('board spots closer than 15%: ' + minPair.toFixed(1));
  return minPair;
}

const minPair = validate(items);

const body = {
  package_id: 'corsi1',
  goals: ['corsi_spatial_memory'],
  mastery: { threshold: 65, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'corsi_v1', game: 'corsi', goal: 'corsi_spatial_memory', metric: 'accuracy_corsi',
    metrics: ['accuracy_corsi', 'corsi_seq_acc_pct', 'corsi_span_max', 'median_rt_corsi'],
    title: 'کولهٔ مرواریدها',
    mastery: { threshold: 65, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین حافظه و تمرکز است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed corsi1 ۱.۰.۰ «حافظهٔ فضایی — کولهٔ مرواریدها» (idempotent) — ۱۴۰۵/۰۸/۱۹
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_corsi', 'دقت بازتولید کامل دنبالهٔ مرواریدها', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_corsi', 'میانهٔ زمان نخستین لمس بازتولید', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('corsi1', '1.0.0', 'حافظهٔ فضایی — کولهٔ مرواریدها', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('corsi_spatial_memory', 'حافظهٔ کاری فضایی — کولهٔ مرواریدها', 'corsi1', 'accuracy_corsi', 4, 12);
UPDATE game_packages SET status = 'retired', updated_at = '${now}' WHERE id = 'trail1'; -- رد پای دزد بازنشسته شد (نقد سه‌گانه — cognitive-games-critique.md)
`;
writeFileSync('/tmp/seed-corsi.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length, 'minPair%:', minPair.toFixed(1));
