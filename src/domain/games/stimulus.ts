// stimulus.ts — مولد محرک گو/نوگو (فاز ۱ بازطراحی / ۱.۲۵.۱۱) — موتور خالص، بدون DB و UI
// دفترچهٔ وظیفه §۱: «Stimulus Generator: شبه‌تصادفی + seed + رعایت نسبت + سقف تکرار پیاپی +
// دنبالهٔ قابل‌ذخیره و بازتولید». ترتیب authored علم نیست (C2 ممیزی) — دنباله از seed می‌آید،
// در جلسه ذخیره می‌شود و با همان seed عیناً بازتولید می‌شود.
//
// تضمین‌ها:
//   ۱) قطعیت: همان seed و گزینه‌ها → عین همان دنباله (آزمون طلایی).
//   ۲) نسبت: شمارش گو دقیقاً round(count×goRatio) — سهمیه سراسری، نه تاس‌ریزی.
//   ۳) سقف تکرار: هیچ اجرای پیاپی یک دسته از maxConsecutiveSame بلندتر نمی‌شود
//      (نگهبان امکان‌پذیری در هر گام — گامِ مرده ساخته نمی‌شود).
//   ۴) بلوک‌بندی: اندیس‌ها به بلوک‌های blockSize تایی بریده می‌شوند.

export type TrialKind = 'go' | 'nogo';

export interface GeneratedTrial {
  /** جایگاه یک‌مبنا در دنبالهٔ کل */
  index: number;
  /** دستهٔ آزمون: go = لمس کن، nogo = بازداری */
  kind: TrialKind;
  /** بلوک یک‌مبنای آزمون */
  block: number;
}

export interface SequenceOptions {
  /** seed متنی — هر رشته؛ هش قطعی FNV-1a به عدد تبدیل می‌شود */
  seed: string;
  /** تعداد کل آزمون‌های دنباله */
  count: number;
  /** نسبت گو ۰..۱ */
  goRatio: number;
  /** سقف تکرار پیاپی یک دسته */
  maxConsecutiveSame: number;
  /** طول بلوک */
  blockSize: number;
}

export interface GeneratedSequence {
  seed: string;
  count: number;
  go_ratio: number;
  max_consecutive_same: number;
  block_size: number;
  /** شمارش واقعی گوها — ثبت در جلسه و راستی‌آزمایی نسبت */
  go_count: number;
  trials: GeneratedTrial[];
}

