// مولد SQL نشاندن بستهٔ «آلبوم خرچنگ» (ن‌پشت / نوع nback) روی D1 عملیاتی — INSERT امن (idempotent) — ۱.۲۵.۴۰ — ۱۴۰۵/۰۸/۱۷
// بانک authored قطعی: ترتیب ثابت در همین فایل → همان ۲۷ کارت در هر بازتولید.
// قرارداد بازی: دوگزینه‌ای «همان است (۰) / فرق دارد (۱)»؛ حکم همسانی (stim.match) نسبت به
// n قدم عقب‌تر در ترتیب authored (n=1: یک عکس به عقب، n=2: دو عکس) — کلید فقط سرور می‌ماند.
// چرخش لنگر-مقید (ضدحفظ بین جلسه‌ها): سرِ زنجیره‌های مستقل n-back با stim.rot_start نشانه
// می‌شود و آفستِ چرخش پسوند پروب فقط روی همین سرها می‌نشیند — درون هر زنجیره ترتیب و
// حکم‌ها عیناً می‌ماند. لنگرها ماهیِ یگانهٔ جریان‌اند (هر کدام دقیقاً یک‌بار در کل ۲۷ کارت):
//   teal → nb-a1 (سر گروه a) · pink → nb-b1 (سر گروه b) · lime → nb-c1 (سر گروه c)
//   indigo → nb-c2 (قدم دوم گروه c — همیشه ناهمسان؛ ماهی یگانهٔ جریان، بدون rot_start)
// اهرم سختی = پلهٔ n (گروه‌های a/b با n=1، گروه c با n=2) و پنجرهٔ پاسخ هر گروه.
import { writeFileSync } from 'node:fs';

/* پالت ثابت ۱۰ ماهی — کلیدها قرارداد بانک‌اند؛ kinds/nback.js همین کلیدها را می‌کشد */
const PALETTE = ['red', 'blue', 'green', 'yellow', 'orange', 'purple', 'teal', 'pink', 'lime', 'indigo'];
const UNIQUE_FISH = ['teal', 'pink', 'lime', 'indigo']; // ماهی‌های یگانه — هر کدام یک‌بار در کل جریان

const OPTS = [{ label: 'همان است' }, { label: 'فرق دارد' }];
const WIN_TRAIN = 4200;
const WIN = { a: 4200, b: 3600, c: 4600 };
const PROMPT_N1 = 'اگر ماهیِ امروزی همانِ یک قدم عقب‌تر بود، «همان است» را لمس کن.';
const PROMPT_N2 = 'اگر ماهیِ امروزی همانِ دو قدم عقب‌تر بود، «همان است» را لمس کن.';
const PROMPT_TRAIN = 'به ماهی‌ها نگاه کن؛ اگر ماهیِ امروزی همانِ یک قدم عقب‌تر بود، «همان است» را لمس کن.';

/** ترتیب ماهی‌های هر گروه — authored و قطعی؛ شمار همسان‌ها: a=۲، b=۲، c=۳ (از ۲۴ پروب = ~۲۹٪) */
const GROUP_FISH = {
  a: ['teal', 'red', 'red', 'blue', 'green', 'green', 'yellow', 'orange'],
  b: ['pink', 'purple', 'blue', 'blue', 'yellow', 'orange', 'orange', 'red'],
  c: ['lime', 'indigo', 'red', 'green', 'red', 'green', 'blue', 'green']
};
const GROUP_N = { a: 1, b: 1, c: 2 };
const GROUP_PROMPT = { a: PROMPT_N1, b: PROMPT_N1, c: PROMPT_N2 };

/** یک کارت ن‌پشت — ماهی + پلهٔ n + حکم همسانی + کلید (فقط سمت سرور می‌ماند) */
function card(id, phase, fish, n, match, windowMs, flags) {
  return {
    id, phase, type: 'nback', prompt: phase === 'train' ? PROMPT_TRAIN : GROUP_PROMPT[n === 2 ? 'c' : 'a'],
    correct: match ? 0 : 1, // ۰=«همان است» / ۱=«فرق دارد» — هرگز به کلاینت نمی‌رود
    options: OPTS.map((o) => ({ ...o })),
    stim: { fish, n, match, window_ms: windowMs, ...flags }
  };
}

