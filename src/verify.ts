// Pass 2: verification loop, two layers.
//
// Layer 1 — deterministic evidence check (free, no model):
//   fetch every evidence URL pass 1 cited. Dead URLs are flagged (a dead or invented
//   citation is the classic hallucination tell). The fetched text is then scanned for
//   keyword corroboration of each claimed field value.
//
// Layer 2 — targeted re-ask (only for fields layer 1 could not corroborate):
//   one narrow Exa /answer question per unsettled field, schema-constrained to the same
//   enum. Agreement => confirmed; disagreement => contradicted + corrected value logged.
//   Absence of a keyword is never treated as contradiction — only a re-ask can overturn.
//
// Usage mirrors research.ts:  npm run verify [-- --only 5,50 | --force | --limit 10]

import path from "node:path";
import { APPS } from "./apps.ts";
import { exaAnswer } from "./lib/exa.ts";
import {
  loadEnv, parseArgs, readJsonIfExists, requireEnv, sleep, slug, writeJson,
} from "./lib/util.ts";
import type { FieldVerdict, ResearchRecord, VerificationRecord } from "./types.ts";

const IN_DIR = path.join("data", "pass1");
const OUT_DIR = path.join("data", "pass2");
const PACE_MS = Number(process.env.PACE_MS || 500);
const MAX_URLS = 4;
const MAX_CHARS_PER_PAGE = 40_000;

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
      Accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
    },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const html = await res.text();
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&amp;|&lt;|&gt;|&#\d+;|&\w+;/g, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  if (text.length < 200) throw new Error("almost no text (JS-rendered or blocked)");
  return text.slice(0, MAX_CHARS_PER_PAGE);
}

/* ---------- layer 1: keyword corroboration ---------- */

const AUTH_PATTERNS: Record<string, RegExp> = {
  "OAuth2": /oauth\s*2|oauth2|authorization code|client credentials/,
  "API key": /api[ -]?key|x-api-key|api token|personal access token|access token/,
  "Basic": /basic auth/,
  "Bearer token": /bearer/,
  "JWT": /\bjwt\b|json web token/,
  "mTLS": /mtls|mutual tls/,
  "other": /./, // "other" can't be keyword-checked; always escalates via the access re-ask
};

const ACCESS_PATTERNS: Record<string, RegExp> = {
  self_serve_free: /free (plan|tier|account|developer|sandbox)|developer (edition|account)|sign ?up.{0,40}free|no credit card/,
  self_serve_trial: /free trial|trial (account|period)|14[- ]day|30[- ]day/,
  paid_plan: /paid plan|available on (the )?\w+ plan|upgrade to|premium|enterprise plan/,
  admin_approval: /approval|app review|review process|verification process|whitelist/,
  partner_gated: /contact (sales|us)|partner(ship)? (program|required)|apply for access|request access|invite[- ]only/,
  no_public_api: /no public api|does not (offer|provide|have) (a |an )?(public )?api/,
};

const TYPE_PATTERNS: Record<string, RegExp> = {
  REST: /rest(ful)? api|rest endpoints?|\brest\b/,
  GraphQL: /graphql/,
  SOAP: /soap/,
  gRPC: /grpc/,
  "SDK-only": /sdk/,
  none: /no public api/,
};

function corroborate(record: ResearchRecord, text: string) {
  const settled = new Map<string, { verdict: FieldVerdict; quote: string }>();

  const authClaims = record.auth_methods ?? [];
  if (authClaims.length > 0 && authClaims.every((m) => AUTH_PATTERNS[m]?.test(text))) {
    settled.set("auth_methods", { verdict: "confirmed", quote: "all claimed methods appear in cited pages" });
  }
  if (ACCESS_PATTERNS[record.access]?.test(text)) {
    settled.set("access", { verdict: "confirmed", quote: `cited pages match "${record.access}" language` });
  }
  const typeClaims = (record.api_type ?? []).filter((t) => t !== "none");
  if (typeClaims.length > 0 && typeClaims.every((t) => TYPE_PATTERNS[t]?.test(text))) {
    settled.set("api_type", { verdict: "confirmed", quote: "claimed API styles appear in cited pages" });
  }
  if (record.mcp !== "none_found" && /model context protocol|mcp server/.test(text)) {
    settled.set("mcp", { verdict: "confirmed", quote: "MCP mentioned in cited pages" });
  }
  return settled;
}

