/**
 * t4-verify.mjs — راستی‌آزمایی باندل زندهٔ تولید برای T4 (m148-a — شرح‌حال نسخهٔ ۳)
 * سامانهٔ مرکز جامع سنجش، آموزش، توان‌بخشی و مداخلات بهنگام · @sdt144
 *
 * الگوی scripts/t2-verify.mjs و tests/golden/generate-bundle-ref.mjs: ناحیه‌های مرتبط
 * با لنگر متنی از خود bundle.js بریده و در vm اجرا می‌شود — یعنی کدی که تست می‌شود
 * بایت‌به‌بایت کد تولید است.
 *
 * پوشش:
 *   ۱) تعریف ce-anamnesis-v3 داخل battery_clinical_default باندل = عین JSON منبع (فیلدبه‌فیلد)
 *   ۲) تعریف ce-anamnesis-v2 باندل دست‌نخورده (۳۴ فیلد — پرونده‌های قدیمی)
 *   ۳) رفتار ناحیهٔ infer باندل در vm: پرچم v2 (هیوریستیک دقیق امروز) + پرچم v3 (ساخت‌یافته)
 *      + سیگنال‌های v3 (قرارداد ClinicalSignal — مرتب، ۰..۱، source=anamnesis)
 *   ۴) سیم‌کشی: targets/gap/output/gate OT/صورت‌بندی + دست‌نخوردگی هیوریستیک v2
 *   ۵) مایگریشن 0060: seed v3 + غیرفعال‌سازی v2 + بدون حذف داده
 *
 * اجرا:  node scripts/t4-verify.mjs   (exit 0 فقط با صفر شکست)
 */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const bundleSrc = fs.readFileSync(path.join(ROOT, 'worker', 'bundle.js'), 'utf8');

