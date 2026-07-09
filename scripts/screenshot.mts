// Dev helper: render site/index.html headlessly and save full-page screenshots
// (light + dark) so layout can be reviewed without opening a browser.
// Usage: npx tsx scripts/screenshot.mts [outDir]

import { chromium } from "playwright";
import path from "node:path";

const outDir = process.argv[2] || "data";
const file = "file:///" + path.resolve("site/index.html").replace(/\\/g, "/");

const browser = await chromium.launch();
for (const scheme of ["light", "dark"] as const) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    colorScheme: scheme,
  });
  await page.goto(file);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `site-${scheme}.png`), fullPage: true });
  console.log(`saved ${outDir}/site-${scheme}.png`);
  await page.close();
}
await browser.close();
