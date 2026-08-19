"""
AI Pulse ingestion + NLP pipeline.

Usage:  python3 ingest.py ../data/llm_export.csv

Stages
  1. Seed reference tables (brands, keyword categories, media outlets,
     journalists) from config + the media DB.
  2. Load raw export rows -> prompts (auto keyword-categorized) + llm_runs.
  3. Per response:
       - extract & normalize cited URLs, parse registrable domains
       - classify media type (earned / owned / social / other)
       - resolve journalist bylines via the article-level media DB
       - detect brand + ecosystem-org mentions (alias regexes)
       - per-brand sentiment (LLM analyzer or lexicon fallback)
       - key-term extraction (curated vocab + statistical bigrams)
  4. Print a metrics summary (visibility, SOV) from the SQL views.

Idempotent: re-running on the same file upserts rather than duplicating.
"""
import csv, re, sys
from collections import Counter
from urllib.parse import urlparse

import psycopg2
import psycopg2.extras

import config
from media_articles import ARTICLES
from sentiment import get_analyzer

csv.field_size_limit(10_000_000)

VENDOR_MAP = {
    "chatgpt": "chatgpt", "openai": "chatgpt", "gpt-4o": "chatgpt", "gpt4": "chatgpt",
    "gemini": "gemini", "google": "gemini", "bard": "gemini",
    "claude": "claude", "anthropic": "claude",
}

URL_RE = re.compile(r"https?://[^\s\)\]\>\"',;]+")
MULTI_TLDS = {"co.uk", "com.au", "co.nz", "co.jp", "com.br"}


# ------------------------------------------------------------------ helpers

def registrable_domain(host: str) -> str:
    host = host.lower().lstrip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_TLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def classify_domain(domain: str, owned_lookup: dict) -> tuple[str, str | None]:
    """-> (media_type, owned_by_brand_name | None)"""
    if domain in owned_lookup:
        return "owned", owned_lookup[domain]
    if domain in {d for (d, _da) in OUTLET_DOMAINS}:
        return "earned", None
    if domain in config.SOCIAL_DOMAINS:
        return "social", None
    return "other", None


def keyword_for_prompt(prompt: str) -> str:
    pl = prompt.lower()
    for pattern, kw in config.KEYWORD_RULES:
        if re.search(pattern, pl):
            return kw
    return config.KEYWORDS[3]  # best outdoor furniture brands


def alias_regex(aliases: list[str]) -> re.Pattern:
    alts = sorted((re.escape(a) for a in aliases), key=len, reverse=True)
    return re.compile(r"(?<![\w&])(" + "|".join(alts) + r")(?![\w])", re.IGNORECASE)


JUNK_TOKENS = {
    "com", "www", "http", "https", "org", "html", "sources", "cited",
    "pages", "consulted", "watch", "sites", "article", "articles",
}
BRAND_WORDS = {
    w.lower()
    for meta in list(config.BRANDS.values())
    for a in meta["aliases"]
    for w in re.split(r"[\s.\-]+", a) if len(w) > 2
} | {
    w.lower()
    for aliases in config.ECOSYSTEM_ORGS.values()
    for a in aliases
    for w in re.split(r"[\s.\-]+", a) if len(w) > 2
}


def extract_key_terms(text: str) -> Counter:
    # strip markdown link labels + bare domain fragments before tokenizing
    text = re.sub(r"\[[^\]]*\]", " ", text)
    text = re.sub(r"\b[\w-]+\.(com|org|net|co|io)\b", " ", text)
    terms = Counter()
    tl = text.lower()
    for vocab in config.KEY_TERM_VOCAB:
        n = len(re.findall(r"(?<!\w)" + re.escape(vocab.lower()) + r"(?!\w)", tl))
        if n:
            terms[vocab] += n
    # statistical bigrams over stopword-filtered tokens
    tokens = [t for t in re.findall(r"[a-z][a-z\-]{2,}", tl)
              if t not in config.STOPWORDS and t not in JUNK_TOKENS]
    bigrams = Counter(zip(tokens, tokens[1:]))
    vocab_lower = {v.lower() for v in config.KEY_TERM_VOCAB}
    for (a, b), n in bigrams.items():
        if n < 2 or f"{a} {b}" in vocab_lower:
            continue
        if a in BRAND_WORDS or b in BRAND_WORDS:  # brand names live in org mentions, not terms
            continue
        terms[f"{a} {b}"] += n
    return terms


# ------------------------------------------------------------------ seeding

OUTLET_DOMAINS = [(v[0], v[1]) for v in config.MEDIA_DB.values()]


def seed(cur):
    for name in config.KEYWORDS:
        cur.execute("INSERT INTO keyword_categories(name) VALUES (%s) ON CONFLICT DO NOTHING", (name,))

    for name, meta in config.BRANDS.items():
        cur.execute(
            """INSERT INTO brands(name, role, aliases, owned_domains) VALUES (%s,%s,%s,%s)
               ON CONFLICT (name) DO UPDATE SET role=EXCLUDED.role,
                 aliases=EXCLUDED.aliases, owned_domains=EXCLUDED.owned_domains""",
            (name, meta["role"], meta["aliases"], meta["owned_domains"]))
    for name, aliases in config.ECOSYSTEM_ORGS.items():
        cur.execute(
            """INSERT INTO brands(name, role, aliases) VALUES (%s,'ecosystem',%s)
               ON CONFLICT (name) DO NOTHING""", (name, aliases))

    for outlet, (domain, da, otype, journos) in config.MEDIA_DB.items():
        cur.execute(
            """INSERT INTO media_outlets(name, domain, domain_authority, outlet_type)
               VALUES (%s,%s,%s,%s) ON CONFLICT (domain) DO UPDATE
               SET domain_authority=EXCLUDED.domain_authority RETURNING id""",
            (outlet, domain, da, otype))
        outlet_id = cur.fetchone()[0]
        for j in journos:
            cur.execute(
                """INSERT INTO journalists(name, outlet_id) VALUES (%s,%s)
                   ON CONFLICT (name, outlet_id) DO NOTHING""", (j, outlet_id))


