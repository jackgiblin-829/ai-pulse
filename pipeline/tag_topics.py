"""
AI Pulse topic tagger — assigns 1-2 short topical labels to every cited
or observed URL, powering the dashboard's Emerging Topics analysis.

Work queue per client: normalized URLs from citation_observations plus
internal citations (cited_urls -> articles) that have no url_topics row
yet. Best available text per URL: crawled article title, else the
observation title + snippet + query.

Tagging: Claude (ANTHROPIC_API_KEY; model TOPIC_MODEL, falling back to
FANOUT_MODEL, then claude-haiku-4-5) in batches of ~25 URLs per request.
The client's existing topic vocabulary is included in every prompt with
a reuse-before-invent instruction so labels converge instead of
fragmenting. Without an API key, falls back to naive facet-name keyword
matching so demo mode still yields topics.

Usage:
    python3 tag_topics.py --client <slug> [--limit 200] [--batch 25] [--dry-run]

Idempotent: tagged URLs never re-enter the queue.
"""
import argparse
import json
import os
import re
import sys

import psycopg2

import config

MODEL = (os.environ.get("TOPIC_MODEL")
         or os.environ.get("FANOUT_MODEL")
         or "claude-haiku-4-5")
MAX_SNIPPET = 400


def load_queue(cur, client_id, limit):
    """-> [(url, text)] untagged URLs with their best available text."""
    cur.execute(
        """WITH candidate AS (
             -- external observations (urls already normalized)
             SELECT o.url,
                    COALESCE(a.title, o.title) AS title,
                    o.snippet, o.query
             FROM citation_observations o
             LEFT JOIN articles a ON a.id = o.article_id
             WHERE o.client_id = %(cid)s
             UNION
             -- internal citations, via their crawled article (title needed)
             SELECT a.url, a.title, NULL, NULL
             FROM cited_urls u
             JOIN llm_runs r ON r.id = u.run_id
             JOIN articles a ON a.id = u.article_id
             WHERE r.client_id = %(cid)s AND a.title IS NOT NULL
           )
           SELECT c.url,
                  MAX(c.title)   AS title,
                  MAX(c.snippet) AS snippet,
                  MAX(c.query)   AS query
           FROM candidate c
           WHERE NOT EXISTS (SELECT 1 FROM url_topics t
                             WHERE t.client_id = %(cid)s AND t.url = c.url)
           GROUP BY c.url
           ORDER BY c.url
           LIMIT %(limit)s""",
        {"cid": client_id, "limit": limit})
    out = []
    for url, title, snippet, query in cur.fetchall():
        bits = [b for b in (title, (snippet or "")[:MAX_SNIPPET], query) if b]
        if bits:
            out.append((url, " | ".join(bits)))
    return out


def existing_topics(cur, client_id):
    cur.execute("SELECT name FROM topics WHERE client_id=%s ORDER BY name", (client_id,))
    return [n for (n,) in cur.fetchall()]


def upsert_topic(cur, client_id, name):
    cur.execute(
        """INSERT INTO topics (client_id, name) VALUES (%s,%s)
           ON CONFLICT (client_id, name) DO UPDATE SET name=EXCLUDED.name
           RETURNING id""", (client_id, name))
    return cur.fetchone()[0]


def clean_label(name):
    name = re.sub(r"\s+", " ", str(name)).strip().lower().strip(".,;:")
    words = name.split()
    if not (1 <= len(words) <= 4) or len(name) > 60:
        return None
    return name


# ------------------------------------------------------------------ taggers