const items = [];
/* پیشوند تمرین (هرگز نمی‌چرخد) — سه کارت n=1: نخستین حکم بی‌مرجع، دوم همسان، سوم ناهمسان */
items.push(card('nb-t1', 'train', 'red', 1, false, WIN_TRAIN, {}));
items.push(card('nb-t2', 'train', 'red', 1, true, WIN_TRAIN, {}));  // همسان با nb-t1 (یک قدم عقب‌تر)
items.push(card('nb-t3', 'train', 'blue', 1, false, WIN_TRAIN, {})); // ناهمسان با nb-t2

/* پروب‌ها — سه گروه authored: سر هر گروه زنجیرهٔ مستقل n-back را باز می‌کند */
const HEADS = { a: 0, b: 0, c: 0 }; // rot_start فقط روی سر گروه‌ها (اندیس صفر هر گروه)
for (const g of ['a', 'b', 'c']) {
  GROUP_FISH[g].forEach((fish, i) => {
    const n = GROUP_N[g];
    let match;
    if (i < n) {
      match = false; // پنجرهٔ n قدم در سر گروه کامل نیست — حکم همسانی تعریف‌نشده = ناهمسان
    } else {
      const back = GROUP_FISH[g][i - n];
      match = fish === back; // حکم نسبت به n قدم عقب‌تر در ترتیب authored همان گروه
    }
    const flags = {};
    if (i === HEADS[g]) flags.rot_start = true;      // سر زنجیره — تنها جایگاه مجاز چرخش
    if (i === HEADS[g] || (g === 'c' && i === 1)) flags.anchor = true; // ماهی یگانهٔ جریان
    items.push(card('nb-' + g + (i + 1), 'probe', fish, n, match, WIN[g], flags));
  });
}

/* ─── گیت طلایی بانک — هر خطا = توقف با پیام روشن؛ SQL فقط از بانک سالم صادر می‌شود ─── */

/** چرخش پیمانه‌ای پسوند پروب — آینهٔ nbackOrderedItems سرور (src/domain/games/stimulus.ts)؛
 *  آفست فقط روی «جایگاه سر زنجیره» می‌نشیند تا زنجیره‌ها و حکم‌ها سالم بمانند */
function rotateFlow(flow, trainCount, offset) {
  const head = flow.slice(0, trainCount);
  const suffix = flow.slice(trainCount);
  const len = suffix.length;
  if (len <= 1) return flow.slice();
  const off = ((offset % len) + len) % len;
  return [...head, ...suffix.slice(off), ...suffix.slice(0, off)];
}

/** سرهای چرخش مجاز یک جریان — آینهٔ سرویس: اندیس rot_start درون پسوند پروب */
function anchorsOf(flow, trainCount) {
  return flow.slice(trainCount)
    .map((it, i) => (it.stim.rot_start === true ? i : -1))
    .filter((i) => i >= 0);
}

/** راستیِ همهٔ حکم‌ها در یک جریان — position<n → ناهمسان؛ else match === (fish === fish_{i-n}) */
function assertFlow(name, flow) {
  for (let i = 0; i < flow.length; i++) {
    const it = flow[i];
    const n = it.stim.n;
    if (i < n) {
      if (it.stim.match !== false) throw new Error(`گیت طلایی ${name}: «${it.id}» پنجرهٔ n قدم کامل ندارد ولی match=${it.stim.match}`);
      continue;
    }
    const back = flow[i - n].stim.fish;
    const truth = back === it.stim.fish;
    if (it.stim.match !== truth) throw new Error(`گیت طلایی ${name}: حکم «${it.id}» با n=${n} قدم عقب‌تر نمی‌خواند (match=${it.stim.match}، حقیقت=${truth})`);
  }
  // سقف همسانِ پیاپی ≤ ۲ — بیش از آن پاسخ به قاعده به حفظ کوتاه‌مدت تبدیل می‌شود
  let run = 0;
  for (const it of flow) {
    run = it.stim.match ? run + 1 : 0;
    if (run > 2) throw new Error(`گیت طلایی ${name}: بیش از دو همسانِ پیاپی (${it.id})`);
  }
}

