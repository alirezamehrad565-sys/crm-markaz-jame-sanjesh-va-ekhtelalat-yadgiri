// مولد SQL نشاندن بستهٔ «آلبوم خرچنگ» (نوع nback — ن‌پشت هم‌سانی دیداری) روی D1 — INSERT امن (idempotent) — ۱.۲۵.۴۰
// بانک authored قطعی: seed ثابت → همان جریان در هر بازتولید.
// پارادایم مرجع — N-back هم‌سانی (Kirchner 1958؛ Jaeggi و همکاران ۲۰۰۳) — پیاده‌سازی اصیل
// بر قرارداد timedchoice این سامانه (پاسخ {option}، دو گزینهٔ ثابت ۰=«همان است»/۱=«فرق دارد»).
// اهرم سختی گروه‌ها = سطح n (۱→۲) + پنجرهٔ پاسخ (stim.window_ms).
//
// گیت صحت چرخش (قلب بانک): پرچم همسانی هر آیتم ایستا است؛ چرخش جلسه فقط روی
// جایگاه‌های rot_start می‌افتد (لنگرها با ماهیِ یگانهٔ جریان). اسکریپت پیش از نوشتن،
// «همهٔ سرهای چرخش مجاز» را شبیه‌سازی می‌کند و راستیِ پرچم‌ها را می‌سنجد — هر ناهم‌خوانی
// = توقف با پیام روشن. این همان تضمینی است که آزمون طلایی src هم مستقل می‌گیرد.
import { writeFileSync } from 'node:fs';

/* پالت ده‌تایی ماهی — کلیدها قرارداد بانک‌اند؛ kinds/nback.js همین کلیدها را می‌کشد.
   جفت‌های رنگی نزدیک (سبز/فیروزه، نارنجی/قرمز) هرگز هم‌جوارِ ناهمسان نمی‌شوند
   تا تشخیص «فرق دارد» برای ۴–۶ سال منصف بماند */
const FISH = [
  { key: 'red', fa: 'قرمز' },
  { key: 'blue', fa: 'آبی' },
  { key: 'green', fa: 'سبز' },
  { key: 'yellow', fa: 'زرد' },
  { key: 'orange', fa: 'نارنجی' },
  { key: 'purple', fa: 'بنفش' },
  { key: 'teal', fa: 'فیروزه‌ای' },
  { key: 'pink', fa: 'صورتی' },
  { key: 'lime', fa: 'لیمویی' },
  { key: 'indigo', fa: 'نیلی' }
];
const FA_OF = Object.fromEntries(FISH.map((f) => [f.key, f.fa]));

/* ماهی‌های لنگر — یگانه در کل جریان (هیچ آیتم دیگری این رنگ را ندارد) */
const ANCHORS = { a: 'teal', b: 'pink', c: 'lime', c1: 'indigo' };
/* استخر ماهی‌های غیرلنگر — میان آیتم‌های عادی می‌چرخد */
const POOL = ['yellow', 'red', 'blue', 'green', 'orange', 'purple'];

const PROMPT_N1 = 'خرچنگ عکاس عکس تازه گرفته؛ از همان ماهیِ عکسِ قبل است یا یکی دیگر؟';
const PROMPT_N2 = 'دو قدم به عقب نگاه کن؛ عکسِ تازه از همان ماهیِ دو عکسِ قبل است؟';

const WINDOW_N1_A = 4200;
const WINDOW_N1_B = 3600;
const WINDOW_N2_C = 4600;

/** یک آیتم ن‌پشت — ماهی + سطح n + کلید (match) فقط سمت سرور می‌ماند */
const ANCHOR_FISH = new Set(Object.values(ANCHORS));
function item(id, phase, band, n, fish, match, window) {
  return {
    id, phase, type: 'nback',
    prompt: n === 2 ? PROMPT_N2 : PROMPT_N1,
    correct: match ? 0 : 1, // ۰=«همان است» / ۱=«فرق دارد» — هرگز به کلاینت نمی‌رود
    options: [
      { label: 'همان است' },
      { label: 'فرق دارد' }
    ],
    stim: {
      fish, n, window_ms: window, band,
      match, // کلید همسانی — سرور نمره می‌دهد؛ کلاینت هرگز نمی‌بیند (ANSWER_KEYS)
      ...(ANCHOR_FISH.has(fish) ? { anchor: true } : {})
    }
  };
}

