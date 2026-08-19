import Link from "next/link";

const ENGINES = [
  ["all", "All engines"],
  ["chatgpt", "ChatGPT"],
  ["gemini", "Gemini"],
  ["claude", "Claude"],
];
const WINDOWS = [
  ["30", "30 days"],
  ["60", "60 days"],
  ["90", "90 days"],
  ["all", "All time"],
];

function Pill({ active, href, children }) {
  return (
    <Link
      href={href}
      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "bg-[var(--text-primary)] text-white"
          : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
      }`}
    >
      {children}
    </Link>
  );
}

export default function Filters({ engine, days }) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="flex items-center gap-1.5">
        {ENGINES.map(([v, label]) => (
          <Pill key={v} active={engine === v} href={`/?engine=${v}&days=${days}`}>
            {label}
          </Pill>
        ))}
      </div>
      <div className="h-4 w-px bg-[var(--grid)]" />
      <div className="flex items-center gap-1.5">
        {WINDOWS.map(([v, label]) => (
          <Pill key={v} active={days === v} href={`/?engine=${engine}&days=${v}`}>
            {label}
          </Pill>
        ))}
      </div>
    </div>
  );
}
