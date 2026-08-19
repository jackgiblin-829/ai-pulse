"use client";
import { useState } from "react";

export default function JournalistsTable({ rows }) {
  const [added, setAdded] = useState(
    () => new Set(rows.filter((r) => r.in_media_list).map((r) => r.id))
  );
  const [busy, setBusy] = useState(null);

  async function toggle(id) {
    setBusy(id);
    const isAdded = added.has(id);
    const res = await fetch("/api/media-list", {
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
    }
    setBusy(null);
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="text-left text-xs text-[var(--text-muted)]">
          <th className="py-2 font-medium">Journalist</th>
          <th className="py-2 font-medium">Outlet</th>
          <th className="py-2 text-right font-medium">DA</th>
          <th className="py-2 text-right font-medium">Citations</th>
          <th className="py-2 text-right font-medium">Media list</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="border-t border-[var(--grid)] py-2 text-sm font-medium">{r.name}</td>
            <td className="border-t border-[var(--grid)] py-2 text-sm text-[var(--text-secondary)]">{r.outlet}</td>
            <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{r.da}</td>
            <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">{r.citations.toLocaleString()}</td>
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
  );
}