def claude_tag(client, items, vocab):
    """items: [(url, text)] -> {url: [(topic, confidence)]}. Raises on failure."""
    numbered = "\n".join(f"{i+1}. {text[:500]}" for i, (_u, text) in enumerate(items))
    vocab_note = (
        "Existing topic labels for this client — REUSE one of these whenever it "
        "fits before inventing a new label:\n" + "\n".join(f"- {v}" for v in vocab)
        if vocab else "This client has no topic labels yet."
    )
    prompt = (
        "You are tagging article/search-result summaries with topical labels for a "
        "media-intelligence dashboard.\n\n"
        f"{vocab_note}\n\n"
        "For EACH numbered item below, assign 1-2 topic labels: short lowercase "
        "noun phrases of 2-4 words describing the subject matter (not the brand, "
        "not the publication).\n"
        'Respond with ONLY JSON: {"items": [{"n": <item number>, '
        '"topics": [{"name": "<label>", "confidence": 0.0-1.0}]}]}\n\n'
        f"ITEMS:\n{numbered}"
    )
    msg = client.messages.create(
        model=MODEL, max_tokens=120 * len(items) + 200,
        messages=[{"role": "user", "content": prompt}])
    raw = next((b.text for b in msg.content if b.type == "text"), "")
    m = re.search(r"\{.*\}", raw, re.DOTALL)
    if not m:
        raise ValueError(f"no JSON object in model output: {raw[:200]!r}")
    parsed = json.loads(m.group(0))
    out = {}
    for entry in parsed.get("items", []):
        idx = int(entry.get("n", 0)) - 1
        if not (0 <= idx < len(items)):
            continue
        url = items[idx][0]
        labels = []
        for t in (entry.get("topics") or [])[:2]:
            name = clean_label(t.get("name") if isinstance(t, dict) else t)
            if name:
                conf = t.get("confidence") if isinstance(t, dict) else None
                try:
                    conf = max(0.0, min(1.0, float(conf))) if conf is not None else None
                except (TypeError, ValueError):
                    conf = None
                labels.append((name, conf))
        if labels:
            out[url] = labels
    return out


def facet_tag(cur, client_id, items):
    """No-API-key fallback: match facet names against the item text."""
    cur.execute("SELECT name FROM facets WHERE client_id=%s", (client_id,))
    facets = [n for (n,) in cur.fetchall()]
    out = {}
    for url, text in items:
        tl = text.lower()
        labels = [(f.lower(), None) for f in facets if f.lower() in tl][:2]
        if labels:
            out[url] = labels
    return out


# ------------------------------------------------------------------ main

def run(client_slug, limit, batch, dry_run):
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()
    cur.execute("SELECT id FROM clients WHERE slug=%s", (client_slug,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"Unknown client slug '{client_slug}'")
    client_id = row[0]

    queue = load_queue(cur, client_id, limit)
    print(f"{len(queue)} untagged URLs for '{client_slug}'.")
    if dry_run:
        for url, text in queue[:20]:
            print(f"  {url}  <-  {text[:80]}")
        return
    if not queue:
        return

    api_key = os.environ.get("ANTHROPIC_API_KEY")
    client = None
    if api_key:
        import anthropic  # lazy, matching sentiment.py
        client = anthropic.Anthropic(api_key=api_key, max_retries=4)
        tagger_name = MODEL
    else:
        print("[topics] ANTHROPIC_API_KEY not set — facet keyword fallback")
        tagger_name = "facet-match"

    n_urls = n_assignments = 0
    for start in range(0, len(queue), batch):
        chunk = queue[start:start + batch]
        if client:
            vocab = existing_topics(cur, client_id)
            try:
                tags = claude_tag(client, chunk, vocab)
            except Exception as e:
                print(f"[topics] Claude tagging failed ({e!r}); facet fallback for this batch")
                tags = facet_tag(cur, client_id, chunk)
        else:
            tags = facet_tag(cur, client_id, chunk)

        for url, labels in tags.items():
            for name, conf in labels:
                topic_id = upsert_topic(cur, client_id, name)
                cur.execute(
                    """INSERT INTO url_topics (client_id, url, topic_id, confidence, model)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (client_id, url, topic_id) DO NOTHING""",
                    (client_id, url, topic_id, conf, tagger_name))
                n_assignments += 1
            n_urls += 1
        conn.commit()
        print(f"  {min(start + batch, len(queue))}/{len(queue)} processed")

    print(f"Done: {n_urls} URLs tagged, {n_assignments} topic assignments ({tagger_name}).")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse topic tagger")
    ap.add_argument("--client", required=True, help="client slug")
    ap.add_argument("--limit", type=int, default=200)
    ap.add_argument("--batch", type=int, default=25)
    ap.add_argument("--dry-run", action="store_true",
                    help="print the untagged queue without tagging")
    args = ap.parse_args()
    run(args.client, args.limit, args.batch, args.dry_run)
