import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, facetsForClient, intentBreakdown, citationTargets,
  promptsForKeyword,
} from "@/lib/queries";
import { q } from "@/lib/db";
import ClientTabs from "@/components/ClientTabs";
import FanoutSearch from "@/components/FanoutSearch";
import TargetsTable from "@/components/TargetsTable";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} citation targets | AI Pulse` : "AI Pulse" };
}

const INTENTS = [
  ["commercial", "Commercial research", "best-of and recommendation queries — the money intent"],
  ["informational", "Informational", "how / what / why queries — education and authority"],
  ["comparison", "Comparison", "brand-vs-brand and alternatives queries"],
  ["transactional", "Transactional", "buying, pricing, and where-to-buy queries"],
];

export default async function TargetsPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [{ id: targetBrandId } = {}] = await q(
    "SELECT id FROM brands WHERE client_id = $1 AND role = 'target'", [client.id]);

  const facets = await facetsForClient(client.id);
  const facetId = facets.some((f) => String(f.id) === sp?.facet) ? Number(sp.facet) : null;
  const kw = typeof sp?.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 80) : null;
  const opts = { facetId, kw };

  const [breakdown, targets, matched] = await Promise.all([
    intentBreakdown(client.id, targetBrandId, opts),
    citationTargets(client.id, targetBrandId, opts),
    kw ? promptsForKeyword(client.id, kw) : Promise.resolve(null),
  ]);
  const byIntent = Object.fromEntries(breakdown.map((b) => [b.intent, b]));
  const targetsByIntent = {};
  for (const t of targets) (targetsByIntent[t.intent] ??= []).push(t);

  const facetHref = (fid) => {
    const p = new URLSearchParams();
    if (fid) p.set("facet", fid);
    if (kw) p.set("q", kw);
    const qs = p.toString();
    return `/clients/${client.slug}/targets${qs ? `?${qs}` : ""}`;
  };

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse ·{" "}
          <Link href={`/clients/${client.slug}`} className="hover:text-[var(--text-primary)]">
            {client.name}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Citation Targets</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Where the engines source their answers, broken down by search intent —
          owned coverage, engaged outlets, and the gaps worth pitching.
        </p>
        <ClientTabs slug={client.slug} active="/targets" />
      </header>

      {breakdown.length === 0 && !kw && !facetId ? (
        <div className="card mx-auto max-w-xl p-10 text-center">
          <h2 className="text-base font-semibold">No data to analyze yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            Citation targets are built from ingested engine responses. Run the
            pipeline for {client.name}, then this view breaks every citation
            down by search intent.
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--page)] p-3 text-left font-mono text-xs">
{`python ingest.py --client ${client.slug} export.csv`}
          </pre>
        </div>
      ) : (
      <>
      {/* keyword search + fanout */}
      <FanoutSearch slug={client.slug} initialQ={kw ?? ""} facetId={facetId} />

      {/* facet refinement */}
      {facets.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs text-[var(--text-muted)]">
            Refine by product / service area:
          </span>
          <Link
            href={facetHref(null)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              !facetId
                ? "bg-[var(--text-primary)] text-white"
                : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
            }`}
          >
            All
          </Link>
          {facets.map((f) => (
            <Link
              key={f.id}
              href={facetHref(f.id)}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                facetId === f.id
                  ? "bg-[var(--text-primary)] text-white"
                  : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
              }`}
            >
              {f.name}
            </Link>
          ))}
        </div>
      )}

      {/* keyword match summary */}
      {matched && (
        <div className="card mt-4 p-5">
          <h2 className="text-sm font-semibold">
            Prompt coverage for “{kw}” — {matched.length} prompt{matched.length === 1 ? "" : "s"}
          </h2>
          {matched.length === 0 ? (
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              No prompts in the library mention this keyword yet — use “Fan out”
              to generate an intent spread and add it to the library.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full min-w-[28rem]">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Prompt</th>
                    <th className="py-2 font-medium">Intent</th>
                    <th className="py-2 font-medium">Facet</th>
                    <th className="py-2 text-right font-medium">Runs</th>
                  </tr>
                </thead>
                <tbody>
                  {matched.map((m) => (
                    <tr key={m.text}>
                      <td className="border-t border-[var(--grid)] py-1.5 pr-4 text-sm">
                        {m.text}
                        {m.source === "fanout" && (
                          <span className="ml-1.5 rounded-full bg-[#eceafb] px-1.5 py-0.5 text-[10px] font-medium text-[#4a3aa7]">
                            fanout
                          </span>
                        )}
                      </td>
                      <td className="border-t border-[var(--grid)] py-1.5 text-xs capitalize text-[var(--text-secondary)]">{m.intent}</td>
                      <td className="border-t border-[var(--grid)] py-1.5 text-xs text-[var(--text-secondary)]">{m.facet ?? "—"}</td>
                      <td className="tabular border-t border-[var(--grid)] py-1.5 text-right text-xs">
                        {m.runs > 0 ? m.runs : <span className="text-[#a04a10]">awaiting run</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* per-intent target sections */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {INTENTS.map(([intent, label, hint]) => {
          const stats = byIntent[intent];
          const rows = (targetsByIntent[intent] ?? []).slice(0, 10);
          return (
            <section key={intent} className="card p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-sm font-semibold">{label}</h2>
                  <p className="mt-0.5 text-xs text-[var(--text-muted)]">{hint}</p>
                </div>
                {stats && (
                  <p className="shrink-0 text-right text-xs text-[var(--text-muted)]">
                    <span className="tabular font-semibold text-[var(--text-primary)]">
                      {stats.visibility ?? 0}%
                    </span>{" "}
                    visibility · {stats.prompts} prompts
                  </p>
                )}
              </div>
              <div className="mt-4">
                {rows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-[var(--text-muted)]">
                    No citations for this intent{facetId || kw ? " with the current refinement" : ""}.
                  </p>
                ) : (
                  <TargetsTable rows={rows} />
                )}
              </div>
            </section>
          );
        })}
      </div>

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        All-time data · Status: <strong>Owned</strong> = the brand's own domain ·{" "}
        <strong>Engaged</strong> = outlet has a journalist on the media list ·{" "}
        <strong>Target</strong> = earned media cited by engines with no engagement yet
      </footer>
      </>
      )}
    </main>
  );
}
