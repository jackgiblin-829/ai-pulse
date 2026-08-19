// Date-range parsing shared by pages, the dashboard API, and exports.
//
// Two range kinds:
//   { kind: "days", days: "30"|"60"|"90"|"all" }  — preset pills, computed
//     relative to the client's latest run_date (existing behavior)
//   { kind: "custom", from: "YYYY-MM-DD", to: "YYYY-MM-DD" } — calendar
//     picker, absolute dates
// Custom wins over days when both are present.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_PRESETS = ["30", "60", "90", "all"];
const DEFAULT_RANGE = { kind: "days", days: "90" };

function validDate(s) {
  if (!DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

export function parseRange(sp) {
  const from = sp?.from, to = sp?.to;
  if (from && to && validDate(from) && validDate(to) && from <= to) {
    return { kind: "custom", from, to };
  }
  if (DAY_PRESETS.includes(sp?.days)) return { kind: "days", days: sp.days };
  return DEFAULT_RANGE;
}

export function parseEngine(sp) {
  return ["all", "chatgpt", "gemini", "claude"].includes(sp?.engine) ? sp.engine : "all";
}

const fmt = new Intl.DateTimeFormat("en-US", {
  month: "short", day: "numeric", year: "numeric", timeZone: "UTC",
});

export function rangeLabel(range) {
  if (range.kind === "custom") {
    return `${fmt.format(new Date(`${range.from}T00:00:00Z`))} – ${fmt.format(new Date(`${range.to}T00:00:00Z`))}`;
  }
  return range.days === "all" ? "all time" : `last ${range.days} days`;
}

// Query-string fragment preserving the active range.
export function rangeParams(range) {
  return range.kind === "custom"
    ? `from=${range.from}&to=${range.to}`
    : `days=${range.days}`;
}
