import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { getClientBySlug, facetsForClient } from "@/lib/queries";

// Intent fan-out templates. Deterministic and template-based; a future
// upgrade can swap in a Claude API call for richer phrasing without
// changing the storage contract (prompts with source='fanout').
function buildFanout(kw, target, competitors) {
  const prompts = [
    { intent: "informational", text: `How do I choose the right ${kw}?` },
    { intent: "informational", text: `What should I know before buying ${kw}?` },
    { intent: "informational", text: `What are common mistakes people make when choosing ${kw}?` },
    { intent: "commercial", text: `What are the best ${kw} brands?` },
    { intent: "commercial", text: `Which ${kw} do experts recommend this year?` },
    { intent: "commercial", text: `What are the top-rated ${kw} for the money?` },
    { intent: "transactional", text: `Where is the best place to buy ${kw}?` },
    { intent: "transactional", text: `Are ${kw} worth the price?` },
  ];
  if (target) {
    prompts.push({ intent: "comparison", text: `What are the best alternatives to ${target} for ${kw}?` });
    if (competitors[0]) {
      prompts.push({ intent: "comparison", text: `${target} vs ${competitors[0]}: which ${kw} is better?` });
    }
  }
  return prompts;
}

export async function POST(req, { params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const { keyword } = await req.json();
  const kw = String(keyword ?? "").trim().toLowerCase();
  if (kw.length < 3 || kw.length > 80) {
    return NextResponse.json({ error: "Keyword must be 3–80 characters" }, { status: 400 });
  }

  const competitors = (await q(
    `SELECT name FROM brands WHERE client_id = $1 AND role = 'competitor'
     ORDER BY sort_order LIMIT 2`, [client.id])).map((r) => r.name);
  const facets = await facetsForClient(client.id);

  // classify each generated prompt's facet with the client's own rules
  const facetFor = (text) => {
    for (const f of facets) {
      try {
        if (new RegExp(f.pattern, "i").test(text)) return f.id;
      } catch { /* python-only pattern syntax — skip */ }
    }
    return null;
  };

  // fallback keyword category = the client's catch-all rule target
  const [{ keyword_category_id: fallbackCat } = {}] = await q(
    `SELECT keyword_category_id FROM keyword_rules
     WHERE client_id = $1 ORDER BY position DESC LIMIT 1`, [client.id]);

  const created = [];
  let skipped = 0;
  for (const p of buildFanout(kw, client.target_brand, competitors)) {
    const rows = await q(
      `INSERT INTO prompts (client_id, text, keyword_category_id, intent, facet_id, source, active)
       VALUES ($1, $2, $3, $4, $5, 'fanout', TRUE)
       ON CONFLICT (client_id, text) DO NOTHING
       RETURNING id`,
      [client.id, p.text, fallbackCat ?? null, p.intent, facetFor(p.text)]);
    if (rows.length) created.push(p);
    else skipped++;
  }

  return NextResponse.json({ keyword: kw, created, skipped });
}