/** PRNG شبه‌تصادفی قطعی mulberry32 — سبک، بدون وابستگی؛ خروجی [۰,۱) */
export function mulberry32(seedNum: number): () => number {
  let a = seedNum >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** هش قطعی seed متنی → عدد ۳۲ بیتی (FNV-1a) — همان seed، همان دنباله، همیشه */
export function seedToNumber(seed: string): number {
  let h = 0x811C9DC5;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** طول اجرای پیاپیِ دستهٔ kind در انتهای بخش kinds[0..i) */
function runBefore(kinds: TrialKind[], i: number, kind: TrialKind): number {
  let n = 0;
  for (let k = i - 1; k >= 0; k--) {
    if (kinds[k] !== kind) break;
    n++;
  }
  return n;
}

/**
 * بررسی دقیقِ امکان‌پذیری: با g گو و n نوگوی باقی‌مانده و اجرای جاری gr/nr،
 * آیا می‌توان تا انتها رفت بدون نقض سقف تکرار؟ تعریف بازگشتی — پس اگر وضعیتِ فعلی
 * از همین تابع «ممکن‌پذیر» رسیده باشد، همیشه دست کم یک انتخاب مجاز وجود دارد
 * (گام مرده نظریاً ناممکن است).
 */
function canPlaceExact(
  g: number, n: number, goRun: number, nogoRun: number, maxRun: number,
  memo: Map<string, boolean>
): boolean {
  // اجرای جاری که خودش از سقف گذشته — دنباله از قبل نقض شده؛ هیچ تکمیلی نجاتش نمی‌دهد
  if (goRun > maxRun || nogoRun > maxRun) return false;
  if (g === 0 && n === 0) return true;
  if (n === 0) return goRun + g <= maxRun;
  if (g === 0) return nogoRun + n <= maxRun;
  const key = g + ':' + n + ':' + goRun + ':' + nogoRun;
  const hit = memo.get(key);
  if (hit !== undefined) return hit;
  let ok = false;
  if (goRun + 1 <= maxRun && canPlaceExact(g - 1, n, goRun + 1, 0, maxRun, memo)) ok = true;
  if (!ok && nogoRun + 1 <= maxRun && canPlaceExact(g, n - 1, 0, nogoRun + 1, maxRun, memo)) ok = true;
  memo.set(key, ok);
  return ok;
}

export function generateSequence(opts: SequenceOptions): GeneratedSequence {
  const count = Math.max(1, Math.floor(opts.count));
  const goRatio = Math.min(1, Math.max(0, opts.goRatio));
  const blockSize = Math.max(1, Math.floor(opts.blockSize));
  let maxRun = Math.max(2, Math.floor(opts.maxConsecutiveSame));

  let goTarget = Math.round(count * goRatio);
  let nogoTarget = count - goTarget;

  // حالت تک‌دسته (ratio=۰ یا ۱): سقف تکرار بی‌معناست و باید تا کل دنباله گشاد شود
  if (goTarget === 0 || nogoTarget === 0) maxRun = Math.max(maxRun, count);
  // نگهبان نسبت: پیکربندی ناممکن (مثل ۹ گو و ۱ نوگو با سقف ۳) به نزدیک‌ترین نسبت ممکن قطعی می‌نشیند
  else {
    if (goTarget > (nogoTarget + 1) * maxRun) {
      goTarget = (nogoTarget + 1) * maxRun;
      nogoTarget = count - goTarget;
    }
    if (nogoTarget > (goTarget + 1) * maxRun) {
      nogoTarget = (goTarget + 1) * maxRun;
      goTarget = count - nogoTarget;
    }
  }

  const rand = mulberry32(seedToNumber(opts.seed));
  const kinds: TrialKind[] = new Array(count);
  let goLeft = goTarget;
  const memo: Map<string, boolean> = new Map();

  for (let i = 0; i < count; i++) {
    const remaining = count - i;
    const goRun = runBefore(kinds, i, 'go');
    const nogoRun = runBefore(kinds, i, 'nogo');
    const nogoLeft = remaining - goLeft;

    // مجموعهٔ انتخاب مجاز: سهمیه + سقف تکرار + امکان‌پذیری دقیقِ دنبالهٔ باقی
    const allowGo = goLeft > 0 && canPlaceExact(goLeft - 1, nogoLeft, goRun + 1, 0, maxRun, memo);
    const allowNogo = nogoLeft > 0 && canPlaceExact(goLeft, nogoLeft - 1, 0, nogoRun + 1, maxRun, memo);
    let kind: TrialKind;
    if (allowGo && allowNogo) kind = rand() < goRatio ? 'go' : 'nogo';
    else if (allowGo) kind = 'go';
    else if (allowNogo) kind = 'nogo';
    else kind = goLeft >= nogoLeft ? 'go' : 'nogo'; // چالهٔ نظری — با تعریف بازگشتی نمی‌رسد؛ محض احتیاط
    if (kind === 'go') goLeft--;
    kinds[i] = kind;
  }

  const trials: GeneratedTrial[] = kinds.map((kind, i) => ({
    index: i + 1,
    kind,
    block: Math.floor(i / blockSize) + 1
  }));

  const go_count = kinds.filter((k) => k === 'go').length;
  return {
    seed: opts.seed,
    count,
    go_ratio: goRatio,
    max_consecutive_same: maxRun,
    block_size: blockSize,
    go_count,
    trials
  };
}

/** بازتولید عینِ دنبالهٔ ذخیره‌شده — ورودی همان گزینه‌های ذخیره‌شده در جلسه */
export function reproduceSequence(record: SequenceOptions): GeneratedSequence {
  return generateSequence(record);
}

/** سریالی‌سازی فشرده برای ذخیره در جلسه — kinds به رشتهٔ g/n فشرده می‌شود */
export function serializeSequence(seq: GeneratedSequence): string {
  return JSON.stringify({
    seed: seq.seed,
    count: seq.count,
    go_ratio: seq.go_ratio,
    max_consecutive_same: seq.max_consecutive_same,
    block_size: seq.block_size,
    go_count: seq.go_count,
    kinds: seq.trials.map((t) => (t.kind === 'go' ? 'g' : 'n')).join('')
  });
}

/** رکورد ذخیره‌شدهٔ جلسه → گزینه‌های بازتولید + trials (ناموفق = null) */
export function parseSequenceRecord(raw: string | null | undefined): {
  options: SequenceOptions;
  trials: GeneratedTrial[];
  go_count: number;
} | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as {
      seed?: unknown; count?: unknown; go_ratio?: unknown;
      max_consecutive_same?: unknown; block_size?: unknown; go_count?: unknown; kinds?: unknown;
    };
    if (typeof r.seed !== 'string' || typeof r.count !== 'number' ||
        typeof r.go_ratio !== 'number' || typeof r.max_consecutive_same !== 'number' ||
        typeof r.block_size !== 'number' || typeof r.kinds !== 'string') return null;
    if (!/^[gn]+$/.test(r.kinds) || r.kinds.length !== r.count) return null;
    const blockSize: number = r.block_size;
    const trials: GeneratedTrial[] = Array.from(r.kinds, (ch, i) => ({
      index: i + 1,
      kind: (ch === 'g' ? 'go' : 'nogo') as TrialKind,
      block: Math.floor(i / blockSize) + 1
    }));
    return {
      options: {
        seed: r.seed, count: r.count, goRatio: r.go_ratio,
        maxConsecutiveSame: r.max_consecutive_same, blockSize: r.block_size
      },
      trials,
      go_count: typeof r.go_count === 'number' ? r.go_count : trials.filter((t) => t.kind === 'go').length
    };
  } catch {
    return null;
  }
}

