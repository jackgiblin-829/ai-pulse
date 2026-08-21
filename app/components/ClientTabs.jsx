import Link from "next/link";

const TABS = [
  ["", "Report"],
  ["/targets", "Citation targets"],
  ["/emerging", "Emerging"],
  ["/prompts", "Prompts"],
  ["/media-list", "Media list"],
  ["/attribution", "Attribution"],
];

// View switcher — deliberately styled as underline tabs, not pills, so it
// reads as navigation rather than a data filter (which uses pills).
export default function ClientTabs({ slug, active }) {
  return (
    <nav aria-label="Client views" className="mt-4 flex items-center gap-5 border-b border-[var(--grid)]">
      {TABS.map(([path, label]) => {
        const isActive = active === path;
        return (
          <Link
            key={path}
            href={`/clients/${slug}${path}`}
            aria-current={isActive ? "page" : undefined}
            className={`-mb-px border-b-2 pb-2 text-sm transition-colors ${
              isActive
                ? "border-[var(--text-primary)] font-semibold text-[var(--text-primary)]"
                : "border-transparent font-medium text-[var(--text-muted)] hover:border-[var(--baseline)] hover:text-[var(--text-secondary)]"
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
