"""
AI Pulse job dispatcher — the scheduler's brain.

Invoked on a fixed timer (launchd LaunchAgent at 06:00 and 18:00; see
launchd/com.829llc.aipulse.dispatch.plist). All scheduling intelligence
lives here, driven by Postgres:

  - clients.tracking_cadence ('daily' | 'weekly', set in /admin/clients)
    decides whether a client is due today or once per ISO week.
  - job_runs records every attempt; a job is due until one SUCCESS row
    exists for the current period, so the second daily fire is a free
    retry after failures and a no-op after successes. Weekly clients run
    at the first fire on/after Monday — no drift, self-healing if the
    machine was off.

Jobs run as subprocesses of the venv python (sys.executable), in order,
per client; one job's failure never blocks the next.

Usage:
    python3 dispatch.py [--client <slug>] [--job <name>] [--force] [--dry-run]

  --force    run due-ness aside (still records job_runs)
  --dry-run  print the due matrix and exit
"""
import argparse
import subprocess
import sys
from datetime import datetime, timedelta
from pathlib import Path

import psycopg2

import config

PIPELINE_DIR = Path(__file__).resolve().parent
STALE_HOURS = 6

# Ordered registry: fetchers first, enrichment/tagging after, so the
# byline crawl sweeps today's new observation URLs in the same run.
# A future LLM prompt-runner slots in before enrich_bylines.
JOBS = [
    ("tavily_fetch",   ["fetch_tavily.py",   "--client", "{slug}"], 1800),
    ("profound_pull",  ["fetch_profound.py", "--client", "{slug}"], 1800),
    ("enrich_bylines", ["enrich_bylines.py", "--client", "{slug}"], 3600),
    ("tag_topics",     ["tag_topics.py",     "--client", "{slug}"], 3600),
]


def log(msg):
    print(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}", flush=True)


def period_start(cadence, today):
    if cadence == "daily":
        return today
    return today - timedelta(days=today.isoweekday() - 1)  # Monday of ISO week


def is_due(cur, job_name, client_id, since):
    cur.execute(
        """SELECT 1 FROM job_runs
           WHERE job_name = %s AND client_id = %s
             AND ((status = 'success' AND run_date >= %s) OR status = 'running')
           LIMIT 1""",
        (job_name, client_id, since))
    return cur.fetchone() is None


def run_job(conn, cur, job_name, args, timeout, client_id, slug, today):
    cur.execute(
        "INSERT INTO job_runs (job_name, client_id, run_date) VALUES (%s,%s,%s) RETURNING id",
        (job_name, client_id, today))
    run_id = cur.fetchone()[0]
    conn.commit()

    cmd = [sys.executable, str(PIPELINE_DIR / args[0]),
           *[a.format(slug=slug) for a in args[1:]]]
    log(f"  {slug}/{job_name}: {' '.join(cmd[1:])}")
    status, error = "success", None
    try:
        proc = subprocess.run(cmd, capture_output=True, text=True,
                              timeout=timeout, cwd=PIPELINE_DIR)
        if proc.stdout.strip():
            for line in proc.stdout.strip().splitlines():
                log(f"    {line}")
        if proc.returncode != 0:
            status = "error"
            error = (proc.stderr or proc.stdout or "")[-2000:]
    except subprocess.TimeoutExpired:
        status, error = "error", f"timeout after {timeout}s"
    except Exception as e:  # subprocess launch failure must not kill the sweep
        status, error = "error", str(e)[:2000]

    # uq_job_runs_one_success allows one success per (job, client, date).
    # A forced re-run of a job that already succeeded today collides with
    # it, and an uncaught violation here aborts the entire sweep — every
    # later client silently goes uncollected. The newest attempt is the
    # one due-ness should reflect, so retire the superseded success row
    # first, and never let bookkeeping errors escape this function.
    try:
        if status == "success":
            cur.execute(
                """DELETE FROM job_runs
                   WHERE job_name=%s AND client_id=%s AND run_date=%s
                     AND status='success' AND id <> %s""",
                (job_name, client_id, today, run_id))
        cur.execute(
            "UPDATE job_runs SET status=%s, finished_at=now(), error=%s WHERE id=%s",
            (status, error, run_id))
        conn.commit()
    except psycopg2.Error as e:
        conn.rollback()
        log(f"    -> WARN: could not record {job_name} status ({status}): {e}")
    if status == "error":
        log(f"    -> ERROR: {(error or '').splitlines()[-1][:200] if error else '?'}")
    return status


def main(only_client, only_job, force, dry_run):
    conn = psycopg2.connect(config.DB_DSN)
    cur = conn.cursor()

    # Singleton: overlapping launchd fires are no-ops.
    cur.execute("SELECT pg_try_advisory_lock(hashtext('ai_pulse.dispatch'))")
    if not cur.fetchone()[0]:
        log("another dispatcher holds the lock; exiting")
        return

    # A crashed dispatcher must never block due-ness forever.
    cur.execute(
        """UPDATE job_runs SET status='error', finished_at=now(),
                  error='stale (dispatcher crash?)'
           WHERE status='running' AND started_at < now() - %s * INTERVAL '1 hour'""",
        (STALE_HOURS,))
    if cur.rowcount:
        log(f"swept {cur.rowcount} stale running job(s)")
    conn.commit()

    today = datetime.now().date()
    cur.execute(
        "SELECT id, slug, tracking_cadence::text FROM clients ORDER BY id")
    clients = cur.fetchall()

    for client_id, slug, cadence in clients:
        if only_client and slug != only_client:
            continue
        since = period_start(cadence, today)
        for job_name, args, timeout in JOBS:
            if only_job and job_name != only_job:
                continue
            due = force or is_due(cur, job_name, client_id, since)
            if dry_run:
                log(f"{slug:20s} {job_name:16s} cadence={cadence:6s} "
                    f"since={since} {'DUE' if due else 'not due'}")
                continue
            if not due:
                continue
            run_job(conn, cur, job_name, args, timeout, client_id, slug, today)

    log("dispatch complete")
    conn.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="AI Pulse job dispatcher")
    ap.add_argument("--client", help="restrict to one client slug")
    ap.add_argument("--job", help="restrict to one job name")
    ap.add_argument("--force", action="store_true",
                    help="ignore due-ness (still records job_runs)")
    ap.add_argument("--dry-run", action="store_true",
                    help="print the due matrix without running anything")
    args = ap.parse_args()
    main(args.client, args.job, args.force, args.dry_run)
