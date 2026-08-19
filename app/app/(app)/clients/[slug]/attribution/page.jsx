import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, attributionArticles, attributionByJournalist,
  earnedCitationCount,
} from "@/lib/queries";
import ClientTabs from "@/components/ClientTabs";
import StatTile from "@/components/StatTile";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} attribution | AI Pulse` : "AI Pulse" };
}

function WonChip({ won }) {
  return won ? (
    <span className="rounded-full bg-[#e7f2e7] px-2 py-0.5 text-[10px] font-semibold text-[#006300]">Won</span>
  ) : (
    <span className="rounded-full bg-[var(--page)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">Pre-existing</span>
  );
}

export default async function AttributionPage({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const [articles, journalists, earnedTotal] = await Promise.all([
    attributionArticles(client.id),
    attributionByJournalist(client.id),
    earnedCitationCount(client.id),
  ]);

  const wins = articles.filter((a) => a.won);
  const wonCitations = wins.reduce((n, a) => n + a.citations, 0);
  const share = earnedTotal ? Math.round((1000 * wonCitations) / earnedTotal) / 10 : 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse ·{" "}
          <Link href={`/clients/${client.slug}`} className="hover:text-[var(--text-primary)]">
            {client.name}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">PR Attribution</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Coverage wins from outreach: articles by media-list journalists whose
          first AI-engine citation came after the journalist was added.
        </p>
        <ClientTabs slug={client.slug} active="/attribution" />
      </header>

      {journalists.length === 0 ? (
        <div className="card p-10 text-center text-sm text-[var(--text-muted)]">
          Attribution starts with the media list — add journalists from the{" "}
          <Link href={`/clients/${client.slug}`} className="text-[var(--accent)] underline">
            dashboard
          </Link>
          's Top Cited Journalists widget, and wins are tracked from that moment.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile label="Articles Won" value={wins.length} note="First cited after outreach began" />
            <StatTile label="Journalists Engaged" value={journalists.length} note="On the media list" />
            <StatTile label="Citations from Wins" value={wonCitations.toLocaleString()} note="Engine citations of won articles" />
            <StatTile label="Share of Earned Citations" value={share} suffix="%" note="Won articles ÷ all earned citations" />
          </div>

          <div className="card mt-4 p-5">
            <h2 className="text-sm font-semibold">Article wins</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Every cited article by an engaged journalist. “Won” = first citation on or after the added date.
            </p>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[40rem]">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Article</th>
                    <th className="py-2 font-medium">Journalist</th>
                    <th className="py-2 font-medium">Outlet</th>
                    <th className="py-2 text-right font-medium">DA</th>
                    <th className="py-2 text-right font-medium">Citations</th>
                    <th className="py-2 text-right font-medium">Engines</th>
                    <th className="py-2 font-medium">First cited</th>
                    <th className="py-2 text-right font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {articles.map((a) => (
                    <tr key={a.url}>
                      <td className="max-w-80 border-t border-[var(--grid)] py-2 pr-4 text-sm">
                        <a href={a.url} target="_blank" rel="noreferrer" className="font-medium hover:text-[var(--accent)]">
                          {a.title ?? a.url.replace(/^https?:\/\/(www\.)?/, "")}
                        </a>
                      </td>
                      <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{a.journalist}</td>
                      <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{a.outlet ?? "—"}</td>
                      <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{a.da ?? "—"}</td>
                      <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{a.citations.toLocaleString()}</td>
                      <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{a.engines}</td>
                      <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{a.first_cited}</td>
                      <td className="border-t border-[var(--grid)] py-2 text-right"><WonChip won={a.won} /></td>
                    </tr>
                  ))}
                  {articles.length === 0 && (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-sm text-[var(--text-muted)]">
                        No cited articles from engaged journalists yet — wins appear
                        once the engines cite their coverage.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="card mt-4 p-5">
            <h2 className="text-sm font-semibold">Citation lift by journalist</h2>
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">
              Engine citations of each journalist's work before vs. after they joined the media list.
            </p>
            <div className="overflow-x-auto">
              <table className="mt-3 w-full min-w-[28rem]">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Journalist</th>
                    <th className="py-2 font-medium">Outlet</th>
                    <th className="py-2 font-medium">Added</th>
                    <th className="py-2 text-right font-medium">Before</th>
                    <th className="py-2 text-right font-medium">After</th>
                    <th className="py-2 text-right font-medium">Lift</th>
                  </tr>
                </thead>
                <tbody>
                  {journalists.map((j) => {
                    const lift = j.before_cites
                      ? Math.round((1000 * (j.after_cites - j.before_cites)) / j.before_cites) / 10
                      : null;
                    return (
                      <tr key={`${j.journalist}-${j.outlet}`}>
                        <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">{j.journalist}</td>
                        <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{j.outlet ?? "—"}</td>
                        <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{j.added}</td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{j.before_cites.toLocaleString()}</td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{j.after_cites.toLocaleString()}</td>
                        <td className={`tabular border-t border-[var(--grid)] py-2 text-right text-sm font-medium ${
                          lift == null ? "text-[var(--text-muted)]" : lift >= 0 ? "text-[#006300]" : "text-[#e34948]"
                        }`}>
                          {lift == null ? "new" : `${lift > 0 ? "+" : ""}${lift}%`}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        Attribution window starts at each journalist's added-to-list date · articles
        resolved by the byline crawler
      </footer>
    </main>
  );
}
