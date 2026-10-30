# CBF Match Report Analysis

## Summary

This project transforms official Campeonato Brasileiro Série A match reports
into structured, searchable data. The dashboard explores cards, disciplinary
reasons, VAR mentions, teams, players, referees, and individual matches from the
2020–2026 dataset.

The **Match Report Assistant** lets visitors query the dataset in natural
language. It runs through a project-owned Cloudflare Worker, so visitors do not
need an API key or model account.

## Methodology

The analysis follows six stages:

1. Collect official CBF match reports.
2. Extract and normalize match, card, player, team, and referee data.
3. Categorize card justifications through reproducible keyword rules.
4. Identify VAR mentions and aggregate disciplinary indicators.
5. Validate the classification and generate the static dashboard.
6. Expose the structured dataset through controlled natural-language tools.

The assistant uses the language model only to interpret the question and select
an allowed tool. The Worker validates the arguments, runs parameterized queries
against D1, and formats the result deterministically.

```text
Question → Workers AI router → validated tool → D1 query → grounded answer
```

This design prevents arbitrary SQL execution and keeps names, dates, and
statistics tied to the structured dataset.

## Structure

- `index.html`: static dashboard and embedded datasets for GitHub Pages.
- `ai.js` and `ai.css`: Match Report Assistant interface.
- `notebooks/`: collection, cleaning, analysis, validation, and site generation.
- `worker/src/`: Cloudflare Worker, domain rules, tools, and D1 queries.
- `worker/migrations/`: D1 schema and database migrations.
- `worker/evals/`: 96 evaluation questions covering supported queries, spelling
  variation, ambiguity, empty results, and out-of-scope requests.
- `worker/scripts/`: seed generation and evaluation runner.
- `data/`: local raw, intermediate, and processed data; ignored by Git.
- `viz/`: charts produced by the analysis.
- `fonts/`: local website fonts.

## Pipeline

### Data analysis

Run the notebooks in order:

1. `00-data_collection.ipynb`
2. `01-data_clean.ipynb`
3. `02-keyword_tagging.ipynb`
4. `03-var-usage.ipynb`
5. `04-build_site.ipynb`
6. `05-classification_validation.ipynb`

`04-build_site.ipynb` updates the JSON datasets embedded in `index.html` while
preserving the rest of the page.

To preview the static dashboard locally:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000`.

### Match Report Assistant

Requirements: Node.js 20+, a Cloudflare account, and Wrangler authentication.

```bash
cd worker
npm install
npm run build:seed
npx wrangler d1 migrations apply DB --local
npx wrangler d1 execute DB --local --file generated/seed.sql
npm run dev
```

For the first deployment in a new Cloudflare account, authenticate, create a D1
database, and copy its ID into `worker/wrangler.jsonc`:

```bash
npx wrangler login
npx wrangler d1 create cbf-sumulas-ai
npx wrangler d1 migrations apply DB --remote
npx wrangler d1 execute DB --remote --file generated/seed.sql
npm run deploy
```

The current Worker uses
`@cf/meta/llama-3.3-70b-instruct-fp8-fast` as its only model. The public API has
an origin allowlist, request-size validation, rate limiting, and a fixed tool
set.

Validate the TypeScript project and inspect an evaluation plan with:

```bash
npm run typecheck
npm run eval -- --per-category 2
```

Live evaluations require the explicit `--confirm-live` flag because they consume
Workers AI quota. See `worker/evals/README.md` for available filters and metrics.
