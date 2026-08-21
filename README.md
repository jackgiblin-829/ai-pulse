# AI Pulse — GEO Visibility Platform (829 Studios)

Internal replica of Muck Rack's Generative Pulse: ingest AI-engine outputs
(ChatGPT, Gemini, Claude) for any number of clients across seed-prompt
libraries, run an NLP extraction pipeline, and report visibility, share of
voice, sentiment, citations, and PR outreach targets on a live multi-client
dashboard — behind a login.

## Repo layout

```
ai-pulse/
├── pipeline/                Python ingestion + NLP pipeline
│   ├── schema.sql           Full multi-client PostgreSQL schema (tables + views)
│   ├── config.py            DB connection only (client config lives in Postgres)
│   ├── constants.py         Engine-level constants (vendors, social domains, stopwords)
│   ├── client_config.py     Loads a client's config from the DB (ClientConfig)
│   ├── seed_client.py       Seeds the POLYWOOD demo client + media outlets
│   ├── ingest.py            The pipeline: CSV -> Postgres, full extraction
│   ├── enrich_bylines.py    Byline crawler: fetches cited URLs, extracts real
│   │                        journalists/titles/dates (JSON-LD -> meta -> DOM)
│   ├── sentiment.py         Pluggable sentiment (Claude API or lexicon fallback)
│   ├── media_articles.py    Demo article fixture (used by enrich --fixture)
│   └── generate_demo_data.py  Synthetic multi-LLM export for the Polywood set
├── app/                     Next.js 15 dashboard (App Router, Tailwind 4, Recharts)
│   ├── middleware.js        Edge auth gate (jose JWT session cookie)
│   ├── app/login            Email + password sign-in
│   ├── app/(app)/page.jsx   Home: client cards -> per-client reports
│   ├── app/(app)/clients/[slug]           The six Pulse widget groups
│   ├── app/(app)/clients/[slug]/media-list  Saved journalists + export
│   ├── app/(app)/admin/clients            Client onboarding form (config -> Postgres)
│   ├── app/(app)/admin/users              User management (admin/member roles)
│   ├── app/api/dashboard    Full report as JSON (?client=slug)
│   ├── app/api/clients/[slug]/media-list  Add/remove/list + /export (.xlsx)
│   ├── lib/report.js        One getReport() shared by page + API
│   ├── lib/queries.js       Every widget's SQL (client-scoped, custom date ranges)
│   ├── lib/brand829.js      829 workbook design tokens (indigo/Onest/logo)
│   ├── scripts/create-admin.mjs  Seed the first login
│   └── components/          Charts (validated palette), tables, date-range picker
├── data/llm_export.csv      Demo raw export (prompt, vendor, date, response)
└── docs/ARCHITECTURE.md     Architecture, schema reference, metric definitions
```

## Quick start

```bash
# 1. Postgres (any 14+). Create the DB and apply the schema:
createdb ai_pulse
psql -d ai_pulse -f pipeline/schema.sql

# 2. Point the pipeline + app at it (defaults expect localhost:5433, user pulse):
#    pipeline: AI_PULSE_DSN env var (see pipeline/config.py)
#    app: PGHOST/PGPORT/PGDATABASE/PGUSER env vars (see app/lib/db.js)

# 3. Seed the demo client + ingest (Python 3.10+):
cd pipeline
pip install -r requirements.txt
python3 generate_demo_data.py            # optional: build the demo export
python3 seed_client.py --slug polywood --name POLYWOOD --seed-outlets
python3 ingest.py --client polywood ../data/llm_export.csv
python3 enrich_bylines.py --client polywood --fixture   # demo bylines
# (real data: drop --fixture to crawl the actually-cited URLs politely)

# 4. Run the dashboard:
cd ../app
npm install
echo "AUTH_SECRET=$(openssl rand -hex 32)" > .env.local
node scripts/create-admin.mjs you@829llc.com "Your Name" <password>
npm run dev                              # http://localhost:3000 -> /login
```

Set `ANTHROPIC_API_KEY` before ingesting to switch sentiment analysis from the
lexicon fallback to Claude (`sentiment.py`).

## Scheduler & tracking cadence

Each client has a **tracking cadence** (weekly by default, or daily — toggle
in Admin → Clients). `pipeline/dispatch.py` reads the cadence plus the
`job_runs` bookkeeping table and runs whatever is due:

```bash
python3 dispatch.py --dry-run          # print the client × job due matrix
python3 dispatch.py                    # run everything due
python3 dispatch.py --client polywood --force   # one client, ignore due-ness
```

Jobs per client, in order (each idempotent, each skips itself when its
integration is disabled):

```bash
python3 fetch_tavily.py --client <slug>     # Tavily search on fan-out keywords
python3 fetch_profound.py --client <slug>   # Profound citations report
python3 enrich_bylines.py --client <slug>   # byline crawl (now also sweeps observations)
python3 tag_topics.py --client <slug>       # Claude topic tagging
```

Install the launchd timer (fires 06:00 + 18:00; the second fire is a free
retry — due-ness makes it a no-op on good days):

```bash
mkdir -p ~/Library/Logs/ai-pulse
cp pipeline/launchd/com.829llc.aipulse.dispatch.plist ~/Library/LaunchAgents/
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.829llc.aipulse.dispatch.plist
launchctl kickstart gui/$(id -u)/com.829llc.aipulse.dispatch
```

Env for the fetchers: `TAVILY_API_KEY`, `PROFOUND_API_KEY`, optional
`TOPIC_MODEL` (defaults to `FANOUT_MODEL`, then claude-haiku). launchd does
not read shell profiles — put keys in the plist's `EnvironmentVariables`.

## Emerging authors & topics

The **Emerging** tab per client blends three citation sources — Tavily
searches on the fan-out keywords, Profound citation reports (clients with a
Profound subscription; category ID configured in Admin → Clients), and the
engines' own ingested citations — into new/rising author and topic analysis.
External observations land in `citation_observations`; authors come from the
byline crawler; topics from `tag_topics.py` (client-scoped vocabulary,
reuse-before-invent Claude tagging).

## Onboarding a new client

Sign in as an admin and use **Admin → Clients → New client**: target brand +
competitor aliases and owned domains, ecosystem-org gazetteer, keyword
categories + ordered classification rules, and key-term vocabulary — all
stored in Postgres. Then ingest:

```bash
python3 ingest.py --client <slug> export.csv
python3 enrich_bylines.py --client <slug>
```

`seed_client.py` exists to rebuild the POLYWOOD demo and as a reference for
the config shape.

## Journalist data

`enrich_bylines.py` fetches every earned-media URL the engines actually cited
and extracts the real byline, article title, and publish date (JSON-LD
Article schema, then meta tags, then DOM byline patterns). It honors
robots.txt, rate-limits per domain, never refetches a known URL, and
backfills `cited_urls` for every client citing the URL. Journalists saved to
a client's media list export as an 829-branded `.xlsx` (indigo/Onest workbook
matching the approved deliverable kit).

## Demo data caveats

`data/llm_export.csv` is synthetic (deterministic templates), so every widget
renders with realistic distributions. Its URLs are fictional and 404 against
the live web — that's why the demo uses `enrich_bylines.py --fixture`. In
production, replace the generator with a scheduled prompt-runner against the
OpenAI / Google / Anthropic APIs and drop `--fixture`.
