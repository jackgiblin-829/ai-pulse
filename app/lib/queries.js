import { q } from "./db";

// Shared filter fragment builders. Every widget query takes a filter
// object f = { clientId, engine, range }:
//   clientId: int (validated via Number())
//   engine:   'all'|'chatgpt'|'gemini'|'claude'
//   range:    { kind:'days', days } — relative to the client's latest
//             run_date — or { kind:'custom', from, to } (absolute,
//             regex-validated YYYY-MM-DD in lib/dates.js)
// Each builder pushes its values onto the query's params array and returns
// SQL containing only $n placeholders — nothing user-influenced is ever
// interpolated into the SQL text, so safety no longer depends on callers
// pre-validating searchParams.
function intParam(value, what) {
  const n = Number(value);
  if (!Number.isInteger(n)) throw new Error(`invalid ${what}: ${value}`);
  return n;
}

function windowClause(f, params) {
  params.push(intParam(f.clientId, "clientId"));
  const cidIdx = params.length;
  const client = `r.client_id = $${cidIdx}`;
  const r = f.range;
  if (r.kind === "custom") {
    params.push(r.from, r.to);
    return `${client} AND r.run_date BETWEEN $${params.length - 1} AND $${params.length}`;
  }
  if (r.days === "all") return client;
  params.push(intParam(r.days, "days"));
  return `${client} AND r.run_date >= (SELECT MAX(run_date) FROM llm_runs WHERE client_id = $${cidIdx}) - ($${params.length} * INTERVAL '1 day')`;
}

function engineClause(f, params) {
  if (f.engine === "all") return "TRUE";
  params.push(f.engine);
  return `r.engine = $${params.length}`;
}

function brandSub(f, params, brand) {
  params.push(intParam(f.clientId, "clientId"), brand);
  return `(SELECT id FROM brands WHERE client_id = $${params.length - 1} AND name = $${params.length})`;
}

// ---------- Clients ------------------------------------------------

export async function getClientBySlug(slug) {
  const [client] = await q(
    `SELECT c.id, c.slug, c.name, c.tracking_cadence::text AS tracking_cadence,
            b.name AS target_brand
     FROM clients c
     JOIN brands b ON b.client_id = c.id AND b.role = 'target'
     WHERE c.slug = $1`, [slug]);
  return client ?? null;
}

export async function trackedBrands(clientId) {
  return q(
    `SELECT name, role::text AS role, sort_order FROM brands
     WHERE client_id = $1 AND role IN ('target','competitor')
     ORDER BY role = 'target' DESC, sort_order, id`, [Number(clientId)]);
}

export async function clientsOverview() {
  return q(`
    SELECT c.id, c.slug, c.name, b.name AS target_brand,
           s.last_run::text AS last_run, s.run_count,
           v.visibility, sov.pct AS sov
    FROM clients c
    JOIN brands b ON b.client_id = c.id AND b.role = 'target'
    LEFT JOIN LATERAL (
      SELECT MAX(run_date) AS last_run, COUNT(*)::int AS run_count
      FROM llm_runs r WHERE r.client_id = c.id) s ON TRUE
    LEFT JOIN LATERAL (
      SELECT ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0),1)::float AS visibility
      FROM llm_runs r
      LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
      WHERE r.client_id = c.id
        AND r.run_date >= s.last_run - INTERVAL '90 days') v ON TRUE
    LEFT JOIN LATERAL (
      SELECT ROUND(100.0 * SUM(CASE WHEN bm.brand_id = b.id THEN bm.mention_count ELSE 0 END)
                   / NULLIF(SUM(bm.mention_count),0),1)::float AS pct
      FROM brand_mentions bm
      JOIN brands tb ON tb.id = bm.brand_id AND tb.role IN ('target','competitor')
      JOIN llm_runs r ON r.id = bm.run_id
      WHERE r.client_id = c.id
        AND r.run_date >= s.last_run - INTERVAL '90 days') sov ON TRUE
    ORDER BY c.name`);
}

