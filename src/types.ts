// Schema the research agent must fill for every app. Enums are deliberately
// closed lists so results are clusterable — free text goes in the *_notes fields.

export type Access =
  | "self_serve_free"      // dev credentials on a free plan / free dev account
  | "self_serve_trial"     // self-serve signup but requires a trial or paid product to test against
  | "paid_plan"            // API only on a paid tier
  | "admin_approval"       // self-serve but app review / admin approval before usable
  | "partner_gated"        // partnership, contact-sales, or allowlist required
  | "no_public_api";       // no documented public API at all

export type Buildable = "yes" | "with_caveats" | "blocked";
export type McpStatus = "official" | "community" | "none_found";
export type Breadth = "broad" | "moderate" | "narrow" | "none";
export type Confidence = "high" | "medium" | "low";

export interface Evidence {
  claim: string;
  url: string;
}

export interface ResearchRecord {
  id: number;
  name: string;
  category: string;
  one_liner: string;
  auth_methods: string[]; // from: OAuth2, API key, Basic, Bearer token, JWT, mTLS, other
  auth_notes: string;
  access: Access;
  access_notes: string;
  api_type: string[]; // from: REST, GraphQL, SOAP, gRPC, SDK-only, none
  api_breadth: Breadth;
  api_notes: string;
  mcp: McpStatus;
  mcp_notes: string;
  buildable: Buildable;
  blocker: string | null;
  evidence: Evidence[];
  confidence: Confidence;
  // provenance added by the pipeline, not the model:
  search_sources?: string[];
  researched_at?: string;
  model?: string;
}

// Pass-2 verifier output: per-field verdicts against fetched evidence pages.
export type FieldVerdict = "confirmed" | "contradicted" | "not_verifiable";

export interface VerificationField {
  field: string;
  verdict: FieldVerdict;
  corrected_value?: unknown;
  quote?: string; // supporting text from the fetched page
}

export interface VerificationRecord {
  id: number;
  name: string;
  fields: VerificationField[];
  urls_fetched: string[];
  urls_failed: string[];
  notes: string;
  verified_at: string;
}