// ─── چرخش لنگر-مقید «ن‌پشت» (۱.۲۵.۴۰) — ضدحفظ ترتیب authored بین جلسه‌ها ───
// بانک authored ترتیب ثابتی دارد؛ تکرار جلسه‌ها می‌تواند ترتیب را قابل حفظ‌کردن کند.
// درمان: پسوند پروبِ هر جلسه با آفستی قطعی (از seed جلسه) چرخش می‌شود — اما چرخشِ کور
// حکم همسانی (stim.match که به همسایهٔ n-قدم-عقب‌تر بسته است) را می‌شکند. راه‌حل:
// آفست فقط روی «سرِ زنجیره‌ها» می‌نشیند — آیتم‌های لنگر (stim.rot_start=true) آغاز
// زنجیره‌های مستقل n-back هستند و چرخش پیمانه‌ایِ پسوند با آفستِ لنگر، زنجیره‌ها را
// سالم جابه‌جا می‌کند (درون هر زنجیره ترتیب و حکم‌ها عیناً می‌ماند).

/** رکورد چرخش ن‌پشت در sequence_json جلسه — قطعی و بازتولیدپذیر برای ممیزی */
export interface NbackRotationRecord {
  kind: 'nback';
  v: 1;
  seed: string;
  /** طول پیشوند تمرین — عیناً ثابت می‌ماند */
  train_count: number;
  /** شمار آیتم‌های پسوند پروب */
  probe_count: number;
  /** آفست پیمانه‌ای چرخش پسوند — فقط روی جایگاه لنگر (rot_start) می‌نشیند */
  offset: number;
}

/**
 * انتخاب قطعی آفست چرخش از میان سرِ زنجیره‌های مجاز (anchors؛ اندیس‌های درون پسوند) —
 * همان seed → همان آفست، همیشه. فهرست خالی (بانک بی‌لنگر) = آفست صفر؛ یعنی بانکی که
 * لنگر ندارد هرگز چرخیده نمی‌شود (ترتیب authored عیناً می‌ماند).
 */
export function nbackRotationOffsetOf(seed: string, anchors: number[]): number {
  const valid = anchors.filter((a) => Number.isInteger(a) && a >= 0);
  if (valid.length === 0) return 0;
  const rand = mulberry32(seedToNumber(seed));
  const idx = Math.floor(rand() * valid.length) % valid.length;
  return valid[idx];
}

/**
 * ترتیب آیتم‌های جریان ن‌پشت — چرخش پیمانه‌ای «فقط پسوند پروب»؛ پیشوند تمرین عیناً.
 * آفستِ لنگر-مقید (خروجی nbackRotationOffsetOf) سرِ پسوند را به یک لنگر می‌برد و
 * زنجیره‌های n-back دست‌نخورده می‌مانند. آفستِ بیرون از دامنه با پیمانه امن می‌شود.
 */
export function nbackOrderedItems<T>(items: readonly T[], opts: { train_count: number; offset: number }): T[] {
  const list = Array.from(items);
  const train = Number.isInteger(opts.train_count) && opts.train_count > 0 ? Math.min(opts.train_count, list.length) : 0;
  const head = list.slice(0, train);
  const suffix = list.slice(train);
  const len = suffix.length;
  if (len <= 1) return list;
  const off = Number.isInteger(opts.offset) ? ((opts.offset % len) + len) % len : 0;
  return [...head, ...suffix.slice(off), ...suffix.slice(0, off)];
}

/** سریالی‌سازی رکورد چرخش برای sequence_json جلسه */
export function serializeNbackRotation(record: NbackRotationRecord): string {
  return JSON.stringify({ kind: 'nback', v: 1, seed: record.seed, train_count: record.train_count, probe_count: record.probe_count, offset: record.offset });
}

/** رکورد چرخش ذخیره‌شده → بازخوانی سخت‌گیرانه؛ ناموفق/ناخوانا = null (جریان بی‌چرخش می‌ماند) */
export function parseNbackRotation(raw: string | null | undefined): NbackRotationRecord | null {
  if (!raw) return null;
  try {
    const r = JSON.parse(raw) as Partial<NbackRotationRecord>;
    if (r.kind !== 'nback' || r.v !== 1 || typeof r.seed !== 'string') return null;
    if (typeof r.train_count !== 'number' || typeof r.probe_count !== 'number' || typeof r.offset !== 'number') return null;
    if (!Number.isInteger(r.train_count) || r.train_count < 0) return null;
    if (!Number.isInteger(r.probe_count) || r.probe_count < 0) return null;
    if (!Number.isInteger(r.offset) || r.offset < 0 || r.offset > r.probe_count) return null;
    return { kind: 'nback', v: 1, seed: r.seed, train_count: r.train_count, probe_count: r.probe_count, offset: r.offset };
  } catch {
    return null;
  }
}
