import { sleep } from "./util.ts";

// Plain fetch against the Gemini REST API — no SDK, so the whole request/response
// path is visible and debuggable.

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

export interface GeminiResult {
  text: string;
  // URLs Google Search grounding actually consulted (provenance, separate from
  // the evidence URLs the model states in its answer).
  sources: string[];
}

interface CallOptions {
  useSearch?: boolean;
  temperature?: number;
  maxOutputTokens?: number;
}

export async function callGemini(prompt: string, opts: CallOptions = {}): Promise<GeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";
  const body: Record<string, unknown> = {
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: opts.temperature ?? 0.2,
      maxOutputTokens: opts.maxOutputTokens ?? 8192,
    },
  };
  if (opts.useSearch) {
    body.tools = [{ google_search: {} }];
  }

  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${BASE}/${model}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify(body),
    });

    if (res.status === 429 || res.status >= 500) {
      const errText = await res.text();
      if (/PerDay|daily/i.test(errText)) {
        throw new Error(`DAILY_QUOTA_EXHAUSTED: ${errText.slice(0, 300)}`);
      }
      if (attempt >= maxAttempts) {
        throw new Error(`Gemini ${res.status} after ${attempt} attempts: ${errText.slice(0, 300)}`);
      }
      const backoff = Math.min(60_000, 5_000 * 2 ** (attempt - 1));
      console.warn(`  gemini ${res.status}, retrying in ${backoff / 1000}s...`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as any;
    const cand = data.candidates?.[0];
    const text = (cand?.content?.parts ?? [])
      .map((p: any) => p.text ?? "")
      .join("");
    if (!text) {
      throw new Error(`empty response (finishReason=${cand?.finishReason ?? "unknown"})`);
    }
    const sources: string[] = (cand?.groundingMetadata?.groundingChunks ?? [])
      .map((c: any) => c.web?.uri)
      .filter(Boolean);
    return { text, sources };
  }
}