/* ۱) صحت ساختاری هر کارت */
for (const it of items) {
  if (!PALETTE.includes(it.stim.fish)) throw new Error('ماهی ناشناخته: ' + it.id);
  if (it.stim.n !== 1 && it.stim.n !== 2) throw new Error('پلهٔ n بیرون از {۱،۲}: ' + it.id);
  if (!(it.stim.window_ms >= 800 && it.stim.window_ms <= 8000)) throw new Error('پنجرهٔ خارج از کرانهٔ ۸۰۰..۸۰۰۰: ' + it.id);
  if (it.correct !== (it.stim.match ? 0 : 1)) throw new Error('کلید ناهم‌خوان با حکم: ' + it.id);
  if (JSON.stringify(it.options) !== JSON.stringify(OPTS)) throw new Error('گزینه‌ها دو گزینهٔ ثابت نیستند: ' + it.id);
}

/* ۲) یگانگی ماهی‌های لنگر — هر کدام دقیقاً یک‌بار در کل ۲۷ کارت */
for (const f of UNIQUE_FISH) {
  const n = items.filter((it) => it.stim.fish === f).length;
  if (n !== 1) throw new Error(`گیت طلایی: ماهی یگانهٔ «${f}» ${n} بار در جریان است (باید دقیقاً ۱ باشد)`);
}
const anchors = items.filter((it) => it.stim.anchor === true).map((it) => it.id);
if (JSON.stringify(anchors) !== JSON.stringify(['nb-a1', 'nb-b1', 'nb-c1', 'nb-c2'])) {
  throw new Error('گیت طلایی: پرچم anchor دقیقاً روی چهار ماهی یگانه نیست: ' + anchors.join(','));
}
const rotStarts = items.filter((it) => it.stim.rot_start === true).map((it) => it.id);
if (JSON.stringify(rotStarts) !== JSON.stringify(['nb-a1', 'nb-b1', 'nb-c1'])) {
  throw new Error('گیت طلایی: rot_start فقط روی سر سه گروه است: ' + rotStarts.join(','));
}

/* ۳) شبیه‌سازی «ترتیب authored + هر سه سر چرخش» — بانک کامل بی‌مرحله */
const full = items;
const trainCount = full.filter((it) => it.phase === 'train').length;
const heads = anchorsOf(full, trainCount);
if (JSON.stringify(heads) !== JSON.stringify([0, 8, 16])) {
  throw new Error('گیت طلایی: سرهای چرخش جریان کامل باید [۰،۸،۱۶] باشند: ' + heads.join(','));
}
for (const off of heads) {
  const flow = rotateFlow(full, trainCount, off);
  // سرِ جریان چرخیده همیشه لنگر است (آفست صفر = سر تمرین، پسوند دست‌نخورده)
  if (off > 0 && flow[trainCount].stim.rot_start !== true) {
    throw new Error(`گیت طلایی: با آفست ${off} سر پسوند پروب لنگر نیست`);
  }
  assertFlow('جریان کامل آفست ' + off, flow);
}
/* ۴) جریان مرحلهٔ n=1 (s1/s2) — بانک پالایش‌شده به پروب‌های یک‌قدمی؛ سرهای چرخش [۰،۸] */
const flowN1 = full.filter((it) => it.phase === 'train' || it.stim.n === 1);
const headsN1 = anchorsOf(flowN1, trainCount);
if (JSON.stringify(headsN1) !== JSON.stringify([0, 8])) {
  throw new Error('گیت طلایی: سرهای چرخش جریان n=1 باید [۰،۸] باشند: ' + headsN1.join(','));
}
for (const off of headsN1) assertFlow('جریان n=1 آفست ' + off, rotateFlow(flowN1, trainCount, off));
/* ۵) جریان مرحلهٔ n=2 (s3..s5) — فقط گروه c بی‌پیشوند تمرین؛ تنها سر چرخش [۰] */
const flowN2 = full.filter((it) => it.stim.n === 2);
const headsN2 = anchorsOf(flowN2, 0);
if (JSON.stringify(headsN2) !== JSON.stringify([0])) {
  throw new Error('گیت طلایی: سرهای چرخش جریان n=2 باید [۰] باشد: ' + headsN2.join(','));
}
assertFlow('جریان n=2 آفست ۰', rotateFlow(flowN2, 0, 0));

