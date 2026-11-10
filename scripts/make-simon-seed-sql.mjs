// مولد SQL نشاندن بستهٔ «هم‌صداها» (نوع simon — تقلید متوالی) روی D1 — INSERT امن (idempotent) — ۱.۲۵.۵۲
// بانک authored قطعی: seed ثابت → همان جریان در هر بازتولید.
// پارادایم مرجع — بازی سیمون/MIMM (تقلید متوالی؛ حافظهٔ ترتیب با تکرار مجازِ غیرمجاور) —
// پیاده‌سازی اصیل بر قرارداد دنباله‌ای این سامانه (پاسخ {order}، مقایسهٔ کامل سمت سرور
// بدون حذف تکرار — برخلاف کرسی)؛ الگوی ساخت = make-corsi-seed-sql.mjs.
// اهرم سختی = طول دنبالهٔ دوستان (۲→۶) + سرعت پخش (تندشونده با طول) + پنجرهٔ پاسخ.
//
// گیت صحت بانک: هر دنباله تکرارِ مجاور ندارد (سیمون کلاسیک؛ قابل‌یادگیری)، طول‌ها
// با نردبان مرحله‌ها (SIMON_STAGE_MAX_SPAN) هم‌خوان‌اند، هر باند طول ≥۳ آیتم دارد و
// از طول ۴ به بعد حداقل یک آیتم با دوستِ تکراری (امضای سیمون) هست — هر ناهم‌خوانی = توقف.
import { writeFileSync } from 'node:fs';

/* نردبان سرعت (اهرم تندشونده) — flash/gap بر حسب طول دنباله */
const TEMPO = {
  2: { flash: 620, gap: 240 },
  3: { flash: 520, gap: 200 },
  4: { flash: 440, gap: 170 },
  5: { flash: 380, gap: 140 },
  6: { flash: 330, gap: 120 }
};

const WINDOW = { 2: 16000, 3: 16000, 4: 20000, 5: 20000, 6: 24000 };

const PROMPT = 'دوستان یکی‌یکی نور می‌گیرند؛ همان ترتیب را لمس کن.';
const PROMPT_LONG = 'آواز بلندتر شد و بعضی دوست‌ها دو بار می‌خوانند؛ همان ترتیب را لمس کن.';

/** یک آیتم هم‌صداها — دنبالهٔ دوستان (محرک عمومی) + کلید همان دنباله (فقط سرور) */
function item(id, phase, band, seq) {
  const tempo = TEMPO[seq.length];
  return {
    id, phase, type: 'simon',
    prompt: seq.length >= 4 ? PROMPT_LONG : PROMPT,
    correct: [...seq], // کلید نمره‌دهی — stripAnswerKeys هرگز به کلاینت نمی‌فرستد
    stim: {
      cols: 2, rows: 2,
      seq: [...seq], // دنبالهٔ نمایش — محرک عمومی خود بازی (کودک می‌بیند)
      flash_ms: tempo.flash, gap_ms: tempo.gap,
      window_ms: WINDOW[seq.length], band
    }
  };
}

/* بانک دوستان — اندیس‌های شبکهٔ ۲×۲ (۰..۳)؛ تکرارِ مجاور ممنوع، تکرارِ غیرمجاور از طول ۴ */
const BANK = {
  train: [
    [0, 2], [1, 3], [3, 1]
  ],
  len2: [
    [0, 3], [2, 1], [1, 0]
  ],
  len3: [
    [0, 1, 2], [2, 0, 3], [1, 3, 0]
  ],
  len4: [
    [0, 2, 3, 0], [1, 0, 3, 1], [3, 2, 0, 3]
  ],
  len5: [
    [0, 2, 1, 3, 0], [1, 0, 3, 2, 1], [2, 3, 0, 1, 2]
  ],
  len6: [
    [0, 1, 2, 3, 0, 2], [2, 3, 1, 0, 3, 1], [1, 2, 0, 3, 2, 0]
  ]
};

/* جریان authored — ترتیب قطعی؛ پیشوند تمرین (t) + پسوند پروب به ترتیب سختی */
const items = [];
items.push(item('sm_t1', 'train', 't', BANK.train[0]));
items.push(item('sm_t2', 'train', 't', BANK.train[1]));
items.push(item('sm_t3', 'train', 't', BANK.train[2]));

