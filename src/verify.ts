// Pass 2: verification loop. For each pass-1 record, actually FETCH the evidence
// URLs the agent cited, strip them to text, and have a second (search-free) model
// call judge every key field against those primary sources only:
//   confirmed | contradicted (with corrected value + quote) | not_verifiable.
//
// This catches the two classic failure modes of search-grounded research:
//   1. hallucinated / dead evidence URLs (the fetch itself fails), and
//   2. claims the cited page does not actually support.
//
// Usage mirrors research.ts:  npm run verify [-- --only 5,50 | --force | --limit 10]

import path from "node:path";
import { APPS } from "./apps.ts";
import { callGemini } from "./lib/gemini.ts";
import {
  extractJson, loadEnv, parseArgs, readJsonIfExists, requireEnv, sleep, slug, writeJson,
} from "./lib/util.ts";
import type { ResearchRecord, VerificationRecord } from "./types.ts";

const IN_DIR = path.join("data", "pass1");
const OUT_DIR = path.join("data", "pass2");
const PACE_MS = Number(process.env.PACE_MS || 7000);
const MAX_URLS = 3;
const MAX_CHARS_PER_PAGE = 12_000;

const CHECKED_FIELDS = ["auth_methods", "access", "api_type", "api_breadth", "mcp", "buildable"] as const;

async function fetchPageText(url: string): Promise<string> {
  const res = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(15_000),
    headers: {
      // Some docs sites block default fetch UAs; present as a normal browser.
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
    .trim();
  if (text.length < 200) throw new Error("page returned almost no text (likely JS-rendered or blocked)");
  return text.slice(0, MAX_CHARS_PER_PAGE);
}

function buildVerifyPrompt(record: ResearchRecord, pages: { url: string; text: string }[]): string {
  const claims = {
    auth_methods: record.auth_methods,
    access: record.access,
    api_type: record.api_type,
    api_breadth: record.api_breadth,
    mcp: record.mcp,
    buildable: record.buildable,
  };
  const pagesBlock = pages
    .map((p, i) => `--- SOURCE ${i + 1}: ${p.url} ---\n${p.text}`)
    .join("\n\n");
  return `You are a fact-checker. Below are (A) claims a research agent made about the app
"${record.name}" and (B) the text of the documentation pages the agent cited as evidence.

Judge each claim STRICTLY against the source text below — do NOT use outside knowledge.
For each field decide:
- "confirmed": the sources clearly support the claimed value
- "contradicted": the sources clearly show a DIFFERENT value (give corrected_value and a short quote)
- "not_verifiable": the sources do not contain enough information either way

(A) CLAIMS:
${JSON.stringify(claims, null, 2)}

(B) SOURCES:
${pagesBlock}

Output ONLY JSON:
{
  "fields": [
    { "field": "auth_methods" | "access" | "api_type" | "api_breadth" | "mcp" | "buildable",
      "verdict": "confirmed" | "contradicted" | "not_verifiable",
      "corrected_value": <only when contradicted, matching the original field's type/enum>,
      "quote": <short supporting quote from a source, when confirmed or contradicted> }
  ],
  "notes": string   // anything odd: page looked wrong, claim partially right, etc.
}
Include exactly one entry per field: ${CHECKED_FIELDS.join(", ")}.`;
}

async function verifyOne(record: ResearchRecord): Promise<VerificationRecord> {
  const urls = [...new Set((record.evidence ?? []).map((e) => e.url))].slice(0, MAX_URLS);
  const pages: { url: string; text: string }[] = [];
  const failed: string[] = [];
  for (const url of urls) {
    try {
      pages.push({ url, text: await fetchPageText(url) });
    } catch (err: any) {
      failed.push(`${url} (${err.message})`);
    }
  }

  if (pages.length === 0) {
    return {
      id: record.id,
      name: record.name,
      fields: CHECKED_FIELDS.map((f) => ({ field: f, verdict: "not_verifiable" as const })),
      urls_fetched: [],
      urls_failed: failed,
      notes: "No evidence URL could be fetched — flagged for human review.",
      verified_at: new Date().toISOString(),
    };
  }

  const { text } = await callGemini(buildVerifyPrompt(record, pages), {
    useSearch: false,
    temperature: 0,
  });
  const parsed = extractJson(text) as { fields: VerificationRecord["fields"]; notes: string };
  return {
    id: record.id,
    name: record.name,
    fields: parsed.fields,
    urls_fetched: pages.map((p) => p.url),
    urls_failed: failed,
    notes: parsed.notes ?? "",
    verified_at: new Date().toISOString(),
  };
}

async function main() {
  loadEnv();
  requireEnv("GEMINI_API_KEY");
  const { only, force, limit } = parseArgs(process.argv.slice(2));

  const pending = APPS.filter((app) => {
    const p1 = readJsonIfExists<ResearchRecord>(path.join(IN_DIR, `${app.id}-${slug(app.name)}.json`));
    if (!p1) return false; // nothing to verify yet
    if (only.size > 0) return only.has(app.id);
    return force || !readJsonIfExists(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`));
  }).slice(0, limit);

  console.log(`Verifying ${pending.length} records...`);

  let ok = 0;
  const failedIds: number[] = [];
  for (const app of pending) {
    const started = Date.now();
    process.stdout.write(`[${app.id}] ${app.name} ... `);
    try {
      const record = readJsonIfExists<ResearchRecord>(
        path.join(IN_DIR, `${app.id}-${slug(app.name)}.json`),
      )!;
      const result = await verifyOne(record);
      writeJson(path.join(OUT_DIR, `${app.id}-${slug(app.name)}.json`), result);
      ok++;
      const counts = result.fields.reduce((acc: Record<string, number>, f) => {
        acc[f.verdict] = (acc[f.verdict] ?? 0) + 1;
        return acc;
      }, {});
      console.log(
        `ok (${counts.confirmed ?? 0} confirmed, ${counts.contradicted ?? 0} contradicted, ${counts.not_verifiable ?? 0} n/v)`,
      );
    } catch (err: any) {
      if (String(err.message).startsWith("DAILY_QUOTA_EXHAUSTED")) {
        console.error(`\nDaily quota exhausted. Progress is checkpointed — resume later.`);
        break;
      }
      failedIds.push(app.id);
      console.log(`FAILED: ${err.message.slice(0, 200)}`);
    }
    const elapsed = Date.now() - started;
    if (elapsed < PACE_MS) await sleep(PACE_MS - elapsed);
  }

  console.log(`\nDone: ${ok} ok, ${failedIds.length} failed.`);
  if (failedIds.length) console.log(`Retry with: npm run verify -- --only ${failedIds.join(",")}`);
}

main();
