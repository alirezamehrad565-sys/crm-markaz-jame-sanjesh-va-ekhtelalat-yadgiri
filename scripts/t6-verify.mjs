// T6 (m148-b) — وریفای ناحیهٔ موتور شک v2 در worker/bundle.js
// الگوی t2/t3-verify: واردکردن مستقیم باندل در Node خاموش می‌شود (شیم‌های unenv)؛
// پس ناحیه با لنگر متنی استخراج و در vm اجرا می‌شود و رفتار روی کدِ بایت‌به‌بایت تولید آزموده می‌شود.
// ناحیه: "var FSIQ_BANDS = [" تا "__name2(runInference, \"runInference\");" — همهٔ وابستگی‌های
// runInference (RULES/targets/DSM/batteryDef/anamnesis/wechsler-link/convergence) داخل همین بازه‌اند.
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const bundle = readFileSync(path.join(ROOT, "worker", "bundle.js"), "utf8");

const START = "var FSIQ_BANDS = [";
const END = '__name2(runInference, "runInference");';
const s = bundle.indexOf(START);
const e = bundle.indexOf(END, s);
if (s === -1 || e === -1) {
  console.error("t6-verify: anchor not found");
  process.exit(1);
}
const region = bundle.slice(s, e + END.length);

const shims = `
var __defProp = Object.defineProperty;
var __name = (t, v) => __defProp(t, "name", { value: v, configurable: true });
var __name2 = __name;
// num از ناحیهٔ موتور وکسلر (بیرون این استخراج) — همان معنا: ارقام فارسی/لاتین → عدد
var num = (x) => {
  if (x === null || x === undefined || x === "") return NaN;
  const s2 = String(x).replace(/[۰-۹]/g, (d) => "0123456789"["۰۱۲۳۴۵۶۷۸۹".indexOf(d)]);
  return Number(s2);
};
`;
const sandbox = { console };
vm.createContext(sandbox);
vm.runInContext(shims + region, sandbox, { filename: "t6-region.js" });

const R = (name) => sandbox[name];

let pass = 0;
let fail = 0;
const fails = [];
function ok(cond, label) {
  if (cond) {
    pass++;
  } else {
    fail++;
    fails.push(label);
    console.error("  ✗ " + label);
  }
}
const eq = (got, want, label) => ok(got === want, `${label} (got=${JSON.stringify(got)} want=${JSON.stringify(want)})`);

// ─── ۱) ثابت‌های بازهٔ FSIQ — تک‌منبع از FSIQ_BANDS ───
eq(R("FSIQ_BAND_BIF")?.min, 70, "FSIQ_BAND_BIF.min=70");
eq(R("FSIQ_BAND_BIF")?.max, 84, "FSIQ_BAND_BIF.max=84");
eq(R("FSIQ_BAND_LOW_BORDER")?.min, 85, "FSIQ_BAND_LOW_BORDER.min=85");
eq(R("FSIQ_BAND_LOW_BORDER")?.max, 89, "FSIQ_BAND_LOW_BORDER.max=89");
eq(R("ID_PATH_MAX_FSIQ"), 70, "ID_PATH_MAX_FSIQ=70");
eq(R("SCATTER_UNIFORM_MAX"), 23, "SCATTER_UNIFORM_MAX=23");

// ─── ۲) نگاشت کامل سیزده‌فرضیه‌ای ───
const IDS = R("WECHSLER_HYP_IDS");
eq(IDS.length, 13, "WECHSLER_HYP_IDS length 13");
eq(new Set(IDS).size, 13, "WECHSLER_HYP_IDS unique");
const T = R("WECHSLER_HYP_TARGETS");
eq(T.BIF, "slow_learner", "BIF → slow_learner (§۳.۱)");
for (const id of ["ID", "NVLD", "TBI", "TWO_E", "NORMAL"]) ok(id in T && T[id] === null, `${id} → null صریح`);
eq(T.DLD, "speech_language", "DLD → speech_language");
eq(T.APD, "speech_language", "APD → speech_language");
eq(T.MOOD, "anxiety", "MOOD → anxiety");
eq(T.ADHD, "adhd", "ADHD → adhd");
eq(T.ASD, "autism", "ASD → autism");
ok(!("SLD" in T) || T.SLD === null, "SLD پویا (ثابت null)");
ok(!("DOMAIN_WEAK" in T) || T.DOMAIN_WEAK === null, "DOMAIN_WEAK پویا (ثابت null)");