export async function runDateBounds(clientId) {
  const [row] = await q(
    `SELECT MIN(run_date)::text AS min, MAX(run_date)::text AS max
     FROM llm_runs WHERE client_id = $1`, [Number(clientId)]);
  return row ?? { min: null, max: null };
}

// ---------- 1. Visibility ----------------------------------------

export async function visibilityMatrix(f) {
  const params = [];
  const win = windowClause(f, params);
  params.push(intParam(f.clientId, "clientId"));
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${win})
    SELECT b.name AS brand, b.role, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM brands b
    CROSS JOIN runs r
    LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
    WHERE b.client_id = $${params.length} AND b.role IN ('target','competitor')
    GROUP BY b.name, b.role, r.engine
    ORDER BY b.role = 'target' DESC, 4 DESC`, params);
}

export async function visibilityTrend(f, brand) {
  const params = [];
  const win = windowClause(f, params);
  const bsub = brandSub(f, params, brand);
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${win})
    SELECT r.run_date::text AS date, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM runs r
    LEFT JOIN brand_mentions bm
      ON bm.run_id = r.id
     AND bm.brand_id = ${bsub}
    GROUP BY r.run_date, r.engine ORDER BY r.run_date`, params);
}

// ---------- 2. Media strategy + SOV -------------------------------

export async function mediaStrategy(f) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  return q(`
    SELECT r.run_date::text AS date, d.media_type::text AS media_type, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN llm_runs r ON r.id = u.run_id
    JOIN cited_domains d ON d.id = u.domain_id
    WHERE ${win} AND ${eng}
    GROUP BY r.run_date, d.media_type ORDER BY r.run_date`, params);
}

export async function shareOfVoice(f) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  return q(`
    SELECT b.name AS brand, b.role, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN brands b ON b.id = bm.brand_id
    JOIN llm_runs r ON r.id = bm.run_id
    WHERE b.role IN ('target','competitor') AND ${win} AND ${eng}
    GROUP BY b.name, b.role ORDER BY mentions DESC`, params);
}

// ---------- 3. Keyword SOV + sentiment ----------------------------

export async function keywordShareOfVoice(f, brand) {
  const params = [];
  const bsub = brandSub(f, params, brand);
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  return q(`
    SELECT k.name AS keyword, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN llm_runs r ON r.id = bm.run_id
    JOIN prompts p ON p.id = r.prompt_id
    JOIN keyword_categories k ON k.id = p.keyword_category_id
    WHERE bm.brand_id = ${bsub}
      AND ${win} AND ${eng}
    GROUP BY k.name ORDER BY mentions DESC`, params);
}

export async function sentimentOverTime(f, brand) {
  const params = [];
  const bsub = brandSub(f, params, brand);
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  return q(`
    SELECT r.run_date::text AS date,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='positive') / COUNT(*), 1)::float AS positive,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='neutral')  / COUNT(*), 1)::float AS neutral,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='negative') / COUNT(*), 1)::float AS negative
    FROM sentiment_scores s
    JOIN llm_runs r ON r.id = s.run_id
    WHERE s.brand_id = ${bsub}
      AND ${win} AND ${eng}
    GROUP BY r.run_date ORDER BY r.run_date`, params);
}

// ---------- 4. Key terms + org mentions ---------------------------

export async function topKeyTerms(f, limit = 28) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  params.push(limit);
  return q(`
    SELECT t.term, SUM(t.freq)::int AS freq
    FROM key_terms t
    JOIN llm_runs r ON r.id = t.run_id
    WHERE ${win} AND ${eng}
    GROUP BY t.term ORDER BY freq DESC LIMIT $${params.length}`, params);
}

export async function orgMentions(f) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  return q(`
    WITH m AS (
      SELECT b.name, b.role, SUM(bm.mention_count)::int AS mentions
      FROM brand_mentions bm
      JOIN brands b ON b.id = bm.brand_id
      JOIN llm_runs r ON r.id = bm.run_id
      WHERE ${win} AND ${eng}
      GROUP BY b.name, b.role)
    SELECT name, role::text AS role, mentions,
           ROUND(100.0 * mentions / NULLIF(SUM(mentions) OVER (),0), 1)::float AS pct
    FROM m ORDER BY mentions DESC`, params);
}

