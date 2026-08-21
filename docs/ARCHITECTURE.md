# AI Pulse — System Architecture

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| Dashboard | Next.js 15 (App Router) + Tailwind 4 + Recharts | Server components query Postgres directly; one deploy target (Vercel or a single container) |
| API | Next.js route handlers (`/api/dashboard`, `/api/media-list`) | JSON access to every widget's data + the media-list write action |
| Pipeline | Python 3.11 + psycopg2 (standalone CLI) | Runs on a schedule (cron/GitHub Actions) independent of the web app |
| Database | PostgreSQL 16 | Enums, arrays, window functions, and views carry the whole analytics model |
| Sentiment | Pluggable: Claude API (`ANTHROPIC_API_KEY`) or domain lexicon fallback | LLM-quality sentiment in production, zero-dependency in dev |

Data flow:

```
prompt library ──▶ prompt runner (OpenAI/Google/Anthropic APIs, scheduled)
                        │  raw export: prompt, vendor, date, response
                        ▼
                 pipeline/ingest.py
   URL extraction ▸ domain parsing ▸ media-type classification
   byline cross-reference ▸ entity mentions ▸ sentiment ▸ key terms
                        ▼
                  PostgreSQL (tables + views)
                        ▼
        Next.js dashboard  /  /api/dashboard JSON
```

The demo replaces the prompt runner with `generate_demo_data.py`. Scheduling
is real: a launchd LaunchAgent (`pipeline/launchd/…dispatch.plist`, 06:00 +
18:00) fires `pipeline/dispatch.py`, which reads `clients.tracking_cadence`
('daily' | 'weekly', set in /admin/clients) plus the `job_runs` bookkeeping
table and runs whatever is due per client: `fetch_tavily.py` →
`fetch_profound.py` → `enrich_bylines.py` → `tag_topics.py` (a future LLM
prompt-runner slots into the same registry). Due-ness = no success row this
period (day, or Mon-anchored ISO week), so the second daily fire is a free
retry and weekly clients self-heal after downtime. In a container, swap the
plist for one cron line — the dispatcher is unchanged. The ingest pipeline
stays idempotent (upserts on `prompt_id, engine, run_date`), so re-runs are
safe. If volume grows past what a nightly batch handles, lift the
per-response stage into an RQ/Celery worker queue — the code is already
structured per-response.

## 2. Database schema

Core tables (see `pipeline/schema.sql` for full DDL):

- `brands` — target / competitor / ecosystem orgs, alias arrays, owned domains
- `keyword_categories`, `prompts` — the seed library, each prompt mapped to a query category
- `llm_runs` — one row per prompt × engine × date; unique key makes ingestion idempotent
- `cited_domains` — each domain classified once: earned / owned / social / other, linked to `media_outlets` and owning brand
- `cited_urls` — every citation, with resolved `journalist_id`
- `media_outlets` (domain authority), `journalists` — the PR reference DB
- `brand_mentions` — per run × brand: mention count + first position
- `sentiment_scores` — per run × tracked brand: label + score + model
- `key_terms` — extracted attribute/material/product terms per run
- `media_list_entries` — the "Add to Media List" action target
- `client_integrations` — per-client Tavily/Profound flags + Profound category ID
- `citation_observations` — external citation/search observations (Tavily, Profound), normalized URLs
- `topics`, `url_topics` — client-scoped topic vocabulary + per-URL assignments (Claude tagging)
- `job_runs` — scheduler bookkeeping (one row per dispatch job attempt; partial unique index enforces one success per job/client/date)
- `clients.tracking_cadence` — daily/weekly scheduler frequency per client

Views: `v_visibility`, `v_share_of_voice`, `v_media_strategy` mirror the
dashboard's core metrics in SQL.

## 3. Metric definitions

