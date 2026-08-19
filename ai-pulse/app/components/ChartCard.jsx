export default function ChartCard({ title, subtitle, children, className = "" }) {
  return (
    <section className={`card p-5 ${className}`}>
      <h2 className="text-sm font-semibold text-[var(--text-primary)]">{title}</h2>
      {subtitle && (
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">{subtitle}</p>
      )}
      <div className="mt-4">{children}</div>
    </section>
  );
}
