import { q } from "./db";

// Shared filter fragment builders. engine: 'all'|'chatgpt'|'gemini'|'claude'
// days: number | 'all'  (window ending at the latest run_date in the DB)
function windowClause(days) {
  return days === "all"
    ? "TRUE"
    : `r.run_date >= (SELECT MAX(run_date) FROM llm_runs) - INTERVAL '${Number(days)} days'`;
}
const engineClause = (engine) =>
  engine === "all" ? "TRUE" : `r.engine = '${engine.replace(/[^a-z]/g, "")}'`;

// ---------- 1. Visibility ----------------------------------------

export async function visibilityMatrix(days) {
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${windowClause(days)})
    SELECT b.name AS brand, b.role, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM brands b
    CROSS JOIN runs r
    LEFT JOIN brand_mentions bm ON bm.run_id = r.id AND bm.brand_id = b.id
    WHERE b.role IN ('target','competitor')
    GROUP BY b.name, b.role, r.engine
    ORDER BY b.role = 'target' DESC, 4 DESC`);
}

export async function visibilityTrend(days, brand) {
  return q(`
    WITH runs AS (SELECT id, engine, run_date FROM llm_runs r WHERE ${windowClause(days)})
    SELECT r.run_date::text AS date, r.engine::text AS engine,
           ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF(COUNT(DISTINCT r.id),0), 1)::float AS visibility
    FROM runs r
    LEFT JOIN brand_mentions bm
      ON bm.run_id = r.id
     AND bm.brand_id = (SELECT id FROM brands WHERE name = $1)
    GROUP BY r.run_date, r.engine ORDER BY r.run_date`, [brand]);
}

// ---------- 2. Media strategy + SOV -------------------------------

export async function mediaStrategy(days, engine) {
  return q(`
    SELECT r.run_date::text AS date, d.media_type::text AS media_type, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN llm_runs r ON r.id = u.run_id
    JOIN cited_domains d ON d.id = u.domain_id
    WHERE ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY r.run_date, d.media_type ORDER BY r.run_date`);
}

export async function shareOfVoice(days, engine) {
  return q(`
    SELECT b.name AS brand, b.role, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN brands b ON b.id = bm.brand_id
    JOIN llm_runs r ON r.id = bm.run_id
    WHERE b.role IN ('target','competitor') AND ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY b.name, b.role ORDER BY mentions DESC`);
}

// ---------- 3. Keyword SOV + sentiment ----------------------------

export async function keywordShareOfVoice(days, engine, brand) {
  return q(`
    SELECT k.name AS keyword, SUM(bm.mention_count)::int AS mentions,
           ROUND(100.0 * SUM(bm.mention_count) / NULLIF(SUM(SUM(bm.mention_count)) OVER (),0), 1)::float AS pct
    FROM brand_mentions bm
    JOIN llm_runs r ON r.id = bm.run_id
    JOIN prompts p ON p.id = r.prompt_id
    JOIN keyword_categories k ON k.id = p.keyword_category_id
    WHERE bm.brand_id = (SELECT id FROM brands WHERE name = $1)
      AND ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY k.name ORDER BY mentions DESC`, [brand]);
}

export async function sentimentOverTime(days, engine, brand) {
  return q(`
    SELECT r.run_date::text AS date,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='positive') / COUNT(*), 1)::float AS positive,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='neutral')  / COUNT(*), 1)::float AS neutral,
           ROUND(100.0 * COUNT(*) FILTER (WHERE s.label='negative') / COUNT(*), 1)::float AS negative
    FROM sentiment_scores s
    JOIN llm_runs r ON r.id = s.run_id
    WHERE s.brand_id = (SELECT id FROM brands WHERE name = $1)
      AND ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY r.run_date ORDER BY r.run_date`, [brand]);
}

// ---------- 4. Key terms + org mentions ---------------------------

export async function topKeyTerms(days, engine, limit = 28) {
  return q(`
    SELECT t.term, SUM(t.freq)::int AS freq
    FROM key_terms t
    JOIN llm_runs r ON r.id = t.run_id
    WHERE ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY t.term ORDER BY freq DESC LIMIT $1`, [limit]);
}

export async function orgMentions(days, engine) {
  return q(`
    WITH m AS (
      SELECT b.name, b.role, SUM(bm.mention_count)::int AS mentions
      FROM brand_mentions bm
      JOIN brands b ON b.id = bm.brand_id
      JOIN llm_runs r ON r.id = bm.run_id
      WHERE ${windowClause(days)} AND ${engineClause(engine)}
      GROUP BY b.name, b.role)
    SELECT name, role::text AS role, mentions,
           ROUND(100.0 * mentions / NULLIF(SUM(mentions) OVER (),0), 1)::float AS pct
    FROM m ORDER BY mentions DESC`);
}

// ---------- 5. Domain / URL citation analytics --------------------

export async function topDomains(days, engine, limit = 15) {
  return q(`
    SELECT d.domain, d.media_type::text AS media_type,
           COUNT(*)::int AS citations, COUNT(DISTINCT u.url)::int AS unique_urls
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY d.domain, d.media_type ORDER BY citations DESC LIMIT $1`, [limit]);
}

export async function topOwnedUrls(days, engine, brand, limit = 10) {
  return q(`
    SELECT u.url, COUNT(*)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE d.owned_by_brand_id = (SELECT id FROM brands WHERE name = $1)
      AND ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY u.url ORDER BY citations DESC LIMIT $2`, [brand, limit]);
}

// ---------- 6. PR & journalist intelligence -----------------------

export async function topOutlets(days, engine, limit = 12) {
  return q(`
    SELECT o.name AS outlet, o.domain, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations
    FROM cited_urls u
    JOIN cited_domains d ON d.id = u.domain_id
    JOIN media_outlets o ON o.id = d.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    WHERE ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY o.name, o.domain, o.domain_authority ORDER BY citations DESC LIMIT $1`, [limit]);
}

export async function topJournalists(days, engine, limit = 12) {
  return q(`
    SELECT j.id, j.name, o.name AS outlet, o.domain_authority::int AS da,
           COUNT(u.id)::int AS citations,
           (ml.id IS NOT NULL) AS in_media_list
    FROM cited_urls u
    JOIN journalists j ON j.id = u.journalist_id
    JOIN media_outlets o ON o.id = j.outlet_id
    JOIN llm_runs r ON r.id = u.run_id
    LEFT JOIN media_list_entries ml ON ml.journalist_id = j.id
    WHERE ${windowClause(days)} AND ${engineClause(engine)}
    GROUP BY j.id, j.name, o.name, o.domain_authority, ml.id
    ORDER BY citations DESC LIMIT $1`, [limit]);
}

// ---------- KPI row -----------------------------------------------

export async function kpis(days, brand) {
  const [vis] = await q(`
    WITH runs AS (SELECT id FROM llm_runs r WHERE ${windowClause(days)})
    SELECT ROUND(100.0 * COUNT(DISTINCT bm.run_id) / NULLIF((SELECT COUNT(*) FROM runs),0),1)::float AS visibility
    FROM brand_mentions bm
    WHERE bm.brand_id=(SELECT id FROM brands WHERE name=$1) AND bm.run_id IN (SELECT id FROM runs)`, [brand]);
  const sov = await shareOfVoice(days, "all");
  const target = sov.find((s) => s.brand === brand);
  const [cites] = await q(`
    SELECT COUNT(*)::int AS n FROM cited_urls u JOIN llm_runs r ON r.id=u.run_id WHERE ${windowClause(days)}`);
  const [sent] = await q(`
    SELECT ROUND(100.0*COUNT(*) FILTER (WHERE label='positive')/NULLIF(COUNT(*),0),1)::float AS pos
    FROM sentiment_scores s JOIN llm_runs r ON r.id=s.run_id
    WHERE s.brand_id=(SELECT id FROM brands WHERE name=$1) AND ${windowClause(days)}`, [brand]);
  return {
    visibility: vis?.visibility ?? 0,
    sov: target?.pct ?? 0,
    citations: cites?.n ?? 0,
    positive: sent?.pos ?? 0,
  };
}

export const TARGET = "POLYWOOD";