const hypTargetOf = R("wechslerHypTargetOf");
eq(hypTargetOf("SLD", { sld: { read: 0.8, write: 0.3, calc: null } }), "dyslexia", "SLD → قوی‌ترین سیگنال (خواندن)");
eq(hypTargetOf("SLD", { sld: { read: 0.3, write: 0.9, calc: 0.1 } }), "dysgraphia", "SLD → قوی‌ترین (نوشتن)");
eq(hypTargetOf("SLD", { sld: { read: 0.7, write: 0.7, calc: 0.1 } }), "dyslexia", "SLD تساوی → ترتیب ثابت خواندن");
eq(hypTargetOf("SLD", {}), null, "SLD بی‌زمینه → null");
eq(hypTargetOf("DOMAIN_WEAK", { domainWeakIndex: "WMI" }), "working_memory", "DOMAIN_WEAK WMI → حافظهٔ کاری");
eq(hypTargetOf("DOMAIN_WEAK", { domainWeakIndex: "VCI" }), "speech_language", "DOMAIN_WEAK VCI → زبان");
eq(hypTargetOf("DOMAIN_WEAK", { domainWeakIndex: "PRI" }), "motor_coordination", "DOMAIN_WEAK PRI → motor_coordination");
eq(hypTargetOf("DOMAIN_WEAK", { domainWeakIndex: "PSI" }), null, "DOMAIN_WEAK PSI → null");
eq(hypTargetOf("BIF"), "slow_learner", "hypTargetOf BIF");
eq(hypTargetOf("ID"), null, "hypTargetOf ID → null");

// ─── ۳) تقویت فرضیه — ID هرگز slow_learner را تقویت نمی‌کند ───
const w4Ev = (hyps, profile) => ({
  toolKey: "ce-wechsler-w4-v1",
  status: "completed",
  occurredAt: "2026-10-01T08:00:00.000Z",
  typeTitle: "وکسلر ۴",
  payload: { engine_output: { value: JSON.stringify({ ok: true, hypotheses: hyps, ...(profile ? { profile } : {}) }) } }
});
const boost = R("wechslerHypothesisBoost");
eq(boost(w4Ev([{ id: "BIF", weight: 0.5 }]), "slow_learner")?.weight, 2, "BIF وزن ۰٫۵ → وزن ۲");
eq(boost(w4Ev([{ id: "ID", weight: 0.9 }]), "slow_learner"), null, "ID ۰٫۹ → هیچ تقویت دیرآموزی");
eq(boost(w4Ev([{ id: "DLD", weight: 0.2 }]), "speech_language")?.weight, 1, "DLD ۰٫۲ → وزن ۱ (رفتار امروز)");
eq(boost(w4Ev([{ id: "SLD", weight: 0.5 }], null, ), "dyslexia", { sld: { read: 1, write: 0.2, calc: null } })?.weight, 2, "SLD با زمینه → dyslexia وزن ۲");
eq(boost(w4Ev([{ id: "SLD", weight: 0.5 }]), "dyslexia"), null, "SLD بی‌زمینه → هیچ");
eq(boost(undefined, "adhd"), null, "بدون رویداد → null");

// ─── ۴) هم‌گرایی — سه حالت خوانا ───
const convItem = R("convergenceItemOf");
const c1 = convItem("adhd", "بیش‌فعالی/کم‌توجهی", ["family", "teacher"], ["family", "teacher"]);
eq(c1?.state, "هم‌گرا", "دو منبع → هم‌گرا");
ok(c1.implicationFa.includes("خانواده") && c1.implicationFa.includes("مدرسه"), "جملهٔ هم‌گرا نام منابع دارد");
const c2 = convItem("adhd", "بیش‌فعالی/کم‌توجهی", ["family"], ["family", "teacher"]);
eq(c2?.state, "واگرا", "مثبت + دادهٔ بی‌نشانهٔ معلم → واگرا");
ok(c2.implicationFa.includes("هم‌رأی نیستند"), "جملهٔ واگرا");
const c3 = convItem("adhd", "بیش‌فعالی/کم‌توجهی", ["family"], ["family"]);
eq(c3?.state, "تنها", "تک‌منبع → تنها");
ok(c3.implicationFa.includes("فقط از سوی خانواده"), "جملهٔ تنها");
eq(convItem("adhd", "x", [], []), null, "بی‌منبع مثبت → null");
// پکیج تجمیعی هرگز دو منبع نمی‌سازد — جدول تک‌منبع
const srcOf = R("convergenceSourceOfTool");
eq(srcOf("ce-comp-family-v2"), "family", "پکیج خانواده → یک منبع family");
eq(srcOf("ce-snap-iv-p-v1"), "family", "کامپوننت پکیج → family");
eq(srcOf("ce-comp-teacher-v2"), "teacher", "پکیج معلم (T7) → teacher");
eq(srcOf("ce-sld-class-t-v1"), "teacher", "ملاک کلاسی معلم → teacher (فال‌بک مخاطب)");
eq(srcOf("ce-wechsler-w4-v1"), "test", "وکسلر → test");

