// Pass 1: research agent. For each app, one search-grounded Gemini call that must
// return a strict JSON record (schema in types.ts). Results are checkpointed to
// data/pass1/<id>-<slug>.json so the run is resumable and individual apps can be
// re-run with --only.
//
// Usage:
//   npm run research                 # all 100, skipping ones already done
//   npm run research -- --only 5,50  # re-run specific apps
//   npm run research -- --force      # ignore checkpoints
//   npm run research -- --limit 10   # first N pending (smoke test)

import path from "node:path";
import { APPS, type AppEntry } from "./apps.ts";
import { callGemini } from "./lib/gemini.ts";
import {
  extractJson, loadEnv, parseArgs, readJsonIfExists, requireEnv, sleep, slug, writeJson,
} from "./lib/util.ts";
import type { ResearchRecord } from "./types.ts";

const OUT_DIR = path.join("data", "pass1");
// Free-tier Gemini is ~10 requests/min; space request starts to stay under it.
const PACE_MS = Number(process.env.PACE_MS || 7000);

function buildPrompt(app: AppEntry): string {
  return `You are an API-integration researcher at Composio, a company that wraps SaaS app APIs
into tools that AI agents can call. Research the app below using Google Search and its
official developer documentation, then fill in the JSON record.

APP: ${app.name}
CATEGORY (given): ${app.category}
STARTING HINT: ${app.hint}

Research questions, in priority order:
1. What does it do? (one line)
2. Auth for its PUBLIC API: OAuth2, API key, Basic, Bearer token, JWT, mTLS, other? List all supported.
3. Access: can a developer get working API credentials by themselves, for free or on a trial?
   Or does it require a paid plan, an app-review/admin-approval step, or a partnership /
   contact-sales gate? Be precise about WHICH gate applies to API access specifically
   (an app can have free signup but gated API access, or vice versa).
4. API surface: documented public REST / GraphQL / SOAP / gRPC / SDK-only / none? Roughly how
   broad (broad = most of the product is controllable via API; moderate = core objects only;
   narrow = a handful of endpoints)?
5. MCP: does an OFFICIAL MCP (Model Context Protocol) server exist, built or endorsed by the
   vendor? A well-known community one? None you can find? MCP means the Model Context Protocol
   standard that AI agents connect to. OpenAPI specs, Postman collections, SDKs, and Zapier
   integrations are NOT MCP servers — do not count them.
6. Verdict: could Composio build an agent toolkit for this TODAY ("yes"), only with caveats
   ("with_caveats" — name them), or is it blocked ("blocked" — name the blocker)?

Rules:
- Prefer official docs over blog posts. Every important claim needs an evidence URL you actually found.
- Evidence URLs must be real pages you saw in search results — never invent or guess a URL.
- Evidence URLs must be the actual destination page (e.g. https://developers.pipedrive.com/docs/api/auth),
  NEVER a vertexaisearch.cloud.google.com or other redirect/tracking link.
- If you cannot verify something, say so in the notes and lower "confidence" — do not guess.
- Some apps are small or obscure; "no_public_api" with low confidence is a valid, honest answer.

Output ONLY a JSON object (no prose before or after) with exactly these fields:
{
  "one_liner": string,
  "auth_methods": string[]           // subset of: "OAuth2","API key","Basic","Bearer token","JWT","mTLS","other" — empty if no API
  "auth_notes": string,
  "access": "self_serve_free" | "self_serve_trial" | "paid_plan" | "admin_approval" | "partner_gated" | "no_public_api",
  "access_notes": string,
  "api_type": string[],              // subset of: "REST","GraphQL","SOAP","gRPC","SDK-only","none"
  "api_breadth": "broad" | "moderate" | "narrow" | "none",
  "api_notes": string,
  "mcp": "official" | "community" | "none_found",
  "mcp_notes": string,
  "buildable": "yes" | "with_caveats" | "blocked",
  "blocker": string | null,          // null when buildable is "yes"
  "evidence": [{ "claim": string, "url": string }],   // 2-5 items
  "confidence": "high" | "medium" | "low"
}`;
}

// Grounding gives back vertexaisearch redirect links, which expire and hide the real
// domain. Follow the redirect once to recover the actual destination URL.
async function resolveRedirect(url: string): Promise<string> {
  if (!/vertexaisearch\.cloud\.google\.com/.test(url)) return url;
  try {
    const res = await fetch(url, { redirect: "manual", signal: AbortSignal.timeout(10_000) });
    return res.headers.get("location") ?? url;
  } catch {
    return url;
  }
}

async function researchOne(app: AppEntry): Promise<ResearchRecord> {
  const { text, sources } = await callGemini(buildPrompt(app), { useSearch: true });
  const parsed = extractJson(text) as Omit<ResearchRecord, "id" | "name" | "category">;
  const evidence = await Promise.all(
    (parsed.evidence ?? []).map(async (e) => ({ ...e, url: await resolveRedirect(e.url) })),
  );
  const resolvedSources = [...new Set(await Promise.all(sources.slice(0, 10).map(resolveRedirect)))];
  return {
    id: app.id,
    name: app.name,
    category: app.category,
    ...parsed,
    evidence,
    search_sources: resolvedSources,
    researched_at: new Date().toISOString(),
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
  };
}

async function main() {
  loadEnv();
  requireEnv("GEMINI_API_KEY");
  const { only, force, limit } = parseArgs(process.argv.slice(2));

  const pending = APPS.filter((app) => {
    if (only.size > 0) return only.has(app.id);
    const file = path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`);
    return force || !readJsonIfExists(file);
  }).slice(0, limit);

  console.log(`Researching ${pending.length} apps (${APPS.length - pending.length} already done)...`);

  let ok = 0;
  let failed: number[] = [];
  for (const app of pending) {
    const started = Date.now();
    process.stdout.write(`[${app.id}] ${app.name} ... `);
    try {
      const record = await researchOne(app);
      writeJson(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`), record);
      ok++;
      console.log(`ok (${record.buildable}, ${record.access}, conf=${record.confidence})`);
    } catch (err: any) {
      if (String(err.message).startsWith("DAILY_QUOTA_EXHAUSTED")) {
        console.error(`\nDaily quota exhausted. Progress is checkpointed — re-run tomorrow or switch keys.`);
        break;
      }
      failed.push(app.id);
      console.log(`FAILED: ${err.message.slice(0, 200)}`);
    }
    const elapsed = Date.now() - started;
    if (elapsed < PACE_MS) await sleep(PACE_MS - elapsed);
  }

  console.log(`\nDone: ${ok} ok, ${failed.length} failed.`);
  if (failed.length) console.log(`Retry failures with: npm run research -- --only ${failed.join(",")}`);
}

main();
