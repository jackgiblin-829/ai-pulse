"""
AI Pulse ingestion + NLP pipeline.

Usage:  python3 ingest.py --client polywood ../data/llm_export.csv

Stages
  1. Load the client's configuration from Postgres (brands, keyword
     taxonomy, key-term vocabulary — written by /admin/clients or
     seed_client.py).
  2. Load raw export rows -> prompts (auto keyword-categorized) + llm_runs.
  3. Per response:
       - extract & normalize cited URLs, parse registrable domains
       - classify media type (earned / owned / social / other)
       - resolve journalist bylines from the crawled articles table
         (populated by enrich_bylines.py)
       - detect brand + ecosystem-org mentions (alias regexes)
       - per-brand sentiment (LLM analyzer or lexicon fallback)
       - key-term extraction (curated vocab + statistical bigrams)
  4. Print a metrics summary (visibility, SOV) from the SQL views.

Idempotent: re-running on the same file upserts rather than duplicating.
"""
import argparse
import csv
import re
from collections import Counter
from urllib.parse import urlparse

import psycopg2
from psycopg2.extras import execute_values

import config
from client_config import ClientConfig, load_client
from constants import (JUNK_TOKENS, SOCIAL_DOMAINS, STOPWORDS,
                       URL_RE, VENDOR_MAP, classify_intent, normalize_url,
                       registrable_domain)
from sentiment import LEXICON_NAME, get_analyzer

csv.field_size_limit(10_000_000)


# ------------------------------------------------------------------ helpers

def classify_domain(domain, cfg: ClientConfig, outlet_domains):
    """-> (media_type, owned_by_brand_name | None)"""
    if domain in cfg.owned_lookup:
        return "owned", cfg.owned_lookup[domain]
    if domain in outlet_domains:
        return "earned", None
    if domain in SOCIAL_DOMAINS:
        return "social", None
    return "other", None


def extract_key_terms(text, cfg: ClientConfig):
    # strip markdown link labels + bare domain fragments before tokenizing
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"\b[\w-]+\.(com|org|net|co|io)\b", " ", text)
    terms = Counter()
    tl = text.lower()
    for vocab in cfg.key_term_vocab:
        n = len(re.findall(r"(?<!\w)" + re.escape(vocab.lower()) + r"(?!\w)", tl))
        if n:
            terms[vocab] += n
    # statistical bigrams over stopword-filtered tokens
    tokens = [t for t in re.findall(r"[a-z][a-z\-]{2,}", tl)
              if t not in STOPWORDS and t not in JUNK_TOKENS]
    bigrams = Counter(zip(tokens, tokens[1:]))
    vocab_lower = {v.lower() for v in cfg.key_term_vocab}
    for (a, b), n in bigrams.items():
        if n < 2 or f"{a} {b}" in vocab_lower:
            continue
        if a in cfg.brand_words or b in cfg.brand_words:  # brand names live in org mentions, not terms
            continue
        terms[f"{a} {b}"] += n
    return terms


def load_maps(cur):
    """Global reference maps (not client-scoped)."""
    cur.execute("SELECT id, domain FROM media_outlets")
    outlet_ids = {d: i for i, d in cur.fetchall()}
    # byline lookup from the crawled articles table (normalized url -> ids)
    cur.execute(
        "SELECT url, journalist_id, id FROM articles WHERE fetch_status = 'ok'")
    article_lookup = {u: (jid, aid) for u, jid, aid in cur.fetchall()}
    return outlet_ids, article_lookup


# ------------------------------------------------------------------ pipeline

