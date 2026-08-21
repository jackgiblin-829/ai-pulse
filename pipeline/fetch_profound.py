"""
AI Pulse Profound fetcher — cited URLs from the client's Profound
citations report (which pages the AI engines actually cited for the
client's tracked prompt set).

Calls POST https://api.tryprofound.com/v1/reports/citations scoped by
the client's Profound category ID (configured in /admin/clients).
Feeds the dashboard's Emerging tab; authors are extracted later by
enrich_bylines.py, topics by tag_topics.py.

Usage:
    python3 fetch_profound.py --client <slug> [--window 7] [--dry-run]

Requires PROFOUND_API_KEY in the environment. Skips (exit 0) when the
client's Profound integration is disabled.

Idempotent: upserts on (client_id, source, url, observed_at, query);
overlapping windows update citation_count in place rather than
duplicating. Scheduling/cadence is the dispatcher's job (dispatch.py).
"""
import argparse
import json
import os
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

import psycopg2
import requests

import config
from constants import normalize_url, registrable_domain

PROFOUND_URL = "https://api.tryprofound.com/v1/reports/citations"
TIMEOUT = 60
DIMENSIONS = ["url", "date", "model", "prompt"]
METRICS = ["count"]
PAGE_LIMIT = 10_000


def run(client_slug, window, dry_run):
    api_key = os.environ.get("PROFOUND_API_KEY")
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()

    cur.execute(
        """SELECT c.id, COALESCE(i.profound_enabled, FALSE), i.profound_category
           FROM clients c LEFT JOIN client_integrations i ON i.client_id = c.id
           WHERE c.slug = %s""", (client_slug,))
    row = cur.fetchone()
    if not row:
        sys.exit(f"Unknown client slug '{client_slug}'")
    client_id, enabled, category_id = row
    if not enabled:
        print(f"skipped: Profound is not enabled for '{client_slug}' (see /admin/clients)")
        return
    if not category_id:
        sys.exit(f"Client '{client_slug}' has Profound enabled but no category ID configured")

    end = date.today()
    start = end - timedelta(days=window)
    body = {
        "category_id": category_id,
        "start_date": f"{start.isoformat()}T00:00:00Z",
        "end_date": f"{end.isoformat()}T23:59:59Z",
        "metrics": METRICS,
        "dimensions": DIMENSIONS,
        "pagination": {"limit": PAGE_LIMIT, "offset": 0},
    }
    if dry_run:
        print(f"Would POST {PROFOUND_URL} for '{client_slug}':")
        print(json.dumps(body, indent=2))
        return
    if not api_key:
        sys.exit("PROFOUND_API_KEY is not set")

    n_new = n_updated = n_skipped = 0
    offset = 0
    while True:
        body["pagination"]["offset"] = offset
        resp = requests.post(
            PROFOUND_URL, timeout=TIMEOUT, json=body,
            headers={"X-API-Key": api_key})
        if resp.status_code != 200:
            sys.exit(f"Profound API error {resp.status_code}: {resp.text[:500]}")
        payload = resp.json()
        rows = payload.get("data", [])

        for r in rows:
            dims = dict(zip(DIMENSIONS, r.get("dimensions", [])))
            count = (r.get("metrics") or [1])[0] or 1
            raw_url = (dims.get("url") or "").strip()
            if not raw_url:
                n_skipped += 1
                continue
            if not raw_url.startswith("http"):
                raw_url = f"https://{raw_url}"
            url = normalize_url(raw_url)
            dom = registrable_domain(urlparse(raw_url).netloc)
            if not dom or "." not in dom:
                n_skipped += 1
                continue
            observed = (dims.get("date") or end.isoformat())[:10]
            cur.execute(
                """INSERT INTO citation_observations
                     (client_id, source, observed_at, url, domain, query,
                      engine, citation_count, raw)
                   VALUES (%s,'profound',%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (client_id, source, url, observed_at, COALESCE(query, ''))
                   DO UPDATE SET citation_count=EXCLUDED.citation_count,
                                 engine=EXCLUDED.engine, raw=EXCLUDED.raw
                   RETURNING (xmax = 0)""",
                (client_id, observed, url, dom, dims.get("prompt"),
                 dims.get("model"), int(count), json.dumps(r)))
            if cur.fetchone()[0]:
                n_new += 1
            else:
                n_updated += 1
        conn.commit()

        total = (payload.get("info") or {}).get("total_rows", 0)
        offset += len(rows)
        if not rows or offset >= total:
            break

    print(f"Done: {n_new} new observations, {n_updated} updated, "
          f"{n_skipped} rows skipped (window {start} → {end}).")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse Profound citations fetcher")
    ap.add_argument("--client", required=True, help="client slug")
    ap.add_argument("--window", type=int, default=7,
                    help="days back to request (inclusive window)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the request without calling Profound")
    args = ap.parse_args()
    run(args.client, args.window, args.dry_run)
