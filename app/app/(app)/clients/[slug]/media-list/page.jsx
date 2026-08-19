import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, mediaList } from "@/lib/queries";
import MediaListTable from "@/components/MediaListTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} media list | AI Pulse` : "AI Pulse" };
}

export default async function MediaListPage({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();
  const rows = await mediaList(client.id);

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            829 Studios · AI Pulse ·{" "}
            <Link href={`/clients/${client.slug}`} className="hover:text-[var(--text-primary)]">
              {client.name}
            </Link>
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Media List</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {rows.length} journalist{rows.length === 1 ? "" : "s"} · outreach targets saved from the dashboard
          </p>
        </div>
        <a
          href={`/api/clients/${client.slug}/media-list/export`}
          className="rounded-full bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-white"
        >
          Export .xlsx
        </a>
      </header>

      <div className="card p-5">
        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            Nothing saved yet — add journalists from the{" "}
            <Link href={`/clients/${client.slug}`} className="text-[var(--accent)] underline">
              dashboard
            </Link>
            's Top Cited Journalists widget.
          </p>
        ) : (
          <MediaListTable rows={rows} clientSlug={client.slug} />
        )}
      </div>
    </main>
  );
}
