import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEvalManifest } from "../lib/eval/manifest";

const file = process.argv[2] ?? "eval/manifest.v1.json";
const p = resolve(process.cwd(), file);
const raw: unknown = JSON.parse(readFileSync(p, "utf8"));
const manifest = parseEvalManifest(raw);
console.log(`Eval manifest OK: ${p} (${manifest.clips.length} clips)`);
