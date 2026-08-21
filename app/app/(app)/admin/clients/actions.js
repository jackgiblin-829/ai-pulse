"use server";

import { redirect } from "next/navigation";
import { pool } from "@/lib/db";
import { requireAdmin } from "@/lib/auth";
import { reclassifyClientPrompts } from "@/lib/classifyPrompt";

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,48}$/;

function bad(error) {
  return { error };
}

function parseList(s) {
  return String(s ?? "")
    .split(/[\n,]/)
    .map((x) => x.trim())
    .filter(Boolean);
}

// payload (JSON from ClientForm):
// { id?, slug, name, target: {name, aliases, owned_domains},
//   competitors: [{name, aliases, owned_domains}],
//   ecosystem: [{name, aliases}],
//   categories: [name], fallback_category: name,
//   rules: [{pattern, category}], vocab: [term],
//   tracking_cadence: 'daily'|'weekly',
//   integrations: {tavily_enabled, profound_enabled, profound_org_id, profound_category} }
export async function saveClient(prevState, formData) {
  await requireAdmin();
  let p;
  try {
    p = JSON.parse(String(formData.get("payload")));
  } catch {
    return bad("Malformed form payload");
  }

  const slug = String(p.slug ?? "").trim().toLowerCase();
  const name = String(p.name ?? "").trim();
  if (!SLUG_RE.test(slug)) return bad("Slug must be lowercase letters, digits, dashes (2–49 chars)");
  if (!name) return bad("Client name is required");
  if (!p.target?.name?.trim()) return bad("Target brand name is required");

  const categories = (p.categories ?? []).map((c) => c.trim()).filter(Boolean);
  if (!categories.length) return bad("At least one keyword category is required");
  const fallback = p.fallback_category?.trim() || categories[0];
  if (!categories.includes(fallback)) return bad("Fallback category must be one of the categories");

  const cadence = ["daily", "weekly"].includes(p.tracking_cadence) ? p.tracking_cadence : "weekly";
  const integrations = {
    tavily_enabled: Boolean(p.integrations?.tavily_enabled),
    profound_enabled: Boolean(p.integrations?.profound_enabled),
    profound_org_id: String(p.integrations?.profound_org_id ?? "").trim(),
    profound_category: String(p.integrations?.profound_category ?? "").trim(),
  };
  if (integrations.profound_enabled && !integrations.profound_category)
    return bad("Profound category ID is required when Profound is enabled");

  const rules = (p.rules ?? []).filter((r) => r.pattern?.trim() && r.category?.trim());
  for (const r of rules) {
    if (!categories.includes(r.category)) return bad(`Rule category "${r.category}" is not in the category list`);
    try {
      new RegExp(r.pattern); // approximate — pipeline compiles with Python re
    } catch {
      return bad(`Invalid regex: ${r.pattern}`);
    }
  }

  const brandRows = [
    { ...p.target, role: "target" },
    ...(p.competitors ?? [])
      .filter((c) => c.name?.trim())
      .map((c) => ({ ...c, role: "competitor" })),
  ];

  const conn = await pool.connect();
  try {
    await conn.query("BEGIN");
    let clientId = p.id ? Number(p.id) : null;
    if (clientId) {
      const { rowCount } = await conn.query(
        "UPDATE clients SET slug=$1, name=$2, tracking_cadence=$3, updated_at=now() WHERE id=$4",
        [slug, name, cadence, clientId]);
      if (!rowCount) throw new Error("Client not found");
    } else {
      const { rows } = await conn.query(
        "INSERT INTO clients (slug, name, tracking_cadence) VALUES ($1,$2,$3) RETURNING id",
        [slug, name, cadence]);
      clientId = rows[0].id;
    }

    // External integration config (Emerging tab data sources).
    await conn.query(
      `INSERT INTO client_integrations
         (client_id, tavily_enabled, profound_enabled, profound_org_id, profound_category, updated_at)
       VALUES ($1,$2,$3,$4,$5,now())
       ON CONFLICT (client_id) DO UPDATE SET
         tavily_enabled=EXCLUDED.tavily_enabled, profound_enabled=EXCLUDED.profound_enabled,
         profound_org_id=EXCLUDED.profound_org_id, profound_category=EXCLUDED.profound_category,
         updated_at=now()`,
      [clientId, integrations.tavily_enabled, integrations.profound_enabled,
       integrations.profound_org_id || null, integrations.profound_category || null]);

    // Categories: upsert, keep ids stable (prompts reference them).
    const catIds = {};
    for (const c of categories) {
      const { rows } = await conn.query(
        `INSERT INTO keyword_categories (client_id, name) VALUES ($1,$2)
         ON CONFLICT (client_id, name) DO UPDATE SET name=EXCLUDED.name RETURNING id`,
        [clientId, c]);
      catIds[c] = rows[0].id;
    }

    // Rules: replace wholesale; server appends the '.*' catch-all.
    await conn.query("DELETE FROM keyword_rules WHERE client_id=$1", [clientId]);
    const finalRules = [...rules.filter((r) => r.pattern !== ".*"), { pattern: ".*", category: fallback }];
    for (let i = 0; i < finalRules.length; i++) {
      await conn.query(
        `INSERT INTO keyword_rules (client_id, position, pattern, keyword_category_id)
         VALUES ($1,$2,$3,$4)`,
        [clientId, i, finalRules[i].pattern, catIds[finalRules[i].category]]);
    }

    // Tracked brands: upsert with sort_order (order drives palette slots).
    for (let i = 0; i < brandRows.length; i++) {
      const b = brandRows[i];
      const aliases = parseList(b.aliases);
      await conn.query(
        `INSERT INTO brands (client_id, name, role, aliases, owned_domains, sort_order)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (client_id, name) DO UPDATE SET role=EXCLUDED.role,
           aliases=EXCLUDED.aliases, owned_domains=EXCLUDED.owned_domains,
           sort_order=EXCLUDED.sort_order`,
        [clientId, b.name.trim(), b.role, aliases.length ? aliases : [b.name.trim()],
         parseList(b.owned_domains), i]);
    }
    // Ecosystem orgs.
    for (const o of (p.ecosystem ?? []).filter((o) => o.name?.trim())) {
      const aliases = parseList(o.aliases);
      await conn.query(
        `INSERT INTO brands (client_id, name, role, aliases)
         VALUES ($1,$2,'ecosystem',$3)
         ON CONFLICT (client_id, name) DO UPDATE SET aliases=EXCLUDED.aliases`,
        [clientId, o.name.trim(), aliases.length ? aliases : [o.name.trim()]]);
    }

    // Facets: upsert by name, then drop removed ones (prompts.facet_id
    // is ON DELETE SET NULL, so upserting preserves classifications).
    const facetRows = (p.facets ?? []).filter((f) => f.name?.trim() && f.pattern?.trim());
    for (const f of facetRows) {
      try {
        new RegExp(f.pattern);
      } catch {
        throw new Error(`Invalid facet regex: ${f.pattern}`);
      }
    }
    for (let i = 0; i < facetRows.length; i++) {
      await conn.query(
        `INSERT INTO facets (client_id, name, pattern, position) VALUES ($1,$2,$3,$4)
         ON CONFLICT (client_id, name) DO UPDATE SET pattern=EXCLUDED.pattern,
           position=EXCLUDED.position`,
        [clientId, facetRows[i].name.trim(), facetRows[i].pattern.trim(), i]);
    }
    await conn.query(
      `DELETE FROM facets WHERE client_id=$1 AND NOT (name = ANY($2::text[]))`,
      [clientId, facetRows.map((f) => f.name.trim())]);

    // Vocab: replace wholesale.
    await conn.query("DELETE FROM key_term_vocab WHERE client_id=$1", [clientId]);
    for (const term of (p.vocab ?? []).map((t) => t.trim()).filter(Boolean)) {
      await conn.query(
        `INSERT INTO key_term_vocab (client_id, term) VALUES ($1,$2)
         ON CONFLICT (client_id, term) DO NOTHING`, [clientId, term]);
    }

    // New/changed facets and keyword rules apply to the existing prompt
    // library immediately, not just on the next ingest.
    await reclassifyClientPrompts((text, params) => conn.query(text, params), clientId);

    await conn.query("COMMIT");
  } catch (e) {
    await conn.query("ROLLBACK");
    if (e.code === "23505" && String(e.constraint).includes("clients_slug"))
      return bad(`Slug "${slug}" is already taken`);
    return bad(e.message ?? "Save failed");
  } finally {
    conn.release();
  }
  redirect("/admin/clients");
}

export async function deleteClient(prevState, formData) {
  await requireAdmin();
  const id = Number(formData.get("id"));
  if (!Number.isInteger(id)) return bad("Bad id");
  await pool.query("DELETE FROM clients WHERE id=$1", [id]); // cascades
  redirect("/admin/clients");
}
