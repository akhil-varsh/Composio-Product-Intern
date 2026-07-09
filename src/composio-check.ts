// Composio registry cross-check. Pulls Composio's own toolkit catalog via their SDK
// and matches our 100 apps against it. Two outputs per app:
//   1. in_composio: does a Composio toolkit already exist? (interesting finding on its own)
//   2. composio_auth_schemes: Composio's recorded auth for that app — used later as an
//      independent check against what OUR agent concluded about auth.
//
// Usage: npm run composio

import { Composio } from "@composio/core";
import { APPS } from "./apps.ts";
import { loadEnv, requireEnv, writeJson } from "./lib/util.ts";

// Apps whose Composio slug isn't guessable from the name. Filled in by hand after
// inspecting first-run "no match" output — this is one of the explicit human-in-the-loop points.
const ALIASES: Record<string, string[]> = {
  "Meta Ads": ["facebook ads", "meta ads"],
  "WhatsApp Business": ["whatsapp"],
  "Monday.com": ["monday"],
  "Lark (Larksuite)": ["lark"],
  "Magento (Adobe Commerce)": ["magento", "adobe commerce"],
  "Amazon Selling Partner": ["amazon seller", "amazon sp"],
  "Otter AI": ["otter"],
  "Threads (Meta)": ["threads"],
  "Jira": ["jira", "atlassian"],
  "QuickBooks": ["quickbooks", "intuit"],
  "Google Ads": ["google ads", "googleads"],
  "YouTube Transcript": ["youtube"],
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

interface CatalogItem {
  name: string;
  slug: string;
  authSchemes?: string[];
  meta?: { toolsCount?: number; description?: string };
}

function matchApp(appName: string, catalog: CatalogItem[]): CatalogItem | null {
  const targets = [appName, ...(ALIASES[appName] ?? [])].map(norm);
  // exact normalized match on name or slug first, then prefix match
  for (const t of targets) {
    const exact = catalog.find((c) => norm(c.name) === t || norm(c.slug) === t);
    if (exact) return exact;
  }
  for (const t of targets) {
    const prefix = catalog.filter((c) => norm(c.name).startsWith(t) || norm(c.slug).startsWith(t));
    if (prefix.length === 1) return prefix[0]; // only accept unambiguous prefix matches
  }
  return null;
}

async function main() {
  loadEnv();
  const composio = new Composio({ apiKey: requireEnv("COMPOSIO_API_KEY") });

  console.log("Fetching Composio toolkit catalog...");
  const catalog = (await composio.toolkits.get({})) as unknown as CatalogItem[];
  console.log(`Catalog: ${catalog.length} toolkits`);
  writeJson("data/composio-catalog.json", catalog);

  const results = APPS.map((app) => {
    const match = matchApp(app.name, catalog);
    return {
      id: app.id,
      name: app.name,
      in_composio: !!match,
      composio_slug: match?.slug ?? null,
      composio_tools_count: match?.meta?.toolsCount ?? null,
      composio_auth_schemes: match?.authSchemes ?? null,
    };
  });

  writeJson("data/composio-check.json", results);
  const found = results.filter((r) => r.in_composio);
  console.log(`\nMatched ${found.length}/${APPS.length} apps to existing Composio toolkits.`);
  console.log(`No match (verify by hand — may need an alias):`);
  for (const r of results.filter((x) => !x.in_composio)) console.log(`  [${r.id}] ${r.name}`);
}

main();
