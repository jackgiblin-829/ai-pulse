import { requireAdmin } from "@/lib/auth";
import { q } from "@/lib/db";
import UsersAdmin from "@/components/UsersAdmin";

export const dynamic = "force-dynamic";

export default async function AdminUsers() {
  const session = await requireAdmin();
  const users = await q(
    "SELECT id, email, name, role, created_at::date::text AS created FROM users ORDER BY created_at");

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Users</h1>
      </header>
      <UsersAdmin users={users} selfId={Number(session.sub)} />
    </main>
  );
}
