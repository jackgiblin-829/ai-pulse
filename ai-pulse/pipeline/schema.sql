-- =============================================================
-- AI Pulse — GEO / Generative Engine Visibility Platform
-- PostgreSQL 16 schema
-- Replicates the analytics model behind Muck Rack Generative Pulse
-- =============================================================

BEGIN;

DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;

-- ---------- Enumerations ----------------------------------------

CREATE TYPE engine_t          AS ENUM ('chatgpt', 'gemini', 'claude');
CREATE TYPE media_type_t      AS ENUM ('earned', 'owned', 'social', 'other');
CREATE TYPE brand_role_t      AS ENUM ('target', 'competitor', 'ecosystem');
CREATE TYPE sentiment_label_t AS ENUM ('positive', 'neutral', 'negative');

-- ---------- Reference / configuration tables --------------------

-- Every organization we track: the target brand, named competitors,
-- and ecosystem orgs discovered by the entity-extraction pass
-- (retailers, material suppliers, review sites' parent orgs, ...).
CREATE TABLE brands (
    id             SERIAL PRIMARY KEY,
    name           TEXT NOT NULL UNIQUE,
    role           brand_role_t NOT NULL DEFAULT 'ecosystem',
    aliases        TEXT[] NOT NULL DEFAULT '{}',   -- alternate surface forms, e.g. {POLYWOOD, Poly-Wood}
    owned_domains  TEXT[] NOT NULL DEFAULT '{}',   -- domains classified as Owned media for this brand
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Query categories used by the "Share of Voice by Keywords" widget.
CREATE TABLE keyword_categories (
    id    SERIAL PRIMARY KEY,
    name  TEXT NOT NULL UNIQUE
);

-- The seed-prompt library.
CREATE TABLE prompts (
    id                   SERIAL PRIMARY KEY,
    text                 TEXT NOT NULL UNIQUE,
    keyword_category_id  INT REFERENCES keyword_categories(id),
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Media outlet reference DB (cross-referenced during URL parsing).
CREATE TABLE media_outlets (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    domain            TEXT NOT NULL UNIQUE,       -- registrable domain, e.g. thespruce.com
    domain_authority  SMALLINT CHECK (domain_authority BETWEEN 0 AND 100),
    outlet_type       TEXT                        -- 'national', 'trade', 'lifestyle', 'review', ...
);

-- Journalist / byline reference DB.
CREATE TABLE journalists (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    outlet_id  INT REFERENCES media_outlets(id),
    beat       TEXT,
    email      TEXT,
    UNIQUE (name, outlet_id)
);

-- ---------- Raw ingestion --------------------------------------

-- One row per (prompt x engine x collection date) raw response.
CREATE TABLE llm_runs (
    id             BIGSERIAL PRIMARY KEY,
    prompt_id      INT NOT NULL REFERENCES prompts(id),
    engine         engine_t NOT NULL,
    run_date       DATE NOT NULL,
    response_text  TEXT NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, engine, run_date)
);
CREATE INDEX idx_runs_date_engine ON llm_runs (run_date, engine);

-- ---------- Extraction outputs ---------------------------------

-- Registrable domains seen in citations, classified once.
CREATE TABLE cited_domains (
    id                SERIAL PRIMARY KEY,
    domain            TEXT NOT NULL UNIQUE,
    media_type        media_type_t NOT NULL DEFAULT 'other',
    outlet_id         INT REFERENCES media_outlets(id),   -- set when domain matches the outlet DB
    owned_by_brand_id INT REFERENCES brands(id)           -- set when domain is brand-owned
);

-- Every URL cited in every response.
CREATE TABLE cited_urls (
    id             BIGSERIAL PRIMARY KEY,
    run_id         BIGINT NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    domain_id      INT NOT NULL REFERENCES cited_domains(id),
    path           TEXT,
    journalist_id  INT REFERENCES journalists(id)         -- byline resolved via media DB cross-reference
);
CREATE INDEX idx_cited_urls_run    ON cited_urls (run_id);
CREATE INDEX idx_cited_urls_domain ON cited_urls (domain_id);

-- Brand / organization mentions detected per response.
CREATE TABLE brand_mentions (
    id              BIGSERIAL PRIMARY KEY,
    run_id          BIGINT NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
    brand_id        INT NOT NULL REFERENCES brands(id),
    mention_count   INT NOT NULL DEFAULT 1,
    first_position  INT,          -- char offset of first mention (rank proxy)
    UNIQUE (run_id, brand_id)
);
CREATE INDEX idx_mentions_brand ON brand_mentions (brand_id);
CREATE INDEX idx_mentions_run   ON brand_mentions (run_id);

-- Per-run, per-brand sentiment from the LLM sentiment pass.
CREATE TABLE sentiment_scores (
    id        BIGSERIAL PRIMARY KEY,
    run_id    BIGINT NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
    brand_id  INT NOT NULL REFERENCES brands(id),
    label     sentiment_label_t NOT NULL,
    score     NUMERIC(5,4) NOT NULL,     -- -1.0000 .. 1.0000
    model     TEXT,                      -- which analyzer produced it
    UNIQUE (run_id, brand_id)
);

-- Key terms / product attributes extracted per response.
CREATE TABLE key_terms (
    id      BIGSERIAL PRIMARY KEY,
    run_id  BIGINT NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
    term    TEXT NOT NULL,
    freq    INT NOT NULL DEFAULT 1
);
CREATE INDEX idx_key_terms_term ON key_terms (term);

-- "Add to Media List" action target.
CREATE TABLE media_list_entries (
    id             SERIAL PRIMARY KEY,
    journalist_id  INT NOT NULL REFERENCES journalists(id) UNIQUE,
    added_by       TEXT NOT NULL DEFAULT 'dashboard',
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Analytics views ------------------------------------

-- Visibility: % of runs (per engine / date) in which a brand appears.
CREATE VIEW v_visibility AS
SELECT b.id AS brand_id, b.name AS brand, b.role,
       r.engine, r.run_date,
       COUNT(DISTINCT r.id)                             AS total_runs,
       COUNT(DISTINCT bm.run_id)                        AS runs_with_mention,
       ROUND(100.0 * COUNT(DISTINCT bm.run_id)
             / NULLIF(COUNT(DISTINCT r.id), 0), 1)      AS visibility_pct
FROM brands b
CROSS JOIN llm_runs r
LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
WHERE b.role IN ('target', 'competitor')
GROUP BY b.id, b.name, b.role, r.engine, r.run_date;

-- Share of voice among tracked brands (target + competitors).
CREATE VIEW v_share_of_voice AS
SELECT b.id AS brand_id, b.name AS brand, b.role,
       SUM(bm.mention_count) AS mentions,
       ROUND(100.0 * SUM(bm.mention_count)
             / NULLIF(SUM(SUM(bm.mention_count)) OVER (), 0), 1) AS sov_pct
FROM brand_mentions bm
JOIN brands b ON b.id = bm.brand_id
WHERE b.role IN ('target', 'competitor')
GROUP BY b.id, b.name, b.role;

-- Media strategy: citation counts by media type over time.
CREATE VIEW v_media_strategy AS
SELECT r.run_date, d.media_type, COUNT(*) AS citations
FROM cited_urls u
JOIN llm_runs r      ON r.id = u.run_id
JOIN cited_domains d ON d.id = u.domain_id
GROUP BY r.run_date, d.media_type;

COMMIT;
