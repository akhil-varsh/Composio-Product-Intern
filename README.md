# App Research Agent — 100-app toolkit-buildability study

## Live Demo
https://composio-product-intern.vercel.app/

An agent pipeline that researches 100 SaaS apps and answers, for each: what it does,
how its API authenticates, whether a developer can self-serve credentials, how broad the
API surface is, whether an MCP server exists, and whether an agent toolkit could be built
today. Results are verified in a second machine pass plus a human spot-check, and published
as a single self-contained HTML case study.

**Live case study:** _link goes here after deploy_

## How it works

```
src/apps.ts            the 100-app research set (fixed input)
        │
        ▼
npm run research       PASS 1 — research agent. One Exa /answer call per app (web search +
        │              synthesis in one request), locked to a JSON schema → checkpointed
        │              to data/pass1/*.json. (data/pass1-gemini/ holds 16 records from the
        │              original Gemini+grounding engine — kept as an independent cross-check.)
        ▼
npm run composio       Composio registry cross-check via @composio/core SDK + v3 API:
        │              does a toolkit already exist, and what auth does Composio record?
        ▼
npm run verify         PASS 2 — verification loop, two layers.
        │              Layer 1 (deterministic, free): fetch every cited evidence URL; dead
        │              citations are flagged; page text keyword-corroborates each claim.
        │              Layer 2 (re-ask): every unsettled field becomes ONE narrow,
        │              schema-locked Exa question; disagreement overturns the field.
        ▼
data/human-review.json PASS 3 — human. Random sample hand-checked against live docs;
        │              corrections recorded here (human > verifier > agent precedence).
        ▼
npm run build-data     Merge all passes, apply corrections, compute accuracy numbers and
        │              the Gemini↔Exa two-engine agreement rate → site/data.json
        ▼
npm run site           Inject data into the case-study page → site/index.html
```

## Run it

```bash
npm install
cp .env.example .env   # fill in EXA_API_KEY and COMPOSIO_API_KEY (GEMINI_API_KEY optional)
npm run research       # ~12 min for 100 apps, ~$0.50 in Exa credits
npm run composio
npm run verify         # ~25 min: fetches all evidence pages + re-asks unsettled fields
npm run build-data
npm run site
```

All long steps checkpoint per-app under `data/` and resume where they left off.
Re-run any subset with `-- --only 5,50`, smoke-test with `-- --limit 5`,
force a redo with `-- --force`.

Dev extras: `npx tsx scripts/screenshot.mts` renders the page headlessly (light + dark)
for layout review — needs `npx playwright install chromium` once.

## Design choices

- **Plain `fetch` for Exa and Gemini, no SDKs** — each client is ~50 lines and debuggable.
  (The Composio SDK is used where it's the point: reading Composio's own registry.)
- **Closed enums, free-text notes** — every clusterable field is a fixed enum so the
  pattern analysis is real; nuance lives in `*_notes`.
- **Verification is adversarial by design** — layer 1 of pass 2 re-fetches the agent's own
  citations: a hallucinated or dead URL fails loudly, and absence of corroborating text
  escalates the field. Absence alone never overturns a claim; only an independent re-ask can.
- **Two engines beat one** — 16 apps researched by both Gemini+Google and Exa give a
  measurable inter-engine agreement rate on top of the verification loops.
- **Human is the last pass, not the first** — the machine does 100 apps; the human
  samples, corrects, and handles the apps that defeated the pipeline.

## Where a human was needed

See the "Verification" section of the case study page for the honest list:
alias-matching Composio slugs, apps with JS-rendered or bot-blocked docs the verifier
couldn't fetch, and the fields the human sample corrected.