// ---------- 5. Domain / URL citation analytics --------------------

export async function topDomains(f, limit = 15) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  params.push(limit);
  return q(`
    SELECT d.domain, d.media_type::text AS media_type,
           COUNT(*)::int AS citations, COUNT(DISTINCT u.url)::int AS unique_urls
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${win} AND ${eng}
    GROUP BY d.domain, d.media_type ORDER BY citations DESC LIMIT $${params.length}`, params);
}

export async function topOwnedUrls(f, brand, limit = 10) {
  const params = [];
  const bsub = brandSub(f, params, brand);
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  params.push(limit);
  return q(`
    SELECT u.url, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE d.owned_by_brand_id = ${bsub}
      AND ${win} AND ${eng}
    GROUP BY u.url ORDER BY citations DESC LIMIT $${params.length}`, params);
}

// ---------- 6. PR & journalist intelligence -----------------------

export async function topOutlets(f, limit = 12) {
  const params = [];
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  params.push(limit);
  return q(`
    SELECT o.name AS outlet, o.domain, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN media_outlets o ON o.id = d.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${win} AND ${eng}
    GROUP BY o.name, o.domain, o.domain_authority ORDER BY citations DESC LIMIT $${params.length}`, params);
}

export async function topJournalists(f, limit = 12) {
  const params = [];
  params.push(intParam(f.clientId, "clientId"));
  const mlIdx = params.length;
  const win = windowClause(f, params);
  const eng = engineClause(f, params);
  params.push(limit);
  return q(`
    SELECT j.id, j.name, o.name AS outlet, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations,
           (ml.id IS NOT NULL) AS in_media_list
    FROM cited_urls u
    JOIN journalists j ON j.id = u.journalist_id
    JOIN media_outlets o ON o.id = j.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    LEFT JOIN media_list_entries ml
      ON ml.journalist_id = j.id AND ml.client_id = $${mlIdx}
    WHERE ${win} AND ${eng}
    GROUP BY j.id, j.name, o.name, o.domain_authority, ml.id
    ORDER BY citations DESC LIMIT $${params.length}`, params);
}

// Counts for the dashboard's media-list call-to-action: how many distinct
// journalists the engines have cited vs how many are already on the list.
export async function mediaListSummary(clientId) {
  const [row] = await q(`
    SELECT
      (SELECT COUNT(DISTINCT u.journalist_id)::int
       FROM cited_urls u JOIN llm_runs r ON r.id = u.run_id
       WHERE r.client_id = $1 AND u.journalist_id IS NOT NULL) AS cited_journalists,
      (SELECT COUNT(*)::int FROM media_list_entries WHERE client_id = $1) AS on_list`,
    [Number(clientId)]);
  return row ?? { cited_journalists: 0, on_list: 0 };
}

// Full media list for a client, with export-grade fields.
export async function mediaList(clientId) {
  return q(`
    SELECT j.id, j.name, o.name AS outlet, o.domain, o.domain_authority::int AS da,
           j.beat, j.email,
           COALESCE(c.citations, 0) AS citations,
           COALESCE(c.examples, '{}') AS examples,
           ml.added_at::date::text AS added_at, ml.added_by
    FROM media_list_entries ml
    JOIN journalists j ON j.id = ml.journalist_id
    LEFT JOIN media_outlets o ON o.id = j.outlet_id
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS citations,
             (ARRAY_AGG(DISTINCT COALESCE(a.url, u.url)))[1:3] AS examples
      FROM cited_urls u
      JOIN llm_runs r ON r.id = u.run_id
      LEFT JOIN articles a ON a.id = u.article_id
      WHERE u.journalist_id = j.id AND r.client_id = ml.client_id) c ON TRUE
    WHERE ml.client_id = $1
    ORDER BY o.domain_authority DESC NULLS LAST, j.name`, [Number(clientId)]);
}