/* ۶) نسبت همسانی پروب ~۳۰٪ (۲۵٪ هم قابل قبول) — ۷ همسان از ۲۴ = ~۲۹٪ */
const probes = items.filter((it) => it.phase === 'probe');
const matchN = probes.filter((it) => it.stim.match).length;
const ratio = matchN / probes.length;
if (!(ratio >= 0.25 && ratio <= 0.34)) {
  throw new Error(`گیت طلایی: نسبت همسانی پروب ${Math.round(ratio * 100)}٪ بیرون از بازهٔ ۲۵..۳۴٪ است`);
}

/* ─── SQL — الگوی بسته‌های پیشین: سنجه/هدف/بسته؛ چهار سنجهٔ موتور از رجیستری می‌آیند ─── */
const body = {
  package_id: 'nback1',
  goals: ['nback_working_memory'],
  mastery: { threshold: 65, sessions: 2 },
  tone_rules: ['no_timer', 'no_rank', 'no_streak', 'no_fail_message'],
  missions: [{
    id: 'nback_v1', game: 'nback', goal: 'nback_working_memory', metric: 'accuracy_nback',
    metrics: ['accuracy_nback', 'median_rt_nback'],
    title: 'آلبوم خرچنگ',
    mastery: { threshold: 65, sessions: 2 },
    items
  }],
  parent_copy: { before: 'این بازی تمرین نگه‌داشتن و یادآوری است، نه درمان.', after: 'فردا ۱۰ دقیقه کافی است.' }
};
const dose = { days_per_week: 3, minutes: 10, max_missions_per_day: 2, min_weeks: 4 };
const now = new Date().toISOString();

const esc = (s) => s.replace(/'/g, "''");
const sql = `-- seed nback1 ۱.۰.۰ «حافظهٔ کاری — آلبوم خرچنگ» (idempotent) — ۱.۲۵.۴۰
INSERT OR IGNORE INTO game_metrics (id, title_fa, unit, higher_is_better, source, formula) VALUES
  ('accuracy_nback', 'دقت حکم همسانی ن‌پشت', 'percent', 1, 'auto', 'accuracy'),
  ('median_rt_nback', 'میانهٔ زمان حکم همسانی', 'ms', 0, 'auto', 'median_rt');
INSERT OR REPLACE INTO game_goals (id, title_fa, package_id, metric_id, age_min, age_max) VALUES
  ('nback_working_memory', 'حافظهٔ کاری — آلبوم خرچنگ', 'nback1', 'accuracy_nback', 4, 12);
INSERT OR REPLACE INTO game_packages (id, version, title_fa, evidence_level, dose_json, status, body_json, reviewed_by, reviewed_at, created_at) VALUES
  ('nback1', '1.0.0', 'حافظهٔ کاری — آلبوم خرچنگ', 'B', '${esc(JSON.stringify(dose))}', 'published', '${esc(JSON.stringify(body))}', NULL, '${now}', '${now}');
`;
writeFileSync('/tmp/seed-nback.sql', sql, 'utf8');
const winSummary = 'train:' + WIN_TRAIN + 'ms  a(n=1):' + WIN.a + 'ms  b(n=1):' + WIN.b + 'ms  c(n=2):' + WIN.c + 'ms';
console.log('SQL ready — bytes:', sql.length, 'items:', items.length, '|', winSummary);
console.log('rot_start:', rotStarts.join(','), '| anchors:', anchors.join(','), '| rotation heads:', heads.join(','));
console.log('probe matches:', matchN + '/' + probes.length, '(~' + Math.round(ratio * 100) + '٪)');
console.log('correct index:', items.map((it) => it.correct).join(','));
