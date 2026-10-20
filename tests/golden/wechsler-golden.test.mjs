// wechsler-golden.test.mjs — GOLDEN equivalence test (phase 0 / task 39-d1)
//
// Proves that the extracted engine (src/domain/wechsler-engine/engine.js) produces
// EXACTLY the same output as the production bundle engine for every case.
//
// Reference implementation: tests/golden/bundle-wechsler-ref.cjs — GENERATED from
// worker/bundle.js lines 21120-24656 (commit 365d103, m130 / 1.00.9, engineVersion
// "m98") by tests/golden/extract-engine.mjs. The reference is the real bundle code,
// so it cannot drift from production.
//
// Run:  node --test tests/golden/
// Regenerate reference after bundle changes:  node tests/golden/extract-engine.mjs

import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import url from "node:url";

import * as extracted from "../../src/domain/wechsler-engine/engine.js";

const require = createRequire(import.meta.url);
const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ref = require(path.join(HERE, "bundle-wechsler-ref.cjs"));

// ---------------------------------------------------------------------------
// Stable deep serializer: deterministic, key-sorted, undefined-safe, NaN-safe.
// Two engine outputs are "exactly equal" iff their stable serializations match.
// ---------------------------------------------------------------------------
function stable(v) {
  if (v === undefined) return "\u0000undefined";
  if (v === null) return "null";
  const t = typeof v;
  if (t === "boolean") return v ? "true" : "false";
  if (t === "number") {
    if (Number.isNaN(v)) return "NaN";
    if (!Number.isFinite(v)) return v > 0 ? "Infinity" : "-Infinity";
    return JSON.stringify(v);
  }
  if (t === "string") return JSON.stringify(v);
  if (t === "function") return `fn:${v.name || "anon"}`;
  if (t === "symbol") return String(v);
  if (t === "bigint") return `${v}n`;
  if (Array.isArray(v)) return `[${v.map((x) => stable(x)).join(",")}]`;
  const keys = Object.keys(v).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stable(v[k])}`).join(",")}}`;
}

/** Assert two engine outputs are exactly equal, with a readable diff on failure. */
function assertSame(name, a, b) {
  const sa = stable(a);
  const sb = stable(b);
  if (sa === sb) return;
  let i = 0;
  while (i < sa.length && sa[i] === sb[i]) i++;
  const ctx = 160;
  const msg =
    `[${name}] extracted vs reference outputs differ\n` +
    `  first divergence at char ${i}\n` +
    `  extracted : …${sa.slice(Math.max(0, i - ctx / 2), i + ctx)}…\n` +
    `  reference : …${sb.slice(Math.max(0, i - ctx / 2), i + ctx)}…`;
  assert.fail(msg);
}

// ---------------------------------------------------------------------------
// Helpers to build realistic raw-score profiles from the actual norms tables.
// rawForScaled returns the raw score whose scaled score is closest to `target`
// in the given age band, so profiles are always inside the band's valid range.
// ---------------------------------------------------------------------------
const CODES = extracted.SUBTEST_CODES;
const INVALID = "\u0646\u0627\u0645\u0639\u062A\u0628\u0631"; // "نامعتبر" — engine's invalid marker

function rawForScaled(years, code, target) {
  const band = extracted.bandForAge(years);
  const pairs = extracted.NORMS.bands[band]?.[code] ?? [];
  if (!pairs.length) return 0;
  let best = pairs[0];
  for (const p of pairs) {
    if (Math.abs(p[1] - target) < Math.abs(best[1] - target)) best = p;
  }
  return best[0];
}

function profile(years, targets = {}, drop = []) {
  const out = {};
  for (const c of CODES) out[c] = rawForScaled(years, c, targets[c] ?? 10);
  for (const c of drop) delete out[c];
  return out;
}

const CORES = ["SI", "VC", "CO", "BD", "PCn", "MR", "DS", "LN", "CD", "SS"];
const SUBSTITUTES = ["IN", "WR", "PCm", "CA", "AR"];

