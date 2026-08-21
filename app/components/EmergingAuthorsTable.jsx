"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCE_LABELS = { tavily: "web", profound: "profound", llm_run: "engines" };

function Badge({ isNew }) {
  return isNew ? (
    <span className="ml-1.5 rounded-full bg-[#e7f2e7] px-1.5 py-0.5 text-[10px] font-semibold text-[#006300]">
      NEW
    </span>
  ) : (
    <span className="ml-1.5 rounded-full bg-[#eceafb] px-1.5 py-0.5 text-[10px] font-semibold text-[#4a3aa7]">
      ▲ rising
    </span>
  );
}

// Same add/remove flow as JournalistsTable — discovered authors land in
// journalists via enrich_bylines, so the media-list API works unmodified.
export default function EmergingAuthorsTable({ rows, clientSlug }) {
  const router = useRouter();
  const [added, setAdded] = useState(
    () => new Set(rows.filter((r) => r.in_media_list).map((r) => r.id))
  );
  const [busy, setBusy] = useState(null);

  async function toggle(id) {
    setBusy(id);
    const isAdded = added.has(id);
    const res = await fetch(`/api/clients/${clientSlug}/media-list`, {
      method: isAdded ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journalist_id: id }),
    });
    if (res.ok) {
      setAdded((prev) => {
        const next = new Set(prev);
        isAdded ? next.delete(id) : next.add(id);
        return next;
      });
      router.refresh();
    }
    setBusy(null);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem]">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 font-medium">Author</th>
            <th className="py-2 font-medium">Outlet</th>
            <th className="py-2 text-right font-medium">DA</th>
            <th className="py-2 font-medium">First seen</th>
            <th className="py-2 text-right font-medium">Recent vs prior</th>
            <th className="py-2 font-medium">Sources</th>
            <th className="py-2 text-right font-medium">Media list</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">
                {r.name}
                <Badge isNew={r.is_new} />
              </td>
              <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">
                {r.outlet ?? "—"}
              </td>
              <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">
                {r.da ?? "—"}
              </td>
              <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">
                {r.first_seen}
              </td>
              <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">
                {r.recent} <span className="text-[var(--text-muted)]">vs {r.prior}</span>
              </td>
              <td className="border-t border-[var(--grid)] py-2">
                <span className="flex flex-wrap gap-1">
                  {(r.sources ?? []).map((s) => (
                    <span key={s}
                      className="rounded-full bg-[var(--page)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--text-secondary)]">
                      {SOURCE_LABELS[s] ?? s}
                    </span>
                  ))}
                </span>
              </td>
              <td className="border-t border-[var(--grid)] py-2 text-right">
                <button
                  onClick={() => toggle(r.id)}
                  disabled={busy === r.id}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                    added.has(r.id)
                      ? "bg-[#e7f2e7] text-[#006300]"
                      : "border border-[var(--border)] bg-white text-[var(--text-secondary)] hover:bg-[var(--page)]"
                  }`}
                >
                  {added.has(r.id) ? "✓ Added" : "+ Add to Media List"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
