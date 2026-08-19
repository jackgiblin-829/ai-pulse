"""
Pluggable per-brand sentiment analyzers.

- AnthropicSentimentAnalyzer: production path. Sends the response text +
  brand to Claude and gets back {label, score}. Used automatically when
  ANTHROPIC_API_KEY is set.
- LexiconSentimentAnalyzer: dependency-free fallback tuned to the
  outdoor-furniture domain. Scores a +/-160-char context window around
  each brand mention.
"""
import json, os, re, urllib.request

POSITIVE = {
    "best", "top", "praised", "gold standard", "excellent", "durable",
    "comfortable", "remarkably", "strong", "stands out", "recommend",
    "recommended", "worth", "high quality", "highest quality", "premium",
    "fade-resistant", "no warping", "well made", "loved", "favorite",
    "winner", "impressive", "great",
}
NEGATIVE = {
    "criticism", "complaints", "complaint", "expensive", "costly", "slow",
    "heavy to move", "hot to sit", "brittle", "crack", "warp", "fade",
    "cheap", "flimsy", "disappointing", "avoid", "worse", "problem",
    "drawback", "downside",
}

class LexiconSentimentAnalyzer:
    name = "lexicon-v1"

    def score_brand(self, text: str, aliases: list[str]) -> tuple[str, float]:
        tl = text.lower()
        windows = []
        for alias in aliases:
            for m in re.finditer(re.escape(alias.lower()), tl):
                windows.append(tl[max(0, m.start() - 160): m.end() + 160])
        if not windows:
            return "neutral", 0.0
        pos = neg = 0
        for w in windows:
            pos += sum(1 for t in POSITIVE if t in w)
            neg += sum(1 for t in NEGATIVE if t in w)
        score = (pos - neg) / (pos + neg + 1)
        label = "positive" if score > 0.15 else "negative" if score < -0.15 else "neutral"
        return label, round(score, 4)

class AnthropicSentimentAnalyzer:
    """LLM-based sentiment via the Anthropic Messages API (no SDK needed)."""
    name = "claude-haiku"
    MODEL = os.environ.get("SENTIMENT_MODEL", "claude-haiku-4-5")

    def __init__(self, api_key: str):
        self.api_key = api_key

    def score_brand(self, text: str, aliases: list[str]) -> tuple[str, float]:
        prompt = (
            f"Rate the sentiment toward the brand '{aliases[0]}' in the text below. "
            'Respond with ONLY JSON: {"label": "positive|neutral|negative", "score": -1.0..1.0}\n\n'
            f"TEXT:\n{text[:6000]}"
        )
        body = json.dumps({
            "model": self.MODEL, "max_tokens": 64,
            "messages": [{"role": "user", "content": prompt}],
        }).encode()
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages", data=body,
            headers={"x-api-key": self.api_key,
                     "anthropic-version": "2023-06-01",
                     "content-type": "application/json"})
        with urllib.request.urlopen(req, timeout=30) as r:
            out = json.load(r)
        parsed = json.loads(out["content"][0]["text"])
        return parsed["label"], float(parsed["score"])

def get_analyzer():
    key = os.environ.get("ANTHROPIC_API_KEY")
    return AnthropicSentimentAnalyzer(key) if key else LexiconSentimentAnalyzer()
