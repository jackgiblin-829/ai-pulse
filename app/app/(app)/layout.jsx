import Link from "next/link";
import { requireSession } from "@/lib/auth";

export default async function AppLayout({ children }) {
  const session = await requireSession();
  return (
    <>
      <nav className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-5">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              AI&nbsp;Pulse
            </Link>
            {session.role === "admin" && (
              <div className="flex items-center gap-3 text-xs text-[var(--text-secondary)]">
                <Link href="/admin/clients" className="hover:text-[var(--text-primary)]">
                  Clients
                </Link>
                <Link href="/admin/users" className="hover:text-[var(--text-primary)]">
                  Users
                </Link>
              </div>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <span>{session.name}</span>
            <form action="/api/auth/logout" method="post">
              <button
                type="submit"
                className="rounded-md border border-[var(--border)] bg-white px-2 py-1 font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      </nav>
      {children}
    </>
  );
}
