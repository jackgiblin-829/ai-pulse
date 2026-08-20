"""
Pluggable per-brand sentiment analyzers.

- AnthropicSentimentAnalyzer: production path, used automatically when
  ANTHROPIC_API_KEY is set. Scores EVERY tracked brand in a response with
  one request per run (the response text is the dominant token cost, so
  it is sent once, not once per brand), and whole ingests go through the
  Message Batches API at a 50% token discount. Failure ladder per run:
  batch result -> one live retry -> lexicon, so an API failure can never
  abort an ingest or leave a run without scores.
- LexiconSentimentAnalyzer: dependency-free fallback tuned to the
  outdoor-furniture domain. Scores a +/-160-char context window around
  each brand mention.
"""
import json
import os
import re
import time

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

LABELS = ("positive", "neutral", "negative")
LEXICON_NAME = "lexicon-v1"


class LexiconSentimentAnalyzer:
    name = LEXICON_NAME
    supports_batch = False

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
    """LLM-based sentiment via the official Anthropic SDK.

    score_batch() is the primary entry point: it submits one request per
    run (all brands together) through the Message Batches API. Individual
    failed/expired/unparseable requests get one live-call retry, then the
    lexicon; each brand's row records which analyzer actually scored it.
    """
    MODEL = os.environ.get("SENTIMENT_MODEL", "claude-haiku-4-5")
    # Cap raised from 6k chars: mentions past the old cap were invisible
    # to the scorer. Long responses cost a little more but score correctly.
    MAX_TEXT = 12_000
    BATCH_CHUNK = 10_000            # requests per batch (API max: 100k / 256MB)
    POLL_SECONDS = 20
    TIMEOUT = int(os.environ.get("SENTIMENT_BATCH_TIMEOUT", "5400"))
    supports_batch = True

    def __init__(self, api_key: str):
        import anthropic  # imported lazily so lexicon-only installs don't need it
        self._client = anthropic.Anthropic(api_key=api_key, max_retries=4)
        self.name = self.MODEL
        self._fallback = LexiconSentimentAnalyzer()

    # ---- shared prompt / parse -------------------------------------

    def _params(self, text: str, brands: list[tuple[str, list[str]]]) -> dict:
        lines = []
        for name, aliases in brands:
            extra = [a for a in aliases if a and a != name]
            lines.append(f"- {name}" + (f" (also referred to as: {', '.join(extra)})" if extra else ""))
        prompt = (
            "Rate the sentiment toward EACH of the following brands in the text below.\n"
            "Brands:\n" + "\n".join(lines) + "\n\n"
            "Respond with ONLY JSON, one entry per brand, using the exact brand names "
            'above as keys:\n'
            '{"brands": {"<brand name>": {"label": "positive|neutral|negative", '
            '"score": -1.0..1.0}}}\n\n'
            f"TEXT:\n{text[:self.MAX_TEXT]}"
        )
        return {
            "model": self.MODEL,
            "max_tokens": max(200, 100 * len(brands)),
            "messages": [{"role": "user", "content": prompt}],
        }

    def _parse(self, raw: str, brands: list[tuple[str, list[str]]]) -> dict[str, tuple[str, float]]:
        m = re.search(r"\{.*\}", raw, re.DOTALL)
        if not m:
            raise ValueError(f"no JSON object in model output: {raw[:200]!r}")
        parsed = json.loads(m.group(0))
        data = parsed.get("brands", parsed)
        if not isinstance(data, dict):
            raise ValueError(f"unexpected JSON shape: {raw[:200]!r}")
        lowered = {str(k).strip().lower(): v for k, v in data.items()}
        out = {}
        for name, _aliases in brands:
            entry = data.get(name) or lowered.get(name.lower())
            if not isinstance(entry, dict):
                raise ValueError(f"brand {name!r} missing from model output")
            label = str(entry["label"]).strip().lower()
            if label not in LABELS:
                raise ValueError(f"unexpected label for {name!r}: {label!r}")
            score = max(-1.0, min(1.0, float(entry["score"])))
            out[name] = (label, score)
        return out

    def _lexicon_all(self, text, brands):
        return {name: (*self._fallback.score_brand(text, aliases or [name]), LEXICON_NAME)
                for name, aliases in brands}

    # ---- live path (fallback for failed batch requests) -------------

    def score_brands(self, text, brands):
        """-> {brand_name: (label, score, model_name)}. Never raises: any
        API/parse failure degrades to the lexicon for this run."""
        try:
            msg = self._client.messages.create(**self._params(text, brands))
            raw = next((b.text for b in msg.content if b.type == "text"), "")
            return {n: (l, s, self.MODEL) for n, (l, s) in self._parse(raw, brands).items()}
        except Exception as e:
            print(f"[sentiment] live scoring failed ({e!r}); lexicon fallback for this run")
            return self._lexicon_all(text, brands)

    # ---- batch path --------------------------------------------------

    def score_batch(self, items):
        """items: [(custom_id, text, brands)] with brands = [(name, aliases)].

        Returns {custom_id: (scores, from_api)} where scores is
        {brand: (label, score, model_name)} and from_api is False when any
        brand fell back to the lexicon — callers should leave those runs
        unmarked so a future ingest retries Claude scoring.
        """
        out = {}
        for start in range(0, len(items), self.BATCH_CHUNK):
            chunk = items[start:start + self.BATCH_CHUNK]
            try:
                raw_results = self._run_one_batch(chunk)
            except Exception as e:
                print(f"[sentiment] batch failed ({e!r}); "
                      f"falling back to live calls for {len(chunk)} runs")
                raw_results = {}
            for cid, text, brands in chunk:
                raw = raw_results.get(cid)
                if raw is not None:
                    try:
                        scores = self._parse(raw, brands)
                        out[cid] = ({n: (l, s, self.MODEL) for n, (l, s) in scores.items()}, True)
                        continue
                    except Exception as e:
                        print(f"[sentiment] unparseable batch result for {cid} ({e!r}); retrying live")
                scores = self.score_brands(text, brands)
                from_api = all(m == self.MODEL for (_l, _s, m) in scores.values())
                out[cid] = (scores, from_api)
        return out

    def _run_one_batch(self, chunk):
        """Submit one Message Batch and poll to completion.
        -> {custom_id: raw_text} for succeeded requests only."""
        from anthropic.types.message_create_params import MessageCreateParamsNonStreaming
        from anthropic.types.messages.batch_create_params import Request

        requests = [
            Request(custom_id=cid,
                    params=MessageCreateParamsNonStreaming(**self._params(text, brands)))
            for cid, text, brands in chunk
        ]
        batch = self._client.messages.batches.create(requests=requests)
        print(f"[sentiment] batch {batch.id}: {len(requests)} requests submitted "
              f"({self.MODEL}, 50% batch discount)")
        deadline = time.monotonic() + self.TIMEOUT
        while batch.processing_status != "ended":
            if time.monotonic() > deadline:
                raise TimeoutError(
                    f"batch {batch.id} still {batch.processing_status} after {self.TIMEOUT}s")
            time.sleep(self.POLL_SECONDS)
            batch = self._client.messages.batches.retrieve(batch.id)
        c = batch.request_counts
        print(f"[sentiment] batch {batch.id} ended: {c.succeeded} succeeded, "
              f"{c.errored} errored, {c.expired} expired, {c.canceled} canceled")
        texts, in_tok, out_tok = {}, 0, 0
        for result in self._client.messages.batches.results(batch.id):
            if result.result.type == "succeeded":
                msg = result.result.message
                texts[result.custom_id] = next(
                    (b.text for b in msg.content if b.type == "text"), "")
                in_tok += msg.usage.input_tokens
                out_tok += msg.usage.output_tokens
        print(f"[sentiment] batch usage: {in_tok:,} input + {out_tok:,} output tokens "
              f"(billed at 50% of standard rates)")
        return texts


def get_analyzer():
    key = os.environ.get("ANTHROPIC_API_KEY")
    return AnthropicSentimentAnalyzer(key) if key else LexiconSentimentAnalyzer()