const adaptOf = R("idAdaptLevelOfEvent");
eq(adaptOf({ analysis: { subscaleScores: [{ id: "id_adapt", color: "danger", band: "پایین — نیاز به بررسی" }] } }), "low", "انطباق danger → low");
eq(adaptOf({ analysis: { subscaleScores: [{ id: "id_adapt", color: "warn", band: "مرزی" }] } }), "border", "انطباق warn → border");
eq(adaptOf({ analysis: { subscaleScores: [{ id: "id_adapt", color: "ok", band: "نرمال" }] } }), "normal", "انطباق ok → normal");
eq(adaptOf(undefined), "unknown", "بی‌رویداد → unknown");
eq(adaptOf({ analysis: { subscaleScores: [{ id: "ia", color: "ok" }] } }), "unknown", "بی‌زیرمقیاس → unknown");

const factsOf = R("wechslerProfileFactsOf");
eq(factsOf(w4Ev([], { fsiq: 78, fsiqBand: null, indexScatter: 5 })).band, "BIF", "fsiq ۷۸ → باند BIF (فال‌بک fsiqBandOf)");
eq(factsOf(w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 4 })).band, "LOW_BORDER", "باند صریح LOW_BORDER");
const oldFacts = factsOf(w4Ev([{ id: "DLD", weight: 0.5 }]));
eq(oldFacts.fsiq, null, "رویداد قدیمی بدون profile → fsiq null");
eq(oldFacts.band, null, "رویداد قدیمی → band null");

// ─── ۵) runInference انتها-به-انتها روی کد باندل ───
const runInf = R("runInference");
const snapEv = (form, color, at) => ({
  toolKey: form === "p" ? "ce-snap-iv-p-v1" : "ce-snap-iv-t-v1",
  status: "completed",
  occurredAt: at,
  typeTitle: form === "p" ? "SNAP والد" : "SNAP معلم",
  analysis: { score: 18, band: null, answered: 9, total: 9, maxScore: 27, subscaleScores: [{ id: "ia", name: "کم‌توجهی", score: 18, max: 27, band: null, color }] }
});
const idAdaptEv = (color, band, at) => ({
  toolKey: "ce-id-adapt-v1", status: "completed", occurredAt: at, typeTitle: "انطباق روزمره",
  analysis: { subscaleScores: [{ id: "id_adapt", color, band }] }
});
const anamV3Ev = (decline, at) => ({
  toolKey: "ce-anamnesis-v3", status: "completed", occurredAt: at, typeTitle: "شرح‌حال v3",
  payload: { decline_scope: { value: decline } }
});

