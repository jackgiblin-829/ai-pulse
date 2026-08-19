-- =============================================================
-- AI Pulse — GEO / Generative Engine Visibility Platform
-- PostgreSQL 16 schema — multi-client
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
-- Search intent of a prompt, classified by ordered rules at ingest.
CREATE TYPE intent_t          AS ENUM ('informational', 'commercial', 'comparison', 'transactional');

-- ---------- Tenancy ---------------------------------------------

-- One row per 829 client. All client-specific config and data hang
-- off this table; onboarding writes it from the /admin/clients form.
CREATE TABLE clients (
    id          SERIAL PRIMARY KEY,
    slug        TEXT NOT NULL UNIQUE,          -- 'polywood'; used in URLs and CLI args
    name        TEXT NOT NULL,                 -- display name
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard users (email + password auth).
CREATE TABLE users (
    id             SERIAL PRIMARY KEY,
    email          TEXT NOT NULL UNIQUE,       -- stored lowercased
    name           TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
    token_version  INT NOT NULL DEFAULT 0,        -- bump to revoke outstanding sessions
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Failed sign-in log for rate limiting (rows pruned on successful login).
CREATE TABLE login_attempts (
    id           SERIAL PRIMARY KEY,
    email        TEXT NOT NULL,
    ip           TEXT,
    attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_login_attempts ON login_attempts (email, attempted_at);

-- ---------- Reference / configuration tables --------------------

-- Every organization we track per client: the target brand, named
-- competitors, and ecosystem orgs (retailers, suppliers, ...).
CREATE TABLE brands (
    id             SERIAL PRIMARY KEY,
    client_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    role           brand_role_t NOT NULL DEFAULT 'ecosystem',
    aliases        TEXT[] NOT NULL DEFAULT '{}',   -- alternate surface forms, e.g. {POLYWOOD, Poly-Wood}
    owned_domains  TEXT[] NOT NULL DEFAULT '{}',   -- domains classified as Owned media for this brand
    sort_order     INT NOT NULL DEFAULT 0,         -- drives chart palette slot assignment
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, name)
);
-- Exactly one target brand per client.
CREATE UNIQUE INDEX uq_one_target_per_client ON brands (client_id) WHERE role = 'target';

-- Query categories used by the "Share of Voice by Keywords" widget.
CREATE TABLE keyword_categories (
    id         SERIAL PRIMARY KEY,
    client_id  INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    UNIQUE (client_id, name)
);

-- Ordered prompt-classification rules (regex -> category). The last
-- rule per client is the '.*' catch-all.
CREATE TABLE keyword_rules (
    id                   SERIAL PRIMARY KEY,
    client_id            INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    position             INT NOT NULL,
    pattern              TEXT NOT NULL,
    keyword_category_id  INT NOT NULL REFERENCES keyword_categories(id),
    UNIQUE (client_id, position)
);

-- Curated key-term vocabulary per client (materials, attributes, ...).
CREATE TABLE key_term_vocab (
    id         SERIAL PRIMARY KEY,
    client_id  INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    term       TEXT NOT NULL,
    UNIQUE (client_id, term)
);

-- Service-area / product facets: a second prompt-classification axis
-- ("Adirondack & rockers", "Kenya safaris", ...), regex-matched like
-- keyword rules. Optional per client.
CREATE TABLE facets (
    id         SERIAL PRIMARY KEY,
    client_id  INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    name       TEXT NOT NULL,
    pattern    TEXT NOT NULL,
    position   INT NOT NULL DEFAULT 0,
    UNIQUE (client_id, name)
);

-- The seed-prompt library.
CREATE TABLE prompts (
    id                   SERIAL PRIMARY KEY,
    client_id            INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    text                 TEXT NOT NULL,
    keyword_category_id  INT REFERENCES keyword_categories(id),
    intent               intent_t,
    facet_id             INT REFERENCES facets(id) ON DELETE SET NULL,
    source               TEXT NOT NULL DEFAULT 'import',   -- 'import' | 'fanout'
    active               BOOLEAN NOT NULL DEFAULT TRUE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, text)
);

-- Media outlet reference DB (global — outlet identity/DA is a fact,
-- not a per-client opinion).
CREATE TABLE media_outlets (
    id                SERIAL PRIMARY KEY,
    name              TEXT NOT NULL,
    domain            TEXT NOT NULL UNIQUE,       -- registrable domain, e.g. thespruce.com
    domain_authority  SMALLINT CHECK (domain_authority BETWEEN 0 AND 100),
    outlet_type       TEXT                        -- 'national', 'trade', 'lifestyle', 'review', ...
);

-- Journalist / byline reference DB (global — a byline is a fact).
CREATE TABLE journalists (
    id         SERIAL PRIMARY KEY,
    name       TEXT NOT NULL,
    outlet_id  INT REFERENCES media_outlets(id),
    beat       TEXT,
    email      TEXT,
    UNIQUE (name, outlet_id)
);

-- Crawled article metadata for cited URLs (global — written by
-- enrich_bylines.py). One row per normalized URL, whatever the
-- fetch outcome, so URLs are never re-fetched.
CREATE TABLE articles (
    id             BIGSERIAL PRIMARY KEY,
    url            TEXT NOT NULL UNIQUE,          -- normalized: scheme+host+path, no query/fragment
    domain         TEXT NOT NULL,                 -- registrable domain
    outlet_id      INT REFERENCES media_outlets(id),
    journalist_id  INT REFERENCES journalists(id),
    title          TEXT,
    author_raw     TEXT,                          -- exact extracted byline before cleanup
    published_at   DATE,
    fetch_status   TEXT NOT NULL DEFAULT 'pending'
                   CHECK (fetch_status IN ('pending', 'ok', 'no_byline', 'failed', 'skipped')),
    http_status    INT,
    fetched_at     TIMESTAMPTZ,
    error          TEXT
);
CREATE INDEX idx_articles_domain ON articles (domain);

-- ---------- Raw ingestion --------------------------------------

-- One row per (prompt x engine x collection date) raw response.
-- client_id is denormalized from prompts to keep dashboard queries
-- join-free on the hot path.
CREATE TABLE llm_runs (
    id             BIGSERIAL PRIMARY KEY,
    client_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    prompt_id      INT NOT NULL REFERENCES prompts(id),
    engine         engine_t NOT NULL,
    run_date       DATE NOT NULL,
    response_text  TEXT NOT NULL,
    ingested_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (prompt_id, engine, run_date)
);
CREATE INDEX idx_runs_client_date_engine ON llm_runs (client_id, run_date, engine);

-- ---------- Extraction outputs ---------------------------------

-- Registrable domains seen in citations, classified once per client
-- ('owned' is a per-client fact: polywood.com is owned media for
-- POLYWOOD and plain 'other' for anyone else).
CREATE TABLE cited_domains (
    id                SERIAL PRIMARY KEY,
    client_id         INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    domain            TEXT NOT NULL,
    media_type        media_type_t NOT NULL DEFAULT 'other',
    outlet_id         INT REFERENCES media_outlets(id),   -- set when domain matches the outlet DB
    owned_by_brand_id INT REFERENCES brands(id),          -- set when domain is brand-owned
    UNIQUE (client_id, domain)
);

-- Every URL cited in every response.
CREATE TABLE cited_urls (
    id             BIGSERIAL PRIMARY KEY,
    run_id         BIGINT NOT NULL REFERENCES llm_runs(id) ON DELETE CASCADE,
    url            TEXT NOT NULL,
    domain_id      INT NOT NULL REFERENCES cited_domains(id),
    path           TEXT,
    journalist_id  INT REFERENCES journalists(id),        -- byline resolved from articles
    article_id     BIGINT REFERENCES articles(id)         -- crawled metadata, when available
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

-- "Add to Media List" action target — one list per client.
CREATE TABLE media_list_entries (
    id             SERIAL PRIMARY KEY,
    client_id      INT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    journalist_id  INT NOT NULL REFERENCES journalists(id),
    added_by       TEXT NOT NULL,                 -- session user email
    added_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (client_id, journalist_id)
);

-- ---------- Analytics views ------------------------------------

-- Visibility: % of a client's runs (per engine / date) in which a
-- tracked brand appears.
CREATE VIEW v_visibility AS
SELECT b.client_id, b.id AS brand_id, b.name AS brand, b.role,
       r.engine, r.run_date,
       COUNT(DISTINCT r.id)                             AS total_runs,
       COUNT(DISTINCT bm.run_id)                        AS runs_with_mention,
       ROUND(100.0 * COUNT(DISTINCT bm.run_id)
             / NULLIF(COUNT(DISTINCT r.id), 0), 1)      AS visibility_pct
FROM brands b
JOIN llm_runs r ON r.client_id = b.client_id
LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
WHERE b.role IN ('target', 'competitor')
GROUP BY b.client_id, b.id, b.name, b.role, r.engine, r.run_date;

-- Share of voice among a client's tracked brands.
CREATE VIEW v_share_of_voice AS
SELECT b.client_id, b.id AS brand_id, b.name AS brand, b.role,
       SUM(bm.mention_count) AS mentions,
       ROUND(100.0 * SUM(bm.mention_count)
             / NULLIF(SUM(SUM(bm.mention_count)) OVER (PARTITION BY b.client_id), 0), 1) AS sov_pct
FROM brand_mentions bm
JOIN brands b ON b.id = bm.brand_id
WHERE b.role IN ('target', 'competitor')
GROUP BY b.client_id, b.id, b.name, b.role;

-- Media strategy: citation counts by media type over time, per client.
CREATE VIEW v_media_strategy AS
SELECT r.client_id, r.run_date, d.media_type, COUNT(*) AS citations
FROM cited_urls u
JOIN llm_runs r      ON r.id = u.run_id
JOIN cited_domains d ON d.id = u.domain_id
GROUP BY r.client_id, r.run_date, d.media_type;

COMMIT;
