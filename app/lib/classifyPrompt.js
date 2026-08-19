import { q } from "./db";

// JS mirror of pipeline/constants.py INTENT_RULES — keep the two in sync.
// Ordered: first match wins; informational is the catch-all.
const INTENT_RULES = [
  [/\bvs\.?\b|\bversus\b|compared? (to|with)|alternatives? to|or should i/i, "comparison"],
  [/\bbuy\b|\bprice\b|\bpricing\b|\bcost\b|\bdeal\b|\bdiscount\b|where (to|can i) (buy|get|order)|near me|worth (the|it)|\border\b/i, "transactional"],
  [/\bbest\b|\btop\b|recommend|review|\bbrands?\b|which .* (should|do)|favorite|most (reliable|durable|popular)/i, "commercial"],
];

export function classifyIntent(text) {
  for (const [re, intent] of INTENT_RULES) {
    if (re.test(text)) return intent;
  }
  return "informational";
}

// First-match against client-defined rule rows ({pattern, <key>}).
// Python-only regex syntax is skipped rather than crashing.
export function matchRules(text, rules, key) {
  for (const r of rules) {
    try {
      if (new RegExp(r.pattern, "i").test(text)) return r[key];
    } catch { /* non-portable pattern */ }
  }
  return null;
}

// Full classification for a prompt: intent + the client's keyword
// category (catch-all fallback) + facet.
export async function classifyForClient(clientId, text) {
  const rules = await q(
    `SELECT pattern, keyword_category_id FROM keyword_rules
     WHERE client_id = $1 ORDER BY position`, [Number(clientId)]);
  const facets = await q(
    `SELECT id, pattern FROM facets WHERE client_id = $1 ORDER BY position, id`,
    [Number(clientId)]);
  return {
    intent: classifyIntent(text),
    keyword_category_id:
      matchRules(text, rules, "keyword_category_id") ??
      rules[rules.length - 1]?.keyword_category_id ?? null,
    facet_id: matchRules(text, facets, "id"),
  };
}
