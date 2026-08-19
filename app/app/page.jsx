import * as Q from "@/lib/queries";
import { brandColor, SLOTS, GRAY } from "@/lib/palette";
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
import { OrgMentionsTable, DomainsTable, OwnedUrlsTable, OutletsTable } from "@/components/Tables";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }) {
  const sp = await searchParams;
  const engine = ["all", "chatgpt", "gemini", "claude"].includes(sp?.engine) ? sp.engine : "all";
  const days = ["30", "60", "90", "all"].includes(sp?.days) ? sp.days : "90";
  const brand = Q.TARGET;

  const [kpis, matrix, trend, media, sov, keywordSov, sentiment, terms, orgs, domains, ownedUrls, outlets, journalists] =
    await Promise.all([
      Q.kpis(days, brand),
      Q.visibilityMatrix(days),
      Q.visibilityTrend(days, brand),
      Q.mediaStrategy(days, engine),
      Q.shareOfVoice(days, engine),
      Q.keywordShareOfVoice(days, engine, brand),
      Q.sentimentOverTime(days, engine, brand),
      Q.topKeyTerms(days, engine),
      Q.orgMentions(days, engine),
      Q.topDomains(days, engine),
      Q.topOwnedUrls(days, engine, brand),
      Q.topOutlets(days, engine),
      Q.topJournalists(days, engine),
    ]);

  const sovItems = sov.map((s) => ({ name: s.brand, pct: s.pct, color: brandColor(s.brand) }));
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
        </div>
        <Filters engine={engine} days={days} />
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

      {/* 2 — Media strategy + SOV */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Media Strategy" subtitle="Cited URLs by media type">
          <MediaStrategyChart rows={media} />
        </ChartCard>
        <ChartCard title="Overall Share of Voice" subtitle="Mention share among tracked brands">
          <SovPie items={sovItems} />
        </ChartCard>
      </div>

      {/* 3 — Keyword SOV + sentiment */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Share of Voice by Keywords" subtitle={`${brand} mentions by query category`}>
          <SovPie items={kwItems} />
        </ChartCard>
        <ChartCard title="Brand Mention Sentiment" subtitle={`${brand} sentiment mix per collection date`}>
          <SentimentChart rows={sentiment} />
        </ChartCard>
      </div>

      {/* 4 — Key terms + org mentions */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Key Terms" subtitle="Prominent attributes, materials & products across responses">
          <KeyTerms rows={terms} />
        </ChartCard>
        <ChartCard title="All Organization Mentions" subtitle="Every org detected — competitors, retailers, suppliers">
          <OrgMentionsTable rows={orgs} />
        </ChartCard>
      </div>

      {/* 5 — Citations */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top Cited Domains" subtitle="All citation sources, classified">
          <DomainsTable rows={domains} />
        </ChartCard>
        <ChartCard title={`Top Cited Owned URLs`} subtitle={`${brand}-owned landing pages cited by engines`}>
          <OwnedUrlsTable rows={ownedUrls} />
        </ChartCard>
      </div>

      {/* 6 — PR intelligence */}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <ChartCard title="Top Cited Media Outlets" subtitle="Earned-media outlets by citation count">
          <OutletsTable rows={outlets} />
        </ChartCard>
        <ChartCard title="Top Cited Journalists" subtitle="Outreach targets — bylines behind cited articles">
          <JournalistsTable rows={journalists} />
        </ChartCard>
      </div>

      <footer className="mt-8 text-center text-xs text-[var(--text-muted)]">
        AI Pulse · internal GEO reporting · data window: {days === "all" ? "all time" : `last ${days} days`} ·
        engine: {engine === "all" ? "all engines" : engine}
      </footer>
    </main>
  );
}
