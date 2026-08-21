import { q } from "./db";

// Read a client's full config into the ClientForm payload shape.
export async function loadClientConfig(id) {
  const [client] = await q(
    "SELECT id, slug, name, tracking_cadence::text AS tracking_cadence FROM clients WHERE id = $1",
    [Number(id)]);
  if (!client) return null;

  const [integrations] = await q(
    `SELECT tavily_enabled, profound_enabled,
            COALESCE(profound_org_id, '') AS profound_org_id,
            COALESCE(profound_category, '') AS profound_category
     FROM client_integrations WHERE client_id = $1`, [client.id]);

  const brands = await q(
    `SELECT name, role::text AS role, aliases, owned_domains FROM brands
     WHERE client_id = $1 ORDER BY sort_order, id`, [client.id]);
  const categories = await q(
    "SELECT id, name FROM keyword_categories WHERE client_id = $1 ORDER BY id", [client.id]);
  const rules = await q(
    `SELECT r.pattern, k.name AS category FROM keyword_rules r
     JOIN keyword_categories k ON k.id = r.keyword_category_id
     WHERE r.client_id = $1 ORDER BY r.position`, [client.id]);
  const vocab = await q(
    "SELECT term FROM key_term_vocab WHERE client_id = $1 ORDER BY id", [client.id]);
  const facets = await q(
    "SELECT name, pattern FROM facets WHERE client_id = $1 ORDER BY position, id", [client.id]);

  const asRow = (b) => ({
    name: b.name,
    aliases: (b.aliases ?? []).join(", "),
    owned_domains: (b.owned_domains ?? []).join(", "),
  });
  const target = brands.find((b) => b.role === "target");
  const catchAll = rules.find((r) => r.pattern === ".*");

  return {
    id: client.id,
    slug: client.slug,
    name: client.name,
    target: target ? asRow(target) : { name: "", aliases: "", owned_domains: "" },
    competitors: brands.filter((b) => b.role === "competitor").map(asRow),
    ecosystem: brands
      .filter((b) => b.role === "ecosystem")
      .map((b) => ({ name: b.name, aliases: (b.aliases ?? []).join(", ") })),
    categories: categories.map((c) => c.name),
    fallback_category: catchAll?.category ?? categories[0]?.name ?? "",
    rules: rules.filter((r) => r.pattern !== ".*"),
    vocab: vocab.map((v) => v.term),
    facets,
    tracking_cadence: client.tracking_cadence,
    integrations: integrations ?? {
      tavily_enabled: false,
      profound_enabled: false,
      profound_org_id: "",
      profound_category: "",
    },
  };
}

export async function adminClientList() {
  return q(`
    SELECT c.id, c.slug, c.name, c.tracking_cadence::text AS tracking_cadence, b.name AS target_brand,
           (SELECT COUNT(*)::int FROM brands WHERE client_id = c.id AND role = 'competitor') AS competitors,
           (SELECT MAX(run_date)::text FROM llm_runs WHERE client_id = c.id) AS last_run
    FROM clients c
    LEFT JOIN brands b ON b.client_id = c.id AND b.role = 'target'
    ORDER BY c.name`);
}
