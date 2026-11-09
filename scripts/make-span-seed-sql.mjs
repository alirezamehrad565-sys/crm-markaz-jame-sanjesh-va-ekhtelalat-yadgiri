// مولد SQL نشاندن بستهٔ «حباب‌های عدد» (نوع span — بازهٔ عدد رو به جلو) روی D1 — INSERT امن (idempotent) — G8/۱.۲۵.۴۸
// بانک authored قطعی: seed ثابت → همان جریان در هر بازتولید.
// پارادایم مرجع — Digit Span (Wechsler؛ استانداردهای WAIS) — پیاده‌سازی اصیل
// بر قرارداد دنباله‌ای این سامانه (پاسخ {digits} با صفحه‌کلید، مقایسهٔ کامل سمت سرور).
// اهرم سختی = شمار عددهای دنباله (۳→۶) + پنجرهٔ پاسخ (stim.window_ms).
//
// گیت صحت بانک: عددها ۱..۹، بدون تکرار هم‌جوار، طول‌ها با نردبان مرحله‌ها
// (SPAN_STAGE_MAX_DIGITS) هم‌خوان‌اند — هر ناهم‌خوانی = توقف با پیام روشن.
import { writeFileSync } from 'node:fs';

const PACE_MS = 760;  /* مدت نمایش هر عدد */
const GAP_MS = 340;   /* فاصلهٔ میان عددها */

const PROMPT = 'عددها یکی‌یکی می‌آیند؛ همان‌ها را به ترتیب وارد کن.';
const PROMPT_LONG = 'دنباله بلند شد؛ در ذهنت تکرارشان کن و به ترتیب وارد کن.';

const WINDOW_3 = 18000;
const WINDOW_4 = 22000;
const WINDOW_5 = 26000;
const WINDOW_6 = 30000;

/** یک آیتم بازهٔ عدد — دنبالهٔ عددها (محرک عمومی) + کلید همان دنباله (فقط سرور) */
function item(id, phase, band, seq, window) {
  return {
    id, phase, type: 'span',
    prompt: seq.length >= 5 ? PROMPT_LONG : PROMPT,
    correct: [...seq], // کلید نمره‌دهی — stripAnswerKeys هرگز به کلاینت نمی‌فرستد
    stim: {
      seq: [...seq], // دنبالهٔ نمایش — محرک عمومی خود بازی (کودک می‌بیند)
      pace_ms: PACE_MS, gap_ms: GAP_MS,
      window_ms: window, band
    }
  };
}

/* بانک عددها — ۱..۹؛ بدون تکرار هم‌جوار؛ ترتیب قطعی authored */
const BANK = {
  train: [
    [4, 9], [2, 7], [6, 1]
  ],
  s2: [
    [3, 8, 5], [7, 2, 9], [1, 6, 4]
  ],
  s3: [
    [5, 2, 8, 3], [9, 4, 1, 7], [6, 3, 8, 2]
  ],
  s4: [
    [4, 7, 2, 9, 5], [8, 1, 6, 3, 9], [2, 5, 9, 4, 7]
  ],
  s5: [
    [6, 2, 8, 4, 1, 7], [3, 9, 5, 2, 8, 4], [7, 1, 4, 9, 3, 6]
  ]
};

/* جریان authored — ترتیب قطعی؛ پیشوند تمرین (t) + پسوند پروب به ترتیب سختی */
const items = [];
items.push(item('sp_t1', 'train', 't', BANK.train[0], WINDOW_3));
items.push(item('sp_t2', 'train', 't', BANK.train[1], WINDOW_3));
items.push(item('sp_t3', 'train', 't', BANK.train[2], WINDOW_3));

let n = 0;
const pushBand = (seqs, window) => {
  for (const seq of seqs) {
    n += 1;
    items.push(item('sp_p' + n, 'probe', 'p', seq, window));
  }
};
pushBand(BANK.s2, WINDOW_3);
pushBand(BANK.s3, WINDOW_4);
pushBand(BANK.s4, WINDOW_5);
pushBand(BANK.s5, WINDOW_6);

/* ─── گیت طلایی بانک — صحت دنباله‌ها و هم‌خوانی با نردبان مرحله‌ها ─── */
for (const it of items) {
  const seq = it.stim.seq;
  if (seq.some((v) => !Number.isInteger(v) || v < 1 || v > 9)) throw new Error(`گیت طلایی: ${it.id} عدد بیرون ۱..۹ — ${seq.join(',')}`);
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] === seq[i - 1]) throw new Error(`گیت طلایی: ${it.id} تکرار هم‌جوار دارد — ${seq.join(',')}`);
  }
}
const lenCounts = {};
for (const it of items.filter((x) => x.phase === 'probe')) {
  lenCounts[it.stim.seq.length] = (lenCounts[it.stim.seq.length] ?? 0) + 1;
}
for (const len of [3, 4, 5, 6]) {
  if ((lenCounts[len] ?? 0) < 3) throw new Error(`گیت طلایی: دنباله‌های طول ${len} کمتر از ۳ است — ${lenCounts[len] ?? 0}`);
}

const body = {
  package_id: 'span1',
  goals: ['span_number_memory'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'span_v1', game: 'span', goal: 'span_number_memory', metric: 'accuracy_span',
    metrics: ['accuracy_span', 'digitspan_span_max'],
    title: 'حباب‌های عدد',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: {
    before: 'این بازی تمرین حافظهٔ عددی است، نه درمان؛ عددها را با هم تکرار کنید.',
    after: 'فردا ۱۰ دقیقه کافی است؛ بی‌عجله.'
  }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed span1 ۱.۰.۰ «حافظهٔ عددی — حباب‌های عدد» (idempotent) — G8/۱.۲۵.۴۸
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_span', 'دقت دنبالهٔ کامل عددها', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_span', 'میانهٔ زمان نخستین لمس صفحه‌کلید (توصیفی)', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('span_number_memory', 'حافظهٔ عددی — حباب‌های عدد', 'span1', 'accuracy_span', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('span1', '1.0.0', 'حافظهٔ عددی — حباب‌های عدد', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-span.sql', sql, 'utf8');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length,
  '| probe:', items.filter((x) => x.phase === 'probe').length,
  '| len counts:', JSON.stringify(lenCounts),
  '| windows:', WINDOW_3, WINDOW_4, WINDOW_5, WINDOW_6);