// ---------- Citation targets (intent x facet) ---------------------

export async function facetsForClient(clientId) {
  return q(
    `SELECT id, name, pattern FROM facets WHERE client_id = $1 ORDER BY position, id`,
    [Number(clientId)]);
}

// Prompt-scoped filter fragment for the targets view.
function promptFilter({ facetId, kw }, params) {
  let sql = "";
  if (facetId) {
    params.push(intParam(facetId, "facetId"));
    sql += ` AND p.facet_id = $${params.length}`;
  }
  if (kw) {
    params.push(`%${kw}%`);
    sql += ` AND p.text ILIKE $${params.length}`;
  }
  return sql;
}

// Per-intent rollup: prompt/citation volume + target visibility.
export async function intentBreakdown(clientId, targetBrandId, opts = {}) {
  const params = [intParam(clientId, "clientId"), intParam(targetBrandId, "brandId")];
  return q(`
    SELECT p.intent::text AS intent,
           COUNT(DISTINCT p.id)::int AS prompts,
           COUNT(DISTINCT u.id)::int AS citations,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM prompts p
    JOIN llm_runs r ON r.prompt_id = p.id
    LEFT JOIN cited_urls u ON u.run_id = r.id
    LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = $2
    WHERE p.client_id = $1 AND p.intent IS NOT NULL${promptFilter(opts, params)}
    GROUP BY p.intent ORDER BY citations DESC`, params);
}

// Top cited sources per intent, with target-status signals:
// owned domain, engaged (outlet has a media-list journalist), or gap.
export async function citationTargets(clientId, targetBrandId, opts = {}) {
  const params = [intParam(clientId, "clientId"), intParam(targetBrandId, "brandId")];
  return q(`
    SELECT p.intent::text AS intent, d.domain, d.media_type::text AS media_type,
           o.name AS outlet, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations, COUNT(DISTINCT u.url)::int AS unique_urls,
           (d.owned_by_brand_id = $2) AS is_owned,
           EXISTS (
             SELECT 1 FROM media_list_entries ml
             JOIN journalists j2 ON j2.id = ml.journalist_id
             WHERE ml.client_id = $1 AND j2.outlet_id = d.outlet_id
           ) AS engaged
    FROM cited_urls u
    JOIN llm_runs r ON r.id = u.run_id
    JOIN prompts p ON p.id = r.prompt_id
    JOIN cited_domains d ON d.id = u.domain_id
    LEFT JOIN media_outlets o ON o.id = d.outlet_id
    WHERE r.client_id = $1 AND p.intent IS NOT NULL${promptFilter(opts, params)}
    GROUP BY p.intent, d.domain, d.media_type, o.name, o.domain_authority,
             d.owned_by_brand_id, d.outlet_id
    ORDER BY p.intent, citations DESC`, params);
}

// Prompts matching a fan-out keyword, with measurement status.
export async function promptsForKeyword(clientId, kw, limit = 30) {
  return q(`
    SELECT p.text, p.intent::text AS intent, f.name AS facet, p.source,
           COUNT(r.id)::int AS runs
    FROM prompts p
    LEFT JOIN facets f ON f.id = p.facet_id
    LEFT JOIN llm_runs r ON r.prompt_id = p.id
    WHERE p.client_id = $1 AND p.text ILIKE $2
    GROUP BY p.id, p.text, p.intent, f.name, p.source
    ORDER BY runs DESC, p.id DESC LIMIT $3`,
    [Number(clientId), `%${kw}%`, limit]);
}

// Full prompt library for the management view.
export async function promptLibrary(clientId) {
  return q(`
    SELECT p.id, p.text, p.intent::text AS intent, p.source, p.active,
           k.name AS category, f.name AS facet,
           COUNT(r.id)::int AS runs,
           MAX(r.run_date)::text AS last_run
    FROM prompts p
    LEFT JOIN keyword_categories k ON k.id = p.keyword_category_id
    LEFT JOIN facets f ON f.id = p.facet_id
    LEFT JOIN llm_runs r ON r.prompt_id = p.id
    WHERE p.client_id = $1
    GROUP BY p.id, p.text, p.intent, p.source, p.active, k.name, f.name
    ORDER BY p.active DESC, COUNT(r.id) = 0 DESC, p.id DESC`, [Number(clientId)]);
}

