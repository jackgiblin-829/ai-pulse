import Link from "next/link";
import { getSession } from "@/lib/auth";

export const metadata = { title: "How it works | AI Pulse" };

function Section({ title, children }) {
  return (
    <section className="card p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-[var(--text-secondary)]">
        {children}
      </div>
    </section>
  );
}

function Metric({ name, children }) {
  return (
    <div className="border-t border-[var(--grid)] py-3 first:border-t-0">
      <p className="text-sm font-semibold text-[var(--text-primary)]">{name}</p>
      <p className="mt-1 text-sm leading-relaxed text-[var(--text-secondary)]">{children}</p>
    </div>
  );
}

const Step = ({ n, title, children }) => (
  <li className="flex gap-3">
    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--text-primary)] text-xs font-semibold text-white">
      {n}
    </span>
    <div>
      <p className="text-sm font-semibold text-[var(--text-primary)]">{title}</p>
      <p className="mt-0.5 text-sm leading-relaxed text-[var(--text-secondary)]">{children}</p>
    </div>
  </li>
);

export default async function HowItWorks() {
  const session = await getSession();
  const isAdmin = session?.role === "admin";
  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          829 Studios · AI Pulse
        </p>
        <h1 className="mt-1 text-2xl font-semibold">How it works</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          What the numbers mean, where the data comes from, and how a client goes
          from onboarding to a live report.
        </p>
      </header>

      <div className="space-y-4">
        <Section title="The pipeline, end to end">
          <ol className="space-y-4">
            <Step n={1} title="Seed prompts are asked of every engine">
              Each client has a library of real buyer questions ("best luxury safari
              companies", "patio furniture that lasts 20 years"). On each collection
              date, every prompt is put to ChatGPT, Gemini, and Claude, and the full
              responses are exported as a CSV.
            </Step>
            <Step n={2} title="Ingestion extracts the signals">
              The pipeline parses every response: which brands and ecosystem orgs are
              named (using each brand's alias list), every URL the engine cited, the
              sentiment of each brand mention, and the key product terms discussed.
              Prompts are auto-categorized into the client's keyword buckets by
              ordered pattern rules.
            </Step>
            <Step n={3} title="Cited URLs are classified and crawled">
              Every cited domain is classified as <em>owned</em> (the brand's own
              site), <em>earned</em> (media outlets), <em>social</em>, or{" "}
              <em>other</em> (retail, review aggregators). A polite crawler then
              fetches the earned-media articles and extracts the real journalist
              byline, headline, and publish date — that's who's behind the coverage
              the engines rely on.
            </Step>
            <Step n={4} title="The dashboard reports it live">
              Every widget is a SQL view over this data, filterable by engine and
              date window. Add promising journalists to the client's media list and
              export it as an 829-branded workbook for outreach.
            </Step>
          </ol>
        </Section>

        <Section title="What each metric means">
          <div>
            <Metric name="Average Visibility">
              The share of responses that mention the brand at least once:{" "}
              <code className="font-mono text-xs">
                responses with a mention ÷ total responses × 100
              </code>
              . Mentions are detected on URL-stripped text, so a citation of
              polywood.com doesn't count as a prose mention. The matrix breaks this
              out per brand × engine; the trend chart tracks it per collection date.
            </Metric>
            <Metric name="Share of Voice">
              The brand's slice of all tracked-brand mentions (target + competitors)
              in the window. Unlike visibility, this counts every mention, so a brand
              discussed at length weighs more than one name-dropped once.
            </Metric>
            <Metric name="Share of Voice by Keywords">
              The target brand's mentions grouped by the prompt's keyword category —
              shows which query themes the brand wins (or is absent from).
            </Metric>
            <Metric name="Brand Mention Sentiment">
              Every mention of a tracked brand is scored positive / neutral /
              negative (Claude API when configured, lexicon fallback otherwise),
              charted as a 100% stacked mix per collection date.
            </Metric>
            <Metric name="Media Strategy">
              Citation counts by media type over time. A healthy profile grows earned
              media; a spike in "other" usually means engines are leaning on retail
              or aggregator pages instead of coverage you can influence.
            </Metric>
            <Metric name="Key Terms">
              The attributes, materials, and products the engines associate with the
              category — curated client vocabulary plus recurring bigrams, with brand
              names excluded (those live in Organization Mentions).
            </Metric>
            <Metric name="Top Cited Journalists / Outlets">
              The bylines and outlets behind the articles the engines actually cite,
              ranked by citation count with Domain Authority for prioritization.
              These are the PR targets: coverage from them feeds future AI answers.
            </Metric>
          </div>
        </Section>

        <Section title="Reading the filters">
          <p>
            <strong className="text-[var(--text-primary)]">Engine pills</strong>{" "}
            re-slice every widget to one engine — useful because visibility often
            diverges sharply between ChatGPT, Gemini, and Claude.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">Day windows</strong>{" "}
            (30/60/90/all) are measured back from the client's most recent
            collection date, so a paused client still shows its last full window.{" "}
            <strong className="text-[var(--text-primary)]">Custom range</strong>{" "}
            uses absolute calendar dates — pick any span inside the data window.
          </p>
        </Section>

        <Section title="Citation targets & keyword fan-out">
          <p>
            The <strong className="text-[var(--text-primary)]">Citation targets</strong>{" "}
            tab re-slices every citation by the prompt's search intent —
            commercial research, informational, comparison, transactional — and
            optionally by service area or product line. Each source carries a
            status: <em>Owned</em> (the brand's own domain), <em>Engaged</em>{" "}
            (the outlet already has a journalist on the media list), or{" "}
            <em>Target</em> (earned media the engines trust where there's no
            relationship yet — the pitch list).
          </p>
          <p>
            Type a keyword and <em>Analyze</em> filters the whole view to
            matching prompts. <em>Fan out</em> generates a spread of new prompts
            across all four intents (including brand-vs-competitor comparisons)
            and adds them to the prompt library — they're measured on the next
            collection run, so coverage questions become trackable the moment
            you think of them.
          </p>
        </Section>

        <Section title="Curating the prompt library">
          <p>
            The <strong className="text-[var(--text-primary)]">Prompts</strong>{" "}
            tab is the review gate between fanning out a keyword and the next
            collection run. Every prompt shows its intent, facet, source, and
            run count — filter to <em>Awaiting run</em> or <em>Fan-out</em> to
            see exactly what a fan-out just added. Unmeasured prompts can be
            edited (they're re-classified automatically) or deleted outright;
            once a prompt has collected runs its text is locked because it
            anchors historical data — toggle it <em>Inactive</em> to drop it
            from future collection instead. <em>Export active prompts</em>{" "}
            hands the runner exactly the curated set.
          </p>
        </Section>

        <Section title="PR attribution">
          <p>
            The <strong className="text-[var(--text-primary)]">Attribution</strong>{" "}
            tab measures outreach outcomes. The moment a journalist is added to
            the media list starts their attribution window; an article counts as
            a <em>win</em> when its first AI-engine citation lands after that
            date. The view totals articles won, citations earned from wins, the
            share of all earned citations they represent, and each journalist's
            citation volume before vs. after outreach began.
          </p>
        </Section>

        <Section title="The media list workflow">
          <p>
            On the dashboard, hit{" "}
            <span className="font-medium text-[var(--text-primary)]">
              + Add to Media List
            </span>{" "}
            on any journalist. The list lives per client (with who added each
            entry), and{" "}
            <span className="font-medium text-[var(--text-primary)]">
              Export .xlsx
            </span>{" "}
            produces the 829-branded workbook — journalist, outlet, DA, contact
            fields, citation counts, and example articles — ready to hand to the PR
            team or the client.
          </p>
        </Section>

        <Section title="Onboarding a new client">
          <p>
            Admins onboard clients at{" "}
            {isAdmin ? (
              <Link href="/admin/clients/new" className="text-[var(--accent)] underline">
                Manage clients → New client
              </Link>
            ) : (
              <span className="font-medium text-[var(--text-primary)]">
                Manage clients → New client (admins)
              </span>
            )}
            : target brand + aliases, competitors (order sets chart colors), owned
            domains, ecosystem orgs, keyword categories with classification rules,
            and the key-term vocabulary. Then run the pipeline against an export:
          </p>
          <pre className="overflow-x-auto rounded-md bg-[var(--page)] p-3 font-mono text-xs text-[var(--text-primary)]">
{`python ingest.py --client <slug> export.csv
python enrich_bylines.py --client <slug>`}
          </pre>
          <p>
            The dashboard picks the data up immediately — no deploy, no config files.
          </p>
        </Section>
      </div>
    </main>
  );
}
