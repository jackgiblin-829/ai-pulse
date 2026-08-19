import { q } from "./db";

// Shared filter fragment builders. Every widget query takes a filter
// object f = { clientId, engine, range }:
//   clientId: int (validated via Number())
//   engine:   'all'|'chatgpt'|'gemini'|'claude'
//   range:    { kind:'days', days } — relative to the client's latest
//             run_date — or { kind:'custom', from, to } (absolute,
//             regex-validated YYYY-MM-DD in lib/dates.js)
function windowClause(f) {
  const cid = Number(f.clientId);
  const client = `r.client_id = ${cid}`;
  const r = f.range;
  if (r.kind === "custom") {
    return `${client} AND r.run_date BETWEEN '${r.from}' AND '${r.to}'`;
  }
  if (r.days === "all") return client;
  return `${client} AND r.run_date >= (SELECT MAX(run_date) FROM llm_runs WHERE client_id = ${cid}) - INTERVAL '${Number(r.days)} days'`;
}
const engineClause = (f) =>
  f.engine === "all" ? "TRUE" : `r.engine = '${f.engine.replace(/[^a-z]/g, "")}'`;
const brandSub = (f, n) =>
  `(SELECT id FROM brands WHERE client_id = ${Number(f.clientId)} AND name = $${n})`;

// ---------- Clients ------------------------------------------------

export async function getClientBySlug(slug) {
  const [client] = await q(
    `SELECT c.id, c.slug, c.name, b.name AS target_brand
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
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${windowClause(f)})
    SELECT b.name AS brand, b.role, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM brands b
    CROSS JOIN runs r
    LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
    WHERE b.client_id = ${Number(f.clientId)} AND b.role IN ('target','competitor')
    GROUP BY b.name, b.role, r.engine
    ORDER BY b.role = 'target' DESC, 4 DESC`);
}

