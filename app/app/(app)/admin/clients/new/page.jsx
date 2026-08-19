import { requireAdmin } from "@/lib/auth";
import ClientForm from "@/components/ClientForm";

export const dynamic = "force-dynamic";

export default async function NewClient() {
  await requireAdmin();
  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Admin · Clients
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Onboard a client</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Everything the pipeline needs to track this brand — stored in Postgres, no config files.
        </p>
      </header>
      <ClientForm />
    </main>
  );
}
