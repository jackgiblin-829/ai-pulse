import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getClientBySlug, emergingAuthors, emergingTopics, topicWeeklyTrend,
  observationSummary,
} from "@/lib/queries";
import ClientTabs from "@/components/ClientTabs";
import ChartCard from "@/components/ChartCard";
import EmergingAuthorsTable from "@/components/EmergingAuthorsTable";
import EmergingTopicsList from "@/components/EmergingTopicsList";
import TopicTrendChart from "@/components/charts/TopicTrendChart";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} emerging | AI Pulse` : "AI Pulse" };
}

const WINDOWS = [14, 30, 60];

function SourceStat({ label, count, last, enabled, hint }) {
  return (
    <div className="flex-1 rounded-md bg-[var(--page)] px-3 py-2">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      {enabled === false ? (
        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">{hint}</p>
      ) : (
        <p className="mt-0.5 text-sm">
          <span className="tabular font-semibold">{(count ?? 0).toLocaleString()}</span>
          <span className="text-xs text-[var(--text-muted)]">
            {" "}observations{last ? ` · last ${last}` : " · none yet"}
          </span>
        </p>
      )}
    </div>
  );
}

export default async function EmergingPage({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const days = WINDOWS.includes(Number(sp?.window)) ? Number(sp.window) : 30;

  const [authors, topics, trend, summary] = await Promise.all([
    emergingAuthors(client.id, days),
    emergingTopics(client.id, days),
    topicWeeklyTrend(client.id, days),
    observationSummary(client.id),
  ]);

  const hasAnyData =
    (summary?.tavily_count ?? 0) + (summary?.profound_count ?? 0) +
    (summary?.internal_count ?? 0) > 0;

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse ·{" "}
          <Link href={`/clients/${client.slug}`} className="hover:text-[var(--text-primary)]">
            {client.name}
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Emerging Authors &amp; Topics</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Who is starting to shape the answers — new and rising authors and
          topics across web search on the fan-out keywords, Profound citation
          reports, and the engines&apos; own citations.
        </p>
        <ClientTabs slug={client.slug} active="/emerging" />
      </header>

      {/* source freshness strip */}
      <div className="mb-4 flex flex-col gap-2 sm:flex-row">
        <SourceStat
          label="Web search (Tavily)"
          count={summary?.tavily_count} last={summary?.tavily_last}
          enabled={summary?.tavily_enabled}
          hint={<>Not enabled — turn it on in <Link href="/admin/clients" className="underline">Admin → Clients</Link>.</>}
        />
        <SourceStat
          label="Profound citations"
          count={summary?.profound_count} last={summary?.profound_last}
          enabled={summary?.profound_enabled}
          hint={<>Not enabled — needs a Profound subscription (<Link href="/admin/clients" className="underline">Admin → Clients</Link>).</>}
        />
        <SourceStat
          label="Engine citations"
          count={summary?.internal_count} last={summary?.internal_last}
        />
      </div>

      {!hasAnyData ? (
        <div className="card mx-auto max-w-xl p-10 text-center">
          <h2 className="text-base font-semibold">No citation data yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            The emerging analysis blends Tavily searches on {client.name}&apos;s
            fan-out keywords, Profound citation reports, and ingested engine
            citations. The scheduler (pipeline/dispatch.py) runs these on the
            client&apos;s cadence, or run them by hand:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--page)] p-3 text-left font-mono text-xs">
{`python fetch_tavily.py --client ${client.slug}
python fetch_profound.py --client ${client.slug}
python enrich_bylines.py --client ${client.slug}
python tag_topics.py --client ${client.slug}`}
          </pre>
        </div>
      ) : (
      <>
      {/* window pills */}
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-xs text-[var(--text-muted)]">Emerging window:</span>
        {WINDOWS.map((w) => (
          <Link
            key={w}
            href={`/clients/${client.slug}/emerging?window=${w}`}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              days === w
                ? "bg-[var(--text-primary)] text-white"
                : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
            }`}
          >
            {w} days
          </Link>
        ))}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <ChartCard
          className="lg:col-span-3"
          title="Emerging authors"
          subtitle={`New in the last ${days} days, or citation weight ≥ 2× the prior ${days} days. Authors identified from crawled bylines.`}
        >
          {authors.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No emerging authors in this window
              {summary?.pending_enrichment > 0 &&
                ` — ${summary.pending_enrichment} observations still await byline crawling (enrich_bylines.py)`}.
            </p>
          ) : (
            <EmergingAuthorsTable rows={authors} clientSlug={client.slug} />
          )}
        </ChartCard>

        <ChartCard
          className="lg:col-span-2"
          title="Emerging topics"
          subtitle={`Topics new or rising over the last ${days} days.`}
        >
          {topics.length === 0 ? (
            <p className="py-6 text-center text-sm text-[var(--text-muted)]">
              No emerging topics in this window
              {summary?.pending_tagging > 0 &&
                ` — ${summary.pending_tagging} URLs still await tagging (tag_topics.py)`}.
            </p>
          ) : (
            <EmergingTopicsList rows={topics} />
          )}
        </ChartCard>
      </div>

      {trend.length > 0 && (
        <div className="mt-4">
          <ChartCard
            title="Topic momentum"
            subtitle="Weekly citation weight for the top topics across all sources."
          >
            <TopicTrendChart rows={trend} />
          </ChartCard>
        </div>
      )}

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        Weights blend sources (Profound rows carry aggregate counts) — treat
        them as ranking signal, not literal citation totals.
      </footer>
      </>
      )}
    </main>
  );
}
