import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-[70vh] items-center justify-center px-6">
      <div className="card w-full max-w-sm p-8 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse
        </p>
        <h1 className="mt-2 text-xl font-semibold">Page not found</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          This page doesn't exist — the client may have been renamed or removed.
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-white"
        >
          Back to clients
        </Link>
      </div>
    </main>
  );
}
