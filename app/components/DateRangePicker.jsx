"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";

// Local (not UTC) y/m/d formatting — toISOString would shift days.
function ymd(d) {
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fromYmd(s) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const shortFmt = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export default function DateRangePicker({ engine, range, basePath, bounds }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(() =>
    range.kind === "custom"
      ? { from: fromYmd(range.from), to: fromYmd(range.to) }
      : undefined
  );
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const active = range.kind === "custom";
  const label = active
    ? `${shortFmt.format(fromYmd(range.from))} – ${shortFmt.format(fromYmd(range.to))}`
    : "Custom range";

  function apply() {
    if (!selected?.from) return;
    const to = selected.to ?? selected.from;
    router.push(`${basePath}?engine=${engine}&from=${ymd(selected.from)}&to=${ymd(to)}`);
    setOpen(false);
  }
  function clear() {
    setSelected(undefined);
    router.push(`${basePath}?engine=${engine}&days=90`);
    setOpen(false);
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
          active
            ? "bg-[var(--text-primary)] text-white"
            : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
        }`}
      >
        {label} ▾
      </button>
      {open && (
        <div className="card absolute right-0 top-full z-20 mt-2 p-4 shadow-lg">
          <DayPicker
            mode="range"
            numberOfMonths={2}
            selected={selected}
            onSelect={setSelected}
            defaultMonth={
              selected?.from ??
              (bounds?.max ? fromYmd(bounds.max) : new Date())
            }
            disabled={
              bounds?.min && bounds?.max
                ? { before: fromYmd(bounds.min), after: fromYmd(bounds.max) }
                : undefined
            }
          />
          <div className="mt-3 flex items-center justify-end gap-2 border-t border-[var(--grid)] pt-3">
            <button
              type="button"
              onClick={clear}
              className="rounded-md border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--page)]"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={apply}
              disabled={!selected?.from}
              className="rounded-md bg-[var(--text-primary)] px-3 py-1 text-xs font-medium text-white disabled:opacity-40"
            >
              Apply
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
