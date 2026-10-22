import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extractEngineRegion } from "../tests/golden/generate-bundle-ref.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const bundle = readFileSync(path.join(ROOT, "worker", "bundle.js"), "utf8");
const enginePath = path.join(ROOT, "src", "domain", "case-formulation", "engine.js");
const engine = readFileSync(enginePath, "utf8");

const newRegion = extractEngineRegion(bundle);

const START = "var CONSTRUCT_KEYS = [";
const END_MARK = '__name2(ageYearsFromBirthDate, "ageYearsFromBirthDate");';
const s = engine.indexOf(START);
if (s === -1) throw new Error("engine.js: start anchor not found");
const e = engine.indexOf(END_MARK, s);
if (e === -1) throw new Error("engine.js: end anchor not found");
const oldRegion = engine.slice(s, e + END_MARK.length);

if (!engine.includes(oldRegion)) throw new Error("engine.js: region not contiguous");
const next = engine.replace(oldRegion, newRegion);
writeFileSync(enginePath, next);
console.log("[rebuild] engine.js region replaced:", oldRegion.length, "->", newRegion.length, "chars");
