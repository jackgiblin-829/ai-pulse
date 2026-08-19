"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";

const FILTERS = [
  ["all", "All"],
  ["awaiting", "Awaiting run"],
  ["fanout", "Fan-out"],
  ["inactive", "Inactive"],
];

const chipCls = (on) =>
  `rounded-full px-3 py-1 text-xs font-medium transition-colors ${
    on
      ? "bg-[var(--text-primary)] text-white"
      : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
  }`;
const smallBtn =
  "rounded-md border border-[var(--border)] bg-white px-2.5 py-1 text-xs font-medium " +
  "text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)] disabled:opacity-40";

export default function PromptsTable({ rows, clientSlug }) {
  const router = useRouter();
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(null);
  const [editing, setEditing] = useState(null); // {id, text}
  const [error, setError] = useState(null);

  const visible = useMemo(() => {
    let out = rows;
    if (filter === "awaiting") out = out.filter((r) => r.runs === 0);
    if (filter === "fanout") out = out.filter((r) => r.source === "fanout");
    if (filter === "inactive") out = out.filter((r) => !r.active);
    if (search.trim()) {
      const s = search.trim().toLowerCase();
      out = out.filter((r) => r.text.toLowerCase().includes(s));
    }
    return out;
  }, [rows, filter, search]);

  async function call(method, body) {
    setError(null);
    const res = await fetch(`/api/clients/${clientSlug}/prompts`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Request failed");
      return false;
    }
    router.refresh();
    return true;
  }

  async function toggleActive(r) {
    setBusy(r.id);
    await call("PUT", { id: r.id, active: !r.active });
    setBusy(null);
  }

  async function remove(r) {
    if (!window.confirm(`Delete this prompt?\n\n"${r.text}"`)) return;
    setBusy(r.id);
    await call("DELETE", { id: r.id });
    setBusy(null);
  }

  async function saveEdit() {
    setBusy(editing.id);
    const ok = await call("PUT", { id: editing.id, text: editing.text });
    if (ok) setEditing(null);
    setBusy(null);
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map(([v, label]) => (
          <button key={v} type="button" className={chipCls(filter === v)} onClick={() => setFilter(v)}>
            {label}
          </button>
        ))}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search prompts…"
          className="ml-auto w-56 rounded-md border border-[var(--border)] bg-white px-3 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
        />
      </div>
      {error && <p className="mt-2 text-xs text-[#e34948]">{error}</p>}

      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[44rem]">
          <thead>
            <tr className="text-left text-xs text-[var(--text-muted)]">
              <th className="py-2 font-medium">Prompt</th>
              <th className="py-2 font-medium">Intent</th>
              <th className="py-2 font-medium">Facet</th>
              <th className="py-2 text-right font-medium">Runs</th>
              <th className="py-2 font-medium">Source</th>
              <th className="py-2 text-right font-medium">Status</th>
              <th className="py-2 text-right font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.id} className={r.active ? "" : "opacity-50"}>
                <td className="max-w-md border-t border-[var(--grid)] py-2 pr-4 text-sm">
                  {editing?.id === r.id ? (
                    <div className="flex items-end gap-2">
                      <textarea
                        value={editing.text}
                        onChange={(e) => setEditing({ ...editing, text: e.target.value })}
                        rows={2}
                        className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm focus:border-[var(--accent)] focus:outline-none"
                      />
                      <button type="button" className={smallBtn} disabled={busy === r.id} onClick={saveEdit}>
                        Save
                      </button>
                      <button type="button" className={smallBtn} onClick={() => setEditing(null)}>
                        Cancel
                      </button>
                    </div>
                  ) : (
                    r.text
                  )}
                </td>
                <td className="border-t border-[var(--grid)] py-2 text-xs capitalize text-[var(--text-secondary)]">{r.intent ?? "—"}</td>
                <td className="border-t border-[var(--grid)] py-2 text-xs text-[var(--text-secondary)]">{r.facet ?? "—"}</td>
                <td className="tabular border-t border-[var(--grid)] py-2 text-right text-sm">
                  {r.runs > 0 ? r.runs.toLocaleString() : (
                    <span className="text-xs text-[#a04a10]">awaiting</span>
                  )}
                </td>
                <td className="border-t border-[var(--grid)] py-2">
                  {r.source === "fanout" ? (
                    <span className="rounded-full bg-[#eceafb] px-2 py-0.5 text-[10px] font-medium text-[#4a3aa7]">fanout</span>
                  ) : (
                    <span className="text-xs text-[var(--text-muted)]">import</span>
                  )}
                </td>
                <td className="border-t border-[var(--grid)] py-2 text-right">
                  <button
                    type="button"
                    disabled={busy === r.id}
                    onClick={() => toggleActive(r)}
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-colors disabled:opacity-40 ${
                      r.active
                        ? "bg-[#e7f2e7] text-[#006300] hover:bg-[#d8ecd8]"
                        : "bg-[var(--page)] text-[var(--text-muted)] hover:bg-[var(--grid)]"
                    }`}
                  >
                    {r.active ? "Active" : "Inactive"}
                  </button>
                </td>
                <td className="border-t border-[var(--grid)] py-2 text-right">
                  <div className="flex justify-end gap-1.5">
                    <button
                      type="button"
                      className={smallBtn}
                      disabled={r.runs > 0 || busy === r.id}
                      title={r.runs > 0 ? "Measured prompts are locked — deactivate instead" : "Edit prompt text"}
                      onClick={() => setEditing({ id: r.id, text: r.text })}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className={smallBtn}
                      disabled={r.runs > 0 || busy === r.id}
                      title={r.runs > 0 ? "Measured prompts anchor history — deactivate instead" : "Delete prompt"}
                      onClick={() => remove(r)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-sm text-[var(--text-muted)]">
                  No prompts match this filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