// ---------- PR attribution -----------------------------------------

// Every cited article by a media-list journalist, flagged "won" when its
// first citation followed the journalist's addition to the list.
export async function attributionArticles(clientId) {
  return q(`
    WITH fc AS (
      SELECT u.article_id, MIN(r.run_date) AS first_cited,
             COUNT(*)::int AS citations, COUNT(DISTINCT r.engine)::int AS engines
      FROM cited_urls u
      JOIN llm_runs r ON r.id = u.run_id
      WHERE r.client_id = $1 AND u.article_id IS NOT NULL
      GROUP BY u.article_id)
    SELECT j.name AS journalist, o.name AS outlet, o.domain_authority::int AS da,
           a.title, a.url, fc.first_cited::text AS first_cited,
           fc.citations, fc.engines,
           ml.added_at::date::text AS added,
           (fc.first_cited >= ml.added_at::date) AS won
    FROM media_list_entries ml
    JOIN journalists j ON j.id = ml.journalist_id
    JOIN articles a ON a.journalist_id = j.id
    JOIN fc ON fc.article_id = a.id
    LEFT JOIN media_outlets o ON o.id = a.outlet_id
    WHERE ml.client_id = $1
    ORDER BY won DESC, fc.citations DESC`, [Number(clientId)]);
}

// Per-journalist citation volume before vs after they were added.
export async function attributionByJournalist(clientId) {
  return q(`
    SELECT j.name AS journalist, o.name AS outlet,
           ml.added_at::date::text AS added,
           COUNT(u.id) FILTER (WHERE r.run_date <  ml.added_at::date)::int AS before_cites,
           COUNT(u.id) FILTER (WHERE r.run_date >= ml.added_at::date)::int AS after_cites
    FROM media_list_entries ml
    JOIN journalists j ON j.id = ml.journalist_id
    LEFT JOIN media_outlets o ON o.id = j.outlet_id
    LEFT JOIN cited_urls u ON u.journalist_id = j.id
    LEFT JOIN llm_runs r ON r.id = u.run_id AND r.client_id = ml.client_id
    WHERE ml.client_id = $1
    GROUP BY j.name, o.name, ml.added_at
    ORDER BY after_cites DESC`, [Number(clientId)]);
}

// Denominator for "share of earned citations from won articles".
export async function earnedCitationCount(clientId) {
  const [row] = await q(`
    SELECT COUNT(*)::int AS n
    FROM cited_urls u
    JOIN llm_runs r ON r.id = u.run_id
    JOIN cited_domains d ON d.id = u.domain_id
    WHERE r.client_id = $1 AND d.media_type = 'earned'`, [Number(clientId)]);
  return row?.n ?? 0;
}

// ---------- KPI row -----------------------------------------------

export async function kpis(f, brand) {
  const visParams = [];
  const visWin = windowClause(f, visParams);
  const visEng = engineClause(f, visParams);
  const visBrand = brandSub(f, visParams, brand);
  const [vis] = await q(`
    WITH runs AS (SELECT id FROM llm_runs r WHERE ${visWin} AND ${visEng})
    SELECT ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF((SELECT COUNT(*) FROM runs),0),1)::float AS visibility
    FROM brand_mentions bm
    WHERE bm.brand_id=${visBrand} AND bm.run_id IN (SELECT id FROM runs)`, visParams);
  const sov = await shareOfVoice(f);
  const target = sov.find((s) => s.brand === brand);
  const citeParams = [];
  const citeWin = windowClause(f, citeParams);
  const citeEng = engineClause(f, citeParams);
  const [cites] = await q(`
    SELECT COUNT(*)::int AS n FROM cited_urls u JOIN llm_runs r ON r.id=u.run_id WHERE ${citeWin} AND ${citeEng}`, citeParams);
  const sentParams = [];
  const sentBrand = brandSub(f, sentParams, brand);
  const sentWin = windowClause(f, sentParams);
  const sentEng = engineClause(f, sentParams);
  const [sent] = await q(`
    SELECT ROUND(100.0*COUNT(*) FILTER (WHERE label='positive')/NULLIF(COUNT(*),0),1)::float AS pos
    FROM sentiment_scores s JOIN llm_runs r ON r.id=s.run_id
    WHERE s.brand_id=${sentBrand} AND ${sentWin} AND ${sentEng}`, sentParams);
  return {
    visibility: vis?.visibility ?? 0,
    sov: target?.pct ?? 0,
    citations: cites?.n ?? 0,
    positive: sent?.pos ?? 0,
  };
}

