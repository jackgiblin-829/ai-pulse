"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const INTENT_LABELS = {
  informational: "Informational",
  commercial: "Commercial",
  comparison: "Comparison",
  transactional: "Transactional",
};

export default function FanoutSearch({ slug, initialQ, facetId }) {
  const router = useRouter();
  const [kw, setKw] = useState(initialQ);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(null);   // {keyword, generator, candidates}
  const [checked, setChecked] = useState(new Set());
  const [committed, setCommitted] = useState(null); // {created, skipped}
  const [error, setError] = useState(null);

  function coverageUrl(q) {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (facetId) p.set("facet", facetId);
    const qs = p.toString();
    return `/clients/${slug}/targets${qs ? `?${qs}` : ""}`;
  }

  // Analyze = filter the page to the keyword AND generate the fan-out
  // preview. Nothing is added to the library until the user commits.
  async function analyze(e) {
    e.preventDefault();
    const q = kw.trim();
    setError(null);
    setCommitted(null);
    setPreview(null);
    router.push(coverageUrl(q));
    if (q.length < 3) return; // just a filter reset
    setBusy(true);
    try {
      const res = await fetch(`/api/clients/${slug}/fanout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: q }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Analysis failed");
      } else {
        setPreview(data);
        // preselect everything not already in the library
        setChecked(new Set(data.candidates.filter((c) => !c.exists).map((c) => c.text)));
      }
    } catch {
      setError("Analysis failed");
    }
    setBusy(false);
  }

  function toggle(text) {
    setChecked((prev) => {
      const next = new Set(prev);
      next.has(text) ? next.delete(text) : next.add(text);
      return next;
    });
  }

  async function addSelected() {
    if (!preview || checked.size === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const add = preview.candidates.filter((c) => checked.has(c.text));
      const res = await fetch(`/api/clients/${slug}/fanout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: preview.keyword, add }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Adding failed");
      } else {
        setCommitted(data);
        setPreview(null);
        router.refresh();
      }
    } catch {
      setError("Adding failed");
    }
    setBusy(false);
  }

  const selectable = preview?.candidates.filter((c) => !c.exists) ?? [];

  return (
    <div className="card p-5">
      <form onSubmit={analyze} className="flex flex-wrap items-end gap-3">
        <label className="min-w-56 flex-1 text-xs font-medium text-[var(--text-secondary)]">
          Keyword
          <input
            value={kw}
            onChange={(e) => setKw(e.target.value)}
            placeholder="e.g. recycled plastic Adirondack chairs"
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm focus:border-[var(--accent)] focus:outline-none"
          />
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-md bg-[var(--text-primary)] px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {busy && !preview ? "Analyzing…" : "Analyze"}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Analyze filters the view to this keyword and generates an intent spread
        of candidate prompts — pick the ones worth measuring before anything is
        added to the library.
      </p>
      {error && <p className="mt-2 text-xs text-[#e34948]">{error}</p>}

      {preview && (
        <div className="mt-4 rounded-md border border-[var(--grid)] bg-[var(--page)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--text-primary)]">
              {preview.candidates.length} candidate prompts for “{preview.keyword}”
            </p>
            {preview.generator === "templates" && (
              <p className="text-[11px] text-[var(--text-muted)]">
                template phrasing — set ANTHROPIC_API_KEY for Claude-generated variants
              </p>
            )}
          </div>
          <ul className="mt-2 space-y-1.5">
            {preview.candidates.map((c) => (
              <li key={c.text}>
                <label
                  className={`flex cursor-pointer items-start gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors ${
                    c.exists ? "cursor-default opacity-50" : "hover:bg-white"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={c.exists}
                    checked={c.exists || checked.has(c.text)}
                    onChange={() => toggle(c.text)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--accent)]"
                  />
                  <span className="w-24 shrink-0 pt-px text-[11px] font-medium text-[var(--text-muted)]">
                    {INTENT_LABELS[c.intent] ?? c.intent}
                  </span>
                  <span>
                    {c.text}
                    {c.exists && (
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">already in library</span>
                    )}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {selectable.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-3 border-t border-[var(--grid)] pt-3">
              <button
                type="button"
                onClick={addSelected}
                disabled={busy || checked.size === 0}
                className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
              >
                {busy ? "Adding…" : `Add ${checked.size} to prompt library`}
              </button>
              <button
                type="button"
                onClick={() => setPreview(null)}
                className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
              >
                Dismiss
              </button>
              <p className="text-xs text-[var(--text-muted)]">
                Selected prompts are grouped under a new “{preview.keyword}”
                service-area facet and measured on the next collection run.
              </p>
            </div>
          ) : (
            <p className="mt-3 border-t border-[var(--grid)] pt-3 text-xs text-[var(--text-muted)]">
              Every candidate is already in the library — curate them in the Prompts tab.
            </p>
          )}
        </div>
      )}

      {committed && (
        <div className="mt-4 rounded-md border border-[#cfe6cf] bg-[#f0f8f0] p-3">
          <p className="text-xs font-semibold text-[#006300]">
            {committed.created.length} prompt{committed.created.length === 1 ? "" : "s"} added to the library
            {committed.skipped > 0 && ` (${committed.skipped} already existed)`}
          </p>
          <p className="mt-1 text-xs text-[var(--text-secondary)]">
            {committed.facet && (
              <>Grouped under the new <strong>{committed.facet}</strong> facet
              (see the refinement chips below). </>
            )}
            Review or refine them anytime in the{" "}
            <a href={`/clients/${slug}/prompts`} className="text-[var(--accent)] underline">
              Prompts tab
            </a>
            — they'll be measured on the next collection run.
          </p>
        </div>
      )}
    </div>
  );
}