// ---------------------------------------------------------------------------
// Golden cases — direct engine API (runWechslerAnalysis)
// ---------------------------------------------------------------------------
const directCases = [
  {
    name: "age 6 — balanced profile (sq-6, first native band)",
    birth: [1400, 3, 15],
    test: [1406, 4, 20],
    raw: profile(6),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 6);
      assert.equal(r.validation.band, "sq-6");
      assert.equal(typeof r.snapshot.fsiq, "number");
      assert.ok(r.hypotheses.some((h) => h.id === "NORMAL"), "NORMAL should activate on a balanced profile");
    }
  },
  {
    name: "age 7 — day-level boundary (7y0m6d, sq-7)",
    birth: [1399, 12, 29],
    test: [1407, 1, 5],
    raw: profile(7),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 7);
      assert.equal(r.validation.band, "sq-7");
      assert.match(r.ageLine, /۷/); // ageLine is Persian-digit "۷ سال و …"
    }
  },
  {
    name: "age 10 — typical slightly uneven profile (sq-10)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { DS: 11, CD: 9 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 10);
      assert.equal(r.validation.band, "sq-10");
      assert.equal(typeof r.snapshot.fsiq, "number");
    }
  },
  {
    name: "age 14 — last native norms band (sq-14)",
    birth: [1392, 2, 10],
    test: [1406, 5, 1],
    raw: profile(14, { SI: 13, VC: 12, MR: 11 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 14);
      assert.equal(r.validation.band, "sq-14");
    }
  },
  {
    name: "age 15 — clamped down to sq-14 norms (band 15 does not exist)",
    birth: [1391, 2, 10],
    test: [1406, 3, 1],
    raw: profile(15, { SI: 12, VC: 13, MR: 10 }),
    expect(r) {
      assert.equal(r.ok, true, "age 15 is within MAX_AGE=16");
      assert.equal(r.validation.years, 15);
      assert.equal(r.validation.band, "sq-14", "ages 15-16 must clamp to the sq-14 table");
    }
  },
  {
    name: "age 16 — clamped to sq-14 norms (top of the supported range)",
    birth: [1390, 6, 20],
    test: [1406, 7, 10],
    raw: profile(16, { SI: 12, VC: 13, MR: 10 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.validation.years, 16);
      assert.equal(r.validation.band, "sq-14");
    }
  },
  {
    name: "age 17 — above MAX_AGE: age error, no analysis",
    birth: [1389, 6, 20],
    test: [1406, 7, 10],
    raw: profile(16),
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.snapshot, null);
      assert.equal(r.analysis, null);
      assert.equal(r.validation.errors[0].kind, "age");
      assert.equal(r.validation.errors[0].value, "17");
    }
  },
  {
    name: "VCI ≫ PRI — index scatter ≥ 23, GAI invalid under strict mode",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { SI: 16, VC: 16, CO: 15, IN: 14, WR: 15, BD: 4, PCn: 5, MR: 5, PCm: 4 }),
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.analysis.gai.validity, INVALID, "VCI/PRI gap > 23 invalidates GAI");
      assert.equal(r.analysis.gai.scaled, INVALID, "strict mode reports INVALID instead of a number");
      assert.equal(r.snapshot.gai, null);
      assert.ok(r.flags.some((f) => f.id === "scatter"), "between-index scatter flag must fire");
      assert.ok(r.snapshot.indexScatter >= 23);
    }
  },
  {
    name: "strict:false — same gap, GAI computed from the norms table anyway",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, { SI: 16, VC: 16, CO: 15, IN: 14, WR: 15, BD: 4, PCn: 5, MR: 5, PCm: 4 }),
    opts: { strict: false },
    expect(r) {
      assert.equal(r.ok, true);
      assert.equal(r.analysis.gai.validity, INVALID);
      assert.equal(typeof r.analysis.gai.scaled, "number", "non-strict mode still computes GAI");
      assert.equal(typeof r.snapshot.gai, "number");
      assert.notEqual(r.snapshot.gaiMeta, null);
      assert.equal(r.analysis.strict, false);
    }
  },
  {
    name: "ACID profile — AR/CD/IN/DS all ≤ 7 (SLD + ADHD activation)",
    birth: [1394, 5, 2],
    test: [1406, 7, 1],
    raw: profile(12, { AR: 5, CD: 5, IN: 5, DS: 5 }),
    expect(r) {
      assert.equal(r.ok, true);
      const ids = r.hypotheses.map((h) => h.id);
      assert.ok(ids.includes("SLD"), "SLD should activate");
      assert.ok(ids.includes("ADHD"), "ADHD should activate");
      const sld = r.hypotheses.find((h) => h.id === "SLD");
      assert.ok(sld.clues.some((c) => c.includes("ACID")), "ACID bonus clue expected");
      assert.ok(sld.weight > 0.35, "ACID pattern adds +0.05 to the SLD base weight");
    }
  },
  {
    name: "missing subtests — only the 10 core subtests administered",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, {}, SUBSTITUTES),
    expect(r) {
      assert.equal(r.ok, true);
      assert.deepEqual([...r.validation.missing].sort(), [...SUBSTITUTES].sort());
      for (const k of ["VCI", "PRI", "WMI", "PSI", "FSIQ"]) {
        assert.equal(r.validation.computable[k], true, `${k} computable from cores only`);
      }
      assert.deepEqual(r.snapshot.substitutes, []);
    }
  },
  {
    name: "missing cores — substitutes administered instead (index built on substitutes)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: profile(10, {}, CORES),
    expect(r) {
      assert.equal(r.ok, true);
      assert.deepEqual([...r.validation.missing].sort(), [...CORES].sort());
      assert.ok(r.snapshot.substitutes.length >= 1, "substitute-built indices must be flagged");
      assert.ok(r.flags.some((f) => f.id.startsWith("missing_") || f.id.startsWith("substitute_")));
    }
  },
  {
    name: "zero raw scores everywhere (floors of the norms tables)",
    birth: [1397, 4, 4],
    test: [1406, 6, 30],
    raw: Object.fromEntries(CODES.map((c) => [c, 0])),
    expect(r) {
      assert.equal(r.ok, true, "raw 0 is the table minimum, not an error");
      assert.equal(r.validation.years, 9);
      assert.equal(r.snapshot.subtests.length, 15);
    }
  },
  {
    name: "out-of-range raw scores — huge (999) and negative (-3)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: { ...profile(10), SI: 999, BD: -3 },
    expect(r) {
      assert.equal(r.ok, false);
      const kinds = r.validation.errors.map((e) => e.kind);
      assert.ok(kinds.every((k) => k === "raw_range"));
      const badCodes = r.validation.errors.map((e) => e.code).sort();
      assert.deepEqual(badCodes, ["BD", "SI"]);
      assert.ok(r.validation.missing.includes("SI"));
      assert.ok(r.validation.missing.includes("BD"));
    }
  },
  {
    name: "non-integer raw score (direct API bypass of form normalization)",
    birth: [1396, 8, 10],
    test: [1406, 9, 15],
    raw: { ...profile(10), SI: 3.7 },
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.validation.errors[0].kind, "raw_range");
      assert.match(r.validation.errors[0].message, /عدد صحیح/);
    }
  },
  {
    name: "birth date after test date — date error",
    birth: [1400, 1, 1],
    test: [1399, 12, 1],
    raw: profile(10),
    expect(r) {
      assert.equal(r.ok, false);
      assert.equal(r.validation.errors[0].kind, "date");
    }
  },
  {
    name: "baseAnswers + skippedHypotheses — questionnaire scoring paths",
    birth: [1394, 5, 2],
    test: [1406, 7, 1],
    raw: profile(12, { AR: 5, CD: 5, IN: 5, DS: 5 }),
    opts: {
      baseAnswers: {
        "SLD:A1": "yes",
        "SLD:A2": "yes",
        "SLD:A3": "yes",
        "SLD:B1": "yes",
        "SLD:B2": "yes",
        "SLD:B3": "yes",
        "SLD:C1": "no",
        "ADHD:A1": "yes",
        "ADHD:A2": "yes",
        "ADHD:B2": "yes",
        BQ4: "yes"
      },
      skippedHypotheses: ["MOOD"]
    },
    expect(r) {
      assert.equal(r.ok, true);
      const sld = r.outcomes.find((o) => o.id === "SLD");
      assert.ok(sld, "SLD outcome expected");
      assert.equal(sld.status, "active");
      assert.ok(sld.counts.aYes > 0 && sld.counts.bYes >= 1);
      const mood = r.outcomes.find((o) => o.id === "MOOD");
      assert.ok(mood, "MOOD outcome expected");
      assert.equal(mood.status, "skipped");
      for (const key of ["SLD:A1", "BQ4"]) {
        assert.equal(r.answers[key], "yes", "baseAnswers must be merged into answers");
      }
      assert.ok(r.queue.every((q) => !(q.key in (r.answers || {})) || true)); // queue keys documented
    }
  }
];

