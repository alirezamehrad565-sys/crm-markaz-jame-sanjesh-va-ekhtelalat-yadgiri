// مولد SQL نشاندن بستهٔ «حقه‌باز رنگ‌ها» (نوع stroop) روی D1 عملیاتی — INSERT امن (idempotent) — ۱.۲۵.۳۲ — ۱۴۰۵/۰۸/۱۷
// بانک authored قطعی: seed ثابت → همان کارت‌ها در هر بازتولید.
// اقتباس مکانیک — مجوز MIT: jspsych/jspsych-timelines — packages/stroop-task
// (مولد ضرب‌دکارتی واژه×جوهر، پرچم congruent، correct = اندیس رنگ جوهر در گزینه‌ها،
// پنجرهٔ زمانی پاسخ) — وفق‌داده‌شده به قرارداد timedchoice این سامانه (پاسخ {option}).
// اهرم سختی مرحله‌ها = نسبت کنگرنت/ناهمخوان + شمار گزینه‌ها + پنجرهٔ پاسخ (stim.window_ms).
// در ناهمخوان‌ها رنگِ خودِ واژه هم میان گزینه‌ها هست (تلهٔ معنی واژه — قلب استروپ).
import { writeFileSync } from 'node:fs';

/* PRNG قطعی mulberry32 — همان الگوی make-scan-seed-sql.mjs؛ بانک authored قابل بازتولید است */
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

/* پالت ثابت ۶ رنگ — کلیدها قرارداد بانک‌اند؛ kinds-stroop.js همین کلیدها را می‌کشد */
const PALETTE = [
  { key: 'red', fa: 'قرمز' },
  { key: 'blue', fa: 'آبی' },
  { key: 'green', fa: 'سبز' },
  { key: 'yellow', fa: 'زرد' },
  { key: 'orange', fa: 'نارنجی' },
  { key: 'purple', fa: 'بنفش' }
];
const KEYS = PALETTE.map((c) => c.key);
const FA_OF = Object.fromEntries(PALETTE.map((c) => [c.key, c.fa]));

/* متن روبه‌کودک — آرام، بی‌سرزنش، بی‌فشار (§۲)؛ markup هم همین را دارد */
const PROMPT = 'حقه‌باز رنگِ واژه را عوض می‌کند؛ تو رنگِ واقعی را لمس کن.';

/* پیکربندی گروه‌ها — a=مرحلهٔ ۱ … d=مرحلهٔ ۴، p=پروب؛ اهرم سختی متفاوت در هر گروه */
const BANDS = {
  a: { window: 4500, opts: 2, cong: 'all', count: 8, phase: 'train' },    // کنگرنت خالص — گرم‌کردن
  b: { window: 4000, opts: 4, cong: 'half', count: 6, phase: 'train' },   // آمیختهٔ متوازن
  c: { window: 4000, opts: 4, cong: 'rare', count: 6, phase: 'train' },   // اکثراً ناهمخوان
  d: { window: 3400, opts: 4, cong: 'none', count: 6, phase: 'train' },   // تمام ناهمخوان
  p: { window: 3600, opts: 'mixed46', cong: 'some', count: 8, phase: 'probe' } // پروب آمیختهٔ متنوع
};

/* الگوی کنگرنتی هر گروه بر جایگاه آیتم — متوازن و قطعی */
function isCongruent(band, i) {
  if (band.cong === 'all') return true;
  if (band.cong === 'none') return false;
  if (band.cong === 'half') return i % 2 === 0;      // ۳ کنگرنت / ۳ ناهمخوان
  if (band.cong === 'rare') return i === 2;          // ۱ کنگرنت / ۵ ناهمخوان
  return i === 0 || i === 3 || i === 5;              // some — ۳ کنگرنت از ۸، پخش در موج
}

/* پروب متنوع: یک‌درمیان ۴ و ۶ گزینه */
function optionCount(band, i) {
  return band.opts === 'mixed46' ? (i % 3 === 1 ? 6 : 4) : band.opts;
}

