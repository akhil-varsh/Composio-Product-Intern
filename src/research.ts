// Pass 1: research agent. For each app, one Exa /answer call (search + synthesis in
// one shot) constrained by a JSON schema, so every record comes back structured with
// real citation URLs. Results checkpoint to data/pass1/<id>-<slug>.json so the run is
// resumable and individual apps can be re-run with --only.
//
// (v1 of this pass used Gemini + Google Search grounding; it produced 16 records before
// hitting the free tier's 20-requests/day wall. Those records are kept in
// data/pass1-gemini/ and used as an independent cross-check — see build-data.ts.)
//
// Usage:
//   npm run research                 # all 100, skipping ones already done
//   npm run research -- --only 5,50  # re-run specific apps
//   npm run research -- --force      # ignore checkpoints
//   npm run research -- --limit 10   # first N pending (smoke test)

import path from "node:path";
import { APPS, type AppEntry } from "./apps.ts";
import { exaAnswer } from "./lib/exa.ts";
import {
  loadEnv, parseArgs, readJsonIfExists, requireEnv, sleep, slug, writeJson,
} from "./lib/util.ts";
import type { ResearchRecord } from "./types.ts";

const OUT_DIR = path.join("data", "pass1");
const PACE_MS = Number(process.env.PACE_MS || 800); // Exa allows 10 QPS; stay well under

// JSON Schema (draft 7) that /answer must fill. Closed enums keep results clusterable.
const RECORD_SCHEMA = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: [
    "one_liner", "auth_methods", "auth_notes", "access", "access_notes",
    "api_type", "api_breadth", "api_notes", "mcp", "mcp_notes",
    "buildable", "blocker", "evidence", "confidence",
  ],
  properties: {
    one_liner: { type: "string", description: "What the app does, one sentence" },
    auth_methods: {
      type: "array",
      items: { type: "string", enum: ["OAuth2", "API key", "Basic", "Bearer token", "JWT", "mTLS", "other"] },
      description: "All auth methods the public API supports; empty if no API",
    },
    auth_notes: { type: "string" },
    access: {
      type: "string",
      enum: ["self_serve_free", "self_serve_trial", "paid_plan", "admin_approval", "partner_gated", "no_public_api"],
      description: "How a developer gets API credentials",
    },
    access_notes: { type: "string" },
    api_type: {
      type: "array",
      items: { type: "string", enum: ["REST", "GraphQL", "SOAP", "gRPC", "SDK-only", "none"] },
    },
    api_breadth: { type: "string", enum: ["broad", "moderate", "narrow", "none"] },
    api_notes: { type: "string" },
    mcp: { type: "string", enum: ["official", "community", "none_found"] },
    mcp_notes: { type: "string" },
    buildable: { type: "string", enum: ["yes", "with_caveats", "blocked"] },
    blocker: { type: "string", description: "Main blocker; empty string when buildable is yes" },
    evidence: {
      type: "array",
      items: {
        type: "object",
        required: ["claim", "url"],
        properties: { claim: { type: "string" }, url: { type: "string" } },
      },
      description: "2-5 important claims, each with the docs URL that supports it",
    },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
} as const;

// Wording matters: an earlier draft said "wrapping it as a tool for AI agents", which
// steered search toward vendors' AI-product marketing (Salesforce Agentforce etc.)
// instead of their core developer platform. Keep the query about the public API itself.
function buildQuery(app: AppEntry): string {
  return `Research the public developer API of "${app.name}" (${app.hint}) using its official
developer documentation — the core API that third-party integrations use, not any adjacent
AI product the vendor sells.

Answer precisely:
1. What does the product do (one line)?
2. Authentication for the public API: which of OAuth2 / API key / Basic / Bearer token / JWT / mTLS
   does it support?
3. Credential access: can a developer get working API credentials by themselves for free (free plan,
   free developer/sandbox account) or on a self-serve trial? Or is API access gated behind a paid
   plan, an app-review/admin-approval step, or a partnership / contact-sales process? Judge API
   access specifically — product signup can be free while the API is gated, and vice versa.
4. API surface: documented public REST / GraphQL / SOAP / gRPC / SDK-only / none, and how broad
   (broad = most of the product is API-controllable; moderate = core objects; narrow = a few endpoints).
5. MCP: does an official Model Context Protocol server by the vendor exist? A well-known community
   one? None? (OpenAPI specs, Postman collections, SDKs and Zapier integrations are NOT MCP servers.)
6. Verdict: could a third-party integration platform wrap this API into a toolkit today — "yes",
   "with_caveats" (name them), or "blocked" (name the blocker)?

Rules: prefer official docs; every important claim needs a real docs URL in "evidence" — never
invent URLs. If something cannot be verified, say so in the notes and lower "confidence" rather
than guessing. "no_public_api" with low confidence is a valid honest answer for obscure apps.`;
}

