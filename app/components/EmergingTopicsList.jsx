const SOURCE_LABELS = { tavily: "web", profound: "profound", llm_run: "engines" };

// Server-renderable emerging-topics list. rows come from emergingTopics().
export default function EmergingTopicsList({ rows }) {
  return (
    <ul className="divide-y divide-[var(--grid)]">
      {rows.map((t) => (
        <li key={t.id} className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-sm font-medium">
              {t.name}
              {t.is_new ? (
                <span className="ml-1.5 rounded-full bg-[#e7f2e7] px-1.5 py-0.5 text-[10px] font-semibold text-[#006300]">
                  NEW
                </span>
              ) : (
                <span className="ml-1.5 rounded-full bg-[#eceafb] px-1.5 py-0.5 text-[10px] font-semibold text-[#4a3aa7]">
                  ▲ rising
                </span>
              )}
            </p>
            <p className="tabular shrink-0 text-xs text-[var(--text-muted)]">
              <span className="font-semibold text-[var(--text-primary)]">{t.recent}</span>
              {" "}vs {t.prior} · {t.urls} URL{t.urls === 1 ? "" : "s"}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            {(t.sources ?? []).map((s) => (
              <span key={s}
                className="rounded-full bg-[var(--page)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                {SOURCE_LABELS[s] ?? s}
              </span>
            ))}
            {(t.examples ?? []).map((u) => {
              let host = u;
              try { host = new URL(u).hostname.replace(/^www\./, ""); } catch {}
              return (
                <a key={u} href={u} target="_blank" rel="noopener noreferrer"
                  className="max-w-56 truncate text-xs text-[var(--text-muted)] underline decoration-[var(--baseline)] hover:text-[var(--text-secondary)]">
                  {host}
                </a>
              );
            })}
          </div>
        </li>
      ))}
    </ul>
  );
}
