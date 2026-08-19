import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { adminClientList } from "@/lib/clientConfig";

export const dynamic = "force-dynamic";

export const metadata = { title: "Manage clients | AI Pulse" };

export default async function AdminClients() {
  await requireAdmin();
  const clients = await adminClientList();

  return (
    <main className="mx-auto max-w-4xl px-6 py-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Admin
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Clients</h1>
        </div>
        <Link
          href="/admin/clients/new"
          className="rounded-full bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-white"
        >
          + New client
        </Link>
      </header>

      <div className="card p-5">
        <table className="w-full">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 font-medium">Client</th>
              <th className="py-2 font-medium">Slug</th>
              <th className="py-2 font-medium">Target brand</th>
              <th className="py-2 text-right font-medium">Competitors</th>
              <th className="py-2 font-medium">Last ingest</th>
              <th className="py-2"></th>
            </tr>
          </thead>
          <tbody>
            {clients.map((c) => (
              <tr key={c.id}>
                <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">
                  <Link href={`/clients/${c.slug}`} className="hover:underline">{c.name}</Link>
                </td>
                <td className="border-t border-[var(--grid)] py-2 font-mono text-xs text-[var(--text-secondary)]">{c.slug}</td>
                <td className="border-t border-[var(--grid)] py-2 text-sm">{c.target_brand ?? "—"}</td>
                <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{c.competitors}</td>
                <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{c.last_run ?? "no data"}</td>
                <td className="border-t border-[var(--grid)] py-2 text-right">
                  <Link href={`/admin/clients/${c.id}`}
                    className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]">
                    Edit
                  </Link>
                </td>
              </tr>
            ))}
            {clients.length === 0 && (
              <tr>
                <td colSpan={6} className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No clients yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </main>
  );
}