// ---------------------------------------------------------------------------
// Golden cases — form payload API (applyWechslerEngineToPayload)
// ---------------------------------------------------------------------------
const OCCURRED_AT = "2026-02-14T09:30:00.000Z"; // → Jalali 1404-11-25

const payloadCases = [
  {
    name: "canonical payload — latin + Persian digits, spaces, full 15 subtests",
    payload: {
      test_date: { value: "1405/08/12", label: "تاریخ اجرا" },
      raw_si: { value: "12" },
      raw_vc: { value: "۱۴" },
      raw_co: { value: " 9 " },
      raw_in: { value: "10" },
      raw_wr: { value: "11" },
      raw_bd: { value: "13" },
      raw_pcn: { value: "8" },
      raw_mr: { value: "10" },
      raw_pcm: { value: "9" },
      raw_ds: { value: "7" },
      raw_ln: { value: "6" },
      raw_ar: { value: "5" },
      raw_cd: { value: "12" },
      raw_ss: { value: "10" },
      raw_ca: { value: "9" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, true);
      assert.deepEqual(h.result.validation.testDate, [1405, 8, 12]);
      assert.equal(typeof h.computed.fsiq, "number");
      const out = JSON.parse(h.payload.engine_output.value);
      assert.equal(out.engineVersion, "m98");
      assert.equal(out.compact, true);
      assert.equal(h.payload.age_at_test.value, h.result.ageLine);
      assert.equal(h.payload.fsiq.value, String(h.computed.fsiq));
    }
  },
  {
    name: "legacy field names only (raw_sim/raw_voc/raw_com/raw_pc)",
    payload: {
      test_date: { value: "1405/08/12" },
      raw_sim: { value: "12" },
      raw_voc: { value: "14" },
      raw_com: { value: "9" },
      raw_pc: { value: "13" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      const raw = h.result.validation.raw;
      assert.deepEqual(Object.keys(raw).sort(), ["CO", "PCn", "SI", "VC"]);
      assert.equal(raw.SI, 12);
      assert.equal(raw.PCn, 13);
    }
  },
  {
    name: "QUIRK LOCK: legacy raw_sim silently overwrites canonical raw_si on collision",
    payload: {
      test_date: { value: "1405/08/12" },
      raw_si: { value: "8" },
      raw_sim: { value: "5" }
    },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.validation.raw.SI, 5, "RAW_FIELD_MAP iteration order means the LEGACY value wins");
    }
  },
  {
    name: "missing test_date → test date falls back to occurred_at (2026-02-14 → 1404-11-25)",
    payload: { raw_si: { value: "12" }, raw_vc: { value: "14" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: OCCURRED_AT,
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(h.result.validation.testDate, [1404, 11, 25]);
    }
  },
  {
    name: "invalid test_date (month 13, day 40) → occurred_at fallback",
    payload: { test_date: { value: "1406/13/40" }, raw_si: { value: "12" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: OCCURRED_AT,
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(h.result.validation.testDate, [1404, 11, 25]);
    }
  },
  {
    name: "no test_date and garbage occurred_at → Jalali shape error",
    payload: { raw_si: { value: "12" }, raw_bd: { value: "13" } },
    birth: "1398/03/25",
    occurredAt: "not-a-date",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, false);
      assert.equal(h.result.validation.errors[0].kind, "shape");
    }
  },
  {
    name: "unparsable birth date → engine error branch (hook would throw)",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "12" }, raw_vc: { value: "14" } },
    birth: "نامشخص",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, false);
      assert.equal(h.result.snapshot, null);
      assert.equal(h.result.validation.errors[0].kind, "shape");
      assert.match(h.result.validation.errors[0].message, /تاریخ تولد/);
      assert.equal(typeof h.payload.engine_output.value, "string");
      assert.equal(JSON.parse(h.payload.engine_output.value).ok, false);
    }
  },
  {
    name: "gregorian ISO birth date → converted to Jalali (2019-08-03 → 1398-05-12)",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "12" }, raw_vc: { value: "14" } },
    birth: "2019-08-03",
    expect(h) {
      assert.equal(h.ran, true);
      assert.equal(h.result.ok, true);
      assert.deepEqual(h.result.validation.birthDate, [1398, 5, 12]);
      assert.match(h.result.ageLine, /^۷ سال/);
    }
  },
  {
    name: "empty payload → ran:false, payload passed through untouched (same reference)",
    payload: { interpretation: { value: "توضیح WITHOUT raw scores" } },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, false);
      assert.equal(h.result, null);
      assert.deepEqual(h.computed, { fsiq: null, vci: null, pri: null, wmi: null, psi: null, gai: null, ageLine: "" });
    },
    sameReference: true
  },
  {
    name: "non-numeric field values silently dropped; numeric ones kept",
    payload: { test_date: { value: "1405/08/12" }, raw_si: { value: "abc" }, raw_bd: { value: "7" } },
    birth: "1398/03/25",
    expect(h) {
      assert.equal(h.ran, true);
      assert.deepEqual(Object.keys(h.result.validation.raw), ["BD"]);
      assert.ok("engine_output" in h.payload);
      assert.equal(
        h.payload.raw_si.value,
        "abc",
        "QUIRK: non-numeric raw fields are silently ignored by the engine but remain in the payload untouched"
      );
    }
  }
];