let pass = 0;
let fail = 0;
function check(name, ok, detail = '') {
  if (ok) { pass += 1; console.log(`  ✓ ${name}`); }
  else { fail += 1; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`); }
}

function cutBetween(src, startMarker, endMarker, label) {
  const start = src.indexOf(startMarker);
  const end = src.indexOf(endMarker, start);
  if (start === -1 || end === -1) throw new Error(`لنگر ناحیهٔ ${label} در باندل پیدا نشد`);
  return src.slice(start, end + endMarker.length);
}

// ───────────── ۱) ناحیهٔ باتری بالینی — ارزیابی تعریف v3/v2 ─────────────

const batteryRegion = cutBetween(bundleSrc, 'var battery_clinical_default = [', '\n];', 'battery_clinical');
const batteryCtx = vm.createContext({});
const batteryArray = vm.runInContext(`(${batteryRegion.replace('var battery_clinical_default =', '').trim().replace(/;$/, '')})`, batteryCtx, { filename: 'bundle-battery-clinical.js' });

const srcBattery = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/domain/clinical-engine/battery-clinical.json'), 'utf8'));
const srcV3 = srcBattery.find((d) => d.key === 'ce-anamnesis-v3');
const srcV2 = srcBattery.find((d) => d.key === 'ce-anamnesis-v2');
const bundleV3 = batteryArray.find((d) => d.key === 'ce-anamnesis-v3');
const bundleV2 = batteryArray.find((d) => d.key === 'ce-anamnesis-v2');

console.log('T4 bundle verify — باتری بالینی باندل:');
check('تعریف v3 در باندل عین JSON منبع است (فیلدبه‌فیلد)', JSON.stringify(bundleV3) === JSON.stringify(srcV3));
check('تعریف v2 در باندل دست‌نخورده است (۳۴ فیلد — پرونده‌های قدیمی)', JSON.stringify(bundleV2) === JSON.stringify(srcV2) && bundleV2.fields.length === 34);
check('v3 — ۴۴ فیلد (۷ سربرگ) و بدون باند/زیرمقیاس', bundleV3.fields.length === 44 && bundleV3.fields.filter((f) => f.type === 'heading').length === 7 && (bundleV3.bands ?? null) === null && (bundleV3.subscales ?? null) === null);
check('v3 — familyFillable=false و مخاطب خانواده و دستهٔ جلسه', bundleV3.familyFillable === false && bundleV3.audience === 'family' && bundleV3.category === 'session');
check('v3 — کلیدهای قرارداد موتور (T3/T6) موجودند', [
  'chief_complaint', 'weak_subjects', 'decline_scope', 'sld_read_concern', 'sld_write_concern', 'sld_calc_concern',
  'attention_concern', 'hyper_concern', 'exam_anxiety', 'morning_somatic', 'crisis_event', 'sensory_concern',
  'home_language', 'school_change', 'absence_level', 'prev_intervention'
].every((k) => bundleV3.fields.some((f) => f.key === k)));

// ───────────── ۲) ناحیهٔ infer باندل (شرح‌حال) در vm ─────────────

const anamRegion = cutBetween(bundleSrc, 'var ANAMNESIS_TEXT_FIELDS', '__name2(anamnesisFlagFor, "anamnesisFlagFor");', 'anamnesis');
const payloadTextRegion = cutBetween(bundleSrc, 'function payloadText(e, keys) {', '__name2(payloadText, "payloadText");', 'payloadText');
const ctx = vm.createContext({
  __name: (t, v) => { try { Object.defineProperty(t, 'name', { value: v, configurable: true }); } catch { /* noop */ } return t; },
  __name2: (t, _v) => t
});
vm.runInContext(`${payloadTextRegion}\n${anamRegion}\n;globalThis.__T4 = { anamnesisFlagFor, anamnesisSignalsOf, ANAMNESIS_V2_KEY, ANAMNESIS_V3_KEY, ANAMNESIS_V3_SIGNAL_SPEC: ANAMNESIS_V3_SIGNAL_SPEC.map(({ fieldKey, sigKey, domain }) => ({ fieldKey, sigKey, domain })) };`, ctx, { filename: 'bundle-anamnesis-region.js' });
const T4 = ctx.__T4;

const ev = (toolKey, payload) => ({ eventId: 'e', toolKey, typeTitle: 't', status: 'completed', occurredAt: '2026-10-03T07:00:00.000Z', payload, analysis: null, bands: null, subscales: null });
const v2ev = (payload) => ev('ce-anamnesis-v2', payload);
const v3ev = (payload) => ev('ce-anamnesis-v3', payload);
const P = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, { value: v, label: k }]));

console.log('T4 bundle verify — ناحیهٔ شرح‌حال موتور (vm):');

// ۲.۱) پرچم نسخهٔ ۲ — هیوریستیک دقیق امروز (فال‌بک پرونده‌های قدیمی)
check('پرچم v2 دیرآموزی: «افت + همه» → درست', T4.anamnesisFlagFor('slow_learner', v2ev(P({ chief_complaint: 'افت تحصیلی تدریجی در همهٔ درس‌ها' }))) === true);
check('پرچم v2 دیرآموزی: بدون «همه» → نادرست', T4.anamnesisFlagFor('slow_learner', v2ev(P({ chief_complaint: 'افت در ریاضی' }))) === false);
check('پرچم v2 اضطراب: «صبح + دل‌درد» → درست', T4.anamnesisFlagFor('anxiety', v2ev(P({ chief_complaint: 'صبح‌ها دل‌درد دارد' }))) === true);
check('پرچم v2 اضطراب: بدون نشانهٔ صبحگاهی → نادرست', T4.anamnesisFlagFor('anxiety', v2ev(P({ chief_complaint: 'نگران است' }))) === false);
check('پرچم v2 با هدف دیگر → نادرست', T4.anamnesisFlagFor('adhd', v2ev(P({ chief_complaint: 'افت در همهٔ درس‌ها صبح' }))) === false);
check('رویداد v3 به پرچمِ مسیر v2 داده نمی‌شود (تفکیک نسخه‌ها در فراخوانی بالادستی)', T4.anamnesisFlagFor('slow_learner', v3ev(P({ chief_complaint: 'افت در همهٔ درس‌ها' }))) === false);

// ۲.۲) پرچم نسخهٔ ۳ — از کلیدهای ساخت‌یافته
check('پرچم v3 دیرآموزی: «بیشترِ درس‌ها» → درست', T4.anamnesisFlagFor('slow_learner', v3ev(P({ decline_scope: 'بیشترِ درس‌ها افت کرده‌اند' }))) === true);
check('پرچم v3 دیرآموزی: «همهٔ درس‌ها» → درست', T4.anamnesisFlagFor('slow_learner', v3ev(P({ decline_scope: 'همهٔ درس‌ها با هم افت کرده‌اند' }))) === true);
check('پرچم v3 دیرآموزی: «فقط یکی دو درس» → نادرست', T4.anamnesisFlagFor('slow_learner', v3ev(P({ decline_scope: 'فقط یکی دو درس مشخص' }))) === false);
check('پرچم v3 اضطراب: «گاهی» → درست', T4.anamnesisFlagFor('anxiety', v3ev(P({ morning_somatic: 'گاهی' }))) === true);
check('پرچم v3 اضطراب: «نه» → نادرست', T4.anamnesisFlagFor('anxiety', v3ev(P({ morning_somatic: 'نه' }))) === false);

// ۲.۳) سیگنال‌های نسخهٔ ۳ — قرارداد ClinicalSignal
const fullSig = T4.anamnesisSignalsOf(v3ev(P({
  sld_read_concern: 'زیاد — نگران‌کننده', sld_write_concern: 'متوسط', sld_calc_concern: 'بدون نگرانی',
  attention_concern: 'کم', hyper_concern: 'متوسط', exam_anxiety: 'کم', morning_somatic: 'گاهی',
  crisis_event: 'بله — برای خود کودک', sensory_concern: 'کم', home_language: 'دوزبانه',
  decline_scope: 'بیشترِ درس‌ها افت کرده‌اند', absence_level: 'یک تا سه ماه', school_change: 'یک بار',
  chief_complaint: 'متن آزاد — سیگنال نمی‌دهد'
})));
const sigKeys = fullSig.map((s) => s.key);
check('v3 کامل → ۱۳ سیگنال', fullSig.length === 13, JSON.stringify(sigKeys));
check('کلیدها با قرارداد src برابرند', JSON.stringify(sigKeys) === JSON.stringify([
  'anam.absence', 'anam.attention', 'anam.crisis_event', 'anam.decline_scope', 'anam.exam_anxiety', 'anam.home_language',
  'anam.hyper', 'anam.morning_somatic', 'anam.school_change', 'anam.sensory', 'anam.sld_calc', 'anam.sld_read', 'anam.sld_write'
]));
check('ترتیب کلید-صعودی (قطعی)', JSON.stringify(sigKeys) === JSON.stringify([...sigKeys].sort()));
check('قرارداد ClinicalSignal: source=anamnesis و مقدار ۰..۱', fullSig.every((s) => s.source === 'anamnesis' && Number.isFinite(s.value) && s.value >= 0 && s.value <= 1 && typeof s.fa === 'string' && s.fa.length > 3));
const byKey = Object.fromEntries(fullSig.map((s) => [s.key, s]));
check('نگاشت مقادیر: خواندن=۱ · نوشتن=۰٫۶۷ · توجه=۰٫۳۳ · صبحگاهی=۰٫۵ · بحران=۱', byKey['anam.sld_read'].value === 1 && byKey['anam.sld_write'].value === 0.67 && byKey['anam.attention'].value === 0.33 && byKey['anam.morning_somatic'].value === 0.5 && byKey['anam.crisis_event'].value === 1);
check('دامنه‌ها: خواندن/افت=academic · توجه/بی‌قراری=attention · صبحگاهی/بحران=emotional · حسی=motor · زبان خانه=language', byKey['anam.sld_read'].domain === 'academic' && byKey['anam.decline_scope'].domain === 'academic' && byKey['anam.attention'].domain === 'attention' && byKey['anam.hyper'].domain === 'attention' && byKey['anam.morning_somatic'].domain === 'emotional' && byKey['anam.crisis_event'].domain === 'emotional' && byKey['anam.sensory'].domain === 'motor' && byKey['anam.home_language'].domain === 'language');
check('فقط نسخهٔ ۳ سیگنال می‌دهد — v2 → []', JSON.stringify(T4.anamnesisSignalsOf(v2ev(P({ sld_read_concern: 'کم' })))) === '[]' && JSON.stringify(T4.anamnesisSignalsOf(undefined)) === '[]');
check('گزینهٔ خارج از قرارداد نادیده می‌شود', JSON.stringify(T4.anamnesisSignalsOf(v3ev(P({ sld_read_concern: 'گزینهٔ آینده' })))) === '[]');
check('جدول قرارداد باندل هم‌خوان src (۱۳ فیلد → دامنه)', JSON.stringify(T4.ANAMNESIS_V3_SIGNAL_SPEC) === JSON.stringify([
  { fieldKey: 'sld_read_concern', sigKey: 'anam.sld_read', domain: 'academic' },
  { fieldKey: 'sld_write_concern', sigKey: 'anam.sld_write', domain: 'academic' },
  { fieldKey: 'sld_calc_concern', sigKey: 'anam.sld_calc', domain: 'academic' },
  { fieldKey: 'attention_concern', sigKey: 'anam.attention', domain: 'attention' },
  { fieldKey: 'hyper_concern', sigKey: 'anam.hyper', domain: 'attention' },
  { fieldKey: 'exam_anxiety', sigKey: 'anam.exam_anxiety', domain: 'emotional' },
  { fieldKey: 'morning_somatic', sigKey: 'anam.morning_somatic', domain: 'emotional' },
  { fieldKey: 'crisis_event', sigKey: 'anam.crisis_event', domain: 'emotional' },
  { fieldKey: 'sensory_concern', sigKey: 'anam.sensory', domain: 'motor' },
  { fieldKey: 'home_language', sigKey: 'anam.home_language', domain: 'language' },
  { fieldKey: 'decline_scope', sigKey: 'anam.decline_scope', domain: 'academic' },
  { fieldKey: 'absence_level', sigKey: 'anam.absence', domain: 'academic' },
  { fieldKey: 'school_change', sigKey: 'anam.school_change', domain: 'academic' }
]));

// ───────────── ۳) سیم‌کشی تولید (لنگرهای متنی) ─────────────

console.log('T4 bundle verify — سیم‌کشی تولید:');
check('targets — هر سه هدف به نسخهٔ ۳ اشاره می‌کنند', bundleSrc.split('    instruments: ["ce-anamnesis-v3"],').length - 1 === 3 && !bundleSrc.includes('    instruments: ["ce-anamnesis-v2"],'));
check('runInference — شرح‌حال مؤثر = v3 ترجیح', bundleSrc.includes('const anamKey = latest.has(ANAMNESIS_V3_KEY) ? ANAMNESIS_V3_KEY : ANAMNESIS_V2_KEY;'));
check('runInference — سیگنال فقط از v3 ساخته می‌شود', bundleSrc.includes('const anamnesisSignals = anamnesisSignalsOf(latest.get(ANAMNESIS_V3_KEY));'));
check('runInference — گیت داده کلید شرح‌حال مؤثر را هم می‌گیرد', bundleSrc.includes('if (toolKeys.has(ANAMNESIS_V2_KEY))\n      toolKeys.add(anamKey);'));
check('runInference — پرچم شرح‌حال از رویداد مؤثر', bundleSrc.includes('anamnesisFlagFor(ruleSet.targetKey, latest.get(anamKey))'));
check('runInference — گپ: نسخهٔ ۲ یا ۳ کافی است', bundleSrc.includes('const anamSatisfied = latest.has(toolKey) || toolKey === ANAMNESIS_V2_KEY && latest.has(ANAMNESIS_V3_KEY);'));
check('runInference — پیشنهاد گپ به فرم فعال (کلید نمایشی)', bundleSrc.includes('const anamDisplay = toolKey === ANAMNESIS_V2_KEY && !latest.has(ANAMNESIS_V2_KEY) ? ANAMNESIS_V3_KEY : toolKey;'));
check('runInference — خروجی: کلید افزودنی anamnesisSignals (m156: بدون disclaimer)', bundleSrc.includes('referralFlags: [...new Set(referralFlags)].slice(0, 10),\n    anamnesisSignals\n  };'));
check('هیوریستیک v2 بایت‌به‌بایت باقی است (صبح + واژه‌های جسمانی)', bundleSrc.includes('\\u0635\\u0628\\u062D') && bundleSrc.includes('\\u062F\\u0644\\u200C\\u062F\\u0631\\u062F') && bundleSrc.includes('event.toolKey !== ANAMNESIS_V2_KEY'));
check('گیت OT — نسخهٔ ۳ هم گیت شرح‌حال را سبز می‌کند', bundleSrc.includes('var ANAMNESIS_KEYS = ["ce-anamnesis-v3", "ce-anamnesis-v2", "anamnesis"];'));
check('صورت‌بندی — اقدام پایه شرح‌حال نسخهٔ ۳ + گارد v2/v3', bundleSrc.includes('if (!present.has("ce-anamnesis-v2") && !present.has("ce-anamnesis-v3")) {') && bundleSrc.includes('toolId: "ce-anamnesis-v3", reasonFa:'));
check('ناحیهٔ وکسلر T1 لمس نشده — لنگر سیگنال T1 سرجایش است', bundleSrc.includes('__name2(profileSignals, "profileSignals");') && bundleSrc.includes('__name2(buildWechslerProfile, "buildWechslerProfile");'));

// ───────────── ۴) مایگریشن 0060 ─────────────

const migPath = path.join(ROOT, 'migrations', '0060_anamnesis_v3.sql');
console.log('T4 bundle verify — مایگریشن 0060:');
if (fs.existsSync(migPath)) {
  const mig = fs.readFileSync(migPath, 'utf8');
  check('seed v3 سیستمی/فعال/جلسه', mig.includes("'ce-anamnesis-v3'") && mig.includes('INSERT OR IGNORE INTO case_event_types') && mig.includes('is_system'));
  check('غیرفعال‌سازی v2 — بدون حذف', mig.includes("UPDATE case_event_types SET active = 0 WHERE key = 'ce-anamnesis-v2';") && !mig.includes('DELETE FROM case_events'));
  check('فیلدهای seed = منبع JSON (طول یکسان)', mig.includes(JSON.stringify(srcV3.fields).replace(/'/g, "''")));
} else {
  check('مایگریشن 0060 موجود است', false);
}

// ───────────── ۵) پایهٔ رفتاری src (t4-baseline.json) ─────────────

console.log('T4 bundle verify — پایهٔ رفتاری T4:');
const baselinePath = path.join(ROOT, 'scripts', 't4-baseline.json');
if (fs.existsSync(baselinePath)) {
  const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'));
  const f1 = baseline.outputs.f1_v2_slow_learner_flag;
  const slow = f1?.ranked?.find((h) => h.targetKey === 'slow_learner');
  check('پایهٔ T4 ثبت شده — فیکسچر v2 دیرآموزی: امتیاز ۳ (وکسلر+پرچم v2)', slow?.score === 3);
  check('پایهٔ T4 — خروجی‌های فقط-v2 فاقد کلید سیگنال‌اند (ثبت پیش از T4)', Object.values(baseline.outputs).every((o) => !('anamnesisSignals' in o)));
} else {
  check('t4-baseline.json موجود است', false);
}

console.log(`\nنتیجه: ${pass} گذر / ${fail} شکست`);
process.exit(fail === 0 ? 0 : 1);
