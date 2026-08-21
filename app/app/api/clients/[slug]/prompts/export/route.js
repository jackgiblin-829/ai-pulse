import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { getClientBySlug } from "@/lib/queries";

// GET — the active prompt library as CSV, ready to feed the prompt
// runner that queries the engines each collection date.
export async function GET(req, { params }) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const rows = await q(
    `SELECT p.text, p.intent::text AS intent, k.name AS category, f.name AS facet
     FROM prompts p
     LEFT JOIN keyword_categories k ON k.id = p.keyword_category_id
     LEFT JOIN facets f ON f.id = p.facet_id
     WHERE p.client_id = $1 AND p.active
     ORDER BY p.id`, [client.id]);

  const esc = (v) => `"${String(v ?? "").replaceAll('"', '""')}"`;
  const csv = ["prompt,intent,category,facet"]
    .concat(rows.map((r) => [r.text, r.intent, r.category, r.facet].map(esc).join(",")))
    .join("\n");

  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${client.slug}-prompts-${date}.csv"`,
    },
  });
}
