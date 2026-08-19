function StatusChip({ row }) {
  if (row.is_owned)
    return <span className="rounded-full bg-[#e7f0fb] px-2 py-0.5 text-[10px] font-semibold text-[#1c5cab]">Owned</span>;
  if (row.media_type === "earned" && row.engaged)
    return <span className="rounded-full bg-[#e7f2e7] px-2 py-0.5 text-[10px] font-semibold text-[#006300]">Engaged</span>;
  if (row.media_type === "earned")
    return <span className="rounded-full bg-[#fdf0e6] px-2 py-0.5 text-[10px] font-semibold text-[#a04a10]">Target</span>;
  return <span className="rounded-full bg-[var(--page)] px-2 py-0.5 text-[10px] font-medium text-[var(--text-muted)]">{row.media_type}</span>;
}

export default function TargetsTable({ rows }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[24rem]">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 font-medium">Source</th>
            <th className="py-2 text-right font-medium">DA</th>
            <th className="py-2 text-right font-medium">Citations</th>
            <th className="py-2 text-right font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.domain}>
              <td className="border-t border-[var(--grid)] py-2 text-sm">
                <a
                  href={`https://${r.domain}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-medium hover:text-[var(--accent)]"
                >
                  {r.outlet ?? r.domain}
                </a>
                {r.outlet && (
                  <span className="ml-1.5 text-xs text-[var(--text-muted)]">{r.domain}</span>
                )}
              </td>
              <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">
                {r.da ?? "—"}
              </td>
              <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">
                {r.citations.toLocaleString()}
              </td>
              <td className="border-t border-[var(--grid)] py-2 text-right">
                <StatusChip row={r} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
