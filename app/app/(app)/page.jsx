import Link from "next/link";
import { clientsOverview } from "@/lib/queries";
import { getSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export const metadata = { title: "Clients | AI Pulse" };

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

function Kpi({ label, value, suffix = "" }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--text-muted)]">{label}</p>
      <p className="tabular mt-0.5 text-lg font-semibold">
        {value ?? "—"}
        {value != null && suffix}
      </p>
    </div>
  );
}

export default async function Home() {
  const [clients, session] = await Promise.all([clientsOverview(), getSession()]);
  const staleCutoff = Date.now() - 7 * 24 * 3600 * 1000;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            829 Studios · AI Pulse
          </p>
          <h1 className="mt-1 text-2xl font-semibold">Clients</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            Generative engine visibility across ChatGPT, Gemini &amp; Claude
          </p>
        </div>
        {session?.role === "admin" && (
          <Link
            href="/admin/clients/new"
            className="rounded-full bg-[var(--text-primary)] px-4 py-1.5 text-xs font-medium text-white"
          >
            + Add client
          </Link>
        )}
      </header>

      {clients.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--text-muted)]">
          No clients yet.
          {session?.role === "admin" && (
            <>
              {" "}
              <Link href="/admin/clients/new" className="text-[var(--accent)] underline">
                Onboard the first one
              </Link>
              .
            </>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {clients.map((c) => {
            const stale = c.last_run && new Date(`${c.last_run}T00:00:00Z`).getTime() < staleCutoff;
            return (
              <Link key={c.id} href={`/clients/${c.slug}`} className="card block p-5 transition-shadow hover:shadow-md">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-semibold">{c.name}</h2>
                    <p className="mt-0.5 text-xs text-[var(--text-muted)]">
                      target: {c.target_brand}
                    </p>
                  </div>
                  {c.last_run && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                        stale
                          ? "bg-[#fdf0e6] text-[#a04a10]"
                          : "bg-[#e7f2e7] text-[#006300]"
                      }`}
                    >
                      {fmt.format(new Date(`${c.last_run}T00:00:00Z`))}
                    </span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[var(--grid)] pt-3">
                  <Kpi label="Visibility" value={c.visibility} suffix="%" />
                  <Kpi label="Share of voice" value={c.sov} suffix="%" />
                  <Kpi label="Runs" value={c.run_count?.toLocaleString()} />
                </div>
                {!c.last_run && (
                  <p className="mt-3 text-xs text-[var(--text-muted)]">
                    No data ingested yet
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </main>
  );
}
