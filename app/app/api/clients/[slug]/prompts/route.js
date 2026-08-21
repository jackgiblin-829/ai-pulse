import { NextResponse } from "next/server";
import { q } from "@/lib/db";
import { requireApiSession } from "@/lib/auth";
import { getClientBySlug } from "@/lib/queries";
import { classifyForClient } from "@/lib/classifyPrompt";

async function ownPrompt(client, id) {
  const [p] = await q(
    `SELECT p.id, p.active, COUNT(r.id)::int AS runs
     FROM prompts p LEFT JOIN llm_runs r ON r.prompt_id = p.id
     WHERE p.id = $1 AND p.client_id = $2
     GROUP BY p.id, p.active`, [Number(id), client.id]);
  return p ?? null;
}

// PUT { id, text? , active? } — text edits are allowed only before a
// prompt has been measured (its text is the identity engines answered).
export async function PUT(req, { params }) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const body = await req.json();
  const prompt = await ownPrompt(client, body.id);
  if (!prompt) return NextResponse.json({ error: "unknown prompt" }, { status: 404 });

  if (typeof body.active === "boolean") {
    await q("UPDATE prompts SET active = $1 WHERE id = $2", [body.active, prompt.id]);
  }

  if (typeof body.text === "string") {
    const text = body.text.trim();
    if (text.length < 10 || text.length > 300) {
      return NextResponse.json({ error: "Prompt must be 10–300 characters" }, { status: 400 });
    }
    if (prompt.runs > 0) {
      return NextResponse.json(
        { error: "This prompt has collected runs — its text is locked. Deactivate it and add a new prompt instead." },
        { status: 409 });
    }
    const cls = await classifyForClient(client.id, text);
    try {
      await q(
        `UPDATE prompts SET text = $1, intent = $2, keyword_category_id = $3, facet_id = $4
         WHERE id = $5`,
        [text, cls.intent, cls.keyword_category_id, cls.facet_id, prompt.id]);
    } catch (e) {
      if (e.code === "23505")
        return NextResponse.json({ error: "An identical prompt already exists" }, { status: 409 });
      throw e;
    }
  }
  return NextResponse.json({ ok: true });
}

// DELETE { id } — only prompts that were never measured can be removed;
// measured prompts anchor historical runs, so deactivate those instead.
export async function DELETE(req, { params }) {
  const { error } = await requireApiSession();
  if (error) return error;
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) return NextResponse.json({ error: "unknown client" }, { status: 404 });

  const { id } = await req.json();
  const prompt = await ownPrompt(client, id);
  if (!prompt) return NextResponse.json({ error: "unknown prompt" }, { status: 404 });
  if (prompt.runs > 0) {
    return NextResponse.json(
      { error: "This prompt has collected runs and anchors historical data — deactivate it instead." },
      { status: 409 });
  }
  await q("DELETE FROM prompts WHERE id = $1", [prompt.id]);
  return NextResponse.json({ ok: true });
}
