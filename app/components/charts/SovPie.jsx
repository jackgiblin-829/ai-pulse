"use client";
import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { SLOTS, GRAY } from "@/lib/palette";

// items: [{name, pct, color?}]  — folds everything past `max` into "Other".
export default function SovPie({ items, max = 8 }) {
  let data = items.map((d) => ({ ...d }));
  if (data.length > max) {
    const head = data.slice(0, max - 1);
    const tailPct = data.slice(max - 1).reduce((s, d) => s + d.pct, 0);
    data = [...head, { name: "Other", pct: Math.round(tailPct * 10) / 10, color: GRAY }];
  }
  data = data.map((d, i) => ({ ...d, color: d.color ?? SLOTS[i] ?? GRAY }));
  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="pct" nameKey="name" innerRadius="45%" outerRadius="78%"
            paddingAngle={1.5} stroke="var(--surface-1)" strokeWidth={2}
            label={({ pct }) => `${pct}%`} labelLine={false}>
            {data.map((d) => <Cell key={d.name} fill={d.color} />)}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} />
          <Legend layout="vertical" align="right" verticalAlign="middle"
            formatter={(v) => (
              <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{v}</span>
            )} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