// ---------- Emerging authors & topics ------------------------------
// Blended citation observations: external (Tavily / Profound) rows from
// citation_observations UNION internal LLM-run citations. Weight is the
// Profound aggregate count or 1 per row. Internal URLs resolve to their
// crawled article's normalized URL so topic joins work across sources.
// "Emerging" (window = N days, anchored at CURRENT_DATE):
//   New    = first observation across all sources within the last N days.
//   Rising = recent weight >= 3 AND >= 2x the prior N-day window.
const OBS_CTE = `
  obs AS (
    SELECT o.url, o.domain, o.observed_at AS seen_on, o.source::text AS source,
           o.citation_count AS weight, o.article_id
    FROM citation_observations o
    WHERE o.client_id = $1
    UNION ALL
    SELECT COALESCE(a.url, u.url), d.domain, r.run_date, 'llm_run', 1, u.article_id
    FROM cited_urls u
    JOIN llm_runs r      ON r.id = u.run_id
    JOIN cited_domains d ON d.id = u.domain_id
    LEFT JOIN articles a ON a.id = u.article_id
    WHERE r.client_id = $1
  )`;

export async function emergingAuthors(clientId, days, limit = 25) {
  return q(`
    WITH ${OBS_CTE}
    SELECT j.id, j.name, mo.name AS outlet, mo.domain_authority::int AS da,
           MIN(obs.seen_on)::text AS first_seen,
           COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0)::int AS recent,
           COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on <  CURRENT_DATE - $2::int
                                              AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0)::int AS prior,
           ARRAY_AGG(DISTINCT obs.source) AS sources,
           (MIN(obs.seen_on) >= CURRENT_DATE - $2::int) AS is_new,
           (ml.id IS NOT NULL) AS in_media_list
    FROM obs
    JOIN articles a ON a.id = obs.article_id AND a.journalist_id IS NOT NULL
    JOIN journalists j ON j.id = a.journalist_id
    LEFT JOIN media_outlets mo ON mo.id = j.outlet_id
    LEFT JOIN media_list_entries ml ON ml.journalist_id = j.id AND ml.client_id = $1
    GROUP BY j.id, j.name, mo.name, mo.domain_authority, ml.id
    HAVING COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) > 0
       AND ( MIN(obs.seen_on) >= CURRENT_DATE - $2::int
          OR ( COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) >= 3
           AND COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0)
               >= 2 * COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on < CURRENT_DATE - $2::int
                                                         AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0) ) )
    ORDER BY (COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) + 1.0)
           / (COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on < CURRENT_DATE - $2::int
                                                 AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0) + 1.0) DESC,
             recent DESC
    LIMIT $3`,
    [intParam(clientId, "clientId"), intParam(days, "days"), intParam(limit, "limit")]);
}

