"""
AI Pulse Tavily fetcher — who is publishing on the fan-out keywords right now.

Runs the client's fan-out facets and fan-out prompts through the Tavily
search API and records every result as a citation observation. Authors
are extracted later by enrich_bylines.py (Tavily returns no bylines);
topics by tag_topics.py. Feeds the dashboard's Emerging tab.

Usage:
    python3 fetch_tavily.py --client <slug> [--max-queries 25]
                            [--per-query 10] [--days-back 14] [--dry-run]

Requires TAVILY_API_KEY in the environment. Skips (exit 0) when the
client's Tavily integration is disabled in /admin/clients.

Idempotent: re-running the same day upserts on
(client_id, source, url, observed_at, query) and inserts nothing new.
Scheduling/cadence is the dispatcher's job (dispatch.py) — this script
always fetches when invoked.
"""
import argparse
import json
import os
import sys
from datetime import date
from urllib.parse import urlparse

import psycopg2
import requests

import config
from constants import normalize_url, registrable_domain

TAVILY_URL = "https://api.tavily.com/search"
TIMEOUT = 30


def time_range(days_back):
    if days_back <= 1:
        return "day"
    if days_back <= 7:
        return "week"
    if days_back <= 31:
        return "month"
    return "year"


def load_queries(cur, client_id, max_queries):
    """Fan-out facet names first, then active fan-out prompts, deduped."""
    cur.execute("SELECT name FROM facets WHERE client_id=%s ORDER BY position, id",
                (client_id,))
    queries = [n for (n,) in cur.fetchall()]
    cur.execute(
        """SELECT text FROM prompts
           WHERE client_id=%s AND source='fanout' AND active ORDER BY id""",
        (client_id,))
    queries += [t for (t,) in cur.fetchall()]
    seen, out = set(), []
    for q in queries:
        key = q.strip().lower()
        if key and key not in seen:
            seen.add(key)
            out.append(q.strip())
    return out[:max_queries]


def run(client_slug, max_queries, per_query, days_back, dry_run):
    api_key = os.environ.get("TAVILY_API_KEY")
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()

    cur.execute(
        """SELECT c.id, COALESCE(i.tavily_enabled, FALSE)
           FROM clients c LEFT JOIN client_integrations i ON i.client_id = c.id
           WHERE c.slug = %s""", (client_slug,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"Unknown client slug '{client_slug}'")
    client_id, enabled = row
    if not enabled:
        print(f"skipped: Tavily is not enabled for '{client_slug}' (see /admin/clients)")
        return

    queries = load_queries(cur, client_id, max_queries)
    if not queries:
        print(f"skipped: '{client_slug}' has no facets or fan-out prompts to search")
        return
    if dry_run:
        print(f"Would search {len(queries)} queries ({per_query} results each, "
              f"last {days_back}d):")
        for q in queries:
            print(f"  {q}")
        return
    if not api_key:
        sys.exit("TAVILY_API_KEY is not set")

    today = date.today()
    n_new = n_seen = 0
    session = requests.Session()
    session.headers["Authorization"] = f"Bearer {api_key}"

    for q in queries:
        try:
            resp = session.post(TAVILY_URL, timeout=TIMEOUT, json={
                "query": q,
                "max_results": per_query,
                "search_depth": "basic",
                "time_range": time_range(days_back),
            })
            resp.raise_for_status()
            results = resp.json().get("results", [])
        except requests.RequestException as e:
            print(f"  [warn] query failed, continuing: {q!r}: {e}")
            continue

        for r in results:
            raw_url = (r.get("url") or "").strip()
            if not raw_url.startswith("http"):
                continue
            url = normalize_url(raw_url)
            dom = registrable_domain(urlparse(raw_url).netloc)
            if not dom or "." not in dom:
                continue
            published = (r.get("published_date") or "")[:10] or None
            cur.execute(
                """INSERT INTO citation_observations
                     (client_id, source, observed_at, url, domain, query,
                      title, snippet, score, published_at, raw)
                   VALUES (%s,'tavily',%s,%s,%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (client_id, source, url, observed_at, COALESCE(query, ''))
                   DO UPDATE SET score=EXCLUDED.score, raw=EXCLUDED.raw
                   RETURNING (xmax = 0)""",
                (client_id, today, url, dom, q, r.get("title"),
                 r.get("content"), r.get("score"), published,
                 json.dumps(r)))
            if cur.fetchone()[0]:
                n_new += 1
            else:
                n_seen += 1
        conn.commit()
        print(f"  {q!r}: {len(results)} results")

    print(f"Done: {len(queries)} queries, {n_new} new observations, "
          f"{n_seen} already recorded today.")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse Tavily fan-out search fetcher")
    ap.add_argument("--client", required=True, help="client slug")
    ap.add_argument("--max-queries", type=int, default=25)
    ap.add_argument("--per-query", type=int, default=10)
    ap.add_argument("--days-back", type=int, default=14,
                    help="restrict results to roughly this recency window")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the query set without calling Tavily")
    args = ap.parse_args()
    run(args.client, args.max_queries, args.per_query, args.days_back, args.dry_run)
