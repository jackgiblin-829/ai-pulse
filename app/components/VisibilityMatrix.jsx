import { seqFor } from "@/lib/palette";

const ENGINES = ["chatgpt", "gemini", "claude"];
const LABELS = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude" };

// rows: [{brand, role, engine, visibility}]
export default function VisibilityMatrix({ rows }) {
  const brands = [];
  const map = {};
  for (const r of rows) {
    if (!map[r.brand]) {
      map[r.brand] = { role: r.role };
      brands.push(r.brand);
    }
    map[r.brand][r.engine] = r.visibility;
  }
  const avg = (b) =>
    Math.round((ENGINES.reduce((s, e) => s + (map[b][e] ?? 0), 0) / ENGINES.length) * 10) / 10;
  brands.sort((a, b) => (map[b].role === "target") - (map[a].role === "target") || avg(b) - avg(a));

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-xs text-[var(--text-muted)]">
            <th className="py-2 pr-3 font-medium">Brand</th>
            {ENGINES.map((e) => (
              <th key={e} className="px-2 py-2 text-center font-medium">{LABELS[e]}</th>
            ))}
            <th className="px-2 py-2 text-center font-medium">Average</th>
          </tr>
        </thead>
        <tbody>
          {brands.map((b) => (
            <tr key={b} className="border-t border-[var(--grid)]">
              <td className="py-2 pr-3 font-medium text-[var(--text-primary)]">
                {b}
                {map[b].role === "target" && (
                  <span className="ml-2 rounded-full bg-[var(--text-primary)] px-2 py-0.5 text-[10px] font-semibold text-white">
                    TARGET
                  </span>
                )}
              </td>
              {ENGINES.map((e) => {
                const v = map[b][e] ?? 0;
                return (
                  <td key={e} className="px-2 py-1.5 text-center">
                    <span
                      className="tabular inline-block w-16 rounded-md px-2 py-1 text-xs font-semibold"
                      style={{ background: seqFor(v), color: v > 55 ? "#fff" : "#0b0b0b" }}
                    >
                      {v}%
                    </span>
                  </td>
                );
              })}
              <td className="tabular px-2 py-1.5 text-center text-xs font-semibold text-[var(--text-secondary)]">
                {avg(b)}%
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
