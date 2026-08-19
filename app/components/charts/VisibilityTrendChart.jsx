"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { ENGINE_COLORS, ENGINE_LABELS } from "@/lib/palette";

// rows: [{date, engine, visibility}] -> pivot to [{date, chatgpt, gemini, claude}]
export default function VisibilityTrendChart({ rows }) {
  const byDate = new Map();
  for (const r of rows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { date: r.date.slice(5) });
    byDate.get(r.date)[r.engine] = r.visibility;
  }
  const data = [...byDate.values()];
  const latest = data[data.length - 1];
  const summary = latest
    ? `Visibility over time by engine. Latest (${latest.date}): ` +
      Object.keys(ENGINE_LABELS)
        .map((e) => `${ENGINE_LABELS[e]} ${latest[e] ?? 0}%`)
        .join(", ") + "."
    : "Visibility over time by engine. No data.";
  return (
    <div className="h-72" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
          <YAxis unit="%" domain={[0, 100]} tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, name) => [`${v}%`, ENGINE_LABELS[name] ?? name]} />
          <Legend iconType="plainline" formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{ENGINE_LABELS[v] ?? v}</span>} />
          {Object.keys(ENGINE_COLORS).map((e) => (
            <Line key={e} type="monotone" dataKey={e} stroke={ENGINE_COLORS[e]}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
