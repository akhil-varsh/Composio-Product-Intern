import { sleep } from "./util.ts";

// Plain fetch against Exa's /answer endpoint — same no-SDK philosophy as gemini.ts.
// /answer runs its own web search and returns either prose or, when outputSchema is
// given, a structured object — plus the citations (real URLs) it based the answer on.

export interface ExaCitation {
  url: string;
  title?: string;
}

export interface ExaAnswerResult<T> {
  answer: T;
  citations: ExaCitation[];
  cost: number;
}

export async function exaAnswer<T>(
  query: string,
  outputSchema?: Record<string, unknown>,
): Promise<ExaAnswerResult<T>> {
  const apiKey = process.env.EXA_API_KEY!;
  const body: Record<string, unknown> = { query, text: false };
  if (outputSchema) body.outputSchema = outputSchema;

  const maxAttempts = 4;
  for (let attempt = 1; ; attempt++) {
    const res = await fetch("https://api.exa.ai/answer", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (res.status === 429 || res.status >= 500) {
      if (attempt >= maxAttempts) {
        throw new Error(`Exa ${res.status} after ${attempt} attempts: ${(await res.text()).slice(0, 300)}`);
      }
      const backoff = Math.min(30_000, 2_000 * 2 ** (attempt - 1));
      console.warn(`  exa ${res.status}, retrying in ${backoff / 1000}s...`);
      await sleep(backoff);
      continue;
    }
    if (!res.ok) {
      throw new Error(`Exa ${res.status}: ${(await res.text()).slice(0, 500)}`);
    }

    const data = (await res.json()) as {
      answer: T;
      citations?: { url: string; title?: string }[];
      costDollars?: { total?: number };
    };
    return {
      answer: data.answer,
      citations: (data.citations ?? []).map((c) => ({ url: c.url, title: c.title })),
      cost: data.costDollars?.total ?? 0,
    };
  }
}
