import { NextResponse } from "next/server";
import { getClientBySlug, mediaList } from "@/lib/queries";
import { buildMediaListWorkbook } from "@/lib/exportMediaList";

// GET — download the client's media list as an 829-branded .xlsx.
export async function GET(req, { params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const rows = await mediaList(client.id);
  const buffer = await buildMediaListWorkbook({ client, rows });
  const date = new Date().toISOString().slice(0, 10);
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="829-${client.slug}-media-list-${date}.xlsx"`,
    },
  });
}
