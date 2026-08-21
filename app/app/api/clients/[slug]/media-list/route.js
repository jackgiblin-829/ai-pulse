import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { getClientBySlug, mediaList } from "@/lib/queries";

async function resolve(params) {
  const { slug } = await params;
  return getClientBySlug(slug);
}

export async function POST(req, { params }) {
  const { session, error } = await requireApiSession();
  if (error) return error;
  const client = await resolve(params);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });
  const { journalist_id } = await req.json();
  if (!Number.isInteger(journalist_id))
    return NextResponse.json({ error: "journalist_id required" }, { status: 400 });
  try {
    await q(
      `INSERT INTO media_list_entries (client_id, journalist_id, added_by) VALUES ($1, $2, $3)
       ON CONFLICT (client_id, journalist_id) DO NOTHING`,
      [client.id, journalist_id, session?.email ?? "dashboard"]
    );
  } catch (e) {
    if (e.code === "23503") // FK violation — journalist doesn't exist
      return NextResponse.json({ error: "unknown journalist_id" }, { status: 400 });
    throw e;
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(req, { params }) {
  const { error } = await requireApiSession();
  if (error) return error;
  const client = await resolve(params);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });
  const { journalist_id } = await req.json();
  await q(`DELETE FROM media_list_entries WHERE client_id = $1 AND journalist_id = $2`,
          [client.id, journalist_id]);
  return NextResponse.json({ ok: true });
}

export async function GET(req, { params }) {
  const { error } = await requireApiSession();
  if (error) return error;
  const client = await resolve(params);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });
  return NextResponse.json(await mediaList(client.id));
}