export async function visibilityTrend(f, brand) {
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${windowClause(f)})
    SELECT r.run_date::text AS date, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM runs r
    LEFT JOIN brand_mentions bm
      ON bm.run_id = r.id
     AND bm.brand_id = ${brandSub(f, 1)}
    GROUP BY r.run_date, r.engine ORDER BY r.run_date`, [brand]);
}

// ---------- 2. Media strategy + SOV -------------------------------

export async function mediaStrategy(f) {
  return q(`
    SELECT r.run_date::text AS date, d.media_type::text AS media_type, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN llm_runs r ON r.id = u.run_id
    JOIN cited_domains d ON d.id = u.domain_id
    WHERE ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY r.run_date, d.media_type ORDER BY r.run_date`);
}

export async function shareOfVoice(f) {
  return q(`
    SELECT b.name AS brand, b.role, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN brands b ON b.id = bm.brand_id
    JOIN llm_runs r ON r.id = bm.run_id
    WHERE b.role IN ('target','competitor') AND ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY b.name, b.role ORDER BY mentions DESC`);
}

// ---------- 3. Keyword SOV + sentiment ----------------------------

export async function keywordShareOfVoice(f, brand) {
  return q(`
    SELECT k.name AS keyword, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN llm_runs r ON r.id = bm.run_id
    JOIN prompts p ON p.id = r.prompt_id
    JOIN keyword_categories k ON k.id = p.keyword_category_id
    WHERE bm.brand_id = ${brandSub(f, 1)}
      AND ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY k.name ORDER BY mentions DESC`, [brand]);
}

export async function sentimentOverTime(f, brand) {
  return q(`
    SELECT r.run_date::text AS date,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='positive') / COUNT(*), 1)::float AS positive,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='neutral')  / COUNT(*), 1)::float AS neutral,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='negative') / COUNT(*), 1)::float AS negative
    FROM sentiment_scores s
    JOIN llm_runs r ON r.id = s.run_id
    WHERE s.brand_id = ${brandSub(f, 1)}
      AND ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY r.run_date ORDER BY r.run_date`, [brand]);
}

// ---------- 4. Key terms + org mentions ---------------------------

export async function topKeyTerms(f, limit = 28) {
  return q(`
    SELECT t.term, SUM(t.freq)::int AS freq
    FROM key_terms t
    JOIN llm_runs r ON r.id = t.run_id
    WHERE ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY t.term ORDER BY freq DESC LIMIT $1`, [limit]);
}

export async function orgMentions(f) {
  return q(`
    WITH m AS (
      SELECT b.name, b.role, SUM(bm.mention_count)::int AS mentions
      FROM brand_mentions bm
      JOIN brands b ON b.id = bm.brand_id
      JOIN llm_runs r ON r.id = bm.run_id
      WHERE ${windowClause(f)} AND ${engineClause(f)}
      GROUP BY b.name, b.role)
    SELECT name, role::text AS role, mentions,
           ROUND(100.0 * mentions / NULLIF(SUM(mentions) OVER (),0), 1)::float AS pct
    FROM m ORDER BY mentions DESC`);
}

// ---------- 5. Domain / URL citation analytics --------------------

export async function topDomains(f, limit = 15) {
  return q(`
    SELECT d.domain, d.media_type::text AS media_type,
           COUNT(*)::int AS citations, COUNT(DISTINCT u.url)::int AS unique_urls
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY d.domain, d.media_type ORDER BY citations DESC LIMIT $1`, [limit]);
}

export async function topOwnedUrls(f, brand, limit = 10) {
  return q(`
    SELECT u.url, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE d.owned_by_brand_id = ${brandSub(f, 1)}
      AND ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY u.url ORDER BY citations DESC LIMIT $2`, [brand, limit]);
}

// ---------- 6. PR & journalist intelligence -----------------------

export async function topOutlets(f, limit = 12) {
  return q(`
    SELECT o.name AS outlet, o.domain, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN media_outlets o ON o.id = d.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY o.name, o.domain, o.domain_authority ORDER BY citations DESC LIMIT $1`, [limit]);
}

export async function topJournalists(f, limit = 12) {
  return q(`
    SELECT j.id, j.name, o.name AS outlet, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations,
           (ml.id IS NOT NULL) AS in_media_list
    FROM cited_urls u
    JOIN journalists j ON j.id = u.journalist_id
    JOIN media_outlets o ON o.id = j.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    LEFT JOIN media_list_entries ml
      ON ml.journalist_id = j.id AND ml.client_id = ${Number(f.clientId)}
    WHERE ${windowClause(f)} AND ${engineClause(f)}
    GROUP BY j.id, j.name, o.name, o.domain_authority, ml.id
    ORDER BY citations DESC LIMIT $1`, [limit]);
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

// ---------- KPI row -----------------------------------------------

export async function kpis(f, brand) {
  const [vis] = await q(`
    WITH runs AS (SELECT id FROM llm_runs r WHERE ${windowClause(f)})
    SELECT ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF((SELECT COUNT(*) FROM runs),0),1)::float AS visibility
    FROM brand_mentions bm
    WHERE bm.brand_id=${brandSub(f, 1)} AND bm.run_id IN (SELECT id FROM runs)`, [brand]);
  const sov = await shareOfVoice({ ...f, engine: "all" });
  const target = sov.find((s) => s.brand === brand);
  const [cites] = await q(`
    SELECT COUNT(*)::int AS n FROM cited_urls u JOIN llm_runs r ON r.id=u.run_id WHERE ${windowClause(f)}`);
  const [sent] = await q(`
    SELECT ROUND(100.0*COUNT(*) FILTER (WHERE label='positive')/NULLIF(COUNT(*),0),1)::float AS pos
    FROM sentiment_scores s JOIN llm_runs r ON r.id=s.run_id
    WHERE s.brand_id=${brandSub(f, 1)} AND ${windowClause(f)}`, [brand]);
  return {
    visibility: vis?.visibility ?? 0,
    sov: target?.pct ?? 0,
    citations: cites?.n ?? 0,
    positive: sent?.pos ?? 0,
  };
}
