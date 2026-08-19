import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug, promptLibrary } from "@/lib/queries";
import ClientTabs from "@/components/ClientTabs";
import PromptsTable from "@/components/PromptsTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} prompts | AI Pulse` : "AI Pulse" };
}

export default async function PromptsPage({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();
  const prompts = await promptLibrary(client.id);
  const active = prompts.filter((p) => p.active).length;
  const awaiting = prompts.filter((p) => p.runs === 0).length;

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
          <h1 className="mt-1 text-2xl font-semibold">Prompt Library</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {prompts.length} prompts · {active} active
            {awaiting > 0 && ` · ${awaiting} awaiting their first run`} — the
            active set is what the collection runner asks each engine.
          </p>
          <ClientTabs slug={client.slug} active="/prompts" />
        </div>
        <a
          href={`/api/clients/${client.slug}/prompts/export`}
          className="rounded-full bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-white"
        >
          Export active prompts (.csv)
        </a>
      </header>

      <div className="card p-5">
        {prompts.length === 0 ? (
          <p className="py-8 text-center text-sm text-[var(--text-muted)]">
            No prompts yet — ingest an export, or fan out a keyword from{" "}
            <Link href={`/clients/${client.slug}/targets`} className="text-[var(--accent)] underline">
              Citation targets
            </Link>
            .
          </p>
        ) : (
          <PromptsTable rows={prompts} clientSlug={client.slug} />
        )}
      </div>

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        Prompts that have collected runs anchor historical data — their text is
        locked and they can only be deactivated. Unmeasured prompts (fan-outs
        awaiting a run) can be edited or deleted freely.
      </footer>
    </main>
  );
}
