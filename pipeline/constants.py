"""
Engine-level constants shared across clients.

These are pipeline plumbing, not client configuration — client config
lives in Postgres (clients / brands / keyword_* / key_term_vocab tables)
and is loaded via client_config.load_client().
"""
import re
from urllib.parse import urlparse

VENDOR_MAP = {
    "chatgpt": "chatgpt", "openai": "chatgpt", "gpt-4o": "chatgpt", "gpt4": "chatgpt",
    "gemini": "gemini", "google": "gemini", "bard": "gemini",
    "claude": "claude", "anthropic": "claude",
}

URL_RE = re.compile(r"https?://[^\s\)\]\>\"',;]+")
MULTI_TLDS = {"co.uk", "com.au", "co.nz", "co.jp", "com.br"}

# Social platforms => media_type 'social'
SOCIAL_DOMAINS = {
    "reddit.com", "youtube.com", "facebook.com", "instagram.com",
    "pinterest.com", "tiktok.com", "x.com", "twitter.com", "quora.com",
}

JUNK_TOKENS = {
    "com", "www", "http", "https", "org", "html", "sources", "cited",
    "pages", "consulted", "watch", "sites", "article", "articles",
}

# Ordered search-intent rules: first match classifies the prompt.
# Generic across clients — verticals differ, buyer language doesn't.
INTENT_RULES = [
    (re.compile(r"\bvs\.?\b|\bversus\b|compared? (to|with)|alternatives? to|or should i", re.I), "comparison"),
    (re.compile(r"\bbuy\b|\bprice\b|\bpricing\b|\bcost\b|\bdeal\b|\bdiscount\b|where (to|can i) (buy|get|order)|near me|worth (the|it)|\border\b", re.I), "transactional"),
    (re.compile(r"\bbest\b|\btop\b|recommend|review|\bbrands?\b|which .* (should|do)|favorite|most (reliable|durable|popular)", re.I), "commercial"),
    # informational is the catch-all: how/what/why/can/does...
]


def classify_intent(prompt):
    for pattern, intent in INTENT_RULES:
        if pattern.search(prompt):
            return intent
    return "informational"


def registrable_domain(host):
    """Registrable domain (www-stripped, multi-part-TLD aware) — the
    domain identity shared by ingest, enrich_bylines, and the fetchers."""
    host = host.lower().lstrip(".")
    if host.startswith("www."):
        host = host[4:]
    parts = host.split(".")
    if len(parts) >= 3 and ".".join(parts[-2:]) in MULTI_TLDS:
        return ".".join(parts[-3:])
    return ".".join(parts[-2:]) if len(parts) >= 2 else host


def normalize_url(url):
    """Canonical URL identity shared by ingest.py and enrich_bylines.py:
    forced https, lowercased host with 'www.' stripped, path without a
    trailing slash, query/fragment dropped."""
    p = urlparse(url)
    host = p.netloc.lower()
    if host.startswith("www."):
        host = host[4:]
    return f"https://{host}{p.path}".rstrip("/")


STOPWORDS = set("""a an and are as at be but by for from has have if in into is it its of on or
such that the their then there these they this to was were will with you your which who whose
what when how why can could should would may might do does did not no yes than more most very
also just about over under between against during before after out up down off above below
""".split())
