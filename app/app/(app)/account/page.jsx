import { requireSession } from "@/lib/auth";
import ChangePasswordForm from "@/components/ChangePasswordForm";

export const dynamic = "force-dynamic";

export const metadata = { title: "Account | AI Pulse" };

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <main className="mx-auto max-w-md px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Account
        </p>
        <h1 className="mt-1 text-2xl font-semibold">{session.name}</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          {session.email} · {session.role}
        </p>
      </header>
      <div className="card p-5">
        <h2 className="text-sm font-semibold">Change password</h2>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          Changing your password signs out your other devices.
        </p>
        <ChangePasswordForm />
      </div>
    </main>
  );
}
