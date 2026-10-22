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

eq(R("FSIQ_BAND_BIF")?.min, 70, "FSIQ_BAND_BIF.min=70");
eq(R("FSIQ_BAND_BIF")?.max, 84, "FSIQ_BAND_BIF.max=84");
eq(R("FSIQ_BAND_LOW_BORDER")?.min, 85, "FSIQ_BAND_LOW_BORDER.min=85");
eq(R("FSIQ_BAND_LOW_BORDER")?.max, 89, "FSIQ_BAND_LOW_BORDER.max=89");
eq(R("ID_PATH_MAX_FSIQ"), 70, "ID_PATH_MAX_FSIQ=70");
eq(R("SCATTER_UNIFORM_MAX"), 23, "SCATTER_UNIFORM_MAX=23");

ok(R("WECHSLER_HYP_IDS") === undefined, "WECHSLER_HYP_IDS حذف شده (m156)");
ok(R("WECHSLER_HYP_TARGETS") === undefined, "WECHSLER_HYP_TARGETS حذف شده (m156)");
ok(R("WECHSLER_HYP_NAMES") === undefined, "WECHSLER_HYP_NAMES حذف شده (m156)");
ok(R("wechslerHypTargetOf") === undefined, "wechslerHypTargetOf حذف شده (m156)");
ok(R("wechslerHypothesisBoost") === undefined, "wechslerHypothesisBoost حذف شده (m156)");
ok(R("domainWeakIndexOf") === undefined, "domainWeakIndexOf حذف شده (m156)");
ok(!bundle.includes("function activateHypotheses"), "activateHypotheses از موتور وکسلر حذف شده (m156)");
ok(!bundle.includes("ENGINE_DISCLAIMER"), "ENGINE_DISCLAIMER از باندل حذف شده (m156)");
ok(R("wechslerEngineOutputOf") !== undefined, "پیوند فقط پروفایل: wechslerEngineOutputOf سرجایش است");
ok(R("wechslerProfileFactsOf") !== undefined, "قواعد سیگنالی پروفایل (FSIQ band) سرجایش‌اند");

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

const w4Ev = (hyps, profile) => ({
  toolKey: "ce-wechsler-w4-v1",
  status: "completed",
  occurredAt: "2026-10-01T08:00:00.000Z",
  typeTitle: "وکسلر ۴",
  payload: { engine_output: { value: JSON.stringify({ ok: true, ...(hyps.length ? { hypotheses: hyps } : {}), ...(profile ? { profile } : {}) }) } }
});

const factsOf = R("wechslerProfileFactsOf");
eq(factsOf(w4Ev([], { fsiq: 78, fsiqBand: null, indexScatter: 5 })).band, "BIF", "fsiq ۷۸ → باند BIF (فال‌بک fsiqBandOf)");
eq(factsOf(w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 4 })).band, "LOW_BORDER", "باند صریح LOW_BORDER");
const oldFacts = factsOf(w4Ev([{ id: "DLD", weight: 0.5 }]));
eq(oldFacts.fsiq, null, "رویداد قدیمی بدون profile → fsiq null");
eq(oldFacts.band, null, "رویداد قدیمی → band null");

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

{
  const out = runInf([
    w4Ev([{ id: "BIF", weight: 0.6 }], { fsiq: 68, fsiqBand: "ID", indexScatter: null }),
    idAdaptEv("danger", "پایین — نیاز به بررسی", "2026-10-02T08:00:00.000Z")
  ]);
  ok(out.referralFlags.some((f) => f.includes("ناتوانی هوشی")), "مسیر ID → پرچم ارجاع خط قرمز");
  ok(out.nextActions.some((a) => a.includes("ارجاع")), "مسیر ID → اقدام بعدی ارجاع");
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "مسیر ID → فرضیهٔ دیرآموزی تقویت نمی‌شود");
}
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
{
  const out = runInf([
    w4Ev([], { fsiq: 78, fsiqBand: "BIF", indexScatter: 6 }),
    idAdaptEv("danger", "پایین — نیاز به بررسی", "2026-10-02T08:00:00.000Z")
  ]);
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "FSIQ ۷۸ + انطباق پایین → تقویت سرکوب");
}
{
  const out = runInf([w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 4 })]);
  ok(out.nextActions.some((a) => a.includes("پایش")), "مرز پایین یکنواخت → توصیهٔ پایش");
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "مرز پایین → بدون فرضیهٔ دیرآموزی");
}
{
  const out = runInf([w4Ev([], { fsiq: 87, fsiqBand: "LOW_BORDER", indexScatter: 30 })]);
  ok(!out.nextActions.some((a) => a.includes("مرز پایین")), "پراکندگی بالا → پایش یکنواخت نیست");
}
{
  const out = runInf([w4Ev([{ id: "BIF", weight: 0.5 }])]);
  eq(out.ranked.find((h) => h.targetKey === "slow_learner"), undefined, "فرضیهٔ BIF قدیمی → هیچ دیرآموزی (m156)");
}
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
{
  const out = runInf([snapEv("p", "danger", "2026-10-03T08:00:00.000Z")]);
  eq(JSON.stringify(Object.keys(out)), JSON.stringify([
    "batteryVersion", "generatedAt", "criteria", "ranked", "discrepancies",
    "nextActions", "dataCoverage", "referralFlags", "anamnesisSignals", "convergence"
  ]), "کلیدهای خروجی — قدیمی‌ها سرجایشان + convergence در انتها");
}
{
  const out = runInf([]);
  eq(out.ranked.length, 0, "بدون داده → بدون فرضیه");
  eq((out.convergence ?? []).length, 0, "بدون داده → convergence خالی");
}

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