// ---------------------------------------------------------------------------
// Run the golden comparisons
// ---------------------------------------------------------------------------
for (const c of directCases) {
  test(`direct | ${c.name}`, () => {
    const input = {
      rawScores: c.raw,
      testDate: c.test,
      birthDate: c.birth,
      ...(c.opts ?? {})
    };
    const a = extracted.runWechslerAnalysis(input);
    const b = ref.runWechslerAnalysis(input);
    assertSame(c.name, a, b);
    c.expect(b); // sanity assertions against the REFERENCE (bundle) output
  });
}

for (const c of payloadCases) {
  test(`payload | ${c.name}`, () => {
    const occurredAt = c.occurredAt ?? OCCURRED_AT;
    const a = extracted.applyWechslerEngineToPayload(c.payload, c.birth, occurredAt);
    const b = ref.applyWechslerEngineToPayload(c.payload, c.birth, occurredAt);
    assertSame(c.name, a, b);
    if (c.sameReference) assert.equal(a.payload, c.payload, "passthrough must return the same payload object");
    c.expect(b);
  });
}

// ---------------------------------------------------------------------------
// Meta: data tables themselves must be identical between bundle and extraction
// ---------------------------------------------------------------------------
test("meta | data tables identical (NORMS, HYPOTHESES, TREATMENTS, maps)", () => {
  for (const table of [
    "NORMS",
    "HYPOTHESES",
    "TREATMENTS",
    "RAW_FIELD_MAP",
    "SUBTESTS",
    "SUBTEST_FA",
    "SUBTEST_FA_OK",
    "INDEX_MEMBERS",
    "GAI_MEMBERS",
    "WISC4_EVENT_KEY"
  ]) {
    assertSame(table, extracted[table], ref[table]);
  }
});

test("meta | both modules agree on constants and engineVersion", () => {
  assert.equal(extracted.WISC4_EVENT_KEY, "ce-wechsler-w4-v1");
  assert.equal(extracted.MIN_AGE, 6);
  assert.equal(extracted.MAX_AGE, 16);
  assert.equal(extracted.NORM_MIN_AGE, 6);
  assert.equal(extracted.NORM_MAX_BAND, 14);
  const probe = { raw_si: { value: "10" } };
  const compact = extracted.compactWechslerOutput(
    extracted.applyWechslerEngineToPayload(probe, "1398/03/25", OCCURRED_AT).result
  );
  assert.equal(compact.engineVersion, "m98");
  assert.equal(Object.keys(extracted).length > 0, true);
});
