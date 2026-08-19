// Validated categorical palette (dataviz reference instance, light mode).
// Slot order is the CVD-safety mechanism — never re-order or cycle.
export const SLOTS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
  "#008300", // 6 green
  "#4a3aa7", // 7 violet
  "#e34948", // 8 red
];
export const GRAY = "#898781"; // muted — used for "Other"/overflow

// Color follows the entity: deterministic brand -> slot assignment per
// client. `brands` comes from trackedBrands() (target first, then
// competitors by sort_order), so the mapping is stable across loads.
export function assignBrandColors(brands) {
  const colors = {};
  brands.forEach((b, i) => {
    colors[b.name] = SLOTS[i] ?? GRAY;
  });
  return colors;
}

export const ENGINE_COLORS = { chatgpt: SLOTS[0], gemini: SLOTS[1], claude: SLOTS[2] };
export const ENGINE_LABELS = { chatgpt: "ChatGPT", gemini: "Gemini", claude: "Claude" };

// Slots 1-4 in order — the validated adjacent sequence (gray failed CVD vs aqua).
export const MEDIA_COLORS = { earned: SLOTS[0], owned: SLOTS[1], social: SLOTS[2], other: SLOTS[3] };

// Sentiment = polarity -> the documented diverging pair (blue/red) + neutral gray.
export const SENTIMENT_COLORS = { positive: "#2a78d6", neutral: "#c3c2b7", negative: "#e34948" };

export const INK = {
  primary: "#0b0b0b",
  secondary: "#52514e",
  muted: "#898781",
  grid: "#e1e0d9",
  baseline: "#c3c2b7",
  surface: "#fcfcfb",
  page: "#f9f9f7",
};

// Sequential blue ramp steps (for the visibility heat matrix).
export const SEQ = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab"];
export const seqFor = (pct) =>
  SEQ[Math.min(SEQ.length - 1, Math.floor((pct / 100) * SEQ.length))];
