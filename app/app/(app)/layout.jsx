import Link from "next/link";
import { requireSession } from "@/lib/auth";
import NavLinks from "@/components/NavLinks";

export default async function AppLayout({ children }) {
  const session = await requireSession();
  const links = [
    { href: "/", label: "Dashboard" },
    { href: "/how-it-works", label: "How it works" },
    ...(session.role === "admin"
      ? [
          { href: "/admin/clients", label: "Manage clients" },
          { href: "/admin/usage", label: "Usage" },
          { href: "/admin/users", label: "Users" },
        ]
      : []),
  ];
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <nav className="border-b border-[var(--border)] bg-[var(--surface-1)]">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2.5">
          <div className="flex items-center gap-5">
            <Link href="/" className="text-sm font-semibold tracking-tight">
              AI&nbsp;Pulse
            </Link>
            <NavLinks links={links} />
          </div>
          <div className="flex items-center gap-3 text-xs text-[var(--text-muted)]">
            <Link
              href="/account"
              className="hidden whitespace-nowrap hover:text-[var(--text-primary)] sm:inline"
            >
              {session.name}
            </Link>
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
      <div id="main" tabIndex={-1}>{children}</div>
    </>
  );
}
