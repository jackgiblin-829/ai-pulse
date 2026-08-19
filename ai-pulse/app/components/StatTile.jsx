export default function StatTile({ label, value, suffix = "", note }) {
  return (
    <div className="card p-5">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-[var(--text-primary)]">
        {value}
        <span className="text-lg font-medium text-[var(--text-secondary)]">{suffix}</span>
      </p>
      {note && <p className="mt-1 text-xs text-[var(--text-muted)]">{note}</p>}
    </div>
  );
}