- **Visibility** (per brand, engine, window): `distinct runs with ≥1 mention ÷ total runs × 100`. Mentions are detected on URL-stripped text, so a `polywood.com` citation doesn't count as a prose mention.
- **Share of voice**: brand's `SUM(mention_count)` over all tracked-brand mentions in the window.
- **Keyword SOV**: the target's mentions grouped by the prompt's keyword category.
- **Media strategy**: citation counts by `cited_domains.media_type` per collection date. Classification order: owned (brand domain list) → earned (outlet DB) → social (platform list) → other.
- **Sentiment**: per run × brand label from the analyzer; charted as a 100% stacked mix per collection date.
- **Key terms**: curated domain vocabulary matches + statistical bigrams (stopword-, junk-, and brand-word-filtered).

## 4. Extraction pipeline details

1. **URL extraction** — regex over the raw response (handles markdown links, bare URLs, bracketed citation styles from all three engines); trailing punctuation stripped; per-run dedupe.
2. **Domain parsing** — registrable domain (www-stripped, multi-part TLD aware).
3. **Byline resolution** — exact (domain, path) lookup in the article index (`media_articles.py`); production swaps this for a Muck Rack/Cision API call. Outlet DA comes from `media_outlets`.
4. **Entity mentions** — longest-first alias alternation with word-boundary guards per brand/org; counts + first-position offset (rank proxy).
5. **Sentiment** — ±160-char context windows around each mention (lexicon), or full-response LLM scoring (Claude) when a key is present.
6. **Key terms** — curated vocab + bigram mining with brand-word exclusion so entities stay in the org-mentions table, not the term cloud.

## 5. Dashboard widgets → data sources

| Widget | Query (`app/lib/queries.js`) |
|---|---|
| Visibility matrix (brand × engine heat cells) | `visibilityMatrix` |
| Visibility over time (line, per engine) | `visibilityTrend` |
| Media strategy (stacked bars by type) | `mediaStrategy` |
| Overall SOV (donut) | `shareOfVoice` |
| SOV by keywords (donut) | `keywordShareOfVoice` |
| Sentiment over time (100% stacked) | `sentimentOverTime` |
| Key terms cloud | `topKeyTerms` |
| All organization mentions | `orgMentions` |
| Top cited domains / owned URLs | `topDomains`, `topOwnedUrls` |
| Top outlets (DA) / journalists (+ media-list action) | `topOutlets`, `topJournalists` |

Global filters (engine, time window) are URL params handled server-side; the
matrix intentionally ignores the engine filter since it is cross-engine by
definition.

Chart colors follow a validated CVD-safe categorical palette
(`app/lib/palette.js`): fixed entity→slot assignment (POLYWOOD is always blue),
sequential blue ramp for the heat matrix, diverging blue/gray/red for
sentiment, 2px surface gaps between stacked segments, legends in ink-colored
text with color swatches carrying identity.

## 6. Production hardening checklist

- Prompt runner: scheduled jobs per engine with retries + raw response archiving (S3) before ingestion.
- ~~Real media DB~~ **Done**: `enrich_bylines.py` crawls cited URLs for real bylines
  (JSON-LD -> meta tags -> DOM patterns), populating the global `articles` +
  `journalists` tables. Remaining: refresh DA scores monthly (Moz API), and
  journalist contact enrichment (beat/email) if a Muck Rack/Cision key appears.
- ~~Auth~~ **Done**: email+password accounts (`users` table, bcrypt), jose JWT
  session cookie verified in Edge middleware, admin/member roles, user
  management at /admin/users. Upgrade path to Google SSO stays open.
- ~~Multi-client~~ **Done**: `clients` table; brands/prompts/runs/keyword
  taxonomy/cited_domains/media lists are client-scoped; config lives in
  Postgres, written by the /admin/clients onboarding form (seed_client.py
  rebuilds the demo). Views and every dashboard query carry client predicates.
- Entity discovery: today the ecosystem gazetteer is curated; add an NER pass (spaCy `en_core_web_trf` ORG entities) to surface unknown orgs for review.
