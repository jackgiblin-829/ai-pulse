import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { loadClientConfig } from "@/lib/clientConfig";
import ClientForm from "@/components/ClientForm";
import DeleteClientButton from "@/components/DeleteClientButton";

export const dynamic = "force-dynamic";

export default async function EditClient({ params }) {
  await requireAdmin();
  const { id } = await params;
  const initial = await loadClientConfig(id);
  if (!initial) notFound();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Admin · Clients
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Edit {initial.name}</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Config changes apply to future ingests; re-run the pipeline to reclassify existing data.
          </p>
        </div>
        <DeleteClientButton id={initial.id} name={initial.name} />
      </header>
      <ClientForm initial={initial} />
    </main>
  );
}
