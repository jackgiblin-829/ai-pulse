"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { MEDIA_COLORS } from "@/lib/palette";

const LABELS = { earned: "Earned media", owned: "Owned content", social: "Social media", other: "Other" };
const ORDER = ["earned", "owned", "social", "other"];

// rows: [{date, media_type, citations}]
export default function MediaStrategyChart({ rows }) {
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date.slice(5) });
    byDate.get(r.date)[r.media_type] = r.citations;
  }
  const data = [...byDate.values()];
  const totals = {};
  for (const r of rows) totals[r.media_type] = (totals[r.media_type] ?? 0) + r.citations;
  const summary = rows.length
    ? "Cited URLs by media type over time. Totals: " +
      ORDER.filter((m) => totals[m]).map((m) => `${LABELS[m]} ${totals[m]}`).join(", ") + "."
    : "Cited URLs by media type over time. No data.";
  return (
    <div className="h-72" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
          <YAxis tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, name) => [v, LABELS[name] ?? name]} />
          <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{LABELS[v] ?? v}</span>} />
          {ORDER.map((m, i) => (
            <Bar key={m} dataKey={m} stackId="mix" fill={MEDIA_COLORS[m]}
              stroke="var(--surface-1)" strokeWidth={1}
              radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
