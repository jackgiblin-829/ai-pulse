// rows: [{term, freq}] — chip cloud scaled by frequency.
export default function KeyTerms({ rows }) {
  if (!rows.length) return <p className="text-sm text-[var(--text-muted)]">No terms yet.</p>;
  const max = rows[0].freq;
  const size = (f) => 11 + Math.round((f / max) * 10); // 11–21px
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
      {rows.map((r) => (
        <span
          key={r.term}
          title={`${r.freq} occurrences`}
          className="rounded-md bg-[var(--page)] px-2 py-1 font-medium text-[var(--text-secondary)]"
          style={{ fontSize: size(r.freq) }}
        >
          {r.term}
          <span className="tabular ml-1.5 text-[10px] text-[var(--text-muted)]">{r.freq}</span>
        </span>
      ))}
    </div>
  );
}
