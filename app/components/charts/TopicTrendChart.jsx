"use client";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { SLOTS, GRAY } from "@/lib/palette";

// rows: [{topic, week, weight}] -> pivot to [{week, <topic>: weight}].
// Topic -> slot assignment follows first appearance order (rows arrive
// week-ordered from topicWeeklyTrend, capped at 6 topics server-side).
export default function TopicTrendChart({ rows }) {
  const topics = [];
  const byWeek = new Map();
  for (const r of rows) {
    if (!topics.includes(r.topic)) topics.push(r.topic);
    if (!byWeek.has(r.week)) byWeek.set(r.week, { week: r.week.slice(5) });
    byWeek.get(r.week)[r.topic] = r.weight;
  }
  const data = [...byWeek.values()];
  const summary = topics.length
    ? `Weekly citation weight for the top ${topics.length} topics: ${topics.join(", ")}.`
    : "Weekly topic trend. No data.";
  return (
    <div className="h-72" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} strokeDasharray="0" />
          <XAxis dataKey="week" tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
          <YAxis allowDecimals={false} tickLine={false} axisLine={false} />
          <Tooltip />
          <Legend iconType="plainline"
            formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v}</span>} />
          {topics.map((t, i) => (
            <Line key={t} type="monotone" dataKey={t} stroke={SLOTS[i] ?? GRAY}
              strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
