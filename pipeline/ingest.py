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

import config
from client_config import ClientConfig, load_client
from constants import (JUNK_TOKENS, MULTI_TLDS, SOCIAL_DOMAINS, STOPWORDS,
                       URL_RE, VENDOR_MAP, normalize_url)
from sentiment import get_analyzer

csv.field_size_limit(10_000_000)


# ------------------------------------------------------------------ helpers

def registrable_domain(host):
    host = host.lower().lstrip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_TLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


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
    n_rows = n_urls = n_mentions = 0

    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            vendor = VENDOR_MAP.get(row["vendor"].strip().lower())
            if not vendor:
                continue
            text, run_date = row["response"], row["date"]

            ptext = row["prompt"].strip()
            if ptext not in prompt_cache:
                cur.execute(
                    """INSERT INTO prompts(client_id, text, keyword_category_id) VALUES (%s,%s,%s)
                       ON CONFLICT (client_id, text) DO UPDATE SET keyword_category_id=EXCLUDED.keyword_category_id
                       RETURNING id""",
                    (cfg.client_id, ptext, cfg.keyword_for_prompt(ptext)))
                prompt_cache[ptext] = cur.fetchone()[0]

            cur.execute(
                """INSERT INTO llm_runs(client_id, prompt_id, engine, run_date, response_text)
                   VALUES (%s,%s,%s,%s,%s)
                   ON CONFLICT (prompt_id, engine, run_date)
                   DO UPDATE SET response_text=EXCLUDED.response_text RETURNING id""",
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
                    label, score = analyzer.score_brand(text_no_urls, b["aliases"] or [name])
                    cur.execute(
                        """INSERT INTO sentiment_scores(run_id, brand_id, label, score, model)
                           VALUES (%s,%s,%s,%s,%s)""",
                        (run_id, b["id"], label, score, analyzer.name))

            # ---- key terms
            for term, freq in extract_key_terms(text_no_urls, cfg).most_common(12):
                cur.execute("INSERT INTO key_terms(run_id, term, freq) VALUES (%s,%s,%s)",
                            (run_id, term, freq))

            if n_rows % 500 == 0:
                conn.commit()
                print(f"  {n_rows} runs processed...")

    conn.commit()
    print(f"Done: {n_rows} runs, {n_urls} cited URLs, {n_mentions} brand mentions.")

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
