"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function FanoutSearch({ slug, initialQ, facetId }) {
  const router = useRouter();
  const [kw, setKw] = useState(initialQ);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  function analyze(e) {
    e.preventDefault();
    const p = new URLSearchParams();
    if (kw.trim()) p.set("q", kw.trim());
    if (facetId) p.set("facet", facetId);
    router.push(`/clients/${slug}/targets${p.toString() ? `?${p}` : ""}`);
  }

  async function fanout() {
    if (!kw.trim() || busy) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await fetch(`/api/clients/${slug}/fanout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyword: kw.trim() }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? "Fan-out failed" });
      } else {
        setResult(data);
        const p = new URLSearchParams({ q: kw.trim() });
        if (facetId) p.set("facet", facetId);
        router.push(`/clients/${slug}/targets?${p}`);
        router.refresh();
      }
    } catch {
      setResult({ error: "Fan-out failed" });
    }
    setBusy(false);
  }

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
          className="rounded-md border border-[var(--border)] bg-white px-4 py-2 text-sm font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
        >
          Analyze
        </button>
        <button
          type="button"
          onClick={fanout}
          disabled={busy || !kw.trim()}
          className="rounded-md bg-[var(--text-primary)] px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          {busy ? "Fanning out…" : "Fan out → prompt library"}
        </button>
      </form>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        Analyze filters everything below to prompts matching the keyword. Fan out
        generates an intent spread of new prompts (commercial, informational,
        comparison, transactional) and adds them to the library — they're
        measured on the next collection run.
      </p>
      {result?.error && <p className="mt-2 text-xs text-[#e34948]">{result.error}</p>}
      {result?.created?.length > 0 && (
        <div className="mt-3 rounded-md bg-[var(--page)] p-3">
          <p className="text-xs font-semibold text-[var(--text-primary)]">
            {result.created.length} prompts added ({result.skipped} already existed)
          </p>
          <ul className="mt-1.5 space-y-1">
            {result.created.map((c) => (
              <li key={c.text} className="text-xs text-[var(--text-secondary)]">
                <span className="mr-1.5 inline-block w-24 font-medium capitalize text-[var(--text-muted)]">{c.intent}</span>
                {c.text}
              </li>
            ))}
          </ul>
        </div>
      )}
      {result && !result.error && result.created?.length === 0 && (
        <p className="mt-2 text-xs text-[var(--text-muted)]">
          All fan-out prompts for this keyword already exist in the library.
        </p>
      )}
    </div>
  );
}
