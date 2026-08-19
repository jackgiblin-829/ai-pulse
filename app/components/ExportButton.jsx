import Link from "next/link";

// Plain GET link — the export route streams the .xlsx download.
export default function ExportButton({ slug, label = "Export .xlsx" }) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <Link
        href={`/clients/${slug}/media-list`}
        className="rounded-full border border-[var(--border)] bg-white px-3 py-1 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:bg-[var(--page)]"
      >
        Media list
      </Link>
      <a
        href={`/api/clients/${slug}/media-list/export`}
        className="rounded-full bg-[var(--text-primary)] px-3 py-1 text-xs font-medium text-white"
      >
        {label}
      </a>
    </div>
  );
}
