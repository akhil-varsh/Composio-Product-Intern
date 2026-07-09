# App Research Agent — 100-app toolkit-buildability study

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
npm run research       PASS 1 — research agent. One search-grounded Gemini call per app
        │              → strict JSON record → checkpointed to data/pass1/*.json
        ▼
npm run composio       Composio registry cross-check via @composio/core SDK:
        │              does a toolkit already exist, and what auth does Composio record?
        ▼
npm run verify         PASS 2 — verification loop. Fetches the evidence URLs pass 1 cited,
        │              strips them to text, and a second (search-free) model call judges
        │              each field against those primary sources only:
        │              confirmed / contradicted (+correction) / not verifiable.
        ▼
data/human-review.json PASS 3 — human. Random sample hand-checked against live docs;
        │              corrections recorded here (human > verifier > agent precedence).
        ▼
npm run build-data     Merge all passes, apply corrections, compute accuracy numbers
        │              → site/data.json
        ▼
npm run site           Inject data into the case-study page → site/index.html
```

## Run it

```bash
npm install
cp .env.example .env   # fill in GEMINI_API_KEY and COMPOSIO_API_KEY
npm run research       # ~15 min for 100 apps (paced for free-tier rate limits)
npm run composio
npm run verify         # ~20 min (fetches evidence pages + one model call per app)
npm run build-data
npm run site
```

All long steps checkpoint per-app under `data/` and resume where they left off.
Re-run any subset with `-- --only 5,50`, smoke-test with `-- --limit 5`,
force a redo with `-- --force`.

## Design choices

- **Plain `fetch` for Gemini, no SDK** — the whole request path is ~60 lines and debuggable.
- **Closed enums, free-text notes** — every clusterable field is a fixed enum so the
  pattern analysis is real; nuance lives in `*_notes`.
- **Verification is adversarial by design** — pass 2 gets *no search access*, only the
  cited pages. If the agent hallucinated a URL, the fetch fails and the app is flagged;
  if the page doesn't support the claim, the field is contradicted.
- **Human is the last pass, not the first** — the machine does 100 apps; the human
  samples, corrects, and handles the apps that defeated the pipeline.

## Where a human was needed

See the "Verification" section of the case study page for the honest list:
alias-matching Composio slugs, apps with JS-rendered or bot-blocked docs the verifier
couldn't fetch, and the fields the human sample corrected.