// Exa's structured output occasionally mangles URL strings (stray JSON fragments,
// duplicates). Keep only clean, unique http(s) URLs; top up from citations if too few.
function cleanEvidence(
  evidence: { claim: string; url: string }[] | undefined,
  citations: { url: string; title?: string }[],
): { claim: string; url: string }[] {
  const seen = new Set<string>();
  const out: { claim: string; url: string }[] = [];
  for (const e of evidence ?? []) {
    const m = /https?:\/\/[^\s"'<>{}\]\)]+/.exec(e.url ?? "");
    if (!m) continue;
    let url = m[0].replace(/[.,;]+$/, "");
    try { url = new URL(url).toString(); } catch { continue; }
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ claim: e.claim, url });
  }
  for (const c of citations) {
    if (out.length >= 4) break;
    if (!seen.has(c.url)) {
      seen.add(c.url);
      out.push({ claim: `Search citation: ${c.title ?? c.url}`, url: c.url });
    }
  }
  return out;
}

async function researchOne(app: AppEntry): Promise<{ record: ResearchRecord; cost: number }> {
  const { answer, citations, cost } = await exaAnswer<Omit<ResearchRecord, "id" | "name" | "category">>(
    buildQuery(app),
    RECORD_SCHEMA as unknown as Record<string, unknown>,
  );
  answer.evidence = cleanEvidence(answer.evidence, citations);
  const evidenceUrls = new Set(answer.evidence.map((e) => e.url));
  const record: ResearchRecord = {
    id: app.id,
    name: app.name,
    category: app.category,
    ...answer,
    blocker: (answer.blocker as unknown as string)?.trim() ? answer.blocker : null,
    search_sources: citations.map((c) => c.url).filter((u) => !evidenceUrls.has(u)).slice(0, 8),
    researched_at: new Date().toISOString(),
    model: "exa-answer",
  };
  return { record, cost };
}

async function main() {
  loadEnv();
  requireEnv("EXA_API_KEY");
  const { only, force, limit } = parseArgs(process.argv.slice(2));

  const pending = APPS.filter((app) => {
    if (only.size > 0) return only.has(app.id);
    const file = path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`);
    return force || !readJsonIfExists(file);
  }).slice(0, limit);

  console.log(`Researching ${pending.length} apps (${APPS.length - pending.length} already done)...`);

  let ok = 0;
  let totalCost = 0;
  const failed: number[] = [];
  for (const app of pending) {
    const started = Date.now();
    process.stdout.write(`[${app.id}] ${app.name} ... `);
    try {
      const { record, cost } = await researchOne(app);
      writeJson(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`), record);
      ok++;
      totalCost += cost;
      console.log(`ok (${record.buildable}, ${record.access}, conf=${record.confidence}, $${cost.toFixed(3)})`);
    } catch (err: any) {
      failed.push(app.id);
      console.log(`FAILED: ${String(err.message).slice(0, 200)}`);
    }
    const elapsed = Date.now() - started;
    if (elapsed < PACE_MS) await sleep(PACE_MS - elapsed);
  }

  console.log(`\nDone: ${ok} ok, ${failed.length} failed. Total cost: $${totalCost.toFixed(2)}`);
  if (failed.length) console.log(`Retry failures with: npm run research -- --only ${failed.join(",")}`);
}

main();
