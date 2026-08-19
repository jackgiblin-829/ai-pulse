import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { q } from "@/lib/db";
import { getClientBySlug, facetsForClient } from "@/lib/queries";

// Template fallback — number-agnostic phrasing so plural and singular
// keywords both read naturally. Used when ANTHROPIC_API_KEY is unset
// or the generation call fails.
function templateFanout(kw, target, competitors) {
  const prompts = [
    { intent: "informational", text: `How do I choose the right option when shopping for ${kw}?` },
    { intent: "informational", text: `What should I know before spending money on ${kw}?` },
    { intent: "informational", text: `What are common mistakes people make when shopping for ${kw}?` },
    { intent: "commercial", text: `What are the best brands for ${kw}?` },
    { intent: "commercial", text: `What do experts recommend for ${kw} this year?` },
    { intent: "commercial", text: `What are the top-rated options for ${kw}?` },
    { intent: "transactional", text: `Where is the best place to buy ${kw}?` },
    { intent: "transactional", text: `Is it worth paying more for ${kw}?` },
  ];
  if (target) {
    prompts.push({ intent: "comparison", text: `What are the best alternatives to ${target} for ${kw}?` });
    if (competitors[0]) {
      prompts.push({ intent: "comparison", text: `${target} or ${competitors[0]} — which is better for ${kw}?` });
    }
  }
  return prompts;
}

const FanoutSchema = z.object({
  prompts: z.array(
    z.object({
      intent: z.enum(["informational", "commercial", "comparison", "transactional"]),
      text: z.string(),
    })
  ),
});

// Claude-generated fan-out: natural buyer phrasing across all four
// intents, grammatical for singular and plural keywords alike.
async function claudeFanout(kw, target, competitors) {
  const client = new Anthropic();
  const response = await client.messages.parse({
    model: "claude-opus-5",
    max_tokens: 2048,
    output_config: { effort: "low", format: zodOutputFormat(FanoutSchema) },
    system:
      "You generate realistic buyer questions people ask AI assistants. " +
      "Questions must be grammatical, natural, and phrased the way real " +
      "shoppers talk — never template-stiff.",
    messages: [
      {
        role: "user",
        content:
          `Keyword: "${kw}"\n` +
          (target ? `Target brand: ${target}\n` : "") +
          (competitors.length ? `Competitors: ${competitors.join(", ")}\n` : "") +
          "Generate exactly 10 distinct questions about this keyword: " +
          "3 informational (how/what to know), 3 commercial (best/recommendations), " +
          "2 transactional (where to buy / worth the price), and 2 comparison " +
          "(target brand vs a competitor, and alternatives to the target brand).",
      },
    ],
  });
  const parsed = response.parsed_output;
  if (!parsed?.prompts?.length) throw new Error("empty fanout");
  return parsed.prompts.slice(0, 12).map((p) => ({ intent: p.intent, text: p.text.trim() }));
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
  const rules = await q(
    `SELECT pattern, keyword_category_id FROM keyword_rules
     WHERE client_id = $1 ORDER BY position`, [client.id]);

  // Classify with the client's own rule sets (same first-match semantics
  // as the pipeline; JS RegExp — python-only syntax is skipped).
  const matchRules = (text, ruleset, key) => {
    for (const r of ruleset) {
      try {
        if (new RegExp(r.pattern, "i").test(text)) return r[key];
      } catch { /* skip non-portable pattern */ }
    }
    return null;
  };
  const categoryFor = (text) =>
    matchRules(text, rules, "keyword_category_id") ??
    rules[rules.length - 1]?.keyword_category_id ?? null;
  const facetFor = (text) => matchRules(text, facets, "id");

  let generated;
  let generator = "templates";
  if (process.env.ANTHROPIC_API_KEY) {
    try {
      generated = await claudeFanout(kw, client.target_brand, competitors);
      generator = "claude";
    } catch {
      generated = templateFanout(kw, client.target_brand, competitors);
    }
  } else {
    generated = templateFanout(kw, client.target_brand, competitors);
  }

  const created = [];
  let skipped = 0;
  for (const p of generated) {
    const rows = await q(
      `INSERT INTO prompts (client_id, text, keyword_category_id, intent, facet_id, source, active)
       VALUES ($1, $2, $3, $4, $5, 'fanout', TRUE)
       ON CONFLICT (client_id, text) DO NOTHING
       RETURNING id`,
      [client.id, p.text, categoryFor(p.text), p.intent, facetFor(p.text)]);
    if (rows.length) created.push(p);
    else skipped++;
  }

  return NextResponse.json({ keyword: kw, created, skipped, generator });
}