// ۵-۱) مسیر ID خط قرمز: FSIQ ≤۷۰ + انطباق پایین → ارجاع، بدون تقویت دیرآموزی
{
  const out = runInf([
    w4Ev([{ id: "BIF", weight: 0.6 }], { fsiq: 68, fsiqBand: "ID", indexScatter: null }),
    idAdaptEv("danger", "پایین — نیاز به بررسی", "2026-10-02T08:00:00.000Z")
  ]);
  ok(out.referralFlags.some((f) => f.includes("ناتوانی هوشی")), "مسیر ID → پرچم ارجاع خط قرمز");
  ok(out.nextActions.some((a) => a.includes("ارجاع")), "مسیر ID → اقدام بعدی ارجاع");
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "مسیر ID → فرضیهٔ دیرآموزی تقویت نمی‌شود");
}
// ۵-۲) دیرآموز: FSIQ ۷۸ + انطباق ثبت‌نشده → تقویت slow_learner + هم‌گرا با شرح‌حال
{
  const out = runInf([
    w4Ev([], { fsiq: 78, fsiqBand: "BIF", indexScatter: 6 }),
    anamV3Ev("همهٔ درس‌ها با هم افت کرده‌اند", "2026-10-02T08:00:00.000Z")
  ]);
  const sl = out.ranked.find((h) => h.targetKey === "slow_learner");
  ok(sl, "FSIQ ۷۸ + افت همه‌درسی → فرضیهٔ دیرآموزی");
  ok(sl ? sl.evidenceFa.some((f) => f.includes("دیرآموزی")) : false, "شاهد پروفایلی BIF در شواهد");
  const conv = (out.convergence ?? []).find((c) => c.targetKey === "slow_learner");
  eq(conv?.state, "هم‌گرا", "آزمون + خانواده → هم‌گرا");
}
// ۵-۳) دیرآموز با انطباق پایین خانواده (۷۸>۷۰ پس مسیر ID نیست ولی تقویت سرکوب می‌شود)
{
  const out = runInf([
    w4Ev([], { fsiq: 78, fsiqBand: "BIF", indexScatter: 6 }),
    idAdaptEv("danger", "پایین — نیاز به بررسی", "2026-10-02T08:00:00.000Z")
  ]);
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "FSIQ ۷۸ + انطباق پایین → تقویت سرکوب");
}
// ۵-۴) مرز پایین یکنواخت: فقط پایش، بدون برچسب
{
  const out = runInf([w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 4 })]);
  ok(out.nextActions.some((a) => a.includes("پایش")), "مرز پایین یکنواخت → توصیهٔ پایش");
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "مرز پایین → بدون فرضیهٔ دیرآموزی");
}
{
  const out = runInf([w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 30 })]);
  ok(!out.nextActions.some((a) => a.includes("مرز پایین")), "پراکندگی بالا → پایش یکنواخت نیست");
}
// ۵-۵) فرضیهٔ قدیمی بدون پروفایل: BIF → نگاشت تازه اعمال می‌شود (تغییر عمدی)
{
  const out = runInf([w4Ev([{ id: "BIF", weight: 0.5 }])]);
  ok(out.ranked.find((h) => h.targetKey === "slow_learner"), "رویداد قدیمی BIF → slow_learner (نگاشت T6)");
}
// ۵-۶) هم‌گرایی والد×معلم برای ADHD — پاریتی رفتار امروز + حالت هم‌گرا
{
  const out = runInf([
    snapEv("p", "danger", "2026-10-03T08:00:00.000Z"),
    snapEv("t", "danger", "2026-10-04T08:00:00.000Z")
  ]);
  const adhd = out.ranked.find((h) => h.targetKey === "adhd");
  ok(adhd, "SNAP جفت → فرضیهٔ ADHD");
  const conv = (out.convergence ?? []).find((c) => c.targetKey === "adhd");
  eq(conv?.state, "هم‌گرا", "خانواده + مدرسه → هم‌گرا");
}
// ۵-۷) کلیدهای افزودنی — ترتیب و ترکیب عیناً حفظ
{
  const out = runInf([snapEv("p", "danger", "2026-10-03T08:00:00.000Z")]);
  eq(JSON.stringify(Object.keys(out)), JSON.stringify([
    "batteryVersion", "generatedAt", "criteria", "ranked", "discrepancies",
    "nextActions", "dataCoverage", "referralFlags", "disclaimer", "anamnesisSignals", "convergence"
  ]), "کلیدهای خروجی — قدیمی‌ها سرجایشان + convergence در انتها");
}
// ۵-۸) رویداد خالی — پاریتی کامل (فرضیه‌ای نیست، convergence [])
{
  const out = runInf([]);
  eq(out.ranked.length, 0, "بدون داده → بدون فرضیه");
  eq((out.convergence ?? []).length, 0, "بدون داده → convergence خالی");
}

// ─── ۶) صورت‌بندی روی خروجی موتور شک — پل سرویس (خارج از ناحیهٔ استخراج طلایی) ───
const svcStart = bundle.indexOf("async function getCaseFormulation(studentId, actor) {");
const svcEnd = bundle.indexOf("__name2(getCaseFormulation, \"getCaseFormulation\");", svcStart);
const svc = bundle.slice(svcStart, svcEnd);
ok(svc.includes("runInference(events)"), "getCaseFormulation → runInference روی همان رویدادها");
ok(svc.includes("inferenceRanked = infT6.ranked") && svc.includes("inferenceConvergence = infT6.convergence"), "کلیدهای افزودنی روی نتیجهٔ صورت‌بندی");
const buildFn = bundle.slice(bundle.indexOf("function buildCaseFormulation(input, options = {}) {"), bundle.indexOf("__name2(buildCaseFormulation,"));
ok(!buildFn.includes("runInference"), "ناحیهٔ استخراج‌شدهٔ طلایی صورت‌بندی دست‌نخورده ماند (بدون runInference)");

console.log(`\nt6-verify: ${pass}/${pass + fail}`);
if (fail > 0) {
  console.error("FAILED CHECKS:");
  for (const f of fails) console.error("  - " + f);
  process.exit(1);
}
