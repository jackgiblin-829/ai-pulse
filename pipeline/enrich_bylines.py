"""
AI Pulse byline enrichment crawler.

Fetches the earned-media URLs the AI engines actually cited and extracts
real journalist bylines, article titles, and publish dates — replacing
the licensed-media-DB lookup (Muck Rack / Cision) with grounded data.

Usage:
    python3 enrich_bylines.py [--client polywood] [--limit N]
                              [--delay 2.0] [--retry-failed] [--fixture]

  --client        enrich only URLs cited in this client's runs
                  (omit to sweep every client)
  --limit         stop after N fetches
  --delay         seconds between requests to the same domain (default 2.0)
  --retry-failed  re-attempt URLs whose last fetch failed
  --fixture       demo mode: load media_articles.py's synthetic article
                  index into the articles table instead of fetching
                  (the demo CSV's URLs are fictional and 404 live)

Design:
  - Idempotent: a URL with any articles row (ok / no_byline / failed /
    skipped) is never refetched unless --retry-failed.
  - Polite: honors robots.txt (cached per domain), identifies itself,
    15s timeout, per-domain delay, 2 MB / text-html-only responses.
  - Commits per URL, so an interrupted run loses nothing.
  - Backfills cited_urls.journalist_id / article_id for every client
    citing the URL (a byline is a global fact).

Extraction ladder (first hit wins per field):
  1. JSON-LD Article / NewsArticle / BlogPosting (author, headline,
     datePublished; walks @graph)
  2. meta tags (author, article:author, parsely-author, sailthru.author;
     og:title; article:published_time)
  3. DOM byline patterns ([rel=author], .byline/.author classes,
     leading "By <Name>" text)
"""
import argparse
import json
import re
import time
import urllib.robotparser
from datetime import date
from urllib.parse import urlparse

import psycopg2
import requests
from bs4 import BeautifulSoup

import config
from constants import SOCIAL_DOMAINS, normalize_url

USER_AGENT = "AIPulseBot/1.0 (+jack.giblin@829llc.com)"
TIMEOUT = 15
MAX_BYTES = 2_000_000

JUNK_AUTHORS = {
    "staff", "editors", "editor", "editorial", "admin", "team",
    "newsroom", "contributor", "guest", "sponsored",
}
ROLE_SUFFIX_RE = re.compile(
    r",\s*(senior |associate |assistant |contributing |staff )?"
    r"(editor|writer|reporter|correspondent|journalist|reviewer|columnist).*$",
    re.IGNORECASE)
BY_RE = re.compile(r"^\s*[Bb]y[:\s]+([A-Z][\w.''’-]+(?:\s+[A-Z][\w.''’-]+){0,3})")

ARTICLE_TYPES = {"article", "newsarticle", "blogposting", "reportagenewsarticle",
                 "reviewnewsarticle", "review"}


# ------------------------------------------------------------------ helpers

def clean_author(raw, outlet_name=None):
    """Normalize an extracted byline; return None for junk."""
    if not raw:
        return None
    name = re.sub(r"^\s*[Bb]y[:\s]+", "", raw.strip())
    name = ROLE_SUFFIX_RE.sub("", name)
    # multi-author strings: keep the first
    name = re.split(r"\s*(?:,| and | & )\s*", name)[0].strip().strip(".")
    if not name or len(name.split()) > 5:
        return None
    if name.lower() in JUNK_AUTHORS:
        return None
    if outlet_name and name.lower() == outlet_name.lower():
        return None
    if not re.search(r"[A-Za-z]", name) or name.startswith("http"):
        return None
    return name


def parse_date(value):
    if not value:
        return None
    value = value.strip()
    m = re.match(r"(\d{4}-\d{2}-\d{2})", value)
    if m:
        try:
            return date.fromisoformat(m.group(1))
        except ValueError:
            return None
    return None


def _jsonld_author(node):
    a = node.get("author")
    if not a:
        return None
    if isinstance(a, str):
        return a
    if isinstance(a, dict):
        return a.get("name")
    if isinstance(a, list):
        for item in a:
            name = item.get("name") if isinstance(item, dict) else item
            if name:
                return name
    return None


