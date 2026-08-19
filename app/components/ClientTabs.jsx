import Link from "next/link";

const TABS = [
  ["", "Report"],
  ["/targets", "Citation targets"],
  ["/media-list", "Media list"],
  ["/attribution", "Attribution"],
];

export default function ClientTabs({ slug, active }) {
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      {TABS.map(([path, label]) => (
        <Link
          key={path}
          href={`/clients/${slug}${path}`}
          aria-current={active === path ? "page" : undefined}
          className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            active === path
              ? "bg-[var(--text-primary)] text-white"
              : "bg-white text-[var(--text-secondary)] border border-[var(--border)] hover:bg-[var(--page)]"
          }`}
        >
          {label}
        </Link>
      ))}
    </div>
  );
}
