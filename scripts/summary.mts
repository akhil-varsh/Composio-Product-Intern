// Dev helper: quick distribution summary of pass-1 records.
import fs from "node:fs";

const files = fs.readdirSync("data/pass1").filter((f) => f.endsWith(".json"));
const recs = files.map((f) => JSON.parse(fs.readFileSync(`data/pass1/${f}`, "utf8")));
const count = (key: string) => {
  const c: Record<string, number> = {};
  for (const r of recs) {
    const v = r[key];
    for (const x of Array.isArray(v) ? v : [v]) c[x] = (c[x] ?? 0) + 1;
  }
  return Object.entries(c).sort((a, b) => b[1] - a[1]);
};
for (const k of ["access", "buildable", "mcp", "confidence", "api_breadth", "auth_methods"]) {
  console.log(`\n${k}:`);
  for (const [v, n] of count(k)) console.log(`  ${v}: ${n}`);
}
console.log("\nlow/medium confidence apps:");
for (const r of recs.filter((x) => x.confidence !== "high")) console.log(`  [${r.id}] ${r.name} (${r.confidence})`);
console.log("\nblocked/no-api apps:");
for (const r of recs.filter((x) => x.buildable === "blocked" || x.access === "no_public_api"))
  console.log(`  [${r.id}] ${r.name}: ${r.blocker ?? r.access}`);