def extract_metadata(html):
    """-> (author_raw, title, published_at) — any may be None."""
    soup = BeautifulSoup(html, "html.parser")
    author = title = published = None

    # 1. JSON-LD
    for script in soup.find_all("script", type="application/ld+json"):
        try:
            data = json.loads(script.string or "")
        except (json.JSONDecodeError, TypeError):
            continue
        nodes = data if isinstance(data, list) else [data]
        expanded = []
        for n in nodes:
            if isinstance(n, dict):
                expanded.extend(n.get("@graph", [n]) if "@graph" in n else [n])
        for node in expanded:
            if not isinstance(node, dict):
                continue
            ntype = node.get("@type", "")
            types = {t.lower() for t in (ntype if isinstance(ntype, list) else [ntype])
                     if isinstance(t, str)}
            if not (types & ARTICLE_TYPES):
                continue
            author = author or _jsonld_author(node)
            title = title or node.get("headline")
            published = published or parse_date(node.get("datePublished", ""))
        if author and title and published:
            break

    # 2. meta tags
    def meta(**attrs):
        tag = soup.find("meta", attrs=attrs)
        return tag.get("content", "").strip() if tag else None

    if not author:
        for probe in (dict(name="author"), dict(property="article:author"),
                      dict(name="parsely-author"), dict(name="sailthru.author")):
            v = meta(**probe)
            if v and not v.startswith("http"):  # article:author is often a profile URL
                author = v
                break
    if not title:
        title = meta(property="og:title") or (soup.title.string.strip() if soup.title and soup.title.string else None)
    if not published:
        published = parse_date(meta(property="article:published_time") or "")

    # 3. DOM byline patterns
    if not author:
        candidates = soup.select('[rel="author"]')
        candidates += [el for el in soup.find_all(attrs={"class": re.compile(r"byline|author", re.I)})[:5]]
        candidates += [el for el in soup.find_all(attrs={"id": re.compile(r"byline|author", re.I)})[:3]]
        for el in candidates:
            text = el.get_text(" ", strip=True)
            if not text:
                continue
            m = BY_RE.match(text)
            if m:
                author = m.group(1)
                break
            if el.get("rel") == ["author"] and 0 < len(text.split()) <= 5:
                author = text
                break

    return author, title, published


# ------------------------------------------------------------------ db ops

def ensure_outlet(cur, domain):
    cur.execute("SELECT id, name FROM media_outlets WHERE domain=%s", (domain,))
    row = cur.fetchone()
    if row:
        return row
    cur.execute(
        """INSERT INTO media_outlets(name, domain) VALUES (%s,%s)
           ON CONFLICT (domain) DO UPDATE SET name=media_outlets.name RETURNING id, name""",
        (domain, domain))
    return cur.fetchone()


def upsert_journalist(cur, name, outlet_id):
    cur.execute(
        """INSERT INTO journalists(name, outlet_id) VALUES (%s,%s)
           ON CONFLICT (name, outlet_id) DO UPDATE SET name=EXCLUDED.name RETURNING id""",
        (name, outlet_id))
    return cur.fetchone()[0]


def insert_article(cur, norm_url, domain, outlet_id, journalist_id, title,
                   author_raw, published_at, status, http_status=None, error=None):
    cur.execute(
        """INSERT INTO articles(url, domain, outlet_id, journalist_id, title,
                                author_raw, published_at, fetch_status, http_status,
                                fetched_at, error)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,now(),%s)
           ON CONFLICT (url) DO UPDATE SET
             outlet_id=EXCLUDED.outlet_id, journalist_id=EXCLUDED.journalist_id,
             title=EXCLUDED.title, author_raw=EXCLUDED.author_raw,
             published_at=EXCLUDED.published_at, fetch_status=EXCLUDED.fetch_status,
             http_status=EXCLUDED.http_status, fetched_at=now(), error=EXCLUDED.error
           RETURNING id""",
        (norm_url, domain, outlet_id, journalist_id, title, author_raw,
         published_at, status, http_status, error))
    return cur.fetchone()[0]