export async function emergingTopics(clientId, days, limit = 20) {
  return q(`
    WITH ${OBS_CTE}
    SELECT t.id, t.name,
           MIN(obs.seen_on)::text AS first_seen,
           COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0)::int AS recent,
           COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on <  CURRENT_DATE - $2::int
                                              AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0)::int AS prior,
           COUNT(DISTINCT obs.url)::int AS urls,
           (ARRAY_AGG(DISTINCT obs.url))[1:3] AS examples,
           ARRAY_AGG(DISTINCT obs.source) AS sources,
           (MIN(obs.seen_on) >= CURRENT_DATE - $2::int) AS is_new
    FROM obs
    JOIN url_topics ut ON ut.client_id = $1 AND ut.url = obs.url
    JOIN topics t ON t.id = ut.topic_id
    GROUP BY t.id, t.name
    HAVING COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) > 0
       AND ( MIN(obs.seen_on) >= CURRENT_DATE - $2::int
          OR ( COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) >= 3
           AND COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0)
               >= 2 * COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on < CURRENT_DATE - $2::int
                                                         AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0) ) )
    ORDER BY (COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on >= CURRENT_DATE - $2::int), 0) + 1.0)
           / (COALESCE(SUM(obs.weight) FILTER (WHERE obs.seen_on < CURRENT_DATE - $2::int
                                                 AND obs.seen_on >= CURRENT_DATE - 2 * $2::int), 0) + 1.0) DESC,
             recent DESC
    LIMIT $3`,
    [intParam(clientId, "clientId"), intParam(days, "days"), intParam(limit, "limit")]);
}

// Weekly weight per topic for the trend chart — top 6 topics by total
// weight over the recent + prior windows.
export async function topicWeeklyTrend(clientId, days) {
  return q(`
    WITH ${OBS_CTE},
    tw AS (
      SELECT t.name AS topic, date_trunc('week', obs.seen_on)::date AS week,
             SUM(obs.weight)::int AS weight
      FROM obs
      JOIN url_topics ut ON ut.client_id = $1 AND ut.url = obs.url
      JOIN topics t ON t.id = ut.topic_id
      WHERE obs.seen_on >= CURRENT_DATE - 2 * $2::int
      GROUP BY t.name, date_trunc('week', obs.seen_on)
    ),
    top AS (SELECT topic FROM tw GROUP BY topic ORDER BY SUM(weight) DESC LIMIT 6)
    SELECT tw.topic, tw.week::text AS week, tw.weight
    FROM tw JOIN top USING (topic)
    ORDER BY tw.week, tw.topic`,
    [intParam(clientId, "clientId"), intParam(days, "days")]);
}

// Freshness / empty-state banner for the Emerging tab.
export async function observationSummary(clientId) {
  const [row] = await q(`
    SELECT
      COALESCE(i.tavily_enabled, FALSE)   AS tavily_enabled,
      COALESCE(i.profound_enabled, FALSE) AS profound_enabled,
      (SELECT COUNT(*)::int FROM citation_observations WHERE client_id = $1 AND source = 'tavily')   AS tavily_count,
      (SELECT MAX(observed_at)::text FROM citation_observations WHERE client_id = $1 AND source = 'tavily')   AS tavily_last,
      (SELECT COUNT(*)::int FROM citation_observations WHERE client_id = $1 AND source = 'profound') AS profound_count,
      (SELECT MAX(observed_at)::text FROM citation_observations WHERE client_id = $1 AND source = 'profound') AS profound_last,
      (SELECT COUNT(*)::int FROM cited_urls u JOIN llm_runs r ON r.id = u.run_id WHERE r.client_id = $1) AS internal_count,
      (SELECT MAX(run_date)::text FROM llm_runs WHERE client_id = $1) AS internal_last,
      (SELECT COUNT(*)::int FROM citation_observations WHERE client_id = $1 AND article_id IS NULL) AS pending_enrichment,
      (SELECT COUNT(DISTINCT o.url)::int FROM citation_observations o
       WHERE o.client_id = $1
         AND NOT EXISTS (SELECT 1 FROM url_topics t WHERE t.client_id = $1 AND t.url = o.url)) AS pending_tagging
    FROM clients c
    LEFT JOIN client_integrations i ON i.client_id = c.id
    WHERE c.id = $1`, [Number(clientId)]);
  return row ?? null;
}