def run(client_slug, csv_path):
    analyzer = get_analyzer()
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()
    cfg = load_client(cur, client_slug)
    outlet_ids, article_lookup = load_maps(cur)
    outlet_domains = set(outlet_ids)
    print(f"Ingesting for client '{cfg.slug}' (target: {cfg.target_brand})")

    domain_cache = {}
    prompt_cache = {}
    n_rows = n_urls = n_mentions = n_skipped = 0
    claude_batch = getattr(analyzer, "supports_batch", False)
    sentiment_work = []   # (run_id, text_no_urls, [(brand_name, aliases)]) for the batch phase
    processed_ids = []    # runs fully processed this ingest -> stamped processed_at

    # utf-8-sig: real LLM exports are UTF-8 (smart quotes, em dashes) and
    # Excel-saved CSVs carry a BOM; never rely on the locale default.
    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        for row in csv.DictReader(f):
            vendor = VENDOR_MAP.get(row["vendor"].strip().lower())
            if not vendor:
                continue
            text, run_date = row["response"], row["date"]

            ptext = row["prompt"].strip()
            if ptext not in prompt_cache:
                cur.execute(
                    """INSERT INTO prompts(client_id, text, keyword_category_id, intent, facet_id)
                       VALUES (%s,%s,%s,%s,%s)
                       ON CONFLICT (client_id, text) DO UPDATE SET
                         keyword_category_id=EXCLUDED.keyword_category_id,
                         intent=EXCLUDED.intent, facet_id=EXCLUDED.facet_id
                       RETURNING id""",
                    (cfg.client_id, ptext, cfg.keyword_for_prompt(ptext),
                     classify_intent(ptext), cfg.facet_for_prompt(ptext)))
                prompt_cache[ptext] = cur.fetchone()[0]

            # Skip runs whose text is unchanged and already fully processed —
            # a re-ingest then re-pays no NLP or API cost. Exception: when a
            # Claude analyzer is active but the stored scores came from the
            # lexicon (key added after the original ingest), rescore.
            cur.execute(
                """SELECT id, response_text = %s, processed_at IS NOT NULL,
                          EXISTS(SELECT 1 FROM sentiment_scores s
                                 WHERE s.run_id = llm_runs.id AND s.model = %s)
                   FROM llm_runs
                   WHERE prompt_id=%s AND engine=%s AND run_date=%s""",
                (text, LEXICON_NAME, prompt_cache[ptext], vendor, run_date))
            existing = cur.fetchone()
            if existing:
                _, unchanged, processed, has_lexicon = existing
                if unchanged and processed and not (claude_batch and has_lexicon):
                    n_skipped += 1
                    continue

            cur.execute(
                """INSERT INTO llm_runs(client_id, prompt_id, engine, run_date, response_text)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (prompt_id, engine, run_date)
                   DO UPDATE SET response_text=EXCLUDED.response_text,
                                 processed_at=NULL RETURNING id""",
                (cfg.client_id, prompt_cache[ptext], vendor, run_date, text))
            run_id = cur.fetchone()[0]
            cur.execute("DELETE FROM cited_urls WHERE run_id=%s", (run_id,))
            cur.execute("DELETE FROM brand_mentions WHERE run_id=%s", (run_id,))
            cur.execute("DELETE FROM sentiment_scores WHERE run_id=%s", (run_id,))
            cur.execute("DELETE FROM key_terms WHERE run_id=%s", (run_id,))
            n_rows += 1

            # ---- URLs
            seen_urls = set()
            for raw in URL_RE.findall(text):
                url = raw.rstrip(".,)>]\"'")
                if url in seen_urls:
                    continue
                seen_urls.add(url)
                parsed = urlparse(url)
                dom = registrable_domain(parsed.netloc)
                if not dom or "." not in dom:
                    continue
                if dom not in domain_cache:
                    mtype, owned_by = classify_domain(dom, cfg, outlet_domains)
                    cur.execute(
                        """INSERT INTO cited_domains(client_id, domain, media_type, outlet_id, owned_by_brand_id)
                           VALUES (%s,%s,%s,%s,%s)
                           ON CONFLICT (client_id, domain) DO UPDATE SET media_type=EXCLUDED.media_type
                           RETURNING id""",
                        (cfg.client_id, dom, mtype, outlet_ids.get(dom),
                         cfg.brands[owned_by]["id"] if owned_by else None))
                    domain_cache[dom] = cur.fetchone()[0]
                jid, aid = article_lookup.get(normalize_url(url), (None, None))
                cur.execute(
                    """INSERT INTO cited_urls(run_id, url, domain_id, path, journalist_id, article_id)
                       VALUES (%s,%s,%s,%s,%s,%s)""",
                    (run_id, url, domain_cache[dom], parsed.path, jid, aid))
                n_urls += 1

            # ---- brand / org mentions + sentiment
            # (detect on URL-stripped text so a polywood.com citation
            #  doesn't count as a prose mention)
            text_no_urls = URL_RE.sub(" ", text)
            tracked = []
            for name, b in cfg.brands.items():
                hits = list(cfg.brand_regexes[name].finditer(text_no_urls))
                if not hits:
                    continue
                cur.execute(
                    """INSERT INTO brand_mentions(run_id, brand_id, mention_count, first_position)
                       VALUES (%s,%s,%s,%s)""",
                    (run_id, b["id"], len(hits), hits[0].start()))
                n_mentions += len(hits)
                if b["role"] in ("target", "competitor"):
                    tracked.append((name, b))
            if tracked and claude_batch:
                # Defer to the batch phase: one request per run covering all
                # brands (text sent once), at the 50% Batches API discount.
                sentiment_work.append(
                    (run_id, text_no_urls,
                     [(name, b["aliases"] or [name]) for name, b in tracked]))
            else:
                for name, b in tracked:
                    label, score = analyzer.score_brand(text_no_urls, b["aliases"] or [name])
                    cur.execute(
                        """INSERT INTO sentiment_scores(run_id, brand_id, label, score, model)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (run_id, b["id"], label, score, analyzer.name))
                processed_ids.append(run_id)

            # ---- key terms
            for term, freq in extract_key_terms(text_no_urls, cfg).most_common(12):
                cur.execute("INSERT INTO key_terms(run_id, term, freq) VALUES (%s,%s,%s)",
                            (run_id, term, freq))

            if n_rows % 500 == 0:
                conn.commit()
                print(f"  {n_rows} runs processed...")

    conn.commit()

    # ---- deferred sentiment (Message Batches API, 50% token discount)
    if sentiment_work:
        print(f"Scoring sentiment for {len(sentiment_work)} runs "
              f"({sum(len(b) for _, _, b in sentiment_work)} brand scores) via batch...")
        results = analyzer.score_batch(
            [(f"run-{rid}", text, brands) for rid, text, brands in sentiment_work])
        rows = []
        for rid, _text, _brands in sentiment_work:
            scores, from_api = results[f"run-{rid}"]
            for name, (label, score, model) in scores.items():
                rows.append((rid, cfg.brands[name]["id"], label, score, model))
            # Lexicon-degraded runs stay unstamped so the next ingest
            # retries Claude scoring for them.
            if from_api:
                processed_ids.append(rid)
        execute_values(
            cur,
            "INSERT INTO sentiment_scores(run_id, brand_id, label, score, model) VALUES %s",
            rows)

    if processed_ids:
        cur.execute("UPDATE llm_runs SET processed_at = now() WHERE id = ANY(%s)",
                    (processed_ids,))
    conn.commit()
    print(f"Done: {n_rows} runs processed, {n_skipped} unchanged runs skipped, "
          f"{n_urls} cited URLs, {n_mentions} brand mentions.")

    # ---- summary from views
    cur.execute("""SELECT brand, engine, ROUND(AVG(visibility_pct),1)
                   FROM v_visibility WHERE client_id=%s
                   GROUP BY brand, engine ORDER BY 3 DESC LIMIT 9""", (cfg.client_id,))
    print("\nTop avg visibility (brand x engine):")
    for b, e, v in cur.fetchall():
        print(f"  {b:28s} {e:8s} {v}%")
    cur.execute("""SELECT brand, sov_pct FROM v_share_of_voice
                   WHERE client_id=%s ORDER BY sov_pct DESC""", (cfg.client_id,))
    print("\nShare of voice:")
    for b, s in cur.fetchall():
        print(f"  {b:28s} {s}%")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse CSV ingestion")
    ap.add_argument("--client", required=True, help="client slug (see clients table)")
    ap.add_argument("csv_path", nargs="?", default="../data/llm_export.csv")
    args = ap.parse_args()
    run(args.client, args.csv_path)
