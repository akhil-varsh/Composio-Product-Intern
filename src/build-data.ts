// Merges pass-1 research + pass-2 verification + Composio cross-check + human review
// into one dataset (site/data.json) and computes the accuracy numbers:
//   pass-1 accuracy  = confirmed / (confirmed + contradicted) on machine-verifiable fields
//   final accuracy   = after applying pass-2 corrections and human corrections
//
// Precedence when values disagree: human > pass-2 verifier > pass-1 agent.
//
// Usage: npm run build-data

import path from "node:path";
import { APPS } from "./apps.ts";
import { readJsonIfExists, slug, writeJson } from "./lib/util.ts";
import type { ResearchRecord, VerificationRecord } from "./types.ts";

interface HumanReview {
  sampled_ids: number[];
  // fields the human checked per sampled app and found WRONG in the post-pass-2 data
  corrections: { id: number; field: string; correct_value: unknown; note: string; url?: string }[];
  // free-text notes about apps that defeated the pipeline
  notes?: { id: number; note: string }[];
}

interface ComposioCheck {
  id: number;
  in_composio: boolean;
  composio_slug: string | null;
  composio_tools_count: number | null;
  composio_auth_schemes: string[] | null;
}

interface Correction {
  id: number;
  name: string;
  field: string;
  from: unknown;
  to: unknown;
  source: "verifier" | "human";
  quote?: string;
}

function main() {
  const records: ResearchRecord[] = [];
  const verifications: VerificationRecord[] = [];
  for (const app of APPS) {
    const p1 = readJsonIfExists<ResearchRecord>(
      path.join("data", "pass1", `${app.id}-${slug(app.name)}.json`),
    );
    if (!p1) {
      console.warn(`missing pass1 for [${app.id}] ${app.name}`);
      continue;
    }
    records.push(p1);
    const p2 = readJsonIfExists<VerificationRecord>(
      path.join("data", "pass2", `${app.id}-${slug(app.name)}.json`),
    );
    if (p2) verifications.push(p2);
  }

  const composio = readJsonIfExists<ComposioCheck[]>("data/composio-check.json") ?? [];
  const human = readJsonIfExists<HumanReview>("data/human-review.json") ?? {
    sampled_ids: [],
    corrections: [],
  };

  // ---- apply pass-2 corrections ----
  const corrections: Correction[] = [];
  let confirmed = 0;
  let contradicted = 0;
  let notVerifiable = 0;
  const finalById = new Map<number, ResearchRecord>(
    records.map((r) => [r.id, structuredClone(r)]),
  );

  for (const v of verifications) {
    const rec = finalById.get(v.id);
    if (!rec) continue;
    for (const f of v.fields) {
      if (f.verdict === "confirmed") confirmed++;
      else if (f.verdict === "not_verifiable") notVerifiable++;
      else if (f.verdict === "contradicted") {
        contradicted++;
        if (f.corrected_value !== undefined) {
          corrections.push({
            id: v.id,
            name: v.name,
            field: f.field,
            from: (rec as any)[f.field],
            to: f.corrected_value,
            source: "verifier",
            quote: f.quote,
          });
          (rec as any)[f.field] = f.corrected_value;
        }
      }
    }
  }

  // ---- apply human corrections (highest precedence) ----
  for (const h of human.corrections) {
    const rec = finalById.get(h.id);
    if (!rec) continue;
    corrections.push({
      id: h.id,
      name: rec.name,
      field: h.field,
      from: (rec as any)[h.field],
      to: h.correct_value,
      source: "human",
      quote: h.note,
    });
    (rec as any)[h.field] = h.correct_value;
  }

  // ---- accuracy numbers ----
  const machineChecked = confirmed + contradicted;
  const pass1Accuracy = machineChecked ? confirmed / machineChecked : null;

  // human sample: fields checked = sampled apps x 6 key fields; wrong = human corrections on sampled apps
  const KEY_FIELDS = 6;
  const humanCheckedFields = human.sampled_ids.length * KEY_FIELDS;
  const humanWrong = human.corrections.filter((c) => human.sampled_ids.includes(c.id)).length;
  const humanSampleAccuracy = humanCheckedFields
    ? (humanCheckedFields - humanWrong) / humanCheckedFields
    : null;

  const out = {
    generated_at: new Date().toISOString(),
    app_count: records.length,
    records: [...finalById.values()].sort((a, b) => a.id - b.id),
    composio,
    verification: {
      verified_count: verifications.length,
      field_verdicts: { confirmed, contradicted, not_verifiable: notVerifiable },
      pass1_accuracy: pass1Accuracy,
      corrections,
      unverifiable_apps: verifications
        .filter((v) => v.urls_fetched.length === 0)
        .map((v) => ({ id: v.id, name: v.name, reason: v.notes })),
      human_sample: {
        sampled_ids: human.sampled_ids,
        fields_checked: humanCheckedFields,
        wrong: humanWrong,
        accuracy: humanSampleAccuracy,
      },
      human_notes: human.notes ?? [],
    },
  };

  writeJson("site/data.json", out);
  console.log(`Wrote site/data.json: ${records.length} records, ${verifications.length} verified.`);
  if (pass1Accuracy !== null) {
    console.log(
      `Pass-1 accuracy on machine-verifiable fields: ${(pass1Accuracy * 100).toFixed(1)}% ` +
        `(${confirmed} confirmed / ${contradicted} contradicted / ${notVerifiable} not verifiable)`,
    );
  }
  console.log(`${corrections.length} corrections applied (${corrections.filter((c) => c.source === "human").length} human).`);
}

main();
