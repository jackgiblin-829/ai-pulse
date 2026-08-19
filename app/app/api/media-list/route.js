import { q } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(req) {
  const { journalist_id } = await req.json();
  if (!Number.isInteger(journalist_id))
    return NextResponse.json({ error: "journalist_id required" }, { status: 400 });
  await q(
    `INSERT INTO media_list_entries (journalist_id) VALUES ($1)
     ON CONFLICT (journalist_id) DO NOTHING`,
    [journalist_id]
  );
  return NextResponse.json({ ok: true });
}

export async function DELETE(req) {
  const { journalist_id } = await req.json();
  await q(`DELETE FROM media_list_entries WHERE journalist_id = $1`, [journalist_id]);
  return NextResponse.json({ ok: true });
}

export async function GET() {
  const rows = await q(
    `SELECT j.name, o.name AS outlet, o.domain_authority, ml.added_at
     FROM media_list_entries ml
     JOIN journalists j ON j.id = ml.journalist_id
     JOIN media_outlets o ON o.id = j.outlet_id
     ORDER BY ml.added_at DESC`
  );
  return NextResponse.json(rows);
}
