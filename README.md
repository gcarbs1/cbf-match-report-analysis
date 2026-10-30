# CBF Match Report Analysis

Analysis of the official Campeonato Brasileiro Série A match reports, focusing on
card justifications and VAR mentions. The data pipeline and static website are
centralized in this repository.

## Structure

- `index.html`: static website ready for GitHub Pages.
- `ai.js` and `ai.css`: AI chat interface that calls the remote Worker.
- `worker/`: Cloudflare Worker, D1 schema, data import, and Workers AI tools.
- `fonts/`: website assets.
- `notebooks/`: data collection, cleaning, classification, analysis, and website generation.
- `data/`: local raw, intermediate, and processed data (ignored by Git).
- `viz/`: charts and materials derived from the analysis.

## Pipeline

Run the notebooks in order:

1. `00-data_collection.ipynb`
2. `01-data_clean.ipynb`
3. `02-keyword_tagging.ipynb`
4. `03-var-usage.ipynb`
5. `04-build_site.ipynb`
6. `05-classification_validation.ipynb`

The `04-build_site.ipynb` notebook directly updates the four JSON blocks embedded
in the root `index.html`. It preserves the rest of the page's HTML, CSS, and
JavaScript.

## AI de Súmulas

The dashboard includes a serverless natural-language analysis agent. Visitors
do not provide an API key or activate a model: the static GitHub Pages frontend
calls a Cloudflare Worker owned by this project.

The Worker uses Workers AI function calling to choose a controlled data tool,
validates its arguments, and queries D1 with parameterized SQL. The tool result
is formatted deterministically, so names and statistics returned by D1 are not
rewritten by a second model call. The current and only model is
`@cf/meta/llama-3.3-70b-instruct-fp8-fast`.

Available tools cover match and head-to-head search, team comparison, team,
match, referee and player rankings, plus referee and player profiles. Team aliases
and normalized, indexed player aliases, together with fuzzy entity resolution,
handle common abbreviations and spelling mistakes; ambiguous names are rejected
instead of silently selecting the wrong entity. Queries can target one season,
an inclusive season range, or the latest N seasons available in the dataset.
Available season bounds are read from D1 instead of being hard-coded.

### Architecture

```text
Question on GitHub Pages
        |
        v
Cloudflare Worker /chat
        |
        v
Workers AI tool call
        |
        v
Validated function --> parameterized D1 query
                                  |
        deterministic formatter <-|
        |
        v
Grounded answer + clickable match evidence
```

The public API enforces an origin allowlist, a 600-character request limit, a
10-requests-per-minute rate limit per visitor, and a maximum tool set. The model
never receives permission to generate or execute arbitrary SQL.

### Worker development

The backend lives in `worker/`:

- `src/index.ts`: HTTP, CORS, rate limiting, and the tool-calling flow.
- `src/tools.ts`: validated domain tools and D1 queries.
- `migrations/`: the D1 schema, including normalized card events.
- `scripts/build-seed.mjs`: builds full and event-only D1 imports from the JSON
  embedded in `index.html`.
- `evals/cases.json`: 96 regression questions covering the supported domain,
  spelling variation, ambiguity, empty results, periods, and out-of-scope input.

Prerequisites are Node.js 20+, a free Cloudflare account, and Wrangler authenticated
with that account. The analysis notebooks use Python 3.12 and `curl`; Poppler's
`pdftotext` is optional because the pipeline falls back to `pdfplumber`.

For the first Cloudflare setup, authenticate and create the database:

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create cbf-sumulas-ai
```

Copy the returned `database_id` into `worker/wrangler.jsonc`. Then create and seed
the remote database before the first deploy:

```bash
npm run build:seed
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file generated/seed.sql
npm run deploy
```

For a database created before `0002_card_events.sql`, apply the migration and
backfill only the new event table without rewriting existing match data:

```bash
npm run build:seed
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file generated/seed-events.sql
npm run deploy
```

For a database created before `0004_player_aliases.sql`, apply the migration and
backfill the normalized player alias index before deploying the updated Worker:

```bash
npm run build:seed
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file generated/seed-player-aliases.sql
npm run deploy
```

No visitor token or model activation is required. Workers AI uses the `AI` binding
declared in `wrangler.jsonc`; Cloudflare applies the account's usage limits.

For local Worker development, use a local D1 database:

```bash
npm run build:seed
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file generated/seed.sql
npm run dev
```

Deploy later backend changes with `npm run deploy`. The production health endpoint is
`https://cbf-sumulas-ai.cbf-sumulas-ai-worker.workers.dev/health`.

The frontend is static and also works when `index.html` is opened directly with
`file://` (`Origin: null` is explicitly allowed). For normal development and the
closest GitHub Pages behavior, serve the repository over HTTP (for example,
`python -m http.server 8000`). Keep production and local origins synchronized in
`ALLOWED_ORIGINS`.

### Validation and evaluations

```bash
cd worker
npm run typecheck
```

The AI evaluation runner is dry-run by default. Select a small balanced sample
before authorizing live Workers AI usage:

```bash
cd worker
npm run eval -- --per-category 2
npm run eval -- --per-category 2 --confirm-live --output eval-results.json
```

Live reports separate answer-quality failures from rate limits, quota exhaustion,
timeouts, and other infrastructure failures. See `worker/evals/README.md` for all
filters and metrics.