/** یک کارت استروپ — واژه + جوهرِ حقه + گزینه‌ها + کلید (فقط سمت سرور می‌ماند) */
function card(id, band, bandKey, salt, i) {
  const rand = mulberry32(0x57200D ^ (salt * 2654435761));
  const cong = isCongruent(band, i);
  // واژه — پخش قطعی روی هر ۶ رنگ
  const wordKey = KEYS[Math.floor(rand() * KEYS.length)];
  // جوهر — کنگرنت = خود واژه؛ ناهمخوان = رنگی دیگر (حقهٔ حقه‌باز)
  let inkKey = wordKey;
  if (!cong) {
    const others = KEYS.filter((k) => k !== wordKey);
    inkKey = others[Math.floor(rand() * others.length)];
  }
  // گزینه‌ها — جوهر همیشه هست؛ در ناهمخوان، رنگِ واژه هم هست (تلهٔ معنی واژه)
  const n = optionCount(band, i);
  const set = new Set([inkKey]);
  if (!cong && n >= 3) set.add(wordKey);
  const rest = KEYS.filter((k) => !set.has(k));
  while (set.size < n && rest.length > 0) {
    set.add(rest.splice(Math.floor(rand() * rest.length), 1)[0]);
  }
  const options = [...set];
  // چینش قطعی گزینه‌ها (فیشر-یتس) — کلید پس از چینش ثبت می‌شود
  for (let k = options.length - 1; k > 0; k--) {
    const j = Math.floor(rand() * (k + 1));
    [options[k], options[j]] = [options[j], options[k]];
  }
  return {
    id, phase: band.phase, type: 'stroop', prompt: PROMPT,
    correct: options.indexOf(inkKey), // اندیس رنگ جوهر — هرگز به کلاینت نمی‌رود
    options,
    stim: { word: FA_OF[wordKey], ink: inkKey, window_ms: band.window, congruent: cong, band: bandKey }
  };
}

const items = [];
const counters = { a: 0, b: 0, c: 0, d: 0, p: 0 };
let salt = 1;
for (const bandKey of ['a', 'b', 'c', 'd', 'p']) {
  const band = BANDS[bandKey];
  for (let i = 0; i < band.count; i++) {
    counters[bandKey] += 1;
    items.push(card('st' + bandKey + counters[bandKey], band, bandKey, salt++, i));
  }
}

/* راستی‌آزمایی بانک پیش از نوشتن — هر خطا = توقف با پیام روشن */
for (const it of items) {
  if (!(it.correct >= 0 && it.correct < it.options.length)) throw new Error('correct خارج از گزینه‌ها: ' + it.id);
  if (new Set(it.options).size !== it.options.length) throw new Error('گزینهٔ تکراری: ' + it.id);
  if (!(it.stim.window_ms >= 800 && it.stim.window_ms <= 8000)) throw new Error('پنجرهٔ خارج از کرانهٔ ۸۰۰..۸۰۰۰: ' + it.id);
  if (!FA_OF[it.stim.ink]) throw new Error('جوهر ناشناخته: ' + it.id);
  if (it.stim.congruent !== (it.stim.word === FA_OF[it.stim.ink])) throw new Error('پرچم congruent ناهم‌خوان با واژه/جوهر: ' + it.id);
}

const body = {
  package_id: 'stroop1',
  goals: ['stroop_attention'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'stroop_v1', game: 'stroop', goal: 'stroop_attention', metric: 'accuracy_stroop',
    metrics: ['accuracy_stroop', 'median_rt_stroop', 'stroop_congruent_pct', 'stroop_incongruent_pct', 'stroop_interference_ms'],
    title: 'حقه‌باز رنگ‌ها',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین توجه و دقت است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed stroop1 ۱.۰.۰ «توجه و تمرکز — حقه‌باز رنگ‌ها» (idempotent) — ۱.۲۵.۳۲
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_stroop', 'دقت لمس رنگ جوهر', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_stroop', 'میانهٔ زمان نخستین لمس', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('stroop_attention', 'توجه و تمرکز — رنگ جوهر را بگیر', 'stroop1', 'accuracy_stroop', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('stroop1', '1.0.0', 'توجه و تمرکز — حقه‌باز رنگ‌ها', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-stroop.sql', sql, 'utf8');
const bandSummary = Object.keys(BANDS).map((k) => {
  const g = items.filter((it) => it.stim.band === k);
  return k + ':' + g.length + '×' + g[0].options.length + 'گزینه/' + g[0].stim.window_ms + 'ms';
}).join('  ');
console.log('SQL ready — bytes:', sql.length, 'items:', items.length, '|', bandSummary);
console.log('congruent per band:', Object.keys(BANDS).map((k) => k + '=' + items.filter((it) => it.stim.band === k && it.stim.congruent).length).join('  '));
console.log('correct index:', items.map((it) => it.correct).join(','));