let n = 0;
const pushBand = (seqs) => {
  for (const seq of seqs) {
    n += 1;
    items.push(item('sm_p' + n, 'probe', 'p', seq));
  }
};
pushBand(BANK.len2);
pushBand(BANK.len3);
pushBand(BANK.len4);
pushBand(BANK.len5);
pushBand(BANK.len6);

/* ─── گیت طلایی بانک — صحت دنباله‌ها و هم‌خوانی با نردبان مرحله‌ها ─── */
const MAX_SPAN = { s1: 2, s2: 3, s3: 4, s4: 5, s5: null };
for (const it of items) {
  const seq = it.stim.seq;
  if (new Set(seq).size !== seq.length && seq.length < 4) throw new Error(`گیت طلایی: ${it.id} دنبالهٔ ${seq.length}تایی تکرار دارد — تکرار فقط از طول ۴ ${seq.join(',')}`);
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) throw new Error(`گیت طلایی: ${it.id} تکرار مجاور دارد — ${seq.join(',')}`);
  }
  if (seq.some((v) => !Number.isInteger(v) || v < 0 || v > 3)) throw new Error(`گیت طلایی: ${it.id} اندیس بیرون شبکهٔ ۲×۲ — ${seq.join(',')}`);
  const probeLen = seq.length;
  const bandMaxes = Object.entries(MAX_SPAN).filter(([, m]) => m === null || probeLen <= m).map(([s]) => s);
  if (bandMaxes.length === 0) throw new Error(`گیت طلایی: ${it.id} طول ${probeLen} در هیچ مرحله‌ای جا نمی‌شود`);
}
const spanCounts = {};
for (const it of items.filter((x) => x.phase === 'probe')) {
  spanCounts[it.stim.seq.length] = (spanCounts[it.stim.seq.length] ?? 0) + 1;
}
for (const len of [2, 3, 4, 5, 6]) {
  if ((spanCounts[len] ?? 0) < 3) throw new Error(`گیت طلایی: دنباله‌های طول ${len} کمتر از ۳ است — ${spanCounts[len] ?? 0}`);
}
/* امضای سیمون — از طول ۴ به بعد حداقل یک تکرارِ غیرمجاور در هر باند */
for (const len of [4, 5, 6]) {
  const bandItems = items.filter((x) => x.phase === 'probe' && x.stim.seq.length === len);
  const withRepeat = bandItems.filter((x) => new Set(x.stim.seq).size < x.stim.seq.length).length;
  if (withRepeat < 1) throw new Error(`گیت طلایی: باند طول ${len} آیتم دوستِ تکراری ندارد — امضای سیمون`);
}

const body = {
  package_id: 'simon1',
  goals: ['simon_seq_memory'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'simon_v1', game: 'simon', goal: 'simon_seq_memory', metric: 'accuracy_simon',
    metrics: ['accuracy_simon', 'median_rt_simon', 'simon_span_max'],
    title: 'هم‌صداها',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: {
    before: 'این بازی تمرین حافظهٔ ترتیب و تقلید متوالی است، نه درمان؛ آواز دوستان را با هم شمرده می‌شود.',
    after: 'فردا ۱۰ دقیقه کافی است؛ بی‌عجله.'
  }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed simon1 ۱.۰.۰ «حافظهٔ ترتیب — هم‌صداها» (idempotent) — ۱.۲۵.۵۲
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_simon', 'دقت آواز کامل دوستان', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_simon', 'میانهٔ زمان نخستین لمس یادآوری', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('simon_seq_memory', 'حافظهٔ ترتیب — هم‌صداها (تقلید متوالی)', 'simon1', 'accuracy_simon', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('simon1', '1.0.0', 'حافظهٔ ترتیب — هم‌صداها', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-simon.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length,
  '| probe:', items.filter((x) => x.phase === 'probe').length,
  '| span counts:', JSON.stringify(spanCounts),
  '| tempo:', JSON.stringify(Object.fromEntries(Object.entries(TEMPO).map(([k, v]) => [k, v.flash + '/' + v.gap]))));