/* جریان authored — ترتیب قطعی؛ پیشوند تمرین (t) + پسوند پروب (a, b, c) */
const items = [];

/* تمرین — سه عکس گرم‌کردنی n=1؛ هرگز نمی‌چرخد (فاز آموزش سرِ جلسه می‌ماند) */
items.push(item('nb_t1', 'train', 't', 1, 'yellow', false, WINDOW_N1_A));
items.push(item('nb_t2', 'train', 't', 1, 'yellow', true, WINDOW_N1_A));
items.push(item('nb_t3', 'train', 't', 1, 'red', false, WINDOW_N1_A));

/* گروه a — n=1، پنجرهٔ آرام؛ لنگر سر گروه (rot_start) */
items.push(item('nb_a0', 'probe', 'a', 1, ANCHORS.a, false, WINDOW_N1_A));
items.push(item('nb_a1', 'probe', 'a', 1, 'blue', false, WINDOW_N1_A));
items.push(item('nb_a2', 'probe', 'a', 1, 'blue', true, WINDOW_N1_A));
items.push(item('nb_a3', 'probe', 'a', 1, 'green', false, WINDOW_N1_A));
items.push(item('nb_a4', 'probe', 'a', 1, 'green', true, WINDOW_N1_A));
items.push(item('nb_a5', 'probe', 'a', 1, 'orange', false, WINDOW_N1_A));
items.push(item('nb_a6', 'probe', 'a', 1, 'purple', false, WINDOW_N1_A));
items.push(item('nb_a7', 'probe', 'a', 1, 'blue', false, WINDOW_N1_A));

/* گروه b — n=1، پنجرهٔ کوتاه‌تر؛ لنگر سر گروه (rot_start) */
items.push(item('nb_b0', 'probe', 'b', 1, ANCHORS.b, false, WINDOW_N1_B));
items.push(item('nb_b1', 'probe', 'b', 1, 'orange', false, WINDOW_N1_B));
items.push(item('nb_b2', 'probe', 'b', 1, 'green', false, WINDOW_N1_B));
items.push(item('nb_b3', 'probe', 'b', 1, 'orange', false, WINDOW_N1_B));
items.push(item('nb_b4', 'probe', 'b', 1, 'orange', true, WINDOW_N1_B));
items.push(item('nb_b5', 'probe', 'b', 1, 'yellow', false, WINDOW_N1_B));
items.push(item('nb_b6', 'probe', 'b', 1, 'yellow', true, WINDOW_N1_B));
items.push(item('nb_b7', 'probe', 'b', 1, 'green', false, WINDOW_N1_B));

/* گروه c — n=2 (دو قدم به عقب)، پنجرهٔ بلندتر برای بار حافظه‌ای؛
   سر گروه (c0) rot_start است؛ c1 هم لنگر است (دوقدم‌عقبش با چرخش عوض می‌شود).
   matchهای گروه از مقایسهٔ دوقدمی درون گروه می‌آیند — ماهیِ لنگر هرگز تکرار نمی‌شود */
items.push(item('nb_c0', 'probe', 'c', 2, ANCHORS.c, false, WINDOW_N2_C));
items.push(item('nb_c1', 'probe', 'c', 2, ANCHORS.c1, false, WINDOW_N2_C));
items.push(item('nb_c2', 'probe', 'c', 2, 'blue', false, WINDOW_N2_C));
items.push(item('nb_c3', 'probe', 'c', 2, 'orange', false, WINDOW_N2_C));
items.push(item('nb_c4', 'probe', 'c', 2, 'blue', true, WINDOW_N2_C));
items.push(item('nb_c5', 'probe', 'c', 2, 'purple', false, WINDOW_N2_C));
items.push(item('nb_c6', 'probe', 'c', 2, 'blue', true, WINDOW_N2_C));
items.push(item('nb_c7', 'probe', 'c', 2, 'orange', false, WINDOW_N2_C));

/* پرچم rot_start — فقط سرِ گروه‌های پروب (تنها سرهای چرخش‌ایمن) */
for (const id of ['nb_a0', 'nb_b0', 'nb_c0']) {
  const it = items.find((x) => x.id === id);
  it.stim.rot_start = true;
}

