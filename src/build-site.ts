// Injects site/data.json into site/template.html -> site/index.html.
// The output is a single self-contained file: no external scripts, fonts, or fetches.

import fs from "node:fs";

const template = fs.readFileSync("site/template.html", "utf8");
const data = fs.readFileSync("site/data.json", "utf8");

const marker = "/*__DATA__*/null";
if (!template.includes(marker)) {
  console.error(`template.html is missing the ${marker} marker`);
  process.exit(1);
}
fs.writeFileSync("site/index.html", template.replace(marker, data), "utf8");
console.log(`Wrote site/index.html (${(fs.statSync("site/index.html").size / 1024).toFixed(0)} KB)`);