def backfill_cited_urls(cur):
    """Point every cited_urls row at its crawled article (all clients)."""
    cur.execute("SELECT url, journalist_id, id FROM articles WHERE fetch_status='ok'")
    lookup = {u: (j, a) for u, j, a in cur.fetchall()}
    cur.execute("SELECT id, url FROM cited_urls WHERE article_id IS NULL")
    rows = cur.fetchall()
    n = 0
    for cid, url in rows:
        hit = lookup.get(normalize_url(url))
        if hit:
            cur.execute("UPDATE cited_urls SET journalist_id=%s, article_id=%s WHERE id=%s",
                        (hit[0], hit[1], cid))
            n += 1
    return n


def backfill_observations(cur):
    """Point external citation observations at their crawled articles.
    Observation URLs are stored pre-normalized, so a set-based join works."""
    cur.execute(
        """UPDATE citation_observations o SET article_id = a.id
           FROM articles a
           WHERE o.article_id IS NULL AND a.url = o.url""")
    return cur.rowcount


# ------------------------------------------------------------------ modes

def load_fixture(conn):
    """Demo mode: load media_articles.py's synthetic index as crawled articles."""
    from media_articles import ARTICLES
    cur = conn.cursor()
    n = 0
    for (domain, path), (outlet_name, journalist, title) in ARTICLES.items():
        outlet_id, _ = ensure_outlet(cur, domain)
        jid = upsert_journalist(cur, journalist, outlet_id)
        norm = normalize_url(f"https://{domain}{path}")
        insert_article(cur, norm, domain, outlet_id, jid, title, journalist,
                       None, "ok", http_status=200)
        n += 1
    filled = backfill_cited_urls(cur)
    filled_obs = backfill_observations(cur)
    conn.commit()
    print(f"Fixture: {n} articles loaded, {filled} cited URLs and "
          f"{filled_obs} observations backfilled.")


class RobotsCache:
    def __init__(self):
        self._cache = {}

    def allowed(self, url):
        host = urlparse(url).netloc
        if host not in self._cache:
            rp = urllib.robotparser.RobotFileParser()
            try:
                resp = requests.get(f"https://{host}/robots.txt",
                                    headers={"User-Agent": USER_AGENT}, timeout=10)
                rp.parse(resp.text.splitlines() if resp.status_code == 200 else [])
            except requests.RequestException:
                rp.parse([])  # unreachable robots.txt -> allow
            self._cache[host] = rp
        return self._cache[host].can_fetch(USER_AGENT, url)


def candidates(cur, client_slug, retry_failed):
    params = []
    client_sql = ""
    if client_slug:
        client_sql = "AND r.client_id = (SELECT id FROM clients WHERE slug = %s)"
        params.append(client_slug)
    cur.execute(f"""
        SELECT DISTINCT u.url, d.domain
        FROM cited_urls u
        JOIN cited_domains d ON d.id = u.domain_id
        JOIN llm_runs r ON r.id = u.run_id
        WHERE d.media_type = 'earned' {client_sql}
        ORDER BY d.domain, u.url""", params)
    rows = cur.fetchall()
    # External observations (Tavily / Profound) join the queue too — their
    # bylines feed the Emerging Authors analysis. Skip social platforms.
    obs_sql = ""
    obs_params = [sorted(SOCIAL_DOMAINS)]  # list -> ARRAY[...] (a tuple becomes a record)
    if client_slug:
        obs_sql = "AND o.client_id = (SELECT id FROM clients WHERE slug = %s)"
        obs_params.append(client_slug)
    cur.execute(f"""
        SELECT DISTINCT o.url, o.domain
        FROM citation_observations o
        WHERE o.domain <> ALL(%s::text[]) {obs_sql}
        ORDER BY o.domain, o.url""", obs_params)
    rows += cur.fetchall()
    # never refetch a URL with any articles row (unless retrying failures)
    if retry_failed:
        cur.execute("SELECT url FROM articles WHERE fetch_status <> 'failed'")
    else:
        cur.execute("SELECT url FROM articles")
    known = {u for (u,) in cur.fetchall()}
    seen, out = set(), []
    for url, domain in rows:
        norm = normalize_url(url)
        if norm in seen or norm in known:
            continue
        seen.add(norm)
        out.append((url, norm, domain))
    return out


