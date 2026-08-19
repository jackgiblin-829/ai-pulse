"""
AI Pulse pipeline connection settings.

All client-specific configuration (brands, keyword taxonomy, key-term
vocabulary) lives in Postgres — written by the dashboard's
/admin/clients onboarding form or seed_client.py, and read via
client_config.load_client(). Engine-level constants live in constants.py.
"""
import os

DB_DSN = os.environ.get("AI_PULSE_DSN", "host=/tmp port=5433 dbname=ai_pulse user=pulse")
