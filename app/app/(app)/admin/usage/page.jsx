import { requireAdmin } from "@/lib/auth";
import { usageByClientMonth, sentimentUsageByClientMonth } from "@/lib/queries";
import {
  ENGINE_PRICING, SENTIMENT_PRICING, CHARS_PER_TOKEN,
  estTokens, engineCost, sentimentCost, fmtTokens, fmtUsd,
} from "@/lib/pricing";

export const dynamic = "force-dynamic";

export const metadata = { title: "Token usage | AI Pulse" };

// Sentiment output ≈ one small JSON entry per scored brand (sentiment.py
// caps max_tokens at ~100/brand; real replies run ~30 tokens each).
const SENTIMENT_OUTPUT_TOKENS_PER_BRAND = 30;

export default async function AdminUsage() {
  await requireAdmin();
  const [engineRows, sentimentRows] = await Promise.all([
    usageByClientMonth(),
    sentimentUsageByClientMonth(),
  ]);

  // months → clients → { engines: {engine: {...}}, nlp: {...} }
  const months = new Map();
  const clientFor = (month, slug, name) => {
    if (!months.has(month)) months.set(month, new Map());
    const clients = months.get(month);
    if (!clients.has(slug)) {
      clients.set(slug, { name, engines: {}, nlp: null });
    }
    return clients.get(slug);
  };

  for (const r of engineRows) {
    const c = clientFor(r.month, r.slug, r.name);
    const input = estTokens(r.input_chars);
    const output = estTokens(r.output_chars);
    c.engines[r.engine] = {
      runs: r.runs, input, output,
      cost: engineCost(r.engine, input, output),
    };
  }
  for (const r of sentimentRows) {
    if (!months.has(r.month) || !months.get(r.month).has(r.slug)) continue;
    const input = estTokens(r.input_chars);
    const output = r.scored_brands * SENTIMENT_OUTPUT_TOKENS_PER_BRAND;
    months.get(r.month).get(r.slug).nlp = {
      runs: r.scored_runs, input, output,
      cost: sentimentCost(input, output),
    };
  }

  const monthKeys = [...months.keys()].sort().reverse();
  const monthLabel = (m) =>
    new Date(`${m}-01T00:00:00`).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const clientTotals = (c) => {
    const parts = [...Object.values(c.engines), ...(c.nlp ? [c.nlp] : [])];
    return {
      runs: Object.values(c.engines).reduce((s, e) => s + e.runs, 0),
      input: parts.reduce((s, e) => s + e.input, 0),
      output: parts.reduce((s, e) => s + e.output, 0),
      cost: parts.reduce((s, e) => s + e.cost, 0),
    };
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
          Admin
        </p>
        <h1 className="mt-1 text-2xl font-semibold">Token Usage & Cost Estimates</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Monthly estimated token volume and API cost per client — engine
          collection runs plus pipeline sentiment scoring.
        </p>
      </header>

      <section className="card mb-4 p-5">
        <h2 className="text-sm font-semibold">How these numbers are estimated</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
          Tokens are approximated from stored text at ~{CHARS_PER_TOKEN} characters per token
          (input = prompt text, output = response text) — no tokenizer runs here. Costs apply
          each engine&apos;s assumed model list price; adjust rates in{" "}
          <code className="rounded bg-[var(--page)] px-1 py-0.5">app/lib/pricing.js</code>.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[28rem]">
            <thead>
              <tr className="text-left text-xs text-[var(--text-muted)]">
                <th className="py-1.5 font-medium">Source</th>
                <th className="py-1.5 font-medium">Priced as</th>
                <th className="py-1.5 text-right font-medium">Input $/1M</th>
                <th className="py-1.5 text-right font-medium">Output $/1M</th>
              </tr>
            </thead>
            <tbody>
              {Object.values(ENGINE_PRICING).map((p) => (
                <tr key={p.label}>
                  <td className="border-t border-[var(--grid)] py-1.5 text-sm">{p.label}</td>
                  <td className="border-t border-[var(--grid)] py-1.5 text-xs text-[var(--text-secondary)]">{p.model}</td>
                  <td className="tabular border-t border-[var(--grid)] py-1.5 text-right text-sm">{fmtUsd(p.inputPerM)}</td>
                  <td className="tabular border-t border-[var(--grid)] py-1.5 text-right text-sm">{fmtUsd(p.outputPerM)}</td>
                </tr>
              ))}
              <tr>
                <td className="border-t border-[var(--grid)] py-1.5 text-sm">{SENTIMENT_PRICING.label}</td>
                <td className="border-t border-[var(--grid)] py-1.5 text-xs text-[var(--text-secondary)]">{SENTIMENT_PRICING.model}</td>
                <td className="tabular border-t border-[var(--grid)] py-1.5 text-right text-sm">{fmtUsd(SENTIMENT_PRICING.inputPerM)}</td>
                <td className="tabular border-t border-[var(--grid)] py-1.5 text-right text-sm">{fmtUsd(SENTIMENT_PRICING.outputPerM)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      {monthKeys.length === 0 && (
        <div className="card p-10 text-center text-sm text-[var(--text-muted)]">
          No runs ingested yet — usage appears here once a client has data.
        </div>
      )}

      {monthKeys.map((month) => {
        const clients = [...months.get(month).entries()].sort((a, b) =>
          a[1].name.localeCompare(b[1].name)
        );
        const monthTotal = clients.reduce(
          (acc, [, c]) => {
            const t = clientTotals(c);
            return {
              runs: acc.runs + t.runs, input: acc.input + t.input,
              output: acc.output + t.output, cost: acc.cost + t.cost,
            };
          },
          { runs: 0, input: 0, output: 0, cost: 0 }
        );
        return (
          <section key={month} className="card mb-4 p-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">{monthLabel(month)}</h2>
              <p className="text-xs text-[var(--text-muted)]">
                {monthTotal.runs.toLocaleString()} runs · {fmtTokens(monthTotal.input + monthTotal.output)} tokens ·{" "}
                <span className="font-semibold text-[var(--text-primary)]">{fmtUsd(monthTotal.cost)}</span>
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[36rem]">
                <thead>
                  <tr className="text-left text-xs text-[var(--text-muted)]">
                    <th className="py-2 font-medium">Client</th>
                    <th className="py-2 text-right font-medium">Runs</th>
                    <th className="py-2 text-right font-medium">Input tokens</th>
                    <th className="py-2 text-right font-medium">Output tokens</th>
                    <th className="py-2 text-right font-medium">Est. cost</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(([slug, c]) => {
                    const t = clientTotals(c);
                    return (
                      <tr key={slug} className="align-top">
                        <td className="border-t border-[var(--grid)] py-2">
                          <p className="text-sm font-medium">{c.name}</p>
                          <p className="mt-0.5 text-[11px] text-[var(--text-muted)]">
                            {Object.entries(c.engines)
                              .map(([eng, e]) =>
                                `${ENGINE_PRICING[eng]?.label ?? eng} ${fmtUsd(e.cost)}`)
                              .join(" · ")}
                            {c.nlp ? ` · Sentiment ${fmtUsd(c.nlp.cost)}` : ""}
                          </p>
                        </td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{t.runs.toLocaleString()}</td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{fmtTokens(t.input)}</td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{fmtTokens(t.output)}</td>
                        <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm font-semibold">{fmtUsd(t.cost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="text-xs text-[var(--text-muted)]">
                    <td className="border-t border-[var(--border)] py-2 font-medium">Total</td>
                    <td className="tabular border-t border-[var(--border)] py-2 text-right">{monthTotal.runs.toLocaleString()}</td>
                    <td className="tabular border-t border-[var(--border)] py-2 text-right">{fmtTokens(monthTotal.input)}</td>
                    <td className="tabular border-t border-[var(--border)] py-2 text-right">{fmtTokens(monthTotal.output)}</td>
                    <td className="tabular border-t border-[var(--border)] py-2 text-right font-semibold text-[var(--text-primary)]">{fmtUsd(monthTotal.cost)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        );
      })}
    </main>
  );
}