/* ─── گیت طلایی بانک — شبیه‌سازی همهٔ سرهای چرخش مجاز + ترتیب authored ───
   برای هر سرِ چرخش: پرچم هر آیتم باید با مقایسهٔ واقعی در ترتیبِ نمایشی برابر باشد؛
   سرِ چرخش باید لنگر باشد (ماهیِ یگانه → همسانی‌اش با هر پیشینه‌ای false است) */
function displayedStream(offset) {
  const train = items.filter((it) => it.phase === 'train');
  const probe = items.filter((it) => it.phase === 'probe');
  const head = probe.slice(offset), tail = probe.slice(0, offset);
  return [...train, ...head, ...tail];
}
function fishOf(it) { return it.stim.fish; }
function backOf(stream, i, n) { return i - n >= 0 ? stream[i - n] : null; }

const rotStarts = items
  .map((it, i) => ({ it, i }))
  .filter((x) => x.it.phase === 'probe' && x.it.stim.rot_start === true)
  .map((x) => items.filter((it) => it.phase === 'probe').indexOf(x.it));

for (const offset of [0, ...rotStarts]) {
  const stream = displayedStream(offset);
  for (let i = 0; i < stream.length; i++) {
    const it = stream[i];
    const n = it.stim.n;
    const back = backOf(stream, i, n);
    const truth = back === null ? false : fishOf(back) === fishOf(it);
    if (it.stim.match !== truth) {
      throw new Error(`گیت طلایی سرِ چرخش ${offset}: پرچم ${it.id} ناراست است — authored=${it.stim.match} واقعی=${truth}`);
    }
    // پنجرهٔ دوقدمیِ سرِ گروه c به گروه b اشاره می‌کند — برای کودک معنادار است
    // (دو عکس به عقب، فارغ از گروه)؛ لنگرِ c0/c1 پاسخ را همیشه false تضمین می‌کند
  }
}

/* یگانگی لنگرها در کل جریان */
for (const [, key] of Object.entries(ANCHORS)) {
  const count = items.filter((it) => fishOf(it) === key).length;
  if (count !== 1) throw new Error(`لنگر ${key} یگانه نیست — ${count} بار دیده شد`);
}

/* نسبت همسانی پسوند پروب ~۳۰٪ (پروپوزال پروتکل) */
const probe = items.filter((it) => it.phase === 'probe');
const matchCount = probe.filter((it) => it.stim.match === true).length;
const ratio = matchCount / probe.length;
if (ratio < 0.2 || ratio > 0.4) throw new Error(`نرخ همسانی خارج از کرانهٔ ~۳۰٪: ${(ratio * 100).toFixed(0)}٪`);

const body = {
  package_id: 'nback1',
  goals: ['nback_working_memory'],
  mastery: { threshold: 78, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'nback_v1', game: 'nback', goal: 'nback_working_memory', metric: 'accuracy_nback',
    metrics: ['accuracy_nback', 'median_rt_nback', 'nback_match_pct', 'nback_nonmatch_pct', 'nback_false_alarm_pct', 'nback_miss_pct'],
    title: 'آلبوم خرچنگ',
    mastery: { threshold: 78, sessions: 2 },
    items
  }],
  parent_copy: {
    before: 'این بازی تمرین حافظهٔ کاری است، نه درمان؛ عکس‌ها را با هم مقایسه کنید.',
    after: 'فردا ۱۰ دقیقه کافی است؛ بی‌عجله.'
  }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed nback1 ۱.۰.۰ «حافظهٔ کاری — آلبوم خرچنگ» (idempotent) — ۱.۲۵.۴۰
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_nback', 'دقت هم‌سانی/تفکیک ن‌پشت', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_nback', 'میانهٔ زمان نخستین پاسخ', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('nback_working_memory', 'حافظهٔ کاری — آلبوم خرچنگ', 'nback1', 'accuracy_nback', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('nback1', '1.0.0', 'حافظهٔ کاری — آلبوم خرچنگ', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-nback.sql', sql, 'utf8');
const matchPct = (ratio * 100).toFixed(0);
console.log('SQL ready — bytes:', sql.length, 'items:', items.length,
  '| probe:', probe.length, 'match%:', matchPct,
  '| rot_starts:', rotStarts.join(','));
console.log('anchors:', Object.values(ANCHORS).join(','), '| windows:', WINDOW_N1_A, WINDOW_N1_B, WINDOW_N2_C);