def load_maps(cur):
    cur.execute("SELECT id, name FROM keyword_categories")
    kw_ids = {n: i for i, n in cur.fetchall()}
    cur.execute("SELECT id, name, role, aliases, owned_domains FROM brands")
    brands = {n: {"id": i, "role": r, "aliases": a, "owned": od}
              for i, n, r, a, od in cur.fetchall()}
    cur.execute("SELECT j.id, j.name, o.domain FROM journalists j JOIN media_outlets o ON o.id=j.outlet_id")
    journo_ids = {(n, d): i for i, n, d in cur.fetchall()}
    cur.execute("SELECT id, domain FROM media_outlets")
    outlet_ids = {d: i for i, d in cur.fetchall()}
    return kw_ids, brands, journo_ids, outlet_ids


# ------------------------------------------------------------------ pipeline

def run(csv_path: str):
    analyzer = get_analyzer()
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()
    seed(cur)
    conn.commit()
    kw_ids, brands, journo_ids, outlet_ids = load_maps(cur)

    owned_lookup = {}
    for name, b in brands.items():
        for d in (b["owned"] or []):
            owned_lookup[d] = name
    brand_res = {n: alias_regex(b["aliases"] or [n]) for n, b in brands.items()}
    article_journo = {(d, p): j for (d, p), (_o, j, _t) in ARTICLES.items()}

    domain_cache: dict[str, int] = {}
    prompt_cache: dict[str, int] = {}
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
                    """INSERT INTO prompts(text, keyword_category_id) VALUES (%s,%s)
                       ON CONFLICT (text) DO UPDATE SET keyword_category_id=EXCLUDED.keyword_category_id
                       RETURNING id""",
                    (ptext, kw_ids[keyword_for_prompt(ptext)]))
                prompt_cache[ptext] = cur.fetchone()[0]

            cur.execute(
                """INSERT INTO llm_runs(prompt_id, engine, run_date, response_text)
                   VALUES (%s,%s,%s,%s)
                   ON CONFLICT (prompt_id, engine, run_date)
                   DO UPDATE SET response_text=EXCLUDED.response_text RETURNING id""",
                (prompt_cache[ptext], vendor, run_date, text))
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
                    mtype, owned_by = classify_domain(dom, owned_lookup)
                    cur.execute(
                        """INSERT INTO cited_domains(domain, media_type, outlet_id, owned_by_brand_id)
                           VALUES (%s,%s,%s,%s)
                           ON CONFLICT (domain) DO UPDATE SET media_type=EXCLUDED.media_type
                           RETURNING id""",
                        (dom, mtype, outlet_ids.get(dom),
                         brands[owned_by]["id"] if owned_by else None))
                    domain_cache[dom] = cur.fetchone()[0]
                jname = article_journo.get((dom, parsed.path))
                jid = journo_ids.get((jname, dom)) if jname else None
                cur.execute(
                    """INSERT INTO cited_urls(run_id, url, domain_id, path, journalist_id)
                       VALUES (%s,%s,%s,%s,%s)""",
                    (run_id, url, domain_cache[dom], parsed.path, jid))
                n_urls += 1

            # ---- brand / org mentions + sentiment
            # (detect on URL-stripped text so a polywood.com citation
            #  doesn't count as a prose mention)
            text_no_urls = URL_RE.sub(" ", text)
            for name, b in brands.items():
                hits = list(brand_res[name].finditer(text_no_urls))
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
            for term, freq in extract_key_terms(text_no_urls).most_common(12):
                cur.execute("INSERT INTO key_terms(run_id, term, freq) VALUES (%s,%s,%s)",
                            (run_id, term, freq))

            if n_rows % 500 == 0:
                conn.commit()
                print(f"  {n_rows} runs processed...")

    conn.commit()
    print(f"Done: {n_rows} runs, {n_urls} cited URLs, {n_mentions} brand mentions.")

    # ---- summary from views
    cur.execute("""SELECT brand, engine, ROUND(AVG(visibility_pct),1)
                   FROM v_visibility GROUP BY brand, engine ORDER BY 3 DESC LIMIT 9""")
    print("\nTop avg visibility (brand x engine):")
    for b, e, v in cur.fetchall():
        print(f"  {b:28s} {e:8s} {v}%")
    cur.execute("SELECT brand, sov_pct FROM v_share_of_voice ORDER BY sov_pct DESC")
    print("\nShare of voice:")
    for b, s in cur.fetchall():
        print(f"  {b:28s} {s}%")
    conn.close()


if __name__ == "__main__":
    run(sys.argv[1] if len(sys.argv) > 1 else "../data/llm_export.csv")
