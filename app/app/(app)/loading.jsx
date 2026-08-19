export default function Loading() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex items-center gap-3 text-sm text-[var(--text-muted)]">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-[var(--grid)] border-t-[var(--accent)]" />
        Loading…
      </div>
    </div>
  );
}