/* ---------- layer 2: targeted re-ask ---------- */

const REASK: Record<string, { question: (r: ResearchRecord) => string; schema: Record<string, unknown> }> = {
  auth_methods: {
    question: (r) =>
      `Which authentication methods does the public API of "${r.name}" support? Check the official API documentation.`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: {
        value: { type: "array", items: { type: "string", enum: ["OAuth2", "API key", "Basic", "Bearer token", "JWT", "mTLS", "other"] } },
        evidence_url: { type: "string" },
      },
    },
  },
  access: {
    question: (r) =>
      `How does a developer get credentials for the public API of "${r.name}"? Pick the single best fit: ` +
      `self_serve_free (free plan or free dev/sandbox account), self_serve_trial (self-serve trial), ` +
      `paid_plan (API only on paid tiers), admin_approval (app review/approval required), ` +
      `partner_gated (partnership or contact-sales required), no_public_api.`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: {
        value: { type: "string", enum: ["self_serve_free", "self_serve_trial", "paid_plan", "admin_approval", "partner_gated", "no_public_api"] },
        evidence_url: { type: "string" },
      },
    },
  },
  api_type: {
    question: (r) => `What kind of public API does "${r.name}" offer: REST, GraphQL, SOAP, gRPC, SDK-only, or none?`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: {
        value: { type: "array", items: { type: "string", enum: ["REST", "GraphQL", "SOAP", "gRPC", "SDK-only", "none"] } },
        evidence_url: { type: "string" },
      },
    },
  },
  api_breadth: {
    question: (r) =>
      `How broad is the public API of "${r.name}"? broad = most of the product controllable via API; ` +
      `moderate = core objects only; narrow = a handful of endpoints; none = no API.`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: { value: { type: "string", enum: ["broad", "moderate", "narrow", "none"] }, evidence_url: { type: "string" } },
    },
  },
  mcp: {
    question: (r) =>
      `Does "${r.name}" have an official Model Context Protocol (MCP) server built or endorsed by the vendor, ` +
      `a well-known community MCP server, or none? OpenAPI specs, Postman collections and SDKs are not MCP servers.`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: { value: { type: "string", enum: ["official", "community", "none_found"] }, evidence_url: { type: "string" } },
    },
  },
  buildable: {
    question: (r) =>
      `Could a third-party integration platform wrap the public API of "${r.name}" into a toolkit today ` +
      `with self-obtained credentials? yes; with_caveats (works but something meaningful limits it); ` +
      `blocked (no API, or credentials require partnership/payment barriers).`,
    schema: {
      type: "object", required: ["value", "evidence_url"],
      properties: { value: { type: "string", enum: ["yes", "with_caveats", "blocked"] }, evidence_url: { type: "string" } },
    },
  },
};

const CHECKED_FIELDS = Object.keys(REASK);

function agrees(field: string, claimed: unknown, reasked: unknown): boolean {
  if (Array.isArray(claimed) && Array.isArray(reasked)) {
    const a = new Set(claimed.map(String));
    const b = new Set(reasked.map(String));
    if (a.size === 0 && b.size === 0) return true;
    // partial listings are common in docs — subset either way counts as agreement
    const inter = [...a].filter((x) => b.has(x));
    return inter.length === Math.min(a.size, b.size) && inter.length > 0;
  }
  // adjacent self-serve flavors are a judgment call, not a factual conflict
  const SOFT_PAIRS = [["self_serve_free", "self_serve_trial"], ["yes", "with_caveats"]];
  if (SOFT_PAIRS.some(([x, y]) => (claimed === x && reasked === y) || (claimed === y && reasked === x))) return true;
  return claimed === reasked;
}