def crawl(conn, client_slug, limit, delay, retry_failed):
    cur = conn.cursor()
    todo = candidates(cur, client_slug, retry_failed)
    if limit:
        todo = todo[:limit]
    print(f"{len(todo)} URLs to fetch.")
    robots = RobotsCache()
    last_fetch = {}  # domain -> monotonic time
    session = requests.Session()
    session.headers["User-Agent"] = USER_AGENT
    n_ok = n_nobyline = n_failed = n_skipped = 0

    for i, (url, norm, domain) in enumerate(todo, 1):
        outlet_id, outlet_name = ensure_outlet(cur, domain)
        try:
            if not robots.allowed(url):
                insert_article(cur, norm, domain, outlet_id, None, None, None,
                               None, "skipped", error="robots.txt disallow")
                n_skipped += 1
                conn.commit()
                continue

            wait = delay - (time.monotonic() - last_fetch.get(domain, 0))
            if wait > 0:
                time.sleep(wait)
            resp = session.get(url, timeout=TIMEOUT, stream=True)
            last_fetch[domain] = time.monotonic()

            ctype = resp.headers.get("Content-Type", "")
            if resp.status_code != 200 or "html" not in ctype:
                insert_article(cur, norm, domain, outlet_id, None, None, None, None,
                               "failed", http_status=resp.status_code,
                               error=f"status {resp.status_code}, type {ctype[:60]}")
                n_failed += 1
                conn.commit()
                continue
            # iter_content (unlike resp.raw.read) wraps urllib3 errors as
            # requests exceptions; requests defaults text/html without a
            # charset param to ISO-8859-1, so only trust resp.encoding when
            # the header actually declared one — otherwise assume UTF-8.
            buf = bytearray()
            for chunk in resp.iter_content(chunk_size=65536):
                buf.extend(chunk)
                if len(buf) >= MAX_BYTES:
                    break
            enc = resp.encoding if "charset" in ctype.lower() else None
            html = bytes(buf[:MAX_BYTES]).decode(enc or "utf-8", errors="replace")

            author_raw, title, published = extract_metadata(html)
            author = clean_author(author_raw, outlet_name)
            if author:
                jid = upsert_journalist(cur, author, outlet_id)
                insert_article(cur, norm, domain, outlet_id, jid, title,
                               author_raw, published, "ok", http_status=200)
                n_ok += 1
            else:
                insert_article(cur, norm, domain, outlet_id, None, title,
                               author_raw, published, "no_byline", http_status=200)
                n_nobyline += 1
        except KeyboardInterrupt:
            raise
        except Exception as e:
            # One bad URL (network hiccup, parser edge case, DB error) must
            # never abort the sweep. Roll back first so a mid-transaction DB
            # failure doesn't leave the connection in an aborted state, then
            # record the failure in a fresh transaction.
            conn.rollback()
            outlet_id, _ = ensure_outlet(cur, domain)
            insert_article(cur, norm, domain, outlet_id, None, None, None, None,
                           "failed", error=str(e)[:300])
            n_failed += 1
        conn.commit()
        if i % 25 == 0:
            print(f"  {i}/{len(todo)} fetched (ok={n_ok} no_byline={n_nobyline} "
                  f"failed={n_failed} skipped={n_skipped})")

    filled = backfill_cited_urls(cur)
    filled_obs = backfill_observations(cur)
    conn.commit()
    print(f"Done: ok={n_ok} no_byline={n_nobyline} failed={n_failed} "
          f"skipped={n_skipped}; {filled} cited URLs and "
          f"{filled_obs} observations backfilled.")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse byline enrichment crawler")
    ap.add_argument("--client", help="client slug; omit to sweep all clients")
    ap.add_argument("--limit", type=int)
    ap.add_argument("--delay", type=float, default=2.0)
    ap.add_argument("--retry-failed", action="store_true")
    ap.add_argument("--fixture", action="store_true",
                    help="load media_articles.py demo index instead of fetching")
    args = ap.parse_args()

    conn = psycopg2.connect(config.DB_DSN)
    if args.fixture:
        load_fixture(conn)
    else:
        crawl(conn, args.client, args.limit, args.delay, args.retry_failed)
    conn.close()
