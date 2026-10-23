// T7 (m150-b) — درج دو تعریف تازهٔ battery-composite.json (ce-sld-class-t-v1 + ce-comp-teacher-v2)
// در آینهٔ باندل (battery_composite_default) — همان سبک esbuild: کلید بدون کوتیشن، رشته‌های
// یونیکد-اسکیپ. زیرمقیاس/باند/فیلدها عیناً از src می‌آیند تا قرارداد باتری≡case-events برقرار بماند.
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const bundlePath = path.join(ROOT, "worker", "bundle.js");
let bundle = readFileSync(bundlePath, "utf8");

const composite = JSON.parse(readFileSync(path.join(ROOT, "src", "domain", "clinical-engine", "battery-composite.json"), "utf8"));
const NEW_KEYS = ["ce-sld-class-t-v1", "ce-comp-teacher-v2"];

const esc = (s) => JSON.stringify(String(s)).replace(/[\u007f-\uffff]/g, (ch) => "\\u" + ch.charCodeAt(0).toString(16).padStart(4, "0"));
const isIdent = (k) => /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(k);
function lit(v, ind) {
  if (v === null) return "null";
  if (typeof v === "number" || typeof v === "boolean") return JSON.stringify(v);
  if (typeof v === "string") return esc(v);
  const pad = " ".repeat(ind);
  const padIn = " ".repeat(ind + 2);
  if (Array.isArray(v)) {
    if (v.length === 0) return "[]";
    return "[\n" + v.map((x) => padIn + lit(x, ind + 2)).join(",\n") + "\n" + pad + "]";
  }
  const keys = Object.keys(v);
  if (keys.length === 0) return "{}";
  return "{\n" + keys.map((k) => padIn + (isIdent(k) ? k : esc(k)) + ": " + lit(v[k], ind + 2)).join(",\n") + "\n" + pad + "}";
}

for (const key of NEW_KEYS) {
  if (bundle.split(`key: "ce-sld-class-t-v1"`).length > 1 && key === "ce-sld-class-t-v1") {
    // already present — skip (idempotent)
  }
  const def = composite.find((f) => f.key === key);
  if (!def) throw new Error(`def not found in src json: ${key}`);
  const marker = `var battery_composite_default = [`;
  const start = bundle.indexOf(marker);
  if (start === -1) throw new Error("battery_composite_default not found");
  const close = bundle.indexOf("\n];", start);
  if (close === -1) throw new Error("array close not found");
  const seg = bundle.slice(start, close);
  if (seg.includes(`"${key}"`) || seg.includes(key)) {
    console.log(`[t7-battery] ${key} already embedded — skip`);
    continue;
  }
  const entry = "  " + lit(def, 2);
  bundle = bundle.slice(0, close) + ",\n" + entry + bundle.slice(close);
  console.log(`[t7-battery] inserted ${key} (${entry.length} chars)`);
}

writeFileSync(bundlePath, bundle);
console.log("[t7-battery] done");
