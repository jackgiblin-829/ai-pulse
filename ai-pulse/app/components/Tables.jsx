const ROLE_LABEL = { target: "Target", competitor: "Competitor", ecosystem: "Ecosystem" };
const MEDIA_LABEL = { earned: "Earned", owned: "Owned", social: "Social", other: "Other" };

function Th({ children, right }) {
  return (
    <th className={`py-2 text-xs font-medium text-[var(--text-muted)] ${right ? "text-right" : "text-left"}`}>
      {children}
    </th>
  );
}
const td = "py-2 text-sm border-t border-[var(--grid)]";

export function OrgMentionsTable({ rows }) {
  return (
    <div className="max-h-80 overflow-y-auto">
      <table className="w-full">
        <thead className="sticky top-0 bg-[var(--surface-1)]">
          <tr><Th>Organization</Th><Th>Type</Th><Th right>Mentions</Th><Th right>Share</Th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name}>
              <td className={`${td} font-medium`}>{r.name}</td>
              <td className={td}>
                <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                  {ROLE_LABEL[r.role]}
                </span>
              </td>
              <td className={`${td} tabular text-right`}>{r.mentions.toLocaleString()}</td>
              <td className={`${td} tabular text-right text-[var(--text-secondary)]`}>{r.pct}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function DomainsTable({ rows }) {
  return (
    <table className="w-full">
      <thead>
        <tr><Th>Domain</Th><Th>Type</Th><Th right>Citations</Th><Th right>Unique URLs</Th></tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domain}>
            <td className={`${td} font-medium`}>{r.domain}</td>
            <td className={td}>
              <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-[10px] text-[var(--text-secondary)]">
                {MEDIA_LABEL[r.media_type]}
              </span>
            </td>
            <td className={`${td} tabular text-right`}>{r.citations.toLocaleString()}</td>
            <td className={`${td} tabular text-right text-[var(--text-secondary)]`}>{r.unique_urls}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OwnedUrlsTable({ rows }) {
  return (
    <table className="w-full">
      <thead><tr><Th>URL</Th><Th right>Citations</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.url}>
            <td className={`${td} max-w-0 truncate pr-4 font-medium`} title={r.url}>
              {r.url.replace(/^https?:\/\/(www\.)?/, "")}
            </td>
            <td className={`${td} tabular text-right`}>{r.citations.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function OutletsTable({ rows }) {
  return (
    <table className="w-full">
      <thead><tr><Th>Outlet</Th><Th>Domain</Th><Th right>DA</Th><Th right>Citations</Th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.domain}>
            <td className={`${td} font-medium`}>{r.outlet}</td>
            <td className={`${td} text-[var(--text-secondary)]`}>{r.domain}</td>
            <td className={`${td} tabular text-right`}>{r.da}</td>
            <td className={`${td} tabular text-right`}>{r.citations.toLocaleString()}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
