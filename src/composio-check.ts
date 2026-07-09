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
  // Composio ships one unified "zoho" suite toolkit (57 tools incl. CRM) rather than per-product ones
  "Zoho CRM": ["zoho"],
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

// The list endpoint caps at 1000 items, so a missing catalog match may just be
// truncation. For unmatched apps, probe likely slugs directly with toolkits.get(slug).
function slugCandidates(appName: string): string[] {
  const base = [appName, ...(ALIASES[appName] ?? [])];
  const out = new Set<string>();
  for (const b of base) {
    const words = b.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().split(/\s+/);
    out.add(words.join("_"));
    out.add(words.join("-"));
    out.add(words.join(""));
  }
  return [...out];
}

async function probeSlug(
  composio: Composio,
  appName: string,
): Promise<CatalogItem | null> {
  for (const s of slugCandidates(appName)) {
    try {
      const tk = (await composio.toolkits.get(s)) as unknown as {
        name: string;
        slug: string;
        authConfigDetails?: { mode?: string }[];
        meta?: { toolsCount?: number };
      };
      return {
        name: tk.name,
        slug: tk.slug,
        authSchemes: tk.authConfigDetails?.map((a) => a.mode ?? "").filter(Boolean),
        meta: tk.meta,
      };
    } catch {
      // slug doesn't exist — try the next candidate
    }
  }
  return null;
}

// The SDK's list call caps at 1000 items and hides the pagination cursor, so the full
// catalog (1047 toolkits at time of writing) has to come from the raw v3 endpoint.
async function fetchFullCatalog(apiKey: string): Promise<CatalogItem[]> {
  const items: CatalogItem[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("https://backend.composio.dev/api/v3/toolkits");
    url.searchParams.set("limit", "500");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url, { headers: { "x-api-key": apiKey } });
    if (!res.ok) throw new Error(`toolkits list ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const page = (await res.json()) as {
      items: {
        name: string;
        slug: string;
        auth_schemes?: string[] | string;
        meta?: { tools_count?: number; description?: string };
      }[];
      next_cursor: string | null;
    };
    for (const it of page.items) {
      items.push({
        name: it.name,
        slug: it.slug,
        authSchemes: Array.isArray(it.auth_schemes)
          ? it.auth_schemes
          : it.auth_schemes
            ? it.auth_schemes.split(",")
            : undefined,
        meta: { toolsCount: it.meta?.tools_count, description: it.meta?.description },
      });
    }
    cursor = page.next_cursor;
  } while (cursor);
  return items;
}

async function main() {
  loadEnv();
  const apiKey = requireEnv("COMPOSIO_API_KEY");
  const composio = new Composio({ apiKey });

  console.log("Fetching Composio toolkit catalog...");
  const catalog = await fetchFullCatalog(apiKey);
  console.log(`Catalog: ${catalog.length} toolkits`);
  writeJson("data/composio-catalog.json", catalog);

  const results = [];
  for (const app of APPS) {
    let match = matchApp(app.name, catalog);
    let via = match ? "catalog" : null;
    if (!match) {
      match = await probeSlug(composio, app.name);
      if (match) via = "slug-probe";
    }
    results.push({
      id: app.id,
      name: app.name,
      in_composio: !!match,
      matched_via: via,
      composio_slug: match?.slug ?? null,
      composio_tools_count: match?.meta?.toolsCount ?? null,
      composio_auth_schemes: match?.authSchemes ?? null,
    });
  }

  writeJson("data/composio-check.json", results);
  const found = results.filter((r) => r.in_composio);
  console.log(`\nMatched ${found.length}/${APPS.length} apps to existing Composio toolkits.`);
  console.log(`No match (verify by hand — may need an alias):`);
  for (const r of results.filter((x) => !x.in_composio)) console.log(`  [${r.id}] ${r.name}`);
}

main();
