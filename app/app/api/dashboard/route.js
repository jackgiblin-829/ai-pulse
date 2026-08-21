import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getClientBySlug } from "@/lib/queries";
import { getReport } from "@/lib/report";
import { parseEngine, parseRange } from "@/lib/dates";

// Full report as JSON — programmatic access to every widget's data.
// GET /api/dashboard?client=<slug>&engine=all&days=90 (or &from=&to=)
export async function GET(req) {
  const { error } = await requireApiSession();
  if (error) return error;
  const sp = Object.fromEntries(new URL(req.url).searchParams);
  if (!sp.client) {
    return NextResponse.json({ error: "client query param required" }, { status: 400 });
  }
  const client = await getClientBySlug(sp.client);
  if (!client) {
    return NextResponse.json({ error: `unknown client '${sp.client}'` }, { status: 404 });
  }
  const engine = parseEngine(sp);
  const range = parseRange(sp);
  const report = await getReport({ client, engine, range });
  return NextResponse.json({ client: client.slug, engine, range, ...report });
}