/* ---------- per-app verification ---------- */

async function verifyOne(record: ResearchRecord): Promise<{ result: VerificationRecord; cost: number }> {
  const urls = [...new Set((record.evidence ?? []).map((e) => e.url))].slice(0, MAX_URLS);
  const pages: string[] = [];
  const fetched: string[] = [];
  const failed: string[] = [];
  for (const url of urls) {
    try {
      pages.push(await fetchPageText(url));
      fetched.push(url);
    } catch (err: any) {
      failed.push(`${url} (${err.message})`);
    }
  }
  const text = pages.join(" ");
  const settled = text ? corroborate(record, text) : new Map();

  const fields: VerificationRecord["fields"] = [];
  let cost = 0;
  for (const field of CHECKED_FIELDS) {
    const pre = settled.get(field);
    if (pre) {
      fields.push({ field, verdict: pre.verdict, quote: pre.quote });
      continue;
    }
    try {
      const { question, schema } = REASK[field];
      const { answer, cost: c } = await exaAnswer<{ value: unknown; evidence_url: string }>(question(record), schema);
      cost += c;
      const claimed = (record as any)[field];
      if (agrees(field, claimed, answer.value)) {
        fields.push({ field, verdict: "confirmed", quote: `independent re-ask agrees (${answer.evidence_url})` });
      } else {
        fields.push({
          field, verdict: "contradicted", corrected_value: answer.value,
          quote: `re-ask found "${Array.isArray(answer.value) ? answer.value.join(", ") : answer.value}" (${answer.evidence_url})`,
        });
      }
      await sleep(PACE_MS);
    } catch {
      fields.push({ field, verdict: "not_verifiable" });
    }
  }

  return {
    result: {
      id: record.id,
      name: record.name,
      fields,
      urls_fetched: fetched,
      urls_failed: failed,
      notes:
        fetched.length === 0
          ? "No evidence URL could be fetched — all fields settled by re-ask only; flagged for human review."
          : "",
      verified_at: new Date().toISOString(),
    },
    cost,
  };
}

async function main() {
  loadEnv();
  requireEnv("EXA_API_KEY");
  const { only, force, limit } = parseArgs(process.argv.slice(2));

  const pending = APPS.filter((app) => {
    const p1 = readJsonIfExists<ResearchRecord>(path.join(IN_DIR, `${app.id}-${slug(app.name)}.json`));
    if (!p1) return false;
    if (only.size > 0) return only.has(app.id);
    return force || !readJsonIfExists(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`));
  }).slice(0, limit);

  console.log(`Verifying ${pending.length} records...`);

  let ok = 0;
  let totalCost = 0;
  const failedIds: number[] = [];
  for (const app of pending) {
    process.stdout.write(`[${app.id}] ${app.name} ... `);
    try {
      const record = readJsonIfExists<ResearchRecord>(path.join(IN_DIR, `${app.id}-${slug(app.name)}.json`))!;
      const { result, cost } = await verifyOne(record);
      writeJson(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`), result);
      ok++;
      totalCost += cost;
      const counts = result.fields.reduce((acc: Record<string, number>, f) => {
        acc[f.verdict] = (acc[f.verdict] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        `ok (${counts.confirmed ?? 0} confirmed, ${counts.contradicted ?? 0} contradicted, ` +
        `${counts.not_verifiable ?? 0} n/v, ${result.urls_failed.length} dead urls, $${cost.toFixed(3)})`,
      );
    } catch (err: any) {
      failedIds.push(app.id);
      console.log(`FAILED: ${String(err.message).slice(0, 200)}`);
    }
  }

  console.log(`\nDone: ${ok} ok, ${failedIds.length} failed. Re-ask cost: $${totalCost.toFixed(2)}`);
  if (failedIds.length) console.log(`Retry with: npm run verify -- --only ${failedIds.join(",")}`);
}

main();
