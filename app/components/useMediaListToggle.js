"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

// Shared add/remove flow for the media-list buttons (JournalistsTable,
// EmergingAuthorsTable). Optimistic set of added ids, one in-flight id,
// and an error message that survives until the next attempt succeeds.
export default function useMediaListToggle(rows, clientSlug) {
  const router = useRouter();
  const [added, setAdded] = useState(
    () => new Set(rows.filter((r) => r.in_media_list).map((r) => r.id))
  );
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  async function toggle(id) {
    setBusy(id);
    setError(null);
    const isAdded = added.has(id);
    try {
      const res = await fetch(`/api/clients/${clientSlug}/media-list`, {
        method: isAdded ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ journalist_id: id }),
      });
      if (!res.ok) throw new Error(`request failed (${res.status})`);
      setAdded((prev) => {
        const next = new Set(prev);
        isAdded ? next.delete(id) : next.add(id);
        return next;
      });
      router.refresh(); // keep media-list/attribution views in sync
    } catch {
      setError(
        isAdded
          ? "Couldn't remove from the media list — try again."
          : "Couldn't add to the media list — try again."
      );
    } finally {
      setBusy(null);
    }
  }

  return { added, busy, error, toggle };
}
