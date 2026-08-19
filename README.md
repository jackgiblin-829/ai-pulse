# AI Pulse — GEO Visibility Platform (829 Studios)

Internal replica of Muck Rack's Generative Pulse: ingest AI-engine outputs
(ChatGPT, Gemini, Claude) for a target brand + competitors across a seed-prompt
library, run an NLP extraction pipeline, and report visibility, share of voice,
sentiment, citations, and PR outreach targets on a live dashboard.

## Repo layout

```
ai-pulse/
├── pipeline/              Python ingestion + NLP pipeline
│   ├── schema.sql         Full PostgreSQL schema (tables + analytics views)
│   ├── config.py          Client config: brands, aliases, media DB, keywords
│   ├── media_articles.py  Article→byline index (stand-in for Muck Rack/Cision API)
│   ├── sentiment.py       Pluggable sentiment (Claude API or lexicon fallback)
│   ├── ingest.py          The pipeline: CSV → Postgres, full extraction
│   └── generate_demo_data.py  Synthetic multi-LLM export for the Polywood set
├── app/                   Next.js 15 dashboard (App Router, Tailwind 4, Recharts)
│   ├── app/page.jsx       All six Pulse widget groups
│   ├── app/api/dashboard  Full report as JSON
│   ├── app/api/media-list Add/remove journalists (media list action)
│   ├── lib/queries.js     Every widget's SQL
│   └── components/        Charts (validated palette) + tables
├── data/llm_export.csv    Demo raw export (prompt, vendor, date, response)
└── docs/ARCHITECTURE.md   Architecture, schema reference, metric definitions
```

## Quick start

```bash
# 1. Postgres (any 14+). Create the DB and apply the schema:
createdb ai_pulse
psql -d ai_pulse -f pipeline/schema.sql

# 2. Point the pipeline + app at it (defaults expect localhost:5433, user pulse):
#    pipeline/config.py  -> DB_DSN
#    app: PGHOST/PGPORT/PGDATABASE/PGUSER env vars (see app/lib/db.js)

# 3. Ingest data (demo, or any CSV with prompt,vendor,date,response columns):
cd pipeline
python3 generate_demo_data.py        # optional: build the demo export
pip install psycopg2-binary
python3 ingest.py ../data/llm_export.csv

# 4. Run the dashboard:
cd ../app
npm install
npm run dev                          # http://localhost:3000
```

Set `ANTHROPIC_API_KEY` before ingesting to switch sentiment analysis from the
lexicon fallback to Claude (`sentiment.py`).

## Onboarding a new client

Everything client-specific lives in `pipeline/config.py`: target brand +
competitor aliases and owned domains, ecosystem-org gazetteer, keyword
categories + prompt-classification rules, and the media outlet/DA seed list.
Swap it, re-apply `schema.sql` to a fresh DB, and re-ingest.

## Demo data caveats

`data/llm_export.csv` is synthetic (deterministic templates), so every widget
renders with realistic distributions. Journalist names are fictional demo
records. In production, replace the generator with a scheduled prompt-runner
against the OpenAI / Google / Anthropic APIs and back `media_articles.py`
with a real media-database lookup.
