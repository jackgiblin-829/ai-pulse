// Token & cost estimation assumptions for the admin usage panel.
//
// Everything here is an ESTIMATE. Tokens are approximated from stored text
// at ~4 characters per token (no tokenizer runs in the app), and the rates
// below are list prices per 1M tokens for the model each engine is assumed
// to run on. Adjust the rates here when pricing or the collection models
// change — the UI renders whatever this file says.

export const CHARS_PER_TOKEN = 4;

// Per-engine collection cost: what one run's prompt (input) and response
// (output) would cost against the assumed model's API list price.
export const ENGINE_PRICING = {
  chatgpt: { label: "ChatGPT", model: "GPT-4o (assumed)", inputPerM: 2.5, outputPerM: 10 },
  gemini: { label: "Gemini", model: "Gemini 2.5 Pro (assumed)", inputPerM: 1.25, outputPerM: 10 },
  claude: { label: "Claude", model: "Claude Sonnet 4.6", inputPerM: 3, outputPerM: 15 },
};

// Pipeline NLP overhead: sentiment scoring sends each run's response text
// (capped at 12k chars in pipeline/sentiment.py) to Claude Haiku via the
// Message Batches API, which is billed at 50% of list price.
export const SENTIMENT_PRICING = {
  label: "Sentiment (pipeline)",
  model: "Claude Haiku 4.5 · Batches API",
  inputPerM: 1 * 0.5,
  outputPerM: 5 * 0.5,
};

export function estTokens(chars) {
  return Math.ceil(chars / CHARS_PER_TOKEN);
}

export function engineCost(engine, inputTokens, outputTokens) {
  const p = ENGINE_PRICING[engine];
  if (!p) return 0;
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1e6;
}

export function sentimentCost(inputTokens, outputTokens) {
  const p = SENTIMENT_PRICING;
  return (inputTokens * p.inputPerM + outputTokens * p.outputPerM) / 1e6;
}

export function fmtTokens(n) {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(n);
}

export function fmtUsd(n) {
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
