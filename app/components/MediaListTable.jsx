"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MediaListTable({ rows, clientSlug }) {
  const router = useRouter();
  const [busy, setBusy] = useState(null);

  async function remove(id) {
    setBusy(id);
    const res = await fetch(`/api/clients/${clientSlug}/media-list`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ journalist_id: id }),
    });
    if (res.ok) router.refresh();
    setBusy(null);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[28rem]">
      <thead>
        <tr className="text-left text-xs text-[var(--text-muted)]">
          <th className="py-2 font-medium">Journalist</th>
          <th className="py-2 font-medium">Outlet</th>
          <th className="py-2 text-right font-medium">DA</th>
          <th className="py-2 text-right font-medium">Citations</th>
          <th className="py-2 pl-4 font-medium">Example article</th>
          <th className="py-2 font-medium">Added</th>
          <th className="py-2 font-medium">By</th>
          <th className="py-2 text-right font-medium"></th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">{r.name}</td>
            <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{r.outlet}</td>
            <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{r.da ?? "—"}</td>
            <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{r.citations.toLocaleString()}</td>
            <td className="max-w-64 truncate border-t border-[var(--grid)] py-2 pl-4 text-xs">
              {r.examples?.[0] ? (
                <a href={r.examples[0]} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
                  {r.examples[0].replace(/^https?:\/\/(www\.)?/, "")}
                </a>
              ) : (
                <span className="text-[var(--text-muted)]">—</span>
              )}
            </td>
            <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{r.added_at}</td>
            <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{r.added_by}</td>
            <td className="border-t border-[var(--grid)] py-2 text-right">
              <button
                onClick={() => remove(r.id)}
                disabled={busy === r.id}
                className="rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] disabled:opacity-50"
              >
                Remove
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
