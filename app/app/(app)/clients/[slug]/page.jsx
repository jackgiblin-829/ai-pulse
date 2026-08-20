import Link from "next/link";
import { notFound } from "next/navigation";
import { getClientBySlug } from "@/lib/queries";
import { getReport } from "@/lib/report";
import { parseEngine, parseRange, rangeLabel } from "@/lib/dates";
import { SLOTS, GRAY } from "@/lib/palette";
import ChartCard from "@/components/ChartCard";
import Filters from "@/components/Filters";
import StatTile from "@/components/StatTile";
import VisibilityMatrix from "@/components/VisibilityMatrix";
import VisibilityTrendChart from "@/components/charts/VisibilityTrendChart";
import MediaStrategyChart from "@/components/charts/MediaStrategyChart";
import SovPie from "@/components/charts/SovPie";
import SentimentChart from "@/components/charts/SentimentChart";
import KeyTerms from "@/components/KeyTerms";
import JournalistsTable from "@/components/JournalistsTable";
import ExportButton from "@/components/ExportButton";
import ClientTabs from "@/components/ClientTabs";
import { OrgMentionsTable, DomainsTable, OwnedUrlsTable, OutletsTable } from "@/components/Tables";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const client = await getClientBySlug(slug);
  return { title: client ? `${client.name} | AI Pulse` : "AI Pulse" };
}

export default async function Dashboard({ params, searchParams }) {
  const [{ slug }, sp] = await Promise.all([params, searchParams]);
  const client = await getClientBySlug(slug);
  if (!client) notFound();

  const engine = parseEngine(sp);
  const range = parseRange(sp);
  const basePath = `/clients/${client.slug}`;

  const report = await getReport({ client, engine, range });
  const { brand, kpis, matrix, trend, media, sov, keywordSov, sentiment,
          terms, orgs, domains, ownedUrls, outlets, journalists,
          mediaListSummary, bounds, brandColors } = report;

  // No runs ingested yet — guidance beats a grid of empty widgets.
  if (!bounds.max) {
    return (
      <main className="mx-auto max-w-7xl px-6 py-8">
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            829 Studios · AI Pulse
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {brand} — Generative Engine Visibility
          </h1>
          <ClientTabs slug={client.slug} active="" />
        </header>
        <div className="card mx-auto max-w-xl p-10 text-center">
          <h2 className="text-base font-semibold">No data ingested yet</h2>
          <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
            {client.name} is configured and ready. Run the pipeline against an
            engine export to light this dashboard up:
          </p>
          <pre className="mt-4 overflow-x-auto rounded-md bg-[var(--page)] p-3 text-left font-mono text-xs">
{`python ingest.py --client ${client.slug} export.csv
python enrich_bylines.py --client ${client.slug}`}
          </pre>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            See <a href="/how-it-works" className="text-[var(--accent)] underline">How it works</a> for
            the full flow, or adjust the configuration under Manage clients.
          </p>
        </div>
      </main>
    );
  }

  const sovItems = sov.map((s) => ({ name: s.brand, pct: s.pct, color: brandColors[s.brand] ?? GRAY }));
  const kwItems = keywordSov.map((k, i) => ({ name: k.keyword, pct: k.pct, color: SLOTS[i] ?? GRAY }));

  return (
    <main className="mx-auto max-w-7xl px-6 py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            829 Studios · AI Pulse
          </p>
          <h1 className="mt-1 text-2xl font-semibold">
            {brand} — Generative Engine Visibility
          </h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">
            {matrix.length ? `${sov.length} tracked brands · ChatGPT, Gemini & Claude` : "No data ingested yet"}
          </p>
          <ClientTabs slug={client.slug} active="" />
        </div>
        <Filters engine={engine} range={range} basePath={basePath} bounds={bounds} />
      </header>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Average Visibility" value={kpis.visibility} suffix="%" note="Share of responses mentioning the brand" />
        <StatTile label="Share of Voice" value={kpis.sov} suffix="%" note="Of all tracked-brand mentions" />
        <StatTile label="Cited URLs" value={kpis.citations.toLocaleString()} note="Across all engine responses" />
        <StatTile label="Positive Sentiment" value={kpis.positive} suffix="%" note="Of scored brand mentions" />
      </div>

      {/* 1 — Visibility */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Average Visibility Score" subtitle="Brand × engine — % of responses with a mention">
          <VisibilityMatrix rows={matrix} />
        </ChartCard>
        <ChartCard title="Visibility Over Time" subtitle={`${brand} by engine`}>
          <VisibilityTrendChart rows={trend} />
        </ChartCard>
      </div>

      {/* 2 — PR intelligence: the tool's action layer. Journalists behind
             the citations, with the media-list CTA — deliberately high on
             the page: building the outreach list is the thing this tool
             exists to make people do. */}
      <div className="card mt-4 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[var(--accent)] p-4">
        <div>
          <h2 className="text-sm font-semibold">Build the media list</h2>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {mediaListSummary.cited_journalists.toLocaleString()} journalists are behind the articles
            these engines cite{mediaListSummary.on_list
              ? ` — ${mediaListSummary.on_list} already on ${brand}'s outreach list.`
              : ` — none saved yet. Add the strongest targets below to start ${brand}'s outreach list.`}
          </p>
        </div>
        <Link
          href={`${basePath}/media-list`}
          className="rounded-md bg-[var(--accent)] px-3.5 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90"
        >
          Open media list{mediaListSummary.on_list ? ` (${mediaListSummary.on_list})` : ""}
        </Link>
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Top Cited Journalists"
          subtitle="Outreach targets — bylines behind cited articles"
          action={<ExportButton slug={client.slug} />}
        >
          <JournalistsTable rows={journalists} clientSlug={client.slug} />
        </ChartCard>
        <ChartCard title="Top Cited Media Outlets" subtitle="Earned-media outlets by citation count">
          <OutletsTable rows={outlets} />
        </ChartCard>
      </div>

      {/* 3 — Media strategy + SOV */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Media Strategy" subtitle="Cited URLs by media type">
          <MediaStrategyChart rows={media} />
        </ChartCard>
        <ChartCard title="Overall Share of Voice" subtitle="Mention share among tracked brands">
          <SovPie items={sovItems} />
        </ChartCard>
      </div>

      {/* 4 — Keyword SOV + sentiment */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Share of Voice by Keywords" subtitle={`${brand} mentions by query category`}>
          <SovPie items={kwItems} />
        </ChartCard>
        <ChartCard title="Brand Mention Sentiment" subtitle={`${brand} sentiment mix per collection date`}>
          <SentimentChart rows={sentiment} />
        </ChartCard>
      </div>

      {/* 5 — Key terms + org mentions */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Key Terms" subtitle="Prominent attributes, materials & products across responses">
          <KeyTerms rows={terms} />
        </ChartCard>
        <ChartCard title="All Organization Mentions" subtitle="Every org detected — competitors, retailers, suppliers">
          <OrgMentionsTable rows={orgs} />
        </ChartCard>
      </div>

      {/* 6 — Citations */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top Cited Domains" subtitle="All citation sources, classified">
          <DomainsTable rows={domains} />
        </ChartCard>
        <ChartCard title={`Top Cited Owned URLs`} subtitle={`${brand}-owned landing pages cited by engines`}>
          <OwnedUrlsTable rows={ownedUrls} />
        </ChartCard>
      </div>

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        AI Pulse · internal GEO reporting · data window: {rangeLabel(range)} ·
        engine: {engine === "all" ? "all engines" : engine}
      </footer>
    </main>
  );
}
