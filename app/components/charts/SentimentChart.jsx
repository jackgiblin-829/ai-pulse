"use client";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";
import { SENTIMENT_COLORS } from "@/lib/palette";

const ORDER = ["positive", "neutral", "negative"];
const LABELS = { positive: "Positive", neutral: "Neutral", negative: "Negative" };

// rows: [{date, positive, neutral, negative}] (percentages)
export default function SentimentChart({ rows }) {
  const data = rows.map((r) => ({ ...r, date: r.date.slice(5) }));
  const latest = data[data.length - 1];
  const summary = latest
    ? `Sentiment mix per collection date. Latest (${latest.date}): positive ${latest.positive}%, neutral ${latest.neutral}%, negative ${latest.negative}%.`
    : "Sentiment mix per collection date. No data.";
  return (
    <div className="h-72" role="img" aria-label={summary}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={{ stroke: "var(--baseline)" }} />
          <YAxis unit="%" domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            allowDataOverflow tickLine={false} axisLine={false} />
          <Tooltip formatter={(v, name) => [`${v}%`, LABELS[name] ?? name]} />
          <Legend formatter={(v) => <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{LABELS[v] ?? v}</span>} />
          {ORDER.map((s, i) => (
            <Bar key={s} dataKey={s} stackId="sent" fill={SENTIMENT_COLORS[s]}
              stroke="var(--surface-1)" strokeWidth={1}
              radius={i === ORDER.length - 1 ? [4, 4, 0, 0] : 0} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
