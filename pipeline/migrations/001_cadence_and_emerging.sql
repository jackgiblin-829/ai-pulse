-- =============================================================
-- Migration 001 — tracking cadence + scheduler bookkeeping +
-- external citation observations (Tavily / Profound) + topics.
-- Idempotent: safe to apply more than once against the live DB.
-- Fresh builds get all of this from schema.sql instead.
-- =============================================================

BEGIN;

-- ---------- Types (guarded: CREATE TYPE has no IF NOT EXISTS) ----

DO $$ BEGIN
    CREATE TYPE cadence_t AS ENUM ('daily', 'weekly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    CREATE TYPE observation_source_t AS ENUM ('tavily', 'profound', 'llm_run');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------- Tracking cadence -------------------------------------

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS tracking_cadence cadence_t NOT NULL DEFAULT 'weekly';

-- ---------- Scheduler bookkeeping --------------------------------

-- One row per dispatcher job attempt. run_date is the logical
-- collection date the attempt was for; the partial unique index is
-- the idempotence guard — at most one SUCCESSFUL attempt per
-- (job, client, date), while failed attempts may repeat.
CREATE TABLE IF NOT EXISTS job_runs (
    id           BIGSERIAL PRIMARY KEY,
    job_name     TEXT NOT NULL,     -- 'tavily_fetch' | 'profound_pull' | 'enrich_bylines' | 'tag_topics' | 'prompt_runner'
    client_id    INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    run_date     DATE NOT NULL,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    status       TEXT NOT NULL DEFAULT 'running'
                 CHECK (status IN ('running', 'success', 'error', 'skipped')),
    error        TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_job_runs_one_success
    ON job_runs (job_name, client_id, run_date) WHERE status = 'success';
CREATE INDEX IF NOT EXISTS idx_job_runs_client
    ON job_runs (client_id, job_name, run_date DESC);

-- ---------- Per-client integration config ------------------------

-- Written by the /admin/clients form (Integrations section). One row
-- per client; global API keys live in env (TAVILY_API_KEY /
-- PROFOUND_API_KEY).
CREATE TABLE IF NOT EXISTS client_integrations (
    client_id         INT PRIMARY KEY REFERENCES clients(id) ON DELETE CASCADE,
    tavily_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
    profound_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
    profound_org_id   TEXT,     -- Profound organization identifier
    profound_category TEXT,     -- Profound category (prompt set) identifier
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- External citation observations -----------------------

-- Search/citation observations from external sources (Tavily
-- searches on fan-out keywords, Profound citation reports).
-- Internal LLM-run citations stay in cited_urls; analytics UNION
-- the two. url is normalize_url()-canonical so it joins
-- articles.url / url_topics.url with plain equality.
CREATE TABLE IF NOT EXISTS citation_observations (
    id              BIGSERIAL PRIMARY KEY,
    client_id       INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    source          observation_source_t NOT NULL,
    observed_at     DATE NOT NULL,              -- fetch date / report date
    url             TEXT NOT NULL,              -- normalized
    domain          TEXT NOT NULL,              -- registrable domain
    query           TEXT,                       -- Tavily query or Profound prompt
    engine          TEXT,                       -- Profound: citing AI engine
    title           TEXT,
    snippet         TEXT,                       -- Tavily content snippet (topic input)
    score           NUMERIC(6,4),               -- Tavily relevance score
    published_at    DATE,                       -- Tavily published_date
    citation_count  INT NOT NULL DEFAULT 1,     -- Profound aggregate for the window
    article_id      BIGINT REFERENCES articles(id),  -- backfilled by enrich_bylines
    raw             JSONB,                      -- source payload for audit
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- Idempotency key for fetch jobs (expression index so NULL query dedupes).
CREATE UNIQUE INDEX IF NOT EXISTS uq_citation_obs
    ON citation_observations (client_id, source, url, observed_at, COALESCE(query, ''));
CREATE INDEX IF NOT EXISTS idx_citation_obs_client_date
    ON citation_observations (client_id, observed_at);
CREATE INDEX IF NOT EXISTS idx_citation_obs_article
    ON citation_observations (article_id);

-- ---------- Topics ------------------------------------------------

-- Client-scoped topic vocabulary, grown by the Claude tagging pass
-- (relevance is a per-client opinion; the URL itself is global).
CREATE TABLE IF NOT EXISTS topics (
    id          SERIAL PRIMARY KEY,
    client_id   INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,                  -- short lowercase label
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, name)
);

-- Topic assignments keyed on normalized URL — one tagging works for
-- external observations and (via articles) internal cited_urls.
CREATE TABLE IF NOT EXISTS url_topics (
    id          BIGSERIAL PRIMARY KEY,
    client_id   INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    url         TEXT NOT NULL,                  -- normalized
    topic_id    INT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    confidence  NUMERIC(4,3),
    model       TEXT,                           -- which tagger produced it
    tagged_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, url, topic_id)
);
CREATE INDEX IF NOT EXISTS idx_url_topics_url ON url_topics (client_id, url);

COMMIT;
