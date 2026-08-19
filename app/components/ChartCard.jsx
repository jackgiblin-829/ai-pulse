export default function ChartCard({ title, subtitle, action, children, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
          {subtitle && (
            <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
